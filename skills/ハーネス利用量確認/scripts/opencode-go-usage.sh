#!/usr/bin/env bash
set -euo pipefail

command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 1; }

key="${OPENCODE_GO_API_KEY:-}"
if [[ -z "$key" ]]; then
  read -r -s -p 'OpenCode Go API key: ' key
  printf '\n' >&2
fi
[[ -n "$key" ]] || { echo 'An OpenCode Go API key is required.' >&2; exit 1; }

response=$(mktemp "${TMPDIR:-/tmp}/opencode-go-usage.XXXXXX")
trap 'rm -f "$response"' EXIT
status=$(curl --silent --show-error --output "$response" --write-out '%{http_code}' --max-time 20 \
  https://opencode.ai/zen/go/v1/usage \
  --header "Authorization: Bearer $key")
unset key

if [[ "$status" != 200 ]]; then
  echo "OpenCode Go usage request failed (HTTP $status)." >&2
  exit 1
fi

jq '.usage' "$response"
