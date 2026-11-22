package host

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"os"
	"strings"
	"time"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/sbx"
)

// payload は、VMの ~/.hako へ写すもの（VM用の hako、ハーネスごとの起動方法、エージェントに知らせること）。
// 中身の要約を sync-id としてVMに残し、ホストの hako が変わったときだけ写し直す。
type payload struct {
	tar []byte
	id  string
}

func buildPayload() (*payload, error) {
	// VMはホストと同じアーキテクチャの Linux で動くため、自分自身を写す。
	self, err := os.Executable()
	if err != nil {
		return nil, err
	}
	bin, err := os.ReadFile(self)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	now := time.Now()
	add := func(name string, mode int64, b []byte) error {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: mode, Size: int64(len(b)), ModTime: now, Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		_, err := tw.Write(b)
		return err
	}
	h := sha256.New()
	h.Write(bin)
	if err := add("bin/hako", 0o755, bin); err != nil {
		return nil, err
	}
	h.Write(hakofiles.Instructions)
	if err := add("hako_instructions.md", 0o644, hakofiles.Instructions); err != nil {
		return nil, err
	}
	harnesses := hakofiles.HarnessFS()
	err = fs.WalkDir(harnesses, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := fs.ReadFile(harnesses, path)
		if err != nil {
			return err
		}
		mode := int64(0o644)
		if strings.HasSuffix(path, "/run") || strings.HasSuffix(path, "/install") {
			mode = 0o755
		}
		h.Write([]byte(path))
		h.Write(b)
		return add("harnesses/"+path, mode, b)
	})
	if err != nil {
		return nil, err
	}
	id := hex.EncodeToString(h.Sum(nil))
	if err := add("sync-id", 0o644, []byte(id+"\n")); err != nil {
		return nil, err
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	return &payload{tar: buf.Bytes(), id: id}, nil
}

// sync は、VMの ~/.hako にある hako と、一緒に写すファイルを、いまのホストの hako に揃える。
// force でなければ、VMの sync-id が同じときは写さない。
func (h *Host) sync(name string, force bool) error {
	p, err := h.payload()
	if err != nil {
		return err
	}
	if !force {
		cur, _ := sbx.Exec(name, "cat", layout.VMHomeAbs+"/sync-id")
		if strings.TrimSpace(cur) == p.id {
			return nil
		}
	}
	// 消したハーネスのファイルが残らないよう、写す前に消す。
	script := `set -e; mkdir -p ~/.hako; rm -rf ~/.hako/harnesses; tar -C ~/.hako -xf -`
	if _, err := sbx.ExecInput(name, bytes.NewReader(p.tar), "sh", "-c", script); err != nil {
		return err
	}
	// ~/.hako/ready があれば準備は済んでいるので、hako-worker の名前だけ整え直す。
	_, err = sbx.Exec(name, "sh", "-c", `[ ! -f ~/.hako/ready ] || `+layout.VMBin+` vm installed`)
	return err
}

func (h *Host) payload() (*payload, error) {
	if h.pl == nil {
		p, err := buildPayload()
		if err != nil {
			return nil, err
		}
		h.pl = p
	}
	return h.pl, nil
}
