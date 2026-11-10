#!/bin/bash
# Claude Code on the web のクラウド環境を組み立てる入口。
#
#   環境のセットアップスクリプト（コンテナ作成時に1回、root、Claude Code 起動前）
#     │ /opt/harness-settings へ clone して exec
#     ▼
#   setup.sh ─▶ install-settings.sh ─▶ ~/.claude/settings.json
#                 （SessionStart フックに sync-skills.sh を登録した設定を丸ごと置く）
#
#   Claude Code（セッション開始・再開のたび）
#     └──▶ sync-skills.sh（クローンを最新にする）
#            └─exec─▶ apply.sh ─┬─▶ ~/.claude/skills
#                               └─▶ install-settings.sh ─▶ ~/.claude/settings.json
#
# スキルの反映はフックだけが行う。セットアップ時には反映しない。
# 設定はセットアップとフックの両方で置く。MCPサーバーの絞り込みなど起動時に効かせたい設定は
# フックの開始より前に読まれるため、起動前のここで置く。
# フックが置く設定は、キャッシュされた環境が古いときの補修で、置き換え後も起動中のセッションに
# 効くかどうかは確認していない。
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

"$SCRIPT_DIR/install-settings.sh"
