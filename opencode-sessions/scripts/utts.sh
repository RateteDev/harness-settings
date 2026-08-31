#!/usr/bin/env bash
# OpenCodeのDBから発言だけを抽出（cwd / 時間でフィルタ、読み取り専用）
#
# 使い方:
#   utts.sh [-l] [-r] [dir部分一致] [since(ローカル時刻)] [until(ローカル時刻)]
#     -l  セッション一覧だけ表示
#     -r  親セッションだけ（サブセッション=parent_idありを除外）
#
# 例:
#   utts.sh -l                                # 全セッション一覧
#   utts.sh llm-voxel-world                   # そのdirの全発言
#   utts.sh llm-voxel-world '2026-08-31 18:00'                    # 18時以降の発言
#   utts.sh llm-voxel-world '2026-08-31 17:00' '2026-08-31 18:30' # 範囲指定
#   OPENCODE_DB=/path/to/copy.db utts.sh ...                      # コピーDBを指定
set -euo pipefail

DB="${OPENCODE_DB:-$HOME/.local/share/opencode/opencode.db}"
LIST=0; ROOT=0
while [ $# -gt 0 ] && [ "${1#-}" != "$1" ]; do
  case "$1" in
    -l) LIST=1 ;;
    -r) ROOT=1 ;;
    *) break ;;
  esac
  shift
done
DIR="${1:-%}"
SINCE="${2:-1970-01-01 00:00:00}"
UNTIL="${3:-9999-12-31 23:59:59}"

ROOT_COND=""
[ $ROOT = 1 ] && ROOT_COND="AND s.parent_id IS NULL"

if [ $LIST = 1 ]; then
  # セッション一覧（開始時刻でフィルタ）
  sqlite3 -header -column "file:$DB?mode=ro" <<SQL
SELECT datetime(s.time_created/1000,'unixepoch','localtime') AS started,
       substr(s.title,1,44) AS title,
       s.directory,
       (SELECT count(*) FROM session_message m
        WHERE m.session_id=s.id AND m.type='user') AS user_msgs,
       s.id
FROM session_v2 s
WHERE s.directory LIKE '%$DIR%'
  AND s.time_created >= COALESCE(strftime('%s','$SINCE','utc')*1000, -9223372036854775808)
  AND s.time_created <  COALESCE(strftime('%s','$UNTIL','utc')*1000, 9223372036854775807)
  $ROOT_COND
ORDER BY s.time_created;
SQL
else
  # 発言だけ（メッセージ時刻でフィルタ → 空発言を除去）
  sqlite3 -separator ' | ' "file:$DB?mode=ro" <<SQL
WITH utt AS (
  SELECT s.directory, s.title, m.time_created, m.type,
         CASE m.type
           WHEN 'user' THEN m.data->>'text'
           ELSE (SELECT group_concat(je.value->>'text', char(10))
                 FROM json_each(m.data,'$.content') je
                 WHERE je.value->>'type'='text')
         END AS text
  FROM session_message m
  JOIN session_v2 s ON s.id = m.session_id
  WHERE m.type IN ('user','assistant')
    AND s.directory LIKE '%$DIR%'
    $ROOT_COND
)
SELECT datetime(time_created/1000,'unixepoch','localtime') AS t,
       CASE type WHEN 'user' THEN 'USER' ELSE 'AI  ' END AS role,
       title, text
FROM utt
WHERE text IS NOT NULL AND trim(text) != ''
  AND time_created >= COALESCE(strftime('%s','$SINCE','utc')*1000, -9223372036854775808)
  AND time_created <  COALESCE(strftime('%s','$UNTIL','utc')*1000, 9223372036854775807)
ORDER BY time_created;
SQL
fi
