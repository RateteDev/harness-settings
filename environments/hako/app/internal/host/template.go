package host

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/sbx"
)

// BuildTemplate は、VMのテンプレートを作り、sbx へ読み込む。
// イメージにはハーネスごとの install だけを写す。ほかのファイルは、環境を作るときにVMへ写す。
// 道具の版を上げるために作り直すので、前回の層を使わない。作り終えたら、前の版をホストと sbx から消す。
func (h *Host) BuildTemplate() error {
	ctx, err := os.MkdirTemp("", "hako-template-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(ctx)
	if err := os.WriteFile(filepath.Join(ctx, "Containerfile"), hakofiles.Containerfile, 0o644); err != nil {
		return err
	}
	for _, name := range hakofiles.Harnesses() {
		dir := filepath.Join(ctx, "harnesses", name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, "install"), hakofiles.HarnessFile(name, "install"), 0o755); err != nil {
			return err
		}
	}
	base := baseImage(string(hakofiles.Containerfile))
	old, _ := exec.Command("podman", "image", "inspect", "--format", "{{.Id}}", layout.Template, base).Output()
	if err := runShown("podman", "build", "--no-cache", "--layers=false", "--pull=newer", "-t", layout.Template, ctx); err != nil {
		return err
	}
	tarPath := filepath.Join(ctx, "image.tar")
	if err := runShown("podman", "save", "-o", tarPath, layout.Template); err != nil {
		return err
	}
	if err := runShown("sbx", "template", "load", tarPath); err != nil {
		return err
	}
	// 名前が新しい版へ移り、どの名前も付いていない前の版だけを消す。
	dangling, _ := exec.Command("podman", "images", "-q", "--no-trunc", "-f", "dangling=true").Output()
	for _, id := range strings.Fields(string(old)) {
		if strings.Contains(string(dangling), "sha256:"+id) {
			exec.Command("podman", "rmi", id).Run()
		}
	}
	if err := pruneAssembled(); err != nil {
		return err
	}
	return writeAtomic(h.paths.TemplateSumFile(), []byte(hakofiles.TemplateSum()+"\n"), 0o644)
}

// pruneAssembled は、sbx がVMを作るたびに使ったテンプレートへ付ける別名（sandbox-kit-assembled）のうち、新しい版を指さないものを消す。
// 別名が前の版を持ち続けてディスクに溜まるため。動いているVMは自分の層を持ち続けるので、別名を消しても止まらない。
func pruneAssembled() error {
	out, err := sbx.Run("template", "ls")
	if err != nil {
		return err
	}
	repo, tag, _ := strings.Cut(layout.Template, ":")
	var current string
	lines := strings.Split(out, "\n")
	for _, l := range lines {
		if f := strings.Fields(l); len(f) >= 3 && f[0] == repo && f[1] == tag {
			current = f[2]
		}
	}
	for i, l := range lines {
		f := strings.Fields(l)
		if i == 0 || len(f) < 3 || !strings.HasSuffix(f[0], "sandbox-kit-assembled") || f[2] == current {
			continue
		}
		if _, err := sbx.Run("template", "rm", "--force", f[0]+":"+f[1]); err != nil {
			return err
		}
	}
	return nil
}

// templateState は、テンプレートが sbx にあるか、いまの hako の定義で作ったものかを返す。
func (h *Host) templateState() (loaded, current bool, err error) {
	out, err := sbx.Run("template", "ls")
	if err != nil {
		return false, false, err
	}
	repo, tag, _ := strings.Cut(layout.Template, ":")
	for _, l := range strings.Split(out, "\n") {
		if f := strings.Fields(l); len(f) >= 2 && f[0] == repo && f[1] == tag {
			loaded = true
		}
	}
	b, _ := os.ReadFile(h.paths.TemplateSumFile())
	return loaded, strings.TrimSpace(string(b)) == hakofiles.TemplateSum(), nil
}

func baseImage(containerfile string) string {
	for _, l := range strings.Split(containerfile, "\n") {
		if f := strings.Fields(l); len(f) >= 2 && strings.EqualFold(f[0], "FROM") {
			return f[1]
		}
	}
	return ""
}

func runShown(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s %s: %w", name, args[0], err)
	}
	return nil
}
