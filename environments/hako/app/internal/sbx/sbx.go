// Package sbx は、Docker Sandboxes の CLI（sbx）を呼ぶ。
// sbx の振る舞いに合わせた注意（空のディレクトリから run する・止まったVMに exec しない）は、ここに集める。
package sbx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// Sandbox は sbx ls --json の1件。
type Sandbox struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (s Sandbox) Running() bool { return s.Status == "running" }

// Run は sbx を呼び、標準出力を返す。失敗したときは標準エラーの末尾をエラーに含める。
func Run(args ...string) (string, error) {
	return RunInput(nil, args...)
}

// RunInput は、標準入力を渡して sbx を呼ぶ。
func RunInput(stdin io.Reader, args ...string) (string, error) {
	cmd := exec.Command("sbx", args...)
	cmd.Stdin = stdin
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if len(msg) > 800 {
			msg = msg[len(msg)-800:]
		}
		return out.String(), fmt.Errorf("sbx %s: %w: %s", args[0], err, msg)
	}
	return out.String(), nil
}

// Attach は、端末をつないだまま sbx を呼ぶ（sbx login や VM の中の対話画面）。
func Attach(args ...string) error {
	cmd := exec.Command("sbx", args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return cmd.Run()
}

// List は sbx の環境を一覧する。
func List() ([]Sandbox, error) {
	out, err := Run("ls", "--json")
	if err != nil {
		return nil, err
	}
	var list []Sandbox
	if err := json.Unmarshal([]byte(out), &list); err != nil {
		return nil, fmt.Errorf("sbx ls --json を読めません: %w", err)
	}
	return list, nil
}

// Find は名前で環境を探す。ないときは nil を返す。
func Find(name string) (*Sandbox, error) {
	list, err := List()
	if err != nil {
		return nil, err
	}
	for _, s := range list {
		if s.Name == name {
			return &s, nil
		}
	}
	return nil, nil
}

// StartDetached は環境を起こす。
// sbx run はパスを省くと今いるディレクトリをVMへ共有するため、空のディレクトリから呼ぶ。
// 普通に起動したVMは最後の sbx exec が切れて30秒で止まり、中のエージェントも止まるため、--detach で起動する。
func StartDetached(name string) error {
	empty, err := os.MkdirTemp("", "hako-run-")
	if err != nil {
		return err
	}
	defer os.Remove(empty)
	cmd := exec.Command("sbx", "run", "--detach", "--name", name)
	cmd.Dir = empty
	var errb bytes.Buffer
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("sbx run %s: %w: %s", name, err, strings.TrimSpace(errb.String()))
	}
	return nil
}

// Exec は、VMの中でコマンドを動かして標準出力を返す。止まっている環境には呼ばない（sbx exec は止まったVMを起動してしまう）。
func Exec(name string, args ...string) (string, error) {
	return RunInput(nil, append([]string{"exec", name}, args...)...)
}

// ExecInput は、標準入力を渡してVMの中でコマンドを動かす。
func ExecInput(name string, stdin io.Reader, args ...string) (string, error) {
	return RunInput(stdin, append([]string{"exec", "-i", name}, args...)...)
}

// ExecTTY は、端末をつないでVMの中のコマンドを動かす。
// sbx exec が TERM を渡すかは文書にないため、ホストの TERM を env で明示して渡す。
func ExecTTY(name string, args ...string) error {
	term := os.Getenv("TERM")
	if term == "" {
		term = "xterm-256color"
	}
	full := append([]string{"exec", "-it", name, "env", "TERM=" + term, "LANG=C.UTF-8"}, args...)
	return Attach(full...)
}

// SecretRow は sbx secret ls の1行を空白で分けたもの。
// 列の意味は文書にないため、hako がこれまで使ってきた並び（2列目がホスト、3列目が環境変数、4列目が代わりの値）で読む。
type SecretRow []string

func Secrets() ([]SecretRow, error) {
	out, err := Run("secret", "ls")
	if err != nil {
		return nil, err
	}
	var rows []SecretRow
	for _, line := range strings.Split(out, "\n") {
		if f := strings.Fields(line); len(f) > 0 {
			rows = append(rows, f)
		}
	}
	return rows, nil
}
