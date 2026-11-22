package vm

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
)

// 最後のターンからこの間は止めない。ホストが積んでから turns が鍵を取るまでの間に止めないため。
const recentTurn = 2 * time.Minute

// 対話の画面から抜けた後も、この間に画面が動いていれば止めない。
// 作業中のハーネスは画面を書き換え続け、待っているハーネスは書き換えないため、画面の動きで作業中かを見る。
const interactiveQuiet = 10 * time.Minute

// Busy は、VMを止めてはいけない理由を返す。止めてよいときは空を返す。
// VMを止めると中のプロセスもすべて止まるため、動いているものが1つでもあれば止めない。
func Busy(v layout.VM, now time.Time) (string, error) {
	if !exists(v.Ready()) && !exists(v.Failed()) {
		return "setup", nil
	}
	for _, h := range hakofiles.Harnesses() {
		st := v.State(h)
		if !exists(st.Root) {
			continue
		}
		lock, ok, err := tryLock(st.TurnsLock())
		if err != nil {
			return "", err
		}
		if !ok {
			return "turn", nil
		}
		lock.Close()
		if len(queued(st)) > 0 {
			return "queued", nil
		}
	}
	if workersAlive(v) {
		return "worker", nil
	}
	if st, err := os.Stat(v.Active()); err == nil && now.Sub(st.ModTime()) < recentTurn {
		return "recent", nil
	}
	for name, s := range tmuxSessions() {
		if strings.HasPrefix(name, layout.TmuxAttachPrefix) && (s.attached || now.Sub(s.activity) < interactiveQuiet) {
			return "interactive", nil
		}
	}
	return "", nil
}

func workersAlive(v layout.VM) bool {
	pids, _ := filepath.Glob(filepath.Join(v.Workers(), "*.pid"))
	for _, p := range pids {
		s, err := readTrim(p)
		if err != nil {
			continue
		}
		pid, err := strconv.Atoi(s)
		if err != nil {
			continue
		}
		// VMを生かしている最初のプロセス（sleep infinity）を巻き込まないよう、番号で確かめる。
		if syscall.Kill(pid, 0) == nil {
			return true
		}
	}
	return false
}

type tmuxState struct {
	attached bool
	activity time.Time
}

// tmuxSessions は、tmux のセッションの様子を名前ごとに返す。tmux のサーバーが動いていなければ空を返す。
func tmuxSessions() map[string]tmuxState {
	sessions := map[string]tmuxState{}
	// tmux は書式の中の制御文字（タブなど）を _ に置き換えて出すため、空白で区切る。hako のセッション名は空白を含まない。
	out, err := exec.Command("tmux", "list-sessions", "-F", "#{session_name} #{session_attached} #{session_activity}").Output()
	if err != nil {
		return sessions
	}
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) != 3 {
			continue
		}
		n, _ := strconv.Atoi(f[1])
		sec, _ := strconv.ParseInt(f[2], 10, 64)
		sessions[f[0]] = tmuxState{attached: n > 0, activity: time.Unix(sec, 0)}
	}
	return sessions
}
