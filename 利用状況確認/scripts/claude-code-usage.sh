#!/usr/bin/env bash
set -euo pipefail

credentials_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json"

command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 1; }
command -v claude >/dev/null || { echo 'Claude Code CLI is required.' >&2; exit 1; }
[[ -r "$credentials_file" ]] || { echo "Claude Code credentials file not found: $credentials_file" >&2; exit 1; }
jq -e '.claudeAiOauth.accessToken | type == "string" and length > 0' "$credentials_file" >/dev/null 2>&1 \
  || { echo 'Claude Code OAuth access token not found.' >&2; exit 1; }

claude_version=$(claude --version | awk 'NR == 1 { print $1 }')
[[ -n "$claude_version" ]] || { echo 'Could not determine Claude Code version.' >&2; exit 1; }

umask 077
response=$(mktemp "${TMPDIR:-/tmp}/claude-code-usage.XXXXXX")
trap 'rm -f "$response"' EXIT

status=$(jq -er '"Authorization: Bearer " + .claudeAiOauth.accessToken' "$credentials_file" \
  | curl --silent --show-error --output "$response" --write-out '%{http_code}' --max-time 20 \
      --header @- \
      --header 'anthropic-beta: oauth-2025-04-20' \
      --header "User-Agent: claude-code/$claude_version" \
      --header 'Accept: application/json' \
      https://api.anthropic.com/api/oauth/usage)

if [[ "$status" != 200 ]]; then
  echo "Claude Code usage request failed (HTTP $status)." >&2
  exit 1
fi

jq -e '
  def legacy_window($kind; $window):
    if ($window | type) == "object" and ($window.utilization | type) == "number" then
      {kind: $kind, percent: $window.utilization, resets_at: $window.resets_at}
    else empty end;
  {
    data_type: "live quota",
    limits: (
      if (.limits | type) == "array" and (.limits | length) > 0 then
        [.limits[] | {kind, group, percent, resets_at, scope, is_active}
          | with_entries(select(.value != null))]
      else
        [legacy_window("session"; .five_hour),
         legacy_window("weekly_all"; .seven_day),
         legacy_window("weekly_opus"; .seven_day_opus),
         legacy_window("weekly_sonnet"; .seven_day_sonnet),
         legacy_window("weekly_overage_included"; .seven_day_overage_included)]
      end
    )
  }
' "$response"
