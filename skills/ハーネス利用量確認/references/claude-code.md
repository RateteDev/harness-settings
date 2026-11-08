# Claude Codeの利用状況

`scripts/claude-code-usage.sh`は、Claude CodeのOAuth認証情報から現在のアクセストークンを読み、`GET https://api.anthropic.com/api/oauth/usage`を呼び出す。
認証情報は読むだけで、更新も保存もしない。
レスポンスからは使用量ウィンドウとリセット時刻だけを出力する。

## 出力

- `data_type`は、データがライブのクォータであることを示す。
- `limits`配列の`kind`・`percent`・`resets_at`が、使用量とリセット時刻である。
- 新形式の`limits`が無い応答では、従来形式のウィンドウ（`five_hour`や`seven_day`など）を同じ形に変換して出力する。

## 前提と障害時

- スクリプトには`curl`、`jq`、Claude Code CLIが必要である。
  CLIの版数を`User-Agent`に載せるためである。
- 認証エラーのときは、ユーザーがClaude Codeで再ログインしてから再実行する。
- レート制限のときは、再試行を連続させず、時間を置く。
- このエンドポイントは非公開APIであり、挙動は保証されない。
