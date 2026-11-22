#!/bin/bash
# hako の VM で動く Claude Code へ、行動規範・hako が置いた環境の説明・instructions.md・modes/・
# global/skills/coding-agent/・settings.jsonc・MCPサーバー itoguchi を反映する。
# hako が VM の中にこのリポジトリをクローンし、VMを作ったときと、止めていたVMを起こしたときに呼ぶ。元に戻す処理は持たない。
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
# Itoguchi のキーは hako の VM では sbx のシークレットに置かれ、VM の環境変数には代わりの値だけが入る。
# 代わりの値を見出しに書いておくと、sbx の中継が itoguchi.ratete.dev への要求のときだけ本物に差し替える。
: "${ITOGUCHI_TOKEN:?ITOGUCHI_TOKEN がありません。ホストで sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN を登録してください}"

mkdir -p ~/.claude
# 共通の行動規範の後ろに、hako の環境の説明と、会話する方法を足す。
# 環境の説明は、hako が自分の版に合わせて VM に置いたものを読む。hako 自身はハーネスへ指示を足さない。
hako_instructions="$HOME/.hako/hako_instructions.md"
[ -f "$hako_instructions" ] || { echo "setup.sh: $hako_instructions がありません。hako がVMへ写すのに失敗しています" >&2; exit 1; }
cat "$repo_dir/global/AGENTS.md" "$hako_instructions" "$script_dir/instructions.md" > ~/.claude/CLAUDE.md

# 入口ごとの事情は、settings.jsonc の SessionStart のフックが HAKO_MODE に合うものを読んで知らせる。
rm -rf ~/.claude/hako-modes
cp -r "$script_dir/modes" ~/.claude/hako-modes

# global/skills/ の直下には、コーディングエージェント向けではないスキルも置く。反映するのは coding-agent/ の下だけにする。
rm -rf ~/.claude/skills
mkdir -p ~/.claude/skills
cp -r "$repo_dir/global/skills/coding-agent/." ~/.claude/skills/

# jq はコメントを読めないため、JSONC を読める Bun で変換する。hako のテンプレートには mise で Bun が入っている。
bun -e 'console.log(JSON.stringify(require(process.argv[1]), null, 2))' "$script_dir/settings.jsonc" > ~/.claude/settings.json

# 見出しの ${ITOGUCHI_TOKEN} は、書き込むときではなく Claude Code が接続するときに展開させる。
claude_json="$HOME/.claude.json"
[ -f "$claude_json" ] || echo '{}' > "$claude_json"
# shellcheck disable=SC2016 # ${ITOGUCHI_TOKEN} は jq の文字列としてそのまま書く。
jq '.mcpServers.itoguchi = {type: "http", url: "https://itoguchi.ratete.dev/mcp", headers: {Authorization: "Bearer ${ITOGUCHI_TOKEN}"}}' \
  "$claude_json" > "$claude_json.tmp"
mv "$claude_json.tmp" "$claude_json"
