# CodexとChatGPTの利用状況

`scripts/codex-usage.sh`は、`~/.codex/auth.json`（`CODEX_HOME`があればその下）を読み、Codex CLIのOAuthクライアントとしてアクセストークンを更新する。
refresh tokenは更新のたびに入れ替わるため、更新後の認証情報を`auth.json`へアトミックに保存してから、`GET https://chatgpt.com/backend-api/wham/usage`を呼び出す。
このため、スクリプトの実行は`auth.json`を書き換える。

## 出力

応答はライブのクォータである。
主なフィールドは次のとおり。

- `rate_limit.primary_window.used_percent`
- `rate_limit.primary_window.reset_at`と`reset_after_seconds`
- 存在する場合の`rate_limit.secondary_window`
- モデル別プールの`additional_rate_limits`

反映されるのは、Codex OAuthログインに紐づくChatGPTプランの利用枠である。
OpenAI APIの従量課金の使用量は含まない。

## 前提と障害時

- スクリプトには`curl`と`jq`が必要である。
- トークンの更新に失敗した場合は、ユーザーが`codex login`で再ログインする。
  トークンはチャットで求めず、ユーザーのログインで更新する。
- WHAMエンドポイントは非公開であり、変更され得る。
