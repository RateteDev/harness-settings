package vm

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

// Setup は、ホストが環境を作った直後に切り離して起動し、ターンを動かせる状態まで整える。1つのVMで1回だけ動く。
// 終わったら ~/.hako/ready、失敗したら ~/.hako/failed を置く。
func Setup(v layout.VM, repo string) (err error) {
	defer func() {
		if err != nil {
			touch(v.Failed())
			return
		}
		touch(v.Ready())
		fmt.Println("== 準備ができました")
	}()
	fmt.Println("== git")
	out, err := exec.Command("gh", "api", "user").Output()
	if err != nil {
		return fmt.Errorf("gh api user: %w（GitHub の鍵を sbx secret set github で登録しているか確かめてください）", err)
	}
	var user struct {
		Login string `json:"login"`
		ID    int64  `json:"id"`
	}
	if err := json.Unmarshal(out, &user); err != nil {
		return err
	}
	if err := run("git", "config", "--global", "user.name", user.Login); err != nil {
		return err
	}
	email := fmt.Sprintf("%d+%s@users.noreply.github.com", user.ID, user.Login)
	if err := run("git", "config", "--global", "user.email", email); err != nil {
		return err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	workdir := filepath.Join(home, "workspace")
	if err := os.MkdirAll(workdir, 0o755); err != nil {
		return err
	}
	if repo != "" {
		fmt.Println("==", repo)
		_, name, _ := strings.Cut(repo, "/")
		workdir = filepath.Join(workdir, name)
		if err := run("gh", "repo", "clone", repo, workdir); err != nil {
			return err
		}
		for _, f := range []string{"mise.toml", ".mise.toml", ".tool-versions"} {
			if exists(filepath.Join(workdir, f)) {
				for _, args := range [][]string{{"trust", "--yes"}, {"install", "--yes"}} {
					cmd := exec.Command("mise", args...)
					cmd.Dir, cmd.Stdout, cmd.Stderr = workdir, os.Stdout, os.Stderr
					if err := cmd.Run(); err != nil {
						return fmt.Errorf("mise %s: %w", args[0], err)
					}
				}
				break
			}
		}
	}
	if err := os.WriteFile(v.Workdir(), []byte(workdir+"\n"), 0o644); err != nil {
		return err
	}

	if err := ApplySettings(v); err != nil {
		return err
	}
	return Installed(v)
}

// ApplySettings は、このリポジトリの最新を取り、各ハーネスの setup.sh を実行する。
// ハーネスに何を知らせるか（行動規範・スキル・MCPサーバー・設定）は、リポジトリの側が決める。
func ApplySettings(v layout.VM) error {
	fmt.Println("==", layout.Repo)
	dir := v.RepoDir()
	if exists(filepath.Join(dir, ".git")) {
		if err := run("git", "-C", dir, "fetch", "--quiet", "--depth", "1", "origin", "HEAD"); err != nil {
			return err
		}
		if err := run("git", "-C", dir, "reset", "--quiet", "--hard", "FETCH_HEAD"); err != nil {
			return err
		}
	} else if err := run("gh", "repo", "clone", layout.Repo, dir, "--", "--depth", "1", "--quiet"); err != nil {
		return err
	}
	for _, h := range hakofiles.Harnesses() {
		fmt.Printf("== %s の設定\n", h)
		if err := run(filepath.Join(dir, layout.RepoHakoDir, h, "setup.sh")); err != nil {
			return err
		}
	}
	return os.WriteFile(v.RepoAt(), []byte(strconv.FormatInt(time.Now().Unix(), 10)+"\n"), 0o644)
}

// refreshSettings は、前に反映してから10分を過ぎていれば設定を取り直す。
// 止めていたVMを起こしたときに最新を反映するためで、取れなくても前の設定のまま動く。
func refreshSettings(v layout.VM) error {
	s, _ := readTrim(v.RepoAt())
	at, _ := strconv.ParseInt(s, 10, 64)
	if time.Since(time.Unix(at, 0)) < 10*time.Minute {
		return nil
	}
	logf, err := os.OpenFile(v.Path("settings.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer logf.Close()
	self, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(self, "vm", "settings")
	cmd.Stdout, cmd.Stderr = logf, logf
	return cmd.Run()
}

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	return nil
}
