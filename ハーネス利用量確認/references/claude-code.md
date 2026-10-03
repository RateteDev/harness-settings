# Claude Codeの利用状況

`scripts/claude-code-usage.sh`はClaude CodeのOAuth認証情報から現在のアクセストークンを読み、`GET https://api.anthropic.com/api/oauth/usage`を呼び出す。
認証情報は更新・保存せず、レスポンスから使用量ウィンドウとリセット時刻のみを出力する。

出力の`data_type`はライブのクォータを示す。
`limits`配列の`kind`・`percent`・`resets_at`が使用量とリセット時刻で、対応する新形式がない場合は従来形式のウィンドウを出力する。

スクリプトには`curl`、`jq`、Claude Code CLIが必要である。
認証エラー時はClaude Codeで再ログインしてから再実行する。
レート制限時は再試行を連続させない。

このエンドポイントは非公開APIであり、挙動は保証されません。
