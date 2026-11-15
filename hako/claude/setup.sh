#!/bin/bash
# hako（使い捨てのVMでエージェントを動かす仕組み）の VM で動く Claude Code へ、
# 行動規範・skills/coding-agent/・settings.jsonc・MCPサーバー itoguchi を反映する。
# hako が VM の中にこのリポジトリをクローンし、Claude Code を起動する前に1回呼ぶ。VMは使い捨てのため、元に戻す処理は持たない。
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
# Itoguchi のキーは hako の VM では sbx のシークレットに置かれ、VM の環境変数には代わりの値だけが入る。
# 代わりの値を見出しに書いておくと、sbx の中継が itoguchi.ratete.dev への要求のときだけ本物に差し替える。
: "${ITOGUCHI_TOKEN:?ITOGUCHI_TOKEN がありません。ホストで sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN を登録してください}"

mkdir -p ~/.claude
cp "$repo_dir/AGENTS.md" ~/.claude/CLAUDE.md

# skills/ の直下には、コーディングエージェント向けではないスキルも置く。反映するのは coding-agent/ の下だけにする。
rm -rf ~/.claude/skills
mkdir -p ~/.claude/skills
cp -r "$repo_dir/skills/coding-agent/." ~/.claude/skills/

# jq はコメントを読めないため、JSONC を読める Bun で変換する。hako のテンプレートには mise で Bun が入っている。
bun -e 'console.log(JSON.stringify(require(process.argv[1]), null, 2))' "$script_dir/settings.jsonc" > ~/.claude/settings.json

# 見出しの ${ITOGUCHI_TOKEN} は、書き込むときではなく Claude Code が接続するときに展開させる。
claude_json="$HOME/.claude.json"
[ -f "$claude_json" ] || echo '{}' > "$claude_json"
# shellcheck disable=SC2016 # ${ITOGUCHI_TOKEN} は jq の文字列としてそのまま書く。
jq '.mcpServers.itoguchi = {type: "http", url: "https://itoguchi.ratete.dev/mcp", headers: {Authorization: "Bearer ${ITOGUCHI_TOKEN}"}}' \
  "$claude_json" > "$claude_json.tmp"
mv "$claude_json.tmp" "$claude_json"
