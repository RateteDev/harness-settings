---
name: Harness Usage
description: Check current quota, reset times, token use, and estimated cost for Codex/ChatGPT or OpenCode without exposing credentials.
---

# Harness Usage

Use the script for the requested harness. Report whether data is a live quota or local usage history.

```sh
scripts/codex-usage.sh
scripts/opencode-go-usage.sh
```

Never print or persist tokens, API keys, passwords, prompts, or transcripts. Read `references/<harness>.md` before diagnosing failures or changing authentication.
