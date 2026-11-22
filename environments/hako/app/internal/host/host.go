// Package host は、ホストで動く hako のコマンドを持つ。
// 環境（Docker Sandboxes のVM）を作って持ち続け、その中のハーネスを、非対話のターンと端末の対話画面から動かす。
package host

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/sbx"
)

type Host struct {
	paths   Paths
	version string
	pl      *payload
	out     io.Writer
}

func usage() string {
	return `使い方:
  hako setup             依存を入れ、鍵・テンプレート・常駐を整える（何度実行してもよい）
  hako doctor            整っているかを確かめるだけで、何も変えない
  hako up [owner/repo]   環境を作り、準備をVMの中で始める。環境の名前を表示する
  hako turn <環境> <ハーネス> <プロンプト>
                         ハーネスの非対話の1ターンを頼む。止まっていれば起こす。
                         ターンの途中なら、終わった後に続けて動かす。running・woke のどちらかを表示する
  hako attach [--new] <環境> <ハーネス>
                         VMの中のハーネスの対話画面に入る（Ctrl-b d で抜けても動き続ける）。
                         --new で新しい会話を始める
  hako ls
  hako logs <環境> <ハーネス>
                         ターンの記録を読む（Ctrl-c で抜ける）
  hako shell <環境>      VMの中のシェルに入る
  hako rm <環境>...
  hako template          VMのテンプレートを作り直して sbx に読み込む
  hako daemon            使っていない環境を止め続ける（常駐させる）
  hako stop-idle         使っていない環境を一度だけ止める
  hako version

ハーネス: ` + strings.Join(hakofiles.Harnesses(), "|") + `
`
}

type usageError struct{ msg string }

func (e usageError) Error() string { return e.msg }

func errUsage() error { return usageError{} }

// Main はホストの hako の入口。終了コードを返す。
func Main(version string, args []string) int {
	paths, err := DefaultPaths()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hako:", err)
		return 1
	}
	h := &Host{paths: paths, version: version, out: os.Stdout}
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage())
		return 2
	}
	err = h.dispatch(args[0], args[1:])
	var ue usageError
	switch {
	case err == nil:
		return 0
	case errors.As(err, &ue):
		if ue.msg != "" {
			fmt.Fprintln(os.Stderr, "hako:", ue.msg)
		}
		fmt.Fprint(os.Stderr, usage())
		return 2
	default:
		fmt.Fprintln(os.Stderr, "hako:", err)
		return 1
	}
}

func (h *Host) dispatch(cmd string, args []string) error {
	switch cmd {
	case "setup":
		return h.Setup(args)
	case "doctor":
		return h.Doctor(args)
	case "up":
		if len(args) > 1 {
			return errUsage()
		}
		repo := ""
		if len(args) == 1 {
			repo = args[0]
		}
		return h.up(repo)
	case "turn":
		if len(args) != 3 {
			return errUsage()
		}
		return h.turn(args[0], args[1], args[2])
	case "attach":
		return h.attach(args)
	case "ls":
		return h.ls()
	case "logs":
		if len(args) != 2 {
			return errUsage()
		}
		return h.logs(args[0], args[1])
	case "shell":
		if len(args) != 1 {
			return errUsage()
		}
		return h.shell(args[0])
	case "rm":
		if len(args) == 0 {
			return errUsage()
		}
		return h.rm(args)
	case "template":
		return h.BuildTemplate()
	case "daemon":
		return h.Daemon()
	case "stop-idle":
		return h.stopIdle()
	case "version", "--version":
		fmt.Fprintln(h.out, h.version)
		return nil
	case "-h", "--help", "help":
		fmt.Fprint(h.out, usage())
		return nil
	}
	return errUsage()
}

var nameRe = regexp.MustCompile("^" + layout.Prefix + "[a-z0-9]+$")

func requireName(name string) error {
	if !nameRe.MatchString(name) {
		return fmt.Errorf("hako の環境ではありません: %s", name)
	}
	return nil
}

func requireHarness(name string) error {
	if !hakofiles.IsHarness(name) {
		return fmt.Errorf("知らないハーネスです: %s（%s）", name, strings.Join(hakofiles.Harnesses(), "|"))
	}
	return nil
}

var repoRe = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// up は環境を作り、VMの中で準備を始める。準備はVMの中で続き、ここはすぐ戻る。
func (h *Host) up(repo string) error {
	if repo != "" && !repoRe.MatchString(repo) {
		return fmt.Errorf("リポジトリは owner/repo の形で指定してください: %s", repo)
	}
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	name := layout.Prefix + hex.EncodeToString(b)
	// 1つのVMで複数のハーネスを動かすので、sbx のハーネス用の種類ではなく shell の種類で作る。
	// sbx create にパスを渡すと手元のディレクトリがVMとつながるため、渡さない。
	if _, err := sbx.Run("create", "--name", name, "-t", layout.Template, "--pull", "never", "shell"); err != nil {
		return err
	}
	// 全体の方針は balanced で、ローカルでは deny が allow に優先するため、
	// 「すべて許可」は環境ごとの allow で足す。環境ごとの規則は sbx rm で一緒に消える。
	if _, err := sbx.Run("policy", "allow", "network", "--sandbox", name, "**"); err != nil {
		return err
	}
	if err := sbx.StartDetached(name); err != nil {
		return err
	}
	if err := h.sync(name, true); err != nil {
		return err
	}
	if err := h.pushCredentials(name); err != nil {
		return err
	}
	setup := []string{layout.VMBin, "vm", "spawn", layout.VMHomeAbs + "/setup.log", "setup"}
	if repo != "" {
		setup = append(setup, repo)
	}
	if _, err := sbx.Exec(name, setup...); err != nil {
		return err
	}
	fmt.Fprintln(h.out, name)
	return nil
}

// ensureUp は、環境を動いている状態にし、VMの中の hako をホストに揃える。
// 起こしたときは、ホストの資格情報を写し直す。
func (h *Host) ensureUp(name string) (string, error) {
	if err := requireName(name); err != nil {
		return "", err
	}
	sb, err := sbx.Find(name)
	if err != nil {
		return "", err
	}
	if sb == nil {
		return "", fmt.Errorf("環境がありません: %s", name)
	}
	if sb.Running() {
		return "running", h.sync(name, false)
	}
	if err := sbx.StartDetached(name); err != nil {
		return "", err
	}
	if err := h.sync(name, false); err != nil {
		return "", err
	}
	return "woke", h.pushCredentials(name)
}

func (h *Host) turn(name, harness, prompt string) error {
	if err := requireHarness(harness); err != nil {
		return err
	}
	if prompt == "" {
		return errors.New("プロンプトを指定してください")
	}
	if err := requireCredentials(harness); err != nil {
		return err
	}
	result, err := h.ensureUp(name)
	if err != nil {
		return err
	}
	if _, err := sbx.ExecInput(name, strings.NewReader(prompt), layout.VMBin, "vm", "enqueue", harness); err != nil {
		return err
	}
	fmt.Fprintln(h.out, result)
	return nil
}

func (h *Host) attach(args []string) error {
	fs := flag.NewFlagSet("attach", flag.ContinueOnError)
	fresh := fs.Bool("new", false, "")
	fs.SetOutput(io.Discard)
	if err := fs.Parse(args); err != nil || fs.NArg() != 2 {
		return errUsage()
	}
	name, harness := fs.Arg(0), fs.Arg(1)
	if err := requireHarness(harness); err != nil {
		return err
	}
	if err := requireCredentials(harness); err != nil {
		return err
	}
	if _, err := h.ensureUp(name); err != nil {
		return err
	}
	vmArgs := []string{layout.VMBin, "vm", "attach"}
	if *fresh {
		vmArgs = append(vmArgs, "--new")
	}
	return sbx.ExecTTY(name, append(vmArgs, harness)...)
}

func (h *Host) ls() error {
	list, err := sbx.List()
	if err != nil {
		return err
	}
	for _, s := range list {
		if strings.HasPrefix(s.Name, layout.Prefix) {
			fmt.Fprintf(h.out, "%s\t%s\t%s\n", s.Name, s.Status, s.CreatedAt)
		}
	}
	return nil
}

func (h *Host) logs(name, harness string) error {
	if err := requireHarness(harness); err != nil {
		return err
	}
	if _, err := h.ensureUp(name); err != nil {
		return err
	}
	return sbx.Attach("exec", name, layout.VMBin, "vm", "logs", harness)
}

func (h *Host) shell(name string) error {
	if _, err := h.ensureUp(name); err != nil {
		return err
	}
	return sbx.ExecTTY(name, "bash", "-c", `cd "$(cat ~/.hako/workdir 2>/dev/null || echo ~)" && exec bash -l`)
}

func (h *Host) rm(names []string) error {
	for _, n := range names {
		if err := requireName(n); err != nil {
			return err
		}
	}
	_, err := sbx.Run(append([]string{"rm", "--force"}, names...)...)
	return err
}

// MissingCredentials は、ハーネスの資格情報のうち、home の下にないファイルを返す。
func MissingCredentials(home, harness string) []string {
	var missing []string
	for _, rel := range hakofiles.Credentials(harness) {
		if _, err := os.Stat(filepath.Join(home, rel)); err != nil {
			missing = append(missing, rel)
		}
	}
	return missing
}

// requireCredentials は、ハーネスの資格情報がホストにあることを確かめる。
// ないままVMで動かすと、ハーネスがサインインを求めて止まり、理由が分かりにくいため、先に止める。
func requireCredentials(harness string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	if missing := MissingCredentials(home, harness); len(missing) > 0 {
		return fmt.Errorf("ホストに ~/%s がありません。ホストで %s にサインインしてから、もう一度実行してください", missing[0], harness)
	}
	return nil
}

// pushCredentials は、ホストにあるハーネスの資格情報を、VMの同じ場所へ写す。
// ホストのものを正とし、VMを作ったときと起こしたときに上書きする。ホストでサインインしていないハーネスの分は写さない。
func (h *Host) pushCredentials(name string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	// 起動中のハーネスが書きかけを読まないよう、別の名前で書いてから置き換える。
	script := `set -e; umask 077; mkdir -p "$(dirname "$HOME/$1")"; cat > "$HOME/$1.hako-tmp"; mv "$HOME/$1.hako-tmp" "$HOME/$1"`
	for _, harness := range hakofiles.Harnesses() {
		for _, rel := range hakofiles.Credentials(harness) {
			b, err := os.ReadFile(filepath.Join(home, rel))
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			if err != nil {
				return err
			}
			if _, err := sbx.ExecInput(name, bytes.NewReader(b), "sh", "-c", script, "sh", rel); err != nil {
				return fmt.Errorf("%s の資格情報を写せません: %w", harness, err)
			}
		}
	}
	return nil
}
