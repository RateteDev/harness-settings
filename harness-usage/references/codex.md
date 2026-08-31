# Codex And ChatGPT Work

`scripts/codex-usage.sh` reads `~/.codex/auth.json`, refreshes its OAuth access token through the Codex CLI's OAuth client, atomically saves rotated credentials, then calls `GET https://chatgpt.com/backend-api/wham/usage`.

The response is live quota data. Key fields:

- `rate_limit.primary_window.used_percent`
- `rate_limit.primary_window.reset_at` and `reset_after_seconds`
- `rate_limit.secondary_window` when present
- `additional_rate_limits` for model-specific pools

The script requires `curl` and `jq`. A failed refresh means the user must log in again with `codex login`; do not request a token in chat.

The WHAM endpoint is undocumented and may change. It reflects the ChatGPT plan associated with the Codex OAuth login, not API billing usage.
