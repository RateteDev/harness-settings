#!/usr/bin/env bash
# js-runtime-guard: block direct use of the JS package managers (npm, npx,
# pnpm, pnpx) and resolve the real one only when invoked under a `real-*` name.
#
# Dispatch is on `basename "$0"`, so it is used through symlinks in
# ~/.local/bin/:
#   npm npx pnpm pnpx                     -> guard (exit 1 stops the real one)
#   real-npm real-npx real-pnpm real-pnpx -> escape hatch to the real one
#
# The suggested replacements are held in the script rather than in a config
# file. Switching camps (pnpm, yarn) means editing the REPLACE array.

set -euo pipefail

declare -A REPLACE=(
    [npm]="bun"
    [npx]="bunx"
    [pnpm]="bun"
    [pnpx]="bunx"
)

name="$(basename "$0")"

case "$name" in
    npm|npx|pnpm|pnpx)
        replacement="${REPLACE[$name]}"
        echo "Direct use of $name is blocked because the user prefers Bun in this environment. Use $replacement instead. If you really need $name, use real-$name." >&2
        if [[ "$name" == pnpm || "$name" == pnpx ]] && [[ -f "$PWD/pnpm-lock.yaml" ]]; then
            echo "Note: pnpm-lock.yaml detected; $replacement may not be a drop-in replacement (workspaces / hoisting / lockfile differ). Consider real-$name for this project." >&2
        fi
        exit 1
        ;;
    real-npm|real-npx|real-pnpm|real-pnpx)
        target="${name#real-}"
        # スクリプト本体と呼び出しリンクの両方を除外し、ガード自身への再解決を防ぐ。
        real_script_dir="$(cd -- "$(dirname -- "$(readlink -f "$0")")" && pwd)"
        invocation_path="$(command -v -- "$name" || true)"
        invocation_dir=""
        if [[ "$invocation_path" == */* ]]; then
            invocation_dir="$(cd -- "$(dirname -- "$invocation_path")" && pwd)"
        fi

        sanitized_path=""
        IFS=':' read -r -a entries <<< "${PATH:-}"
        for e in "${entries[@]}"; do
            [[ -z "$e" ]] && e="."
            [[ "$e" == "$real_script_dir" ]] && continue
            [[ -n "$invocation_dir" && "$e" == "$invocation_dir" ]] && continue
            sanitized_path="${sanitized_path:+$sanitized_path:}$e"
        done

        if [[ -z "$sanitized_path" ]]; then
            echo "js-runtime-guard: PATH only contains guard directories; cannot resolve $target." >&2
            exit 127
        fi

        resolved="$(PATH="$sanitized_path" command -v -- "$target" || true)"
        if [[ -z "$resolved" ]]; then
            echo "js-runtime-guard: unable to find $target outside guard directories." >&2
            exit 127
        fi

        PATH="$sanitized_path" exec "$resolved" "$@"
        ;;
    *)
        echo "js-runtime-guard: unknown invocation name: $name" >&2
        echo "Expected: npm | npx | pnpm | pnpx | real-npm | real-npx | real-pnpm | real-pnpx" >&2
        exit 64
        ;;
esac
