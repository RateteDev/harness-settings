// hako は、隔離したVM（Docker Sandboxes）を持ち続け、その中のコーディングエージェントを動かす。
// ホストでは環境を作る・起こす・止めるコマンドとして、VMの中では hako vm と hako-worker として動く1つの実行ファイルである。
package main

import (
	"os"
	"path/filepath"

	"github.com/RateteDev/harness-settings/environments/hako/app/internal/host"
	"github.com/RateteDev/harness-settings/environments/hako/app/internal/vm"
)

// version は、リリースのときにビルドの引数で埋め込む。
var version = "dev"

func main() {
	// VMの中のエージェントは hako-worker という名前で呼ぶ。名前で入口を分け、VMの中にスクリプトを置かずに済ませる。
	if filepath.Base(os.Args[0]) == "hako-worker" {
		os.Exit(vm.Main(append([]string{"worker"}, os.Args[1:]...)))
	}
	if len(os.Args) > 1 && os.Args[1] == "vm" {
		os.Exit(vm.Main(os.Args[2:]))
	}
	os.Exit(host.Main(version, os.Args[1:]))
}
