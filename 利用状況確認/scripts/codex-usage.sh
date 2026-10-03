#!/usr/bin/env bash
set -euo pipefail

auth_file="${CODEX_HOME:-$HOME/.codex}/auth.json"
client_id='app_EMoamEEZ73f0CkXaXp7hrann'

command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 1; }
[[ -r "$auth_file" ]] || { echo "Codex auth file not found: $auth_file" >&2; exit 1; }

umask 077
refresh_response=$(mktemp "${TMPDIR:-/tmp}/codex-refresh.XXXXXX")
usage_response=$(mktemp "${TMPDIR:-/tmp}/codex-usage.XXXXXX")
trap 'rm -f "$refresh_response" "$usage_response"' EXIT

refresh_token=$(jq -r '.tokens.refresh_token // empty' "$auth_file")
[[ -n "$refresh_token" ]] || { echo 'Codex refresh token not found.' >&2; exit 1; }

refresh_status=$(curl --silent --show-error --output "$refresh_response" --write-out '%{http_code}' --max-time 20 \
  --request POST https://auth.openai.com/oauth/token \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --arg client_id "$client_id" --arg refresh_token "$refresh_token" '{client_id: $client_id, grant_type: "refresh_token", refresh_token: $refresh_token}')")
unset refresh_token

if [[ "$refresh_status" != 200 ]] || ! jq -e '.access_token and .refresh_token and .id_token' "$refresh_response" >/dev/null; then
  echo 'Codex OAuth refresh failed. Run `codex login` to sign in again.' >&2
  exit 1
fi

# Refresh tokenはローテーションするため、後続のリクエストの前に差し替え後の認証情報を保存する。
new_auth=$(mktemp "${auth_file}.XXXXXX")
jq --slurpfile refreshed "$refresh_response" \
  '.tokens.access_token = $refreshed[0].access_token | .tokens.refresh_token = $refreshed[0].refresh_token | .tokens.id_token = $refreshed[0].id_token | .last_refresh = (now | todateiso8601)' \
  "$auth_file" > "$new_auth"
chmod 600 "$new_auth"
mv "$new_auth" "$auth_file"

access_token=$(jq -r '.access_token' "$refresh_response")
usage_status=$(curl --silent --show-error --output "$usage_response" --write-out '%{http_code}' --max-time 20 \
  https://chatgpt.com/backend-api/wham/usage \
  --header "Authorization: Bearer $access_token")
unset access_token

if [[ "$usage_status" != 200 ]]; then
  echo "WHAM usage request failed (HTTP $usage_status)." >&2
  exit 1
fi

jq '{plan_type, rate_limit, code_review_rate_limit, additional_rate_limits, credits, spend_control, rate_limit_reached_type}' "$usage_response"
