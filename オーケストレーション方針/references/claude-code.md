# Claude Codeハーネスの使い方

OpenCodeのメインからClaude Code CLIへ委譲するときの主なオプション。
Claude Code 2.1.296で確認。

```
claude -p "<依頼>" --output-format json | jq -r '.result'

  -p, --print                  非対話で実行し、結果を stdout へ返す。終了コードは成功0・失敗非0
  --output-format <format>     text|json|stream-json。json は result・session_id・is_error・total_cost_usd を返す
  --resume <session-id>        指定した会話を続ける。別ディレクトリからも解決できる
  --model <alias>              opus|sonnet|haiku などの別名か完全名
```

権限モードは変更せず、操作範囲はプロンプトで指示する。
推論量はユーザーの指定がある場合に限り `--effort` で渡す。
