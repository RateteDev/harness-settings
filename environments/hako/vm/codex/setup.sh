#!/bin/bash
# hako の VM で動く Codex へ、行動規範・hako の環境の説明・Itoguchi での会話の仕方・MCPサーバー itoguchi を反映する。
# ターンのたびに turn が呼ぶ。
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# このファイルは environments/hako/vm/<ハーネス>/ にある。
hako_dir="$(cd "$script_dir/../.." && pwd)"
repo_dir="$(cd "$hako_dir/../.." && pwd)"
: "${ITOGUCHI_TOKEN:?ITOGUCHI_TOKEN がありません。ホストで sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN を登録してください}"

# 追加部品が置いた sbx の案内（VMの使い方）は残し、その後ろに足す。2回目からは、取っておいた元の案内に足し直す。
agents="$HOME/.codex/AGENTS.md"
[ -f "$agents.sbx" ] || cp "$agents" "$agents.sbx"
cat "$agents.sbx" "$repo_dir/global/AGENTS.md" "$hako_dir/instructions.md" > "$agents"

# 鍵は環境変数の代わりの値を読ませ、sbx の中継に本物へ差し替えさせる。
codex mcp get itoguchi >/dev/null 2>&1 ||
  codex mcp add itoguchi --url https://itoguchi.ratete.dev/mcp --bearer-token-env-var ITOGUCHI_TOKEN >/dev/null
