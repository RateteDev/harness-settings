package vm_test

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/layout"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/vm"
)

// newVM は、準備の済んだVMの ~/.hako を一時ディレクトリに作る。
// ハーネスの run は、受け取った動かし方・会話のID・入口・プロンプトを1行ずつ出す。
func newVM(t *testing.T) layout.VM {
	t.Helper()
	v := layout.VM{Root: t.TempDir()}
	run := v.HarnessRun("claude")
	must(t, os.MkdirAll(filepath.Dir(run), 0o755))
	must(t, os.WriteFile(run, []byte("#!/bin/sh\nprintf 'mode=%s id=%s via=%s prompt=%s\\n' \"$1\" \"$HAKO_SESSION_ID\" \"$HAKO_MODE\" \"$2\"\n"), 0o755))
	must(t, os.WriteFile(v.Ready(), nil, 0o644))
	must(t, os.WriteFile(v.Workdir(), []byte(t.TempDir()+"\n"), 0o644))
	// リポジトリを取り直さないよう、反映したばかりにしておく。
	must(t, os.WriteFile(v.RepoAt(), []byte(strconv.FormatInt(time.Now().Unix(), 10)), 0o644))
	return v
}

func queue(t *testing.T, v layout.VM, name, prompt string) {
	t.Helper()
	st := v.State("claude")
	must(t, os.MkdirAll(st.Queue(), 0o755))
	must(t, os.WriteFile(filepath.Join(st.Queue(), name), []byte(prompt), 0o644))
}

func sessionLog(t *testing.T, v layout.VM) []string {
	t.Helper()
	b, err := os.ReadFile(v.State("claude").SessionLog())
	must(t, err)
	var lines []string
	for _, l := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(l, "mode=") {
			lines = append(lines, l)
		}
	}
	return lines
}

func TestTurnsJoinsQueuedPromptsIntoOneTurnInOrder(t *testing.T) {
	v := newVM(t)
	queue(t, v, "00000000000000000002", "後の頼みごと")
	queue(t, v, "00000000000000000001", "先の頼みごと")
	must(t, vm.Turns(v, "claude"))
	got := sessionLog(t, v)
	if len(got) != 1 || !strings.HasSuffix(got[0], "via=turn prompt=先の頼みごと") {
		t.Fatalf("1つのターンに積んだ順でまとめて渡すはずが: %q", got)
	}
}

func TestTurnsContinuesTheSameConversation(t *testing.T) {
	v := newVM(t)
	queue(t, v, "00000000000000000001", "一つ目")
	must(t, vm.Turns(v, "claude"))
	queue(t, v, "00000000000000000002", "二つ目")
	must(t, vm.Turns(v, "claude"))
	got := sessionLog(t, v)
	if len(got) != 2 || !strings.HasPrefix(got[0], "mode=start") || !strings.HasPrefix(got[1], "mode=resume") {
		t.Fatalf("始めてから続けるはずが: %q", got)
	}
	id := strings.Fields(got[0])[1]
	if id == "id=" || id != strings.Fields(got[1])[1] {
		t.Fatalf("同じ会話のIDで続けるはずが: %q", got)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
