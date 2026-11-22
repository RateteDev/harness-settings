package host

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/sbx"
)

// stopIdle は、ターン・作業役・対話のどれも動いていない環境を止める。
// VMを止めると中のプロセスもすべて止まるため、VMの中の hako vm busy が idle と答えたときだけ止める。
func (h *Host) stopIdle() error {
	list, err := sbx.List()
	if err != nil {
		return err
	}
	for _, sb := range list {
		// sbx exec は止まっているVMを起動してしまうため、動いているVMにだけ触れる。
		if !strings.HasPrefix(sb.Name, layout.Prefix) || !sb.Running() {
			continue
		}
		if err := h.sync(sb.Name, false); err != nil {
			log.Printf("%s: VMの中の hako を揃えられません: %v", sb.Name, err)
			continue
		}
		out, err := sbx.Exec(sb.Name, layout.VMBin, "vm", "busy")
		if err != nil || strings.TrimSpace(out) != "idle" {
			continue
		}
		if _, err := sbx.Run("stop", sb.Name); err != nil {
			log.Printf("%s: 止められません: %v", sb.Name, err)
			continue
		}
		fmt.Fprintln(h.out, "止めました:", sb.Name)
	}
	return nil
}

// Daemon は、1分ごとに使っていない環境を止める。
// 自分と違う版の hako が入ったら終わり、systemd に新しい版で起動し直させる。
func (h *Host) Daemon() error {
	log.SetFlags(0)
	log.SetOutput(os.Stderr)
	log.Printf("hako %s を常駐させます", h.version)
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		if err := h.stopIdle(); err != nil {
			log.Printf("使っていない環境を止められませんでした: %v", err)
		}
		if h.installedVersionChanged() {
			log.Printf("新しい版の hako が入ったため、起動し直します")
			return nil
		}
		select {
		case <-sig:
			return nil
		case <-tick.C:
		}
	}
}

// installedVersionChanged は、PATH の hako が自分と違う版を答えたら真を返す。
// 手元で作った版（dev）は版で見分けられないため、起動し直さない。
func (h *Host) installedVersionChanged() bool {
	if h.version == "dev" {
		return false
	}
	path, err := exec.LookPath("hako")
	if err != nil {
		return false
	}
	out, err := exec.Command(path, "version").Output()
	if err != nil {
		return false
	}
	v := strings.TrimSpace(string(out))
	return v != "" && v != h.version
}
