#!/bin/bash
# settings.json を ~/.claude/settings.json へ丸ごと置く。内容が同じなら何もしない。
# 呼び出し元と時機は setup.sh 冒頭の図を参照。
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
