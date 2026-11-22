package host_test

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/host"
)

func TestMissingCredentialsReportsFilesAbsentFromHome(t *testing.T) {
	home := t.TempDir()
	if got := host.MissingCredentials(home, "claude"); !reflect.DeepEqual(got, []string{".claude/.credentials.json"}) {
		t.Fatalf("サインインしていなければ、ない資格情報を返すはずが: %q", got)
	}
	path := filepath.Join(home, ".claude", ".credentials.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := host.MissingCredentials(home, "claude"); len(got) != 0 {
		t.Fatalf("サインイン済みなら何も返さないはずが: %q", got)
	}
}
