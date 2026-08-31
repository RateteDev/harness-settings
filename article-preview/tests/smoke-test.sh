#!/usr/bin/env bash
set -euo pipefail

skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/article-preview-skill-test.$$"
trap 'rm -rf "$runtime_root"' EXIT
mkdir -p "$runtime_root"

cat > "${runtime_root}/sample.mdx" <<'EOF'
# 動作確認

## 図

```mermaid
flowchart LR
  A --> B
```
EOF

"${skill_root}/scripts/article-preview" \
    "${runtime_root}/sample.mdx" \
    --out "${runtime_root}/sample.html"

python3 - "${runtime_root}/sample.html" <<'PY'
import sys
from pathlib import Path

output = Path(sys.argv[1])
html = output.read_text(encoding="utf-8")
if output.stat().st_size < 10000 or "動作確認" not in html or "<svg" not in html:
    raise SystemExit("generated HTML did not contain the expected article and Mermaid output")
print(f"Smoke test passed: {output.stat().st_size} bytes")
PY
