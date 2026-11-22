package vm

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

// Enqueue は、標準入力のプロンプトを積み、ターンを動かす turns を切り離して起動する。
// turns が書きかけのプロンプトを読まないよう、別の場所に書いてから積む。
func Enqueue(v layout.VM, h string, prompt io.Reader) error {
	if err := requireHarness(h); err != nil {
		return err
	}
	st := v.State(h)
	b, err := io.ReadAll(prompt)
	if err != nil {
		return err
	}
	if len(b) == 0 {
		return exitError{2, "プロンプトが空です"}
	}
	for _, d := range []string{st.Queue(), st.QueueTmp()} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	// 名前の順が積んだ順になるよう、桁を揃えた時刻を名前にする。
	name := fmt.Sprintf("%020d", time.Now().UnixNano())
	tmp := filepath.Join(st.QueueTmp(), name)
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(st.Queue(), name)); err != nil {
		return err
	}
	if err := touch(v.Active()); err != nil {
		return err
	}
	return Spawn(st.TurnsLog(), []string{"vm", "turns", h})
}

// Turns は、積まれたプロンプトをハーネスの非対話の1ターンとして順に動かし、積まれたものが尽きたら終わる。
// Enqueue が積むたびに起動する。同じハーネスで同時に動くのは1つだけで、ほかは積まれたものを任せてすぐ終わる。
func Turns(v layout.VM, h string) error {
	if err := requireHarness(h); err != nil {
		return err
	}
	st := v.State(h)
	if err := os.MkdirAll(st.Root, 0o755); err != nil {
		return err
	}
	if err := waitReady(v); err != nil {
		note(st, "setup-failed")
		return err
	}
	// 実行中のものが積まれたものを見終えてから鍵を放すまでの間に積まれると、後から来た方は鍵を取れずに終わる。
	// そのため、鍵を放した後にも積まれたものを確かめ、残っていればもう一度鍵を取りに行く。
	for {
		lock, ok, err := tryLock(st.TurnsLock())
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		if err := refreshSettings(v); err != nil {
			note(st, "settings-failed")
		}
		drainErr := drain(v, h)
		lock.Close()
		if drainErr != nil {
			return drainErr
		}
		if len(queued(st)) == 0 {
			return nil
		}
	}
}

func drain(v layout.VM, h string) error {
	st := v.State(h)
	for {
		files := queued(st)
		if len(files) == 0 {
			return nil
		}
		// ターンの途中に積まれたものは、次のターンでまとめて渡す。
		prompt, err := JoinPrompts(files)
		if err != nil {
			return err
		}
		for _, f := range files {
			os.Remove(f)
		}
		mode := "resume"
		if !exists(st.SessionID()) {
			mode = "start"
			id, err := newUUID()
			if err != nil {
				return err
			}
			if err := os.WriteFile(st.SessionID(), []byte(id+"\n"), 0o644); err != nil {
				return err
			}
		}
		id, _ := readTrim(st.SessionID())
		note(st, mode)
		if err := runTurn(v, h, mode, id, prompt); err != nil {
			note(st, "failed")
			// 会話を始められなかったときは、次のターンでもう一度始める。
			if mode == "start" {
				os.Remove(st.SessionID())
			}
		}
		touch(v.Active())
	}
}

func runTurn(v layout.VM, h, mode, id, prompt string) error {
	logf, err := os.OpenFile(v.State(h).SessionLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer logf.Close()
	cmd, err := harnessCmd(v, h, layout.ModeTurn, []string{"HAKO_SESSION_ID=" + id}, mode, prompt)
	if err != nil {
		return err
	}
	cmd.Stdout, cmd.Stderr = logf, logf
	return cmd.Run()
}

// JoinPrompts は、積まれた順にプロンプトを空行で区切ってつなぐ。
func JoinPrompts(files []string) (string, error) {
	parts := make([]string, 0, len(files))
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			return "", err
		}
		parts = append(parts, strings.TrimRight(string(b), "\n"))
	}
	return strings.Join(parts, "\n\n"), nil
}

func queued(st layout.State) []string {
	entries, err := os.ReadDir(st.Queue())
	if err != nil {
		return nil
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() {
			files = append(files, filepath.Join(st.Queue(), e.Name()))
		}
	}
	sort.Strings(files)
	return files
}

func note(st layout.State, event string) {
	f, err := os.OpenFile(st.SessionLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, `{"hako":%s,"at":%s}`+"\n", strconv.Quote(event), strconv.Quote(time.Now().Format(time.RFC3339)))
}

// tryLock は、待たずにファイルの排他の鍵を取る。取れなければ ok=false を返す。鍵はファイルを閉じると放す。
func tryLock(path string) (f *os.File, ok bool, err error) {
	f, err = os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, false, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return f, true, nil
}
