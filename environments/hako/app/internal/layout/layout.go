// Package layout は、ホストとVMの両方が同じ名前で指すファイルと値を1か所で決める。
// VMの中の ~/.hako の置き方を変えるときは、ここだけを直す。
package layout

import (
	"os"
	"path/filepath"
)

// Repo は、このリポジトリ（owner/repo）。VMはこれをクローンし、ハーネスごとの setup.sh を実行する。
const Repo = "RateteDev/harness-settings"

// RepoHakoDir は、リポジトリの中で hako のファイルを置く場所。ハーネスごとの setup.sh はこの下の <ハーネス>/ にある。
const RepoHakoDir = "environments/hako"

// Prefix は hako が作る環境の名前の頭に付ける。hako の環境でないVMに触れないための目印でもある。
const Prefix = "hako-"

// Template は hako template が sbx へ読み込むテンプレートの名前。
const Template = "localhost/hako-base:latest"

// VMHomeDir はVMの中のhakoの置き場（VMの利用者 agent のホームからの相対）。
const VMHomeDir = ".hako"

// VMHomeAbs はVMの中のhakoの置き場の絶対パス。sbx exec に渡すコマンドは VM の中で展開されないため、絶対パスで書く。
const VMHomeAbs = "/home/agent/" + VMHomeDir

// VMBin はVMの中に置く hako の実行ファイル。
const VMBin = VMHomeAbs + "/bin/hako"

// ハーネスへ渡す HAKO_MODE の値。いまどの入口から動いているかを伝える。意味は hako_instructions.md に書く。
const (
	ModeTurn        = "turn"
	ModeWorker      = "worker"
	ModeInteractive = "interactive"
)

// TmuxAttachPrefix は、対話の画面を動かす tmux のセッション名の頭。後ろにハーネスの名前が付く。
const TmuxAttachPrefix = "hako-attach-"

func TmuxAttach(harness string) string { return TmuxAttachPrefix + harness }

// VM は、VMの中の ~/.hako の下にあるファイルを指す。
type VM struct{ Root string }

// CurrentVM は、いま動いているプロセスのホームから ~/.hako を指す。VMの中で使う。
func CurrentVM() (VM, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return VM{}, err
	}
	return VM{Root: filepath.Join(home, VMHomeDir)}, nil
}

func (v VM) Path(name string) string { return filepath.Join(v.Root, name) }

// VMの中のファイル。hako が書き、hako が読む。
func (v VM) Workdir() string { return v.Path("workdir") }
func (v VM) Ready() string   { return v.Path("ready") }
func (v VM) Failed() string  { return v.Path("failed") }
func (v VM) Active() string  { return v.Path("active") }
func (v VM) Workers() string { return v.Path("workers") }
func (v VM) RepoAt() string  { return v.Path("repo-at") }
func (v VM) RepoDir() string { return v.Path("repo") }
func (v VM) SyncID() string  { return v.Path("sync-id") }

// Harnesses は、ホストが写したハーネスごとの起動方法（run など）の置き場。
func (v VM) Harnesses() string { return v.Path("harnesses") }

func (v VM) HarnessRun(harness string) string {
	return filepath.Join(v.Harnesses(), harness, "run")
}

func (v VM) HarnessFile(harness, name string) string {
	return filepath.Join(v.Harnesses(), harness, name)
}

// State は、ハーネスごとの会話とターンの状態の置き場。1つのVMで複数のハーネスを動かせるよう、ハーネスで分ける。
func (v VM) State(harness string) State {
	return State{Root: filepath.Join(v.Root, "state", harness)}
}

type State struct{ Root string }

func (s State) Path(name string) string { return filepath.Join(s.Root, name) }
func (s State) Queue() string           { return s.Path("queue") }
func (s State) QueueTmp() string        { return s.Path("queue.tmp") }
func (s State) SessionID() string       { return s.Path("session-id") }

// InteractiveSessionID は、対話の会話のID。ターンの会話とは別に1つ持ち、hako attach のたびに続ける。
func (s State) InteractiveSessionID() string { return s.Path("interactive-session-id") }
func (s State) SessionLog() string           { return s.Path("session.log") }
func (s State) TurnsLog() string             { return s.Path("turns.log") }
func (s State) TurnsLock() string            { return s.Path("turns.lock") }
