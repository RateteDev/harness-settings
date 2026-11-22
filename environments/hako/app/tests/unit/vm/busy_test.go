package vm_test

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/vm"
)

func TestBusyIsIdleWhenNothingRuns(t *testing.T) {
	v := newVM(t)
	reason, err := vm.Busy(v, time.Now())
	must(t, err)
	if reason != "" {
		t.Fatalf("何も動いていなければ止めてよいはずが: %s", reason)
	}
}

func TestBusyKeepsVMWhileWorkerRuns(t *testing.T) {
	v := newVM(t)
	must(t, os.MkdirAll(v.Workers(), 0o755))
	must(t, os.WriteFile(filepath.Join(v.Workers(), "w.pid"), []byte(strconv.Itoa(os.Getpid())), 0o644))
	if reason, _ := vm.Busy(v, time.Now()); reason != "worker" {
		t.Fatalf("作業役が動いていれば止めないはずが: %q", reason)
	}
}

func TestBusyKeepsVMWhilePromptIsQueued(t *testing.T) {
	v := newVM(t)
	queue(t, v, "00000000000000000001", "頼みごと")
	if reason, _ := vm.Busy(v, time.Now()); reason != "queued" {
		t.Fatalf("積まれた頼みごとが残っていれば止めないはずが: %q", reason)
	}
}

func TestBusyWaitsAfterTheLastTurn(t *testing.T) {
	v := newVM(t)
	must(t, os.WriteFile(v.Active(), nil, 0o644))
	if reason, _ := vm.Busy(v, time.Now()); reason != "recent" {
		t.Fatalf("最後のターンの直後は止めないはずが: %q", reason)
	}
}
