package files_test

import (
	"reflect"
	"testing"

	hakofiles "github.com/RateteDev/harness-settings/environments/hako"
)

func TestParseCredentialsSkipsCommentsAndBlankLines(t *testing.T) {
	got := hakofiles.ParseCredentials([]byte("# 説明\n\n.codex/auth.json\n  .claude/.credentials.json  \n"))
	if want := []string{".codex/auth.json", ".claude/.credentials.json"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestHarnessesAreDirectoriesWithRun(t *testing.T) {
	if got := hakofiles.Harnesses(); !reflect.DeepEqual(got, []string{"claude"}) {
		t.Fatalf("run を持つディレクトリだけをハーネスとして数えるはずが: %q", got)
	}
}
