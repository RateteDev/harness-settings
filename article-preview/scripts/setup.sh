#!/usr/bin/env bash
set -euo pipefail

skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${skill_root}/runtime"

[[ -f "${runtime_root}/bun.lock" ]] || {
    echo "ERROR: bundled runtime lockfile is missing: ${runtime_root}/bun.lock" >&2
    exit 1
}

cd "$runtime_root"
bun install --frozen-lockfile

# OpenCodeはglobal skills配下の深い階層までSKILL.mdを探索するため、
# runtime dependency同梱のskill文書を残すと意図せず別skillを上書きする。
find "${runtime_root}/node_modules" -type f -name SKILL.md -delete
