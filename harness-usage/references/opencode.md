# OpenCode Go

`scripts/opencode-go-usage.sh` calls `GET https://opencode.ai/zen/go/v1/usage` with an OpenCode Go API key. It returns live, exact subscription usage and reset times for the rolling 5-hour, weekly, and monthly windows.

Provide the key interactively, or set `OPENCODE_GO_API_KEY` only for the command invocation. Do not write the key to a config file, shell history, skill, or chat.

```sh
OPENCODE_GO_API_KEY="$OPENCODE_GO_API_KEY" scripts/opencode-go-usage.sh
```

The endpoint is not documented in the public Go API reference. If it changes, use the OpenCode Zen Console for the authoritative current usage view.
