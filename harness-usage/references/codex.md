# CodexとChatGPTの利用状況

`scripts/codex-usage.sh`は`~/.codex/auth.json`を読み、Codex CLIのOAuthクライアント経由でOAuthアクセストークンを更新した後、更新後の認証情報をアトミックに保存してから、`GET https://chatgpt.com/backend-api/wham/usage`を呼び出す。

応答はライブのクォータデータである。主なフィールドは次の通り。

- `rate_limit.primary_window.used_percent`
- `rate_limit.primary_window.reset_at`と`reset_after_seconds`
- 存在する場合の`rate_limit.secondary_window`
- モデル別プールの`additional_rate_limits`

スクリプトには`curl`と`jq`が必要である。トークンの更新に失敗した場合は、ユーザーが`codex login`で再ログインする必要がある。チャットでトークンを要求してはならない。

WHAMエンドポイントは非公開で、変更され得る。このエンドポイントが反映するのはCodex OAuthログインに紐づくChatGPTプランであって、API課金の使用量ではない。
