package vm

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

type interactiveArgs struct {
	harness string
	fresh   bool
}

func parseInteractive(name string, args []string) (interactiveArgs, error) {
	var a interactiveArgs
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.BoolVar(&a.fresh, "new", false, "")
	if err := fs.Parse(args); err != nil || fs.NArg() != 1 {
		return a, exitError{2, "使い方: hako vm " + name + " [--new] <ハーネス>"}
	}
	a.harness = fs.Arg(0)
	return a, requireHarness(a.harness)
}

// Attach は、対話の画面を tmux の中に開き、端末をつなぐ。開いていれば、その画面につなぎ直す。
// tmux の中で動かすのは、ホストとの接続が切れても、作業中のハーネスを止めないため。
func Attach(v layout.VM, args []string) error {
	a, err := parseInteractive("attach", args)
	if err != nil {
		return err
	}
	session := layout.TmuxAttach(a.harness)
	if _, open := tmuxSessions()[session]; open {
		if a.fresh {
			return exitError{1, "開いている対話の画面があります。その画面でハーネスを終えてから --new を付けてください"}
		}
	} else {
		if !exists(v.Ready()) {
			fmt.Fprintln(os.Stderr, "hako: 環境の準備が終わるのを待っています")
		}
		if err := waitReady(v); err != nil {
			return err
		}
		self, err := os.Executable()
		if err != nil {
			return err
		}
		home, _ := os.UserHomeDir()
		inner := []string{"-u", "new-session", "-d", "-s", session, "-c", home, self, "vm", "interactive"}
		if a.fresh {
			inner = append(inner, "--new")
		}
		inner = append(inner, a.harness)
		if out, err := exec.Command("tmux", inner...).CombinedOutput(); err != nil {
			return fmt.Errorf("tmux new-session: %w: %s", err, out)
		}
	}
	path, err := exec.LookPath("tmux")
	if err != nil {
		return errors.New("VMに tmux がありません。ホストで hako template を実行し、環境を作り直してください")
	}
	return syscall.Exec(path, []string{"tmux", "-u", "attach-session", "-t", session}, os.Environ())
}

// Interactive は、tmux の中でハーネスの対話画面を動かす。
// 対話の会話はターンの会話とは別に1つ持ち、開くたびに続ける。--new なら新しく始める。
func Interactive(v layout.VM, args []string) error {
	a, err := parseInteractive("interactive", args)
	if err != nil {
		return err
	}
	if err := waitReady(v); err != nil {
		return pause(err)
	}
	if err := refreshSettings(v); err != nil {
		fmt.Fprintln(os.Stderr, "hako: リポジトリの最新を反映できませんでした。前の設定のまま開きます")
	}
	st := v.State(a.harness)
	if err := os.MkdirAll(st.Root, 0o755); err != nil {
		return pause(err)
	}
	resume := exists(st.InteractiveSessionID()) && !a.fresh
	if !resume {
		id, err := newUUID()
		if err != nil {
			return pause(err)
		}
		if err := os.WriteFile(st.InteractiveSessionID(), []byte(id+"\n"), 0o644); err != nil {
			return pause(err)
		}
	}
	id, _ := readTrim(st.InteractiveSessionID())
	env := []string{"HAKO_SESSION_ID=" + id}
	if resume {
		env = append(env, "HAKO_RESUME=1")
	}
	cmd, err := harnessCmd(v, a.harness, layout.ModeInteractive, env, "interactive")
	if err != nil {
		return pause(err)
	}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		msg := fmt.Errorf("ハーネスが終了コード付きで終わりました（%v）", err)
		if resume {
			msg = fmt.Errorf("%w。前の会話を開けなかったときは、hako attach --new で新しく始められます", msg)
		}
		return pause(msg)
	}
	return nil
}

// pause は、エラーを表示して Enter を待つ。tmux の画面がすぐ閉じて、理由を読めなくなるのを防ぐ。
func pause(err error) error {
	fmt.Fprintln(os.Stderr, "hako:", err)
	fmt.Fprintln(os.Stderr, "Enter で閉じます")
	bufio.NewReader(os.Stdin).ReadString('\n')
	return exitError{1, ""}
}

// Logs は、ターンの記録を読み続ける。ハーネスに log.jq があれば、読みやすい形にして出す。
func Logs(v layout.VM, h string) error {
	if err := requireHarness(h); err != nil {
		return err
	}
	st := v.State(h)
	if err := os.MkdirAll(st.Root, 0o755); err != nil {
		return err
	}
	touch(st.SessionLog())
	script := `tail -n +1 -F "$1"`
	filter := v.HarnessFile(h, "log.jq")
	if exists(filter) {
		script += ` | jq --unbuffered -Rr -f "$2"`
	}
	sh, err := exec.LookPath("sh")
	if err != nil {
		return err
	}
	return syscall.Exec(sh, []string{"sh", "-c", script, "sh", st.SessionLog(), filter}, os.Environ())
}
