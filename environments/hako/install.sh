#!/bin/bash
# テンプレートを作るときに、VMの中で1回動く。道具とハーネスを入れ、各ハーネスへ指示・スキル・MCPサーバーを設定する。
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
itoguchi=https://itoguchi.ratete.dev/mcp

sudo apt-get update -qq
sudo apt-get install -y -qq build-essential
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component rustfmt,clippy
# sbx exec はログインシェルを通さないため、sbx がどの bash にも読ませるファイルに PATH を足す。
# shellcheck disable=SC2016
echo 'export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"' | sudo tee -a /etc/sandbox-persistent.sh
~/.bun/bin/bunx playwright install --with-deps chromium

curl -fsSL https://claude.ai/install.sh | bash
mkdir -p ~/.claude
# 既定のシステムプロンプトの代わりに渡すファイル。hako.ts が --system-prompt-file で指す。
(cat "$repo/global/system-prompt.md"; echo; cat "$repo/environments/hako/instructions.md") > ~/.claude/system-prompt.md
cp -r "$repo/global/skills" ~/.claude/skills
# wait_for_events を外すのは、ターンの中で次の呼びかけを待つとVMが止まらないため。
cat > ~/.claude/settings.json <<'JSON'
{
  "attribution": false,
  "includeGitInstructions": false,
  "syncClaudeAiSkills": false,
  "syncClaudeAiPlugins": false,
  "permissions": { "deny": ["mcp__itoguchi__wait_for_events"] }
}
JSON
# ${ITOGUCHI_TOKEN} は展開せずに書く。接続のときに代わりの値が入り、sbx の中継が本物に差し替える。
# shellcheck disable=SC2016
claude mcp add --scope user --transport http itoguchi "$itoguchi" --header 'Authorization: Bearer ${ITOGUCHI_TOKEN}'

