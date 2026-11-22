package host

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/sbx"
)

// step は、hako を使える状態にするための1つの条件。check で確かめ、満たしていなければ setup が fix で直す。
// fix が nil の条件は、hako では直せず、案内だけを出す。
type step struct {
	name  string
	check func() (bool, string)
	fix   func() error
}

// Setup は、満たしていない条件だけを順に直す。何度実行しても同じ状態になる。
func (h *Host) Setup(args []string) error {
	if len(args) != 0 {
		return errUsage()
	}
	for _, s := range h.steps() {
		ok, detail := s.check()
		if ok {
			fmt.Fprintf(h.out, "✔ %s\n", s.name)
			continue
		}
		if s.fix == nil {
			fmt.Fprintf(h.out, "✘ %s: %s\n", s.name, detail)
			continue
		}
		fmt.Fprintf(h.out, "… %s: %s。直します\n", s.name, detail)
		if err := s.fix(); err != nil {
			return fmt.Errorf("%s: %w", s.name, err)
		}
		if ok, detail := s.check(); !ok {
			return fmt.Errorf("%s: 直した後も満たしていません: %s", s.name, detail)
		}
		fmt.Fprintf(h.out, "✔ %s\n", s.name)
	}
	return nil
}

// Doctor は、条件を確かめて結果を出すだけで、何も変えない。
func (h *Host) Doctor(args []string) error {
	if len(args) != 0 {
		return errUsage()
	}
	failed := 0
	for _, s := range h.steps() {
		ok, detail := s.check()
		if ok {
			fmt.Fprintf(h.out, "✔ %s\n", s.name)
			continue
		}
		failed++
		hint := "hako setup で直せます"
		if s.fix == nil {
			hint = "hako では直せません"
		}
		fmt.Fprintf(h.out, "✘ %s: %s（%s）\n", s.name, detail, hint)
	}
	if failed > 0 {
		return fmt.Errorf("%d件の条件を満たしていません", failed)
	}
	return nil
}

func (h *Host) steps() []step {
	steps := []step{
		{name: "対応するOS", check: func() (bool, string) {
			return runtime.GOOS == "linux", runtime.GOOS + " には対応していません"
		}},
		{name: "PATH の hako", check: checkPath},
		kvmStep(),
		{name: "sbx", check: lookPath("sbx"), fix: installSbx},
		{name: "Podman", check: lookPath("podman"), fix: func() error { return sudo("apt-get", "install", "-y", "podman") }},
		lingerStep(),
		serviceStep("sbx のデーモンの常駐", sbxdService),
		{name: "Docker へのサインイン", check: func() (bool, string) {
			_, err := sbx.List()
			return err == nil, "sbx を使えません（サインインしていないか、sbx のデーモンが動いていません）"
		}, fix: func() error { return sbx.Attach("login") }},
		{name: "通信の方針", check: func() (bool, string) {
			out, err := sbx.Run("policy", "ls")
			return err == nil && strings.TrimSpace(out) != "", "sbx の全体の方針が決まっていません"
		}, fix: func() error {
			_, err := sbx.Run("policy", "init", "balanced")
			return err
		}},
		{name: "GitHub の鍵", check: func() (bool, string) {
			rows, err := sbx.Secrets()
			if err != nil {
				return false, err.Error()
			}
			for _, r := range rows {
				for _, f := range r {
					if f == "github" {
						return true, ""
					}
				}
			}
			return false, "sbx に github の鍵がありません"
		}, fix: func() error {
			fmt.Fprintln(h.out, "使うリポジトリに届く fine-grained PAT を登録します。")
			return sbx.Attach("secret", "set", "github")
		}},
	}
	for _, name := range hakofiles.Harnesses() {
		harness := name
		// サインインはハーネスごとに画面が違うため、hako では直さず、案内だけを出す。
		steps = append(steps, step{name: harness + " の資格情報", check: func() (bool, string) {
			home, err := os.UserHomeDir()
			if err != nil {
				return false, err.Error()
			}
			if missing := MissingCredentials(home, harness); len(missing) > 0 {
				return false, "ホストに ~/" + missing[0] + " がありません。ホストで " + harness + " にサインインしてください"
			}
			return true, ""
		}})
	}
	steps = append(steps,
		step{name: "テンプレート", check: func() (bool, string) {
			loaded, current, err := h.templateState()
			switch {
			case err != nil:
				return false, err.Error()
			case !loaded:
				return false, "sbx にテンプレートがありません"
			case !current:
				return false, "いまの hako の定義で作ったテンプレートではありません"
			}
			return true, ""
		}, fix: h.BuildTemplate},
		serviceStep("hako daemon の常駐", hakoService),
	)
	return steps
}

func lookPath(name string) func() (bool, string) {
	return func() (bool, string) {
		_, err := exec.LookPath(name)
		return err == nil, name + " が PATH にありません"
	}
}

// checkPath は、PATH の hako がいま動いている hako と同じものかを確かめる。
// 常駐とホストの連携サーバーは PATH の hako を呼ぶため、古い版が先に見つかると食い違う。
func checkPath() (bool, string) {
	path, err := exec.LookPath("hako")
	if err != nil {
		return false, "hako が PATH にありません。mise use -g github:RateteDev/harness-settings で入れてください"
	}
	self, err := os.Executable()
	if err != nil {
		return false, err.Error()
	}
	a, errA := filepath.EvalSymlinks(path)
	b, errB := filepath.EvalSymlinks(self)
	if errA == nil && errB == nil && a == b {
		return true, ""
	}
	// mise のシムは mise 本体へのリンクなので、版を聞いて同じものかを見る。
	out, err := exec.Command(path, "version").Output()
	selfOut, err2 := exec.Command(self, "version").Output()
	if err == nil && err2 == nil && strings.TrimSpace(string(out)) == strings.TrimSpace(string(selfOut)) {
		return true, ""
	}
	return false, fmt.Sprintf("PATH の hako（%s）が、いま動いている hako と違います", path)
}

func kvmStep() step {
	return step{
		name: "KVM",
		check: func() (bool, string) {
			if _, err := os.Stat("/dev/kvm"); err != nil {
				return false, "/dev/kvm がありません（BIOS・UEFI で仮想化を有効にしてください）"
			}
			f, err := os.OpenFile("/dev/kvm", os.O_RDWR, 0)
			if err != nil {
				return false, "/dev/kvm を使う権限がありません"
			}
			f.Close()
			return true, ""
		},
		fix: func() error {
			if _, err := os.Stat("/dev/kvm"); err != nil {
				return errors.New("KVM が有効ではありません。BIOS・UEFI で仮想化を有効にしてから、もう一度実行してください")
			}
			u, err := user.Current()
			if err != nil {
				return err
			}
			if err := sudo("usermod", "-aG", "kvm", u.Username); err != nil {
				return err
			}
			return errors.New("kvm のグループに入りました。ログインし直してから、もう一度 hako setup を実行してください")
		},
	}
}

func installSbx() error {
	// Docker Engine は入れず、Docker の apt リポジトリだけを登録して sbx を入れる。
	script, err := download("https://get.docker.com")
	if err != nil {
		return err
	}
	defer os.Remove(script)
	if err := sudo("env", "REPO_ONLY=1", "sh", script); err != nil {
		return err
	}
	return sudo("apt-get", "install", "-y", "docker-sbx")
}

func download(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s を取れません: %s", url, resp.Status)
	}
	f, err := os.CreateTemp("", "hako-download-")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// sudo は、管理者の権限で動かす。何を動かすかを先に表示する。
func sudo(args ...string) error {
	fmt.Println("$ sudo", strings.Join(args, " "))
	return runShown("sudo", args...)
}
