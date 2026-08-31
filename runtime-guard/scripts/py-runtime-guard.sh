#!/usr/bin/env bash
# py-runtime-guard: block direct use of pip, pip3 and pipx and point at uv.
# python3 is dispatched on its arguments: blocked, hinted, or passed through.
# The real command is resolved only when invoked under a `real-*` name.
#
# Used through symlinks in ~/.local/bin/:
#   pip pip3 pipx python3                         → guard
#   real-pip real-pip3 real-pipx real-python3      → bypass

set -euo pipefail

declare -A REPLACE=(
    [pip]="uv pip"
    [pip3]="uv pip"
    [pipx]="uvx"
)

name="$(basename "$0")"

resolve_real() {
    local target="$1"; shift
    local real_script_dir
    real_script_dir="$(cd -- "$(dirname -- "$(readlink -f "$0")")" && pwd)"
    local invocation_path
    invocation_path="$(command -v -- "$name" || true)"
    local invocation_dir=""
    if [[ "$invocation_path" == */* ]]; then
        invocation_dir="$(cd -- "$(dirname -- "$invocation_path")" && pwd)"
    fi

    local sanitized_path=""
    IFS=':' read -r -a entries <<< "${PATH:-}"
    for e in "${entries[@]}"; do
        [[ -z "$e" ]] && e="."
        [[ "$e" == "$real_script_dir" ]] && continue
        [[ -n "$invocation_dir" && "$e" == "$invocation_dir" ]] && continue
        sanitized_path="${sanitized_path:+$sanitized_path:}$e"
    done

    if [[ -z "$sanitized_path" ]]; then
        echo "py-runtime-guard: PATH only contains guard directories; cannot resolve $target." >&2
        exit 127
    fi

    local resolved
    resolved="$(PATH="$sanitized_path" command -v -- "$target" || true)"
    if [[ -z "$resolved" ]]; then
        echo "py-runtime-guard: unable to find $target outside guard directories." >&2
        exit 127
    fi

    PATH="$sanitized_path" exec "$resolved" "$@"
}

hint() {
    echo "hint(py-runtime-guard): $1" >&2
}

case "$name" in
    pip|pip3|pipx)
        replacement="${REPLACE[$name]}"
        echo "Direct use of $name is blocked. Use '$replacement' instead. If you really need $name, use real-$name." >&2
        if [[ "$name" == pipx ]]; then
            echo "  pipx run <cmd>     -> uvx <cmd>" >&2
            echo "  pipx install <cmd> -> uv tool install <cmd>" >&2
        else
            echo "  $name install <pkg> -> uv pip install <pkg> / uv add <pkg>" >&2
            echo "  $name freeze        -> uv pip freeze / uv lock" >&2
        fi
        exit 1
        ;;

    python3)
        case "${1:-}" in
            -m)
                module="${2:-}"
                case "$module" in
                    pip)
                        echo "Direct use of 'python3 -m pip' is blocked. Use 'uv pip' instead. Bypass: real-python3 -m pip" >&2
                        exit 1
                        ;;
                    venv)
                        hint "consider 'uv venv' instead. Bypass: real-python3"
                        ;;
                    *)
                        if [[ -n "$module" ]]; then
                            hint "consider 'uv run -m $module' (auto-resolves deps). Bypass: real-python3"
                        fi
                        ;;
                esac
                ;;
            -c|"")
                # REPL / one-liner: silent pass-through
                ;;
            *)
                if [[ -f "${1:-}" && "${1:-}" == *.py ]]; then
                    hint "consider 'uv run $1' (supports inline script metadata). Bypass: real-python3"
                fi
                ;;
        esac
        resolve_real python3 "$@"
        ;;

    real-pip|real-pip3|real-pipx|real-python3)
        resolve_real "${name#real-}" "$@"
        ;;

    *)
        echo "py-runtime-guard: unknown invocation name: $name" >&2
        echo "Expected: pip | pip3 | pipx | python3 | real-pip | real-pip3 | real-pipx | real-python3" >&2
        exit 64
        ;;
esac
