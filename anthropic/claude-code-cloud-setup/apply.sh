#!/bin/bash
# 最新化済みのクローンから、skills/ と settings.json を ~/.claude へ丸ごと反映する。
# 呼び出し元と時機は setup.sh 冒頭の図を参照。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

repo_dir="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

# 削除されたskillも反映するため、丸ごと置き換える
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"
cp -r "$repo_dir/skills/." "$SKILLS_DIR/"

"$SCRIPT_DIR/install-settings.sh"
