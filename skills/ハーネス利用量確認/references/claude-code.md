# Claude Code利用状況の確認

`scripts/claude-code-usage.sh` を実行し、Claude Codeの使用量とリセット時刻を取得します。
※OAuth認証情報を読み取り専用で使用し、非公開API（`GET /api/oauth/usage`）を呼び出します。

## 前提条件
- `curl`, `jq` がインストールされていること
- Claude Code CLIでログイン済みであること

## 実行方法
```bash
./scripts/claude-code-usage.sh
```

## 出力内容
- **使用量**: `limits[].kind`, `limits[].percent`（使用率）
- **リセット時刻**: `limits[].resets_at`
※新形式のデータがない場合は、従来形式のウィンドウ情報をフォールバック表示します。

## トラブルシューティング
- **認証エラー（401等）**: Claude Code CLIで再ログイン後、スクリプトを再実行してください。
- **レート制限（429）**: 即座に再試行せず、時間をおいてから実行してください。

## 注意事項
- Anthropicの非公開APIを使用しているため、予告なく仕様変更される可能性があります。
