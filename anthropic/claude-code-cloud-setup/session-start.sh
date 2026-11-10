#!/bin/bash
# SessionStart フックの入口。クローンを origin の HEAD に揃え、最新の apply.sh へ引き渡す。
# 呼び出し元と時機は setup.sh 冒頭の図を参照。
#
# フックが実行するのは、環境のセットアップ時に作られたクローンのこのファイルで、
# セットアップ結果はキャッシュされるため、環境が作り直されるまで古い版のまま動く。
# 変更される処理をここに置くと反映が遅れるので、更新と引き渡しだけにし、処理は apply.sh に置く。
# キャッシュ済みの settings.json がこのファイルのパスを指すため、改名や削除をすると、
# 環境が作り直されるまでフックの実行が失敗する。
set -euo pipefail

main() {
  local script_dir repo_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"

  # フックが実際に動いたかを後から確認するための記録
  echo "$(date -Is) sync" >> /tmp/harness-sync.log

  git -C "$repo_dir" fetch --depth 1 origin HEAD
  git -C "$repo_dir" reset --hard FETCH_HEAD

  exec "$script_dir/apply.sh"
}

# このファイル自身が置かれたクローンを git reset で書き換える。
# bash はスクリプトを少しずつ読みながら実行するため、本体を関数に入れ、呼び出しと終了を同じ行に置く。
main "$@"; exit
