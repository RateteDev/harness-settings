#!/bin/bash
# Claude Code on the web のクラウド環境を組み立てる入口。
#
#   環境のセットアップスクリプト（コンテナ作成時に1回、root、Claude Code 起動前）
#     │ /opt/harness-settings へ clone して exec
#     ▼
#   setup.sh ─▶ settings.json を ~/.claude/settings.json へ丸ごと置く
#                 │ SessionStart フックに sync-skills.sh を登録
#                 ▼
#   Claude Code（セッション開始・再開のたび）
#     └──────▶ sync-skills.sh ─▶ ~/.claude/skills
#
# スキルの反映はフックだけが行う。セットアップ時には反映しない。
# 設定は起動中の Claude Code が監視しているため、書き込みは起動前のここで済ませる。
#
# settings.json はコメントを書けないので、各キーの意図はここに残す。
# - claude.aiから自動で注入されるコネクタ・スキル・プラグインは取り込まない。
#   スキルとプラグインは環境変数では切れず、settings.jsonのキーでしか指定できない。
# - disableClaudeAiConnectorsはClaude Code自身が取得するコネクタにしか効かず、
#   クラウドホストが--mcp-configで渡すコネクタ(Gmailなど)は止められない。
#   そのため、使うMCPサーバーを allowedMcpServers の許可リストで列挙し、それ以外を弾く。
#   拒否リストにしないのは、claude.ai側でコネクタを足すたびに見えてしまうため。
# - 許可リストの名前はホストが渡す設定上のキー名で、間違えるとgithubが使えなくなる。
#   claude-code-remoteも同時に消えるので、セッション内から環境を直せなくなる。
# - フックのcommandの絶対パスは、環境のセットアップスクリプトのclone先
#   (/opt/harness-settings)と一致させる。
#
# 非ゼロ終了はセッション起動失敗になるため、失敗は握りつぶさない。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$HOME/.claude"
cp "$SCRIPT_DIR/settings.json" "$HOME/.claude/settings.json"
