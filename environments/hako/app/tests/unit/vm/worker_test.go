package vm_test

import (
	"testing"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/vm"
)

func TestWorkerUsesCallersHarnessWhenOmitted(t *testing.T) {
	h, p, err := vm.ParseWorkerArgs([]string{"- 箇条書きの頼みごと"}, "claude")
	must(t, err)
	if h != "claude" || p != "- 箇条書きの頼みごと" {
		t.Fatalf("呼んだ側のハーネスで、頼みごとをそのまま渡すはずが: %q %q", h, p)
	}
}

func TestWorkerRejectsUnknownHarness(t *testing.T) {
	if _, _, err := vm.ParseWorkerArgs([]string{"nonexistent", "頼みごと"}, "claude"); err == nil {
		t.Fatal("知らないハーネスでは作業役を起動しないはず")
	}
}

func TestWorkerRejectsOptionLikePrompt(t *testing.T) {
	if _, _, err := vm.ParseWorkerArgs([]string{"--version"}, "claude"); err == nil {
		t.Fatal("版を確かめるつもりの呼び出しで作業役を起動しないはず")
	}
}

func TestWorkerNeedsHarnessOutsideOfHarness(t *testing.T) {
	if _, _, err := vm.ParseWorkerArgs([]string{"頼みごと"}, ""); err == nil {
		t.Fatal("呼んだ側のハーネスが分からなければ、指定を求めるはず")
	}
}
