#!/usr/bin/env bash
set -euo pipefail

# my-r2: R2へのアップロード/ダウンロード/同期を AWS CLI 経由で行う薄いラッパー。
# バケット名とエンドポイントは R2_* 環境変数から読み込むため、呼び出し側では
# バケット名を書かず、R2側のキー(パス)だけを渡す。方向は動詞(put/get)で決まる。

# 秘密ファイルを読み込んで R2_* を環境へ載せる。
# ※ このパスは一時的に固定している。公開/非公開の分離は後続で見直す。
SECRETS_FILE="${MYR2_SECRETS_FILE:-$HOME/.config/secrets.env}"
if [[ -r "$SECRETS_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$SECRETS_FILE"
fi

# 必須の環境変数を検査。欠けていれば明示的に失敗させる。
for v in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT_URL R2_BUCKET; do
  : "${!v:?missing required env var ${v} (load ${SECRETS_FILE} or set it)}"
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

usage() {
  cat <<'EOF'
my-r2 - R2操作を AWS CLI 経由で行う薄いラッパー。R2側のパスはバケット名なしで書く。

サブコマンド:
  put <local> <key>      アップロード (local を R2 の key へ)
  get <key> <local>      ダウンロード (R2 の key を local へ)
  ls [prefix]            一覧 (prefix は省略可)
  sync <local-dir> <key> ディレクトリ同期 (ローカル→R2 のアップロード方向)
  rm <key>               削除
  help                   この表示

例:
  my-r2 put ./photo.png docs/photo.png
  my-r2 get docs/photo.png ./photo.png
  my-r2 ls docs/
  my-r2 sync ./assets docs/assets
  my-r2 rm docs/old.png
EOF
}

main() {
  local verb="${1:-}"
  shift 1 || true

  case "$verb" in
    put)
      [[ $# -eq 2 ]] || { echo "usage: my-r2 put <local> <key>" >&2; exit 1; }
      aws s3 cp "$1" "s3://${BUCKET}/$2" --endpoint-url "$ENDPOINT_URL"
      ;;
    get)
      [[ $# -eq 2 ]] || { echo "usage: my-r2 get <key> <local>" >&2; exit 1; }
      aws s3 cp "s3://${BUCKET}/$1" "$2" --endpoint-url "$ENDPOINT_URL"
      ;;
    ls)
      local prefix="${1:-}"
      [[ "$prefix" == */ || -z "$prefix" ]] || prefix="$prefix/"
      aws s3 ls "s3://${BUCKET}/${prefix}" --endpoint-url "$ENDPOINT_URL"
      ;;
    sync)
      [[ $# -eq 2 ]] || { echo "usage: my-r2 sync <local-dir> <key>" >&2; exit 1; }
      aws s3 sync "$1" "s3://${BUCKET}/$2" --endpoint-url "$ENDPOINT_URL"
      ;;
    rm)
      [[ $# -eq 1 ]] || { echo "usage: my-r2 rm <key>" >&2; exit 1; }
      aws s3 rm "s3://${BUCKET}/$1" --endpoint-url "$ENDPOINT_URL"
      ;;
    help|--help|-h|"")
      usage
      ;;
    *)
      echo "unknown subcommand: $verb" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
