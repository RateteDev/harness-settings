#!/bin/bash
# VMの中で動く。ホストの hako.ts が sbx exec で呼ぶ。
#   vm.sh install   テンプレートを作るときに、道具とハーネスを入れる
#   vm.sh setup     VMを作ったときに1回、各ハーネスへ指示・スキル・MCPサーバーを設定する
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
itoguchi=https://itoguchi.ratete.dev/mcp

install() {
  sudo apt-get update -qq
  sudo apt-get install -y -qq build-essential
  curl -fsSL https://bun.sh/install | bash
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component rustfmt,clippy
  # sbx exec はログインシェルを通さないため、sbx がどの bash にも読ませるファイルに PATH を足す。
  # shellcheck disable=SC2016
  echo 'export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"' | sudo tee -a /etc/sandbox-persistent.sh
  # Docker の claude-mixin は、sbx に登録した鍵が効かなくなるため使わない。Codex と Playwright は hako.ts の kits で入る。
  curl -fsSL https://claude.ai/install.sh | bash
}

setup() {
  mkdir -p ~/workspace ~/.claude

  cat "$repo/global/AGENTS.md" "$repo/environments/hako/instructions.md" > ~/.claude/CLAUDE.md
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

  cat "$repo/global/AGENTS.md" "$repo/environments/hako/instructions.md" > ~/.codex/AGENTS.md
  codex mcp add itoguchi --url "$itoguchi" --bearer-token-env-var ITOGUCHI_TOKEN
}

"$@"
