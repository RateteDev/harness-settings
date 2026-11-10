#!/bin/bash
# クローンを origin の HEAD に揃え、skills/ を ~/.claude/skills へ丸ごと反映する。
# 呼び出し元と時機は setup.sh 冒頭の図を参照。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

main() {
  local repo_dir
  repo_dir="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

  # フックが実際に動いたかを後から確認するための記録
  echo "$(date -Is) sync" >> /tmp/harness-sync.log

  git -C "$repo_dir" fetch --depth 1 origin HEAD
  git -C "$repo_dir" reset --hard FETCH_HEAD

  # 削除されたskillも反映するため、丸ごと置き換える
  rm -rf "$SKILLS_DIR"
  mkdir -p "$SKILLS_DIR"
  cp -r "$repo_dir/skills/." "$SKILLS_DIR/"
}

# このファイル自身が置かれたクローンを git reset で書き換える。
# bash はスクリプトを少しずつ読みながら実行するため、本体を関数に入れ、呼び出しと終了を同じ行に置く。
main "$@"; exit
