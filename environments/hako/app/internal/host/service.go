package host

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
)

// service は、ログインしていなくても動かし続けるプロセス。systemd の user unit にする。
type service struct {
	// name は unit の名前の元。
	name        string
	description string
	args        []string
	after       string
	// always が真なら、終わるたびに起動し直す。hako daemon は新しい版が入ると自分で終わり、起動し直されて入れ替わる。
	// 定義を書き換えたときもすぐ起動し直し、いまの PATH を渡す（常駐からも sbx・podman・hako を呼ぶため）。
	// sbx のデーモンは、起動し直すと動いているVMがすべて止まるため、定義を書き換えても起動し直さない。
	always bool
}

func sbxdService() (service, error) {
	path, err := exec.LookPath("sbx")
	if err != nil {
		return service{}, err
	}
	return service{name: "hako-sbxd", description: "Docker Sandboxes daemon for hako", args: []string{path, "daemon", "start"}}, nil
}

func hakoService() (service, error) {
	path, err := hakoCommand()
	if err != nil {
		return service{}, err
	}
	return service{name: "hako", description: "hako daemon", args: []string{path, "daemon"}, after: "hako-sbxd", always: true}, nil
}

// hakoCommand は、常駐させる hako のパス。版を上げても変わらないよう、PATH で見つかるもの（mise のシムなど）を使う。
func hakoCommand() (string, error) {
	if p, err := exec.LookPath("hako"); err == nil {
		return filepath.Abs(p)
	}
	return os.Executable()
}

func (s service) systemdPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "systemd", "user", s.name+".service")
}

// unit は、systemd の user unit の中身。
func (s service) unit() string {
	var b strings.Builder
	fmt.Fprintf(&b, "[Unit]\nDescription=%s\n", s.description)
	if s.after != "" {
		fmt.Fprintf(&b, "After=%s.service\nWants=%s.service\n", s.after, s.after)
	}
	fmt.Fprintf(&b, "\n[Service]\nExecStart=%s\n", strings.Join(s.args, " "))
	if s.always {
		fmt.Fprintf(&b, "Restart=always\nRestartSec=5\nEnvironment=PATH=%s\n", os.Getenv("PATH"))
	} else {
		b.WriteString("Restart=on-failure\n")
	}
	b.WriteString("\n[Install]\nWantedBy=default.target\n")
	return b.String()
}

// check は、定義がいまの中身と同じで、動いているかを確かめる。
func (s service) check() (bool, string) {
	path, want := s.systemdPath(), s.unit()
	cur, err := os.ReadFile(path)
	if err != nil {
		return false, path + " がありません"
	}
	if string(cur) != want {
		return false, path + " の中身が古くなっています"
	}
	if exec.Command("systemctl", "--user", "is-active", "--quiet", s.name+".service").Run() != nil {
		return false, "動いていません"
	}
	return true, ""
}

func (s service) install() error {
	if err := writeAtomic(s.systemdPath(), []byte(s.unit()), 0o644); err != nil {
		return err
	}
	if err := runShown("systemctl", "--user", "daemon-reload"); err != nil {
		return err
	}
	if !s.always {
		return runShown("systemctl", "--user", "enable", "--now", s.name+".service")
	}
	if err := runShown("systemctl", "--user", "enable", s.name+".service"); err != nil {
		return err
	}
	return runShown("systemctl", "--user", "restart", s.name+".service")
}

func serviceStep(name string, get func() (service, error)) step {
	return step{
		name: name,
		check: func() (bool, string) {
			s, err := get()
			if err != nil {
				return false, err.Error()
			}
			return s.check()
		},
		fix: func() error {
			s, err := get()
			if err != nil {
				return err
			}
			return s.install()
		},
	}
}

// lingerStep は、ログアウトしても user unit を動かし続けるよう、systemd の linger を有効にする。
func lingerStep() step {
	return step{
		name: "ログアウト後も動かし続ける設定（linger）",
		check: func() (bool, string) {
			u, err := user.Current()
			if err != nil {
				return false, err.Error()
			}
			out, err := exec.Command("loginctl", "show-user", u.Username, "--property=Linger").Output()
			return err == nil && strings.TrimSpace(string(out)) == "Linger=yes", "linger が有効ではありません"
		},
		fix: func() error {
			u, err := user.Current()
			if err != nil {
				return err
			}
			if exec.Command("loginctl", "enable-linger", u.Username).Run() == nil {
				return nil
			}
			return sudo("loginctl", "enable-linger", u.Username)
		},
	}
}
