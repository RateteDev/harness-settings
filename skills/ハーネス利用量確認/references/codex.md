# Codex / ChatGPT利用状況の確認

`scripts/codex-usage.sh` を実行して、Codex OAuthに紐づくChatGPTアカウントの利用クォータ（残量・制限）を取得します。

## 前提条件
- 依存コマンド: `curl`, `jq`
- 認証情報: `~/.codex/auth.json`（スクリプト実行時に自動でトークン更新・保存されます）

## 取得データの主なフィールド
レスポンスに含まれる主要なレート制限情報は以下の通りです。

- `rate_limit.primary_window.used_percent`: 使用率（%）
- `rate_limit.primary_window.reset_at` / `reset_after_seconds`: リセット日時 / 残り秒数
- `rate_limit.secondary_window`: サブウィンドウの制限（存在する場合）
- `additional_rate_limits`: モデル別プールの制限情報

## 注意事項・制約（エージェント向け指示）

1. **認証エラー時の対応**:
   - トークンの更新に失敗した場合は、ユーザーに `codex login` の再実行を案内してください。
   - **チャット上でユーザーにアクセストークンを尋ねてはいけません。**
2. **対象データ**:
   - 反映されるのは **ChatGPTプランの利用枠** です（OpenAI API従量課金の使用量ではありません）。
3. **エンドポイント仕様**:
   - 内部非公開API（`chatgpt.com/backend-api/wham/usage`）を利用しているため、予告なく仕様変更される可能性があります。
