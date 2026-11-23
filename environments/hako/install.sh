#!/bin/bash
# テンプレートを作るときに、VMの中で1回動く。道具とハーネスを入れ、各ハーネスへ指示・スキル・MCPサーバーを設定する。
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
itoguchi=https://itoguchi.ratete.dev/mcp

sudo apt-get update -qq
sudo apt-get install -y -qq build-essential ffmpeg zip sqlite3
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component rustfmt,clippy
# Debian が配る Node.js と Go は古いため、公式の配布物から、作るときの最新を入れる。
node=$(curl -fsSL https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts)][0].version')
curl -fsSL "https://nodejs.org/dist/$node/node-$node-linux-x64.tar.xz" | sudo tar -xJ -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE
go=$(curl -fsSL 'https://go.dev/VERSION?m=text' | head -1)
curl -fsSL "https://go.dev/dl/$go.linux-amd64.tar.gz" | sudo tar -xz -C /usr/local
# sbx exec はログインシェルを通さないため、sbx がどの bash にも読ませるファイルに PATH を足す。
# shellcheck disable=SC2016
echo 'export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/go/bin:$PATH"' | sudo tee -a /etc/sandbox-persistent.sh
sudo npm install --global --silent agent-browser
agent-browser install --with-deps
install -D -m 755 "$repo/environments/hako/hako.sh" ~/.local/bin/hako

curl -fsSL https://claude.ai/install.sh | bash
mkdir -p ~/.claude
# 既定のシステムプロンプトの代わりに渡すファイル。hako.sh が --system-prompt-file で指す。
(cat "$repo/global/system-prompt.md"; echo; cat "$repo/environments/hako/instructions.md") > ~/.claude/system-prompt.md
cp -r "$repo/global/skills" ~/.claude/skills
# Itoguchi の wait_for_events は、次の呼びかけが新しいターンとして届くので使わせない。
# Claude Code の予約のツールは、ターンごとに終了する -p では発火しないので使わせない。予約は hako later で行う。
cat > ~/.claude/settings.json <<'JSON'
{
  "attribution": false,
  "includeGitInstructions": false,
  "syncClaudeAiSkills": false,
  "syncClaudeAiPlugins": false,
  "permissions": { "deny": ["mcp__itoguchi__wait_for_events", "CronCreate", "CronDelete", "CronList", "ScheduleWakeup"] }
}
JSON
# ${ITOGUCHI_TOKEN} は展開せずに書く。接続のときに代わりの値が入り、sbx の中継が本物に差し替える。
# shellcheck disable=SC2016
claude mcp add --scope user --transport http itoguchi "$itoguchi" --header 'Authorization: Bearer ${ITOGUCHI_TOKEN}'

