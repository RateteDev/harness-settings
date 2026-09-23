#!/usr/bin/env bash
# ぽいめも（poi-memo）API の薄いラッパー。投稿・返信・TL・検索・プロフィール一覧。
set -euo pipefail
unset CDPATH

DEFAULT_BASE="https://poi-memo.ratete.dev"
BASE="${POI_MEMO_BASE_URL:-$DEFAULT_BASE}"
AS="${POI_MEMO_AS:-bot}"
LIMIT=20
PARENT=""
AT=""
JSON_OUT=0

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOS'
poi-memo - ぽいめも API ラッパー

usage:
  poi-memo whoami                      接続先と投稿者プロフィールを表示する
  poi-memo profiles                    プロフィール一覧（メンションの宛先IDを調べる）
  poi-memo post [options] [text...]    投稿する（text 省略時は標準入力）
  poi-memo reply [options] <postId> [text...]
  poi-memo timeline [--limit N] [--json]
  poi-memo show <postId>
  poi-memo replies <postId> [--limit N] [--json]
  poi-memo search [--json] <query>
  poi-memo delete <postId>

options:
  --base <url>        接続先（既定 $POI_MEMO_BASE_URL または https://poi-memo.ratete.dev）
  --as <bot|human|handle>  投稿者プロフィール（既定 bot）
  --parent <postId>   返信先
  --at <ISO8601>      createdAt を上書きする
  --limit <n>         一覧件数（既定 20）
  --json              生JSONで出力する
  -h, --help          このヘルプ

メンションは本文に <@prf_...> を書く。宛先は `poi-memo profiles` で確認する。
EOS
}

api() {
  local method="$1" path="$2"
  shift 2
  curl -sS --fail-with-body -X "$method" "$BASE$path" -H 'Accept: application/json' "$@"
}

resolve_profile() {
  local profiles
  case "$AS" in
    human) api GET /api/v1/account | jq -r '.profile.id' ;;
    bot)
      profiles=$(api GET /api/v1/profiles)
      jq -r 'first(.profiles[] | select(.kind == "bot") | .id) // empty' <<<"$profiles"
      ;;
    *)
      profiles=$(api GET /api/v1/profiles)
      jq -r --arg a "$AS" 'first(.profiles[] | select(.handle == $a or .id == $a) | .id) // empty' <<<"$profiles"
      ;;
  esac
}

read_text() {
  if [ "$#" -gt 0 ]; then
    printf '%s' "$*"
  else
    cat
  fi
}

print_posts() {
  if [ "$JSON_OUT" = 1 ]; then
    jq .
  else
    jq -r '.posts[]? | "\(.createdAt) \(.profileHandle) \(.content | gsub("\n"; " ")) [\(.id)]"' \
      | cut -c1-200
  fi
}

command="${1:-}"
shift || true

# 全体共通オプションを先に取り出す
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --as) AS="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --json) JSON_OUT=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- "${args[@]+"${args[@]}"}"

case "$command" in
  -h | --help | help | "")
    usage
    ;;
  whoami)
    [ "$#" -eq 0 ] || die "whoami takes no arguments"
    profile=$(resolve_profile)
    [ -n "$profile" ] || die "no profile matched --as $AS"
    api GET /api/v1/profiles |
      jq -r --arg base "$BASE" --arg id "$profile" \
        '"base: \($base)", (.profiles[] | select(.id == $id) | "profile: \(.kind) @\(.handle) \(.displayName) [\(.id)]")'
    ;;
  profiles)
    [ "$#" -eq 0 ] || die "profiles takes no arguments"
    api GET /api/v1/profiles | jq -r '.profiles[] | "\(.kind) @\(.handle) \(.displayName) [\(.id)]"'
    ;;
  post | reply)
    if [ "$command" = reply ]; then
      [ "$#" -ge 1 ] || die "reply needs <postId>"
      PARENT="$1"
      shift
    fi
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --parent) PARENT="$2"; shift 2 ;;
        --at) AT="$2"; shift 2 ;;
        *) break ;;
      esac
    done
    text=$(read_text "$@")
    [ -n "$text" ] || die "post text is empty"
    profile=$(resolve_profile)
    [ -n "$profile" ] || die "no profile matched --as $AS"
    body=$(jq -nc --arg content "$text" --arg profileId "$profile" \
      --arg parentId "$PARENT" --arg createdAt "$AT" \
      '{content: $content, profileId: $profileId}
       + (if $parentId == "" then {} else {parentId: $parentId} end)
       + (if $createdAt == "" then {} else {createdAt: $createdAt} end)')
    if ! response=$(api POST /api/v1/posts -H 'Content-Type: application/json' -d "$body"); then
      printf '%s\n' "$response" >&2
      die "post failed"
    fi
    jq -e '(.id | type == "string") and (.id | startswith("pst_"))' <<<"$response" >/dev/null || die "post response has no valid ID"
    jq -r '"posted \(.id) as @\(.profileHandle) at \(.createdAt)\n\(.content)"' <<<"$response"
    ;;
  timeline)
    [ "$#" -eq 0 ] || die "timeline takes no positional arguments"
    api GET "/api/v1/posts?limit=$LIMIT" | print_posts
    ;;
  delete)
    [ "$#" -eq 1 ] || die "delete needs <postId>"
    api DELETE "/api/v1/posts/$1" | jq -r '"deleted \(.id)"'
    ;;
  show)
    [ "$#" -eq 1 ] || die "show needs <postId>"
    api GET "/api/v1/posts/$1" | jq .
    ;;
  replies)
    [ "$#" -eq 1 ] || die "replies needs <postId>"
    api GET "/api/v1/posts/$1/children?limit=$LIMIT" | print_posts
    ;;
  search)
    [ "$#" -ge 1 ] || die "search needs <query>"
    query=$(printf '%s' "$*" | jq -sRr @uri)
    result=$(api GET "/api/v1/search/fts?q=$query")
    if [ "$JSON_OUT" = 1 ]; then
      jq . <<<"$result"
    else
      jq -r '(.posts // .results // [])[] | "\(.createdAt) \(.profileHandle) \(.content | gsub("\n"; " ")) [\(.id)]"' <<<"$result" | cut -c1-200
    fi
    ;;
  *)
    die "unknown command: $command (see --help)"
    ;;
esac
