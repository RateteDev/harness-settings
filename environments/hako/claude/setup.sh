#!/bin/bash
# hako の VM で動く Claude Code へ、行動規範・hako の環境の説明・Itoguchi での会話の仕方・スキル・設定・MCPサーバー itoguchi を反映する。
# ターンのたびに turn が呼ぶ。ホストがターンの前にこのリポジトリの中身を写すため、ホストのクローンの今の状態が反映される。
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hako_dir="$(dirname "$script_dir")"
# ホストは global/ と environments/hako/ を、リポジトリと同じ並びで写す。
repo_dir="$(cd "$hako_dir/../.." && pwd)"
# Itoguchi のキーは sbx のシークレットに置かれ、VM の環境変数には代わりの値だけが入る。
# 代わりの値を見出しに書いておくと、sbx の中継が itoguchi.ratete.dev への要求のときだけ本物に差し替える。
: "${ITOGUCHI_TOKEN:?ITOGUCHI_TOKEN がありません。ホストで sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN を登録してください}"

mkdir -p ~/.claude
cat "$repo_dir/global/AGENTS.md" "$hako_dir/hako_instructions.md" "$hako_dir/itoguchi-link/instructions.md" > ~/.claude/CLAUDE.md

# 消したスキルも反映されるよう、丸ごと置き換える。
rm -rf ~/.claude/skills
cp -r "$repo_dir/global/skills" ~/.claude/skills

# jq はコメントを読めないため、JSONC を読める Bun で変換する。
bun -e 'console.log(JSON.stringify(require(process.argv[1]), null, 2))' "$script_dir/settings.jsonc" > ~/.claude/settings.json

# 見出しの ${ITOGUCHI_TOKEN} は、書き込むときではなく Claude Code が接続するときに展開させる。
claude_json="$HOME/.claude.json"
[ -f "$claude_json" ] || echo '{}' > "$claude_json"
# shellcheck disable=SC2016 # ${ITOGUCHI_TOKEN} は jq の文字列としてそのまま書く。
jq '.mcpServers.itoguchi = {type: "http", url: "https://itoguchi.ratete.dev/mcp", headers: {Authorization: "Bearer ${ITOGUCHI_TOKEN}"}}' \
  "$claude_json" > "$claude_json.tmp"
mv "$claude_json.tmp" "$claude_json"
