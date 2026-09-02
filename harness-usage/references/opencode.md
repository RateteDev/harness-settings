# OpenCode Go

`scripts/opencode-go-usage.sh`はOpenCode GoのAPIキーで`GET https://opencode.ai/zen/go/v1/usage`を呼び出す。ローリング5時間・週次・月次の各ウィンドウについて、正確なライブのサブスクリプション使用量とリセット時刻を返す。

キーは対話的に渡すか、コマンド実行時だけ`OPENCODE_GO_API_KEY`を設定する。設定ファイル、シェル履歴、スキル、チャットへキーを書かない。

```sh
OPENCODE_GO_API_KEY="$OPENCODE_GO_API_KEY" scripts/opencode-go-usage.sh
```

エンドポイントは公開されているGo APIリファレンスに記載されていない。変更された場合は、OpenCode Zen Consoleで最新の使用量を確認する。
