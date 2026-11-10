#!/bin/bash
# settings.json を ~/.claude/settings.json へ丸ごと置く。内容が同じなら何もしない。
# Claude Code on the web のクラウド環境を組み立てる流れの要でもあるため、全体の図をここに置く。
#
#   環境のセットアップスクリプト（setup-script.sh を、環境の設定画面の欄に貼ったもの）
#     │ コンテナ作成時に1回、root、Claude Code 起動前。クローンを最新にして exec
#     ▼
#   install-settings.sh ─▶ ~/.claude/settings.json
#     （SessionStart フックに session-start.sh を登録した設定を丸ごと置く）
#
#   Claude Code（セッション開始・再開のたび）
#     └──▶ session-start.sh（クローンを最新にする）
#            └─exec─▶ apply.sh ─┬─▶ ~/.claude/skills
#                               └─▶ install-settings.sh ─▶ ~/.claude/settings.json
#
# スキルの反映はフックだけが行う。セットアップ時には反映しない。
# 設定はセットアップとフックの両方で置く。MCPサーバーの絞り込みなど起動時に効かせたい設定は
# フックの開始より前に読まれるため、起動前のセットアップで置く。
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
# - フックのcommandの絶対パスは、setup-script.sh の REPO_DIR と一致させる。
#
# 非ゼロ終了はセッション起動失敗になるため、失敗は握りつぶさない。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/settings.json"
DEST="$HOME/.claude/settings.json"

# 空白や改行だけの違いを差分とみなして書き換えないよう、キーを整列した JSON で比べる。
# 壊れた JSON は差分として置き換える。
src_json="$(jq -S . "$SRC")"
if [ -f "$DEST" ] && [ "$(jq -S . "$DEST" 2>/dev/null)" = "$src_json" ]; then
  exit 0
fi

# 起動中の Claude Code が設定を監視しているため、書きかけを読まれないよう mv で差し替える。
mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST.tmp"
mv "$DEST.tmp" "$DEST"
echo "$DEST を $SRC の内容に置き換えた"
