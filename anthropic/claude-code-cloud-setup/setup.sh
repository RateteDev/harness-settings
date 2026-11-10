#!/bin/bash
# Claude Code on the web のクラウド環境を組み立てる入口。
#
#   環境のセットアップスクリプト（コンテナ作成時に1回、root、Claude Code 起動前）
#     │ /opt/harness-settings へ clone して exec
#     ▼
#   setup.sh
#     ├─(1)─▶ sync-skills.sh ─▶ ~/.claude/skills
#     └─(2)─▶ ~/.claude/settings.json
#                 │ SessionStart フックに sync-skills.sh を登録
#                 ▼
#   Claude Code（セッション開始・再開のたび）
#     └──────▶ sync-skills.sh ─▶ ~/.claude/skills
#
# (1) を先に行うのは、フックが効かない環境でもセットアップ時点のスキルを残すため。
# 非ゼロ終了はセッション起動失敗になるため、失敗は握りつぶさない。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-skills.sh"

# claude.aiから自動で注入されるコネクタ・スキル・プラグインは取り込まない。
# スキルとプラグインは環境変数では切れず、settings.jsonのキーでしか指定できない。
# disableClaudeAiConnectorsはClaude Code自身が取得するコネクタにしか効かず、
# クラウドホストが--mcp-configで渡すコネクタ(Gmailなど)は止められない。
# そのため、使うMCPサーバーを許可リストで列挙し、それ以外を弾く。
# 拒否リストにしないのは、claude.ai側でコネクタを足すたびに見えてしまうため。
# 許可リストの名前はホストが渡す設定上のキー名で、間違えるとgithubが使えなくなる。
# claude-code-remoteも同時に消えるので、セッション内から環境を直せなくなる。
# 管理するキーだけを既存の設定へ重ね、それ以外のキーは残す。
# 配列(hooks.SessionStart, allowedMcpServers)は重ねると丸ごと置き換わるため、再実行しても重複しない。
install_user_settings() {
  local file="$HOME/.claude/settings.json"
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || echo '{}' > "$file"
  jq --arg sync "$SYNC_SCRIPT" '. * {
    "disableClaudeAiConnectors": true,
    "syncClaudeAiSkills": false,
    "syncClaudeAiPlugins": false,
    "allowedMcpServers": [
      { "serverName": "github" },
      { "serverName": "claude-code-remote" }
    ],
    "hooks": {
      "SessionStart": [
        {
          "matcher": "startup|resume",
          "hooks": [{ "type": "command", "command": $sync }]
        }
      ]
    }
  }' "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
}

main() {
  "$SYNC_SCRIPT"
  install_user_settings
}

# sync-skills.sh がこのファイルを含むクローンを書き換えうるため、呼び出しと終了を同じ行に置く。
main "$@"; exit
