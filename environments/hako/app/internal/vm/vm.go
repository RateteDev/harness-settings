// Package vm は、VMの中で動く hako（hako vm <コマンド>）を持つ。
// ホストの hako が sbx exec で呼び、VMの中の ~/.hako の状態を読み書きする。
package vm

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

const usage = `hako vm はVMの中でホストの hako から呼ばれる。人が直接使うのは hako-worker だけである。
  setup [owner/repo] | settings | turns <ハーネス> | enqueue <ハーネス> | busy | worker [ハーネス] <プロンプト>
  attach [--new] <ハーネス> | interactive [--new] <ハーネス> | logs <ハーネス>
  spawn <記録> <コマンド>... | installed | sync-id`

// Main は hako vm の入口。終了コードを返す。
func Main(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, usage)
		return 2
	}
	v, err := layout.CurrentVM()
	if err == nil {
		err = dispatch(v, args[0], args[1:])
	}
	if err != nil {
		var ex exitError
		if errors.As(err, &ex) {
			if ex.msg != "" {
				fmt.Fprintln(os.Stderr, "hako:", ex.msg)
			}
			return ex.code
		}
		fmt.Fprintln(os.Stderr, "hako:", err)
		return 1
	}
	return 0
}

type exitError struct {
	code int
	msg  string
}

func (e exitError) Error() string { return e.msg }

func dispatch(v layout.VM, cmd string, args []string) error {
	switch cmd {
	case "setup":
		if len(args) > 1 {
			return exitError{2, "使い方: hako vm setup [owner/repo]"}
		}
		repo := ""
		if len(args) == 1 {
			repo = args[0]
		}
		return Setup(v, repo)
	case "settings":
		return ApplySettings(v)
	case "turns":
		if len(args) != 1 {
			return exitError{2, "使い方: hako vm turns <ハーネス>"}
		}
		return Turns(v, args[0])
	case "enqueue":
		if len(args) != 1 {
			return exitError{2, "使い方: hako vm enqueue <ハーネス>（プロンプトは標準入力）"}
		}
		return Enqueue(v, args[0], os.Stdin)
	case "busy":
		reason, err := Busy(v, time.Now())
		if err != nil {
			return err
		}
		if reason == "" {
			fmt.Println("idle")
		} else {
			fmt.Println("busy:", reason)
		}
		return nil
	case "worker":
		return Worker(v, args)
	case "attach":
		return Attach(v, args)
	case "interactive":
		return Interactive(v, args)
	case "logs":
		if len(args) != 1 {
			return exitError{2, "使い方: hako vm logs <ハーネス>"}
		}
		return Logs(v, args[0])
	case "spawn":
		if len(args) < 2 {
			return exitError{2, "使い方: hako vm spawn <記録のファイル> <hako vm のコマンド>..."}
		}
		return Spawn(args[0], append([]string{"vm"}, args[1:]...))
	case "installed":
		return Installed(v)
	case "sync-id":
		b, _ := os.ReadFile(v.SyncID())
		fmt.Print(string(b))
		return nil
	}
	return exitError{2, usage}
}

// Spawn は、自分自身を新しいセッションとして切り離して起動し、すぐに戻る。
// sbx exec は、起動したプロセスが入出力をつないでいる間は戻らないため、入出力をすべてファイルへ向ける。
func Spawn(logPath string, args []string) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	_, err = spawnCommand(logPath, exec.Command(self, args...))
	return err
}

// spawnCommand は、cmd を新しいセッションとして切り離して起動し、番号を返す。
func spawnCommand(logPath string, cmd *exec.Cmd) (int, error) {
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return 0, err
	}
	logf, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return 0, err
	}
	defer logf.Close()
	devnull, err := os.Open(os.DevNull)
	if err != nil {
		return 0, err
	}
	defer devnull.Close()
	cmd.Stdin, cmd.Stdout, cmd.Stderr = devnull, logf, logf
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return 0, err
	}
	pid := cmd.Process.Pid
	return pid, cmd.Process.Release()
}

// Installed は、ホストが ~/.hako へ写した後に呼び、VMの中から使う名前を整える。
func Installed(v layout.VM) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	bin := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		return err
	}
	// エージェントが使う hako-worker は、hako の実行ファイルへのリンクとし、起動した名前で作業役の入口として動く。
	link := filepath.Join(bin, "hako-worker")
	os.Remove(link)
	return os.Symlink(layout.VMBin, link)
}

func readTrim(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func touch(path string) error {
	now := time.Now()
	if err := os.Chtimes(path, now, now); err == nil {
		return nil
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	return f.Close()
}

// waitReady は、準備（hako vm setup）が終わるまで待つ。失敗していればエラーを返す。
func waitReady(v layout.VM) error {
	for !exists(v.Ready()) {
		if exists(v.Failed()) {
			return errors.New("環境の準備に失敗しています。~/.hako/setup.log を確かめ、環境を作り直してください")
		}
		time.Sleep(2 * time.Second)
	}
	return nil
}

// requireHarness は、名前がハーネスかを確かめる。
func requireHarness(h string) error {
	if !hakofiles.IsHarness(h) {
		return exitError{2, fmt.Sprintf("知らないハーネスです: %s（%s）", h, strings.Join(hakofiles.Harnesses(), "|"))}
	}
	return nil
}

func newUUID() (string, error) {
	b, err := os.ReadFile("/proc/sys/kernel/random/uuid")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

// harnessCmd は、ハーネスの run を、作業場所で動かすコマンドにする。
func harnessCmd(v layout.VM, h, mode string, extraEnv []string, args ...string) (*exec.Cmd, error) {
	workdir, err := readTrim(v.Workdir())
	if err != nil {
		return nil, errors.New("作業場所が決まっていません。環境の準備が終わっていないか、失敗しています")
	}
	cmd := exec.Command(v.HarnessRun(h), args...)
	cmd.Dir = workdir
	// HAKO_HARNESS は、エージェントが hako-worker をハーネスを省いて呼んだときに、同じハーネスで作業役を動かすために渡す。
	cmd.Env = append(append(os.Environ(), "HAKO_MODE="+mode, "HAKO_HARNESS="+h), extraEnv...)
	return cmd, nil
}
