#!/usr/bin/env bash
set -euo pipefail

# my-r2: R2へのファイル操作と一時URL発行を AWS CLI 経由で行う薄いラッパー。
# バケット名とエンドポイントは R2_* 環境変数から読み込むため、呼び出し側では
# バケット名を書かず、R2側のキー(パス)だけを渡す。方向は動詞(put/get)で決まる。

DEFAULT_PRESIGN_EXPIRES_IN=86400
MAX_PRESIGN_EXPIRES_IN=604800

usage() {
  cat <<'EOF'
my-r2 - A thin AWS CLI wrapper for Cloudflare R2. Write R2 keys without the bucket name.

Commands:
  put <local> <key> [--download]    Upload a file. Without --download the shared link opens in
                                    the browser; with it the link saves the file under the local
                                    file's name
  get <key> <local>                 Download a file
  ls [prefix]                       List objects
  sync <local-dir> <key>            Sync a local directory to R2
  rm <key>                          Delete an object
  presign <key> [expires-seconds]   Create a temporary download URL (default: 86400 seconds)
  help                              Show this help

Examples:
  my-r2 put ./photo.png docs/photo.png
  my-r2 put ./report.md docs/report.md --download
  my-r2 get docs/photo.png ./photo.png
  my-r2 ls docs/
  my-r2 sync ./assets docs/assets
  my-r2 rm docs/old.png
  my-r2 presign docs/photo.png
EOF
}

configure_r2() {
  # TODO(secret-file-layout): 未決: 公開・非公開設定の分離に合わせて秘密ファイルの既定パスを見直す。
  local secrets_file="${MYR2_SECRETS_FILE:-$HOME/.config/secrets.env}"
  if [[ -r "$secrets_file" ]]; then
    # shellcheck source=/dev/null
    source "$secrets_file"
  fi

  local variable
  for variable in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT_URL R2_BUCKET; do
    if [[ -z "${!variable:-}" ]]; then
      echo "error: missing required environment variable ${variable} (load ${secrets_file} or set it)" >&2
      exit 1
    fi
  done

  if ! command -v aws >/dev/null 2>&1; then
    echo "error: aws CLI not found. Install it and put it on PATH." >&2
    exit 1
  fi

  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_REGION=auto
  ENDPOINT_URL="$R2_ENDPOINT_URL"
  BUCKET="$R2_BUCKET"
}

# リンクをブラウザで開かせず保存させるための Content-Disposition を作る。
# 非ASCII名はRFC 5987の filename* (UTF-8) で渡し、対応していない相手向けにASCII名を併記する。
attachment_content_disposition() {
  local filename encoded fallback
  filename="$(basename -- "$1")"
  encoded="$(printf '%s' "$filename" | od -An -v -tx1 | tr -d ' \n' | sed 's/../%&/g')"
  fallback="$(printf '%s' "$filename" | LC_ALL=C tr -c '\040-\176' '_' | sed 's/["\\]/_/g')"
  printf "attachment; filename=\"%s\"; filename*=UTF-8''%s" "$fallback" "$encoded"
}

main() {
  local verb="${1:-}"
  shift 1 || true

  case "$verb" in
    help|--help|-h|"")
      usage
      return
      ;;
    put)
      [[ $# -eq 2 || $# -eq 3 ]] || { echo "usage: my-r2 put <local> <key> [--download]" >&2; exit 1; }
      if [[ $# -eq 3 && "${3}" != "--download" ]]; then
        echo "unknown option: ${3} (supported: --download)" >&2
        exit 1
      fi
      ;;
    get)
      [[ $# -eq 2 ]] || { echo "usage: my-r2 get <key> <local>" >&2; exit 1; }
      ;;
    ls)
      [[ $# -le 1 ]] || { echo "usage: my-r2 ls [prefix]" >&2; exit 1; }
      ;;
    sync)
      [[ $# -eq 2 ]] || { echo "usage: my-r2 sync <local-dir> <key>" >&2; exit 1; }
      ;;
    rm)
      [[ $# -eq 1 ]] || { echo "usage: my-r2 rm <key>" >&2; exit 1; }
      ;;
    presign)
      [[ $# -ge 1 && $# -le 2 ]] || { echo "usage: my-r2 presign <key> [expires-seconds]" >&2; exit 1; }
      local expires_in="${2:-$DEFAULT_PRESIGN_EXPIRES_IN}"
      if ! [[ "$expires_in" =~ ^[1-9][0-9]{0,5}$ ]] || (( 10#$expires_in > MAX_PRESIGN_EXPIRES_IN )); then
        echo "error: expires-seconds must be an integer from 1 to ${MAX_PRESIGN_EXPIRES_IN}" >&2
        exit 1
      fi
      ;;
    *)
      echo "unknown subcommand: $verb" >&2
      usage
      exit 1
      ;;
  esac

  configure_r2

  case "$verb" in
    put)
      local -a extra=()
      if [[ "${3:-}" == "--download" ]]; then
        extra=(--content-disposition "$(attachment_content_disposition "$1")")
      fi
      aws s3 cp "$1" "s3://${BUCKET}/$2" --endpoint-url "$ENDPOINT_URL" ${extra[@]+"${extra[@]}"}
      ;;
    get)
      aws s3 cp "s3://${BUCKET}/$1" "$2" --endpoint-url "$ENDPOINT_URL"
      ;;
    ls)
      local prefix="${1:-}"
      [[ "$prefix" == */ || -z "$prefix" ]] || prefix="$prefix/"
      aws s3 ls "s3://${BUCKET}/${prefix}" --endpoint-url "$ENDPOINT_URL"
      ;;
    sync)
      aws s3 sync "$1" "s3://${BUCKET}/$2" --endpoint-url "$ENDPOINT_URL"
      ;;
    rm)
      aws s3 rm "s3://${BUCKET}/$1" --endpoint-url "$ENDPOINT_URL"
      ;;
    presign)
      aws s3 presign "s3://${BUCKET}/$1" --endpoint-url "$ENDPOINT_URL" --expires-in "$expires_in"
      ;;
  esac
}

main "$@"
