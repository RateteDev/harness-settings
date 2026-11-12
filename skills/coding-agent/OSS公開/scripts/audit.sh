#!/usr/bin/env bash
# 公開前チェックの機械点検。秘密値そのものは出力せず、場所と種類だけを報告する。
set -euo pipefail

repo="${1:-.}"

if ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    printf 'error: not a git repository: %s\n' "$repo" >&2
    exit 2
fi

# kind|regex の組。右辺の値は出力に含めない。
patterns=(
    'private-key|BEGIN [A-Z ]*PRIVATE KEY'
    'api-token|sk-[A-Za-z0-9]{20,}'
    'api-token|ghp_[A-Za-z0-9]{20,}'
    'api-token|github_pat_[A-Za-z0-9_]{20,}'
    'api-token|xox[baprs]-[A-Za-z0-9-]{10,}'
    'api-token|AKIA[0-9A-Z]{16}'
    'jwt|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    'home-path|/home/[A-Za-z0-9]'
    'home-path|/Users/[A-Za-z0-9]'
    'home-path|C:\\Users\\'
    'private-ip|192\.168\.[0-9]+\.[0-9]+'
    'hostname|DESKTOP-[A-Z0-9]{6,}'
    'mac-address|([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}'
)
suspicious='(^|/)(\.env($|\.)|id_rsa|id_ed25519|credentials)$|\.(pem|pfx|p12|key)$'

findings=0

report() {
    printf 'finding: %s: %s\n' "$1" "$2"
    findings=$((findings + 1))
}

scan_tree() {
    local entry kind re path
    for entry in "${patterns[@]}"; do
        kind="${entry%%|*}"
        re="${entry#*|}"
        while IFS= read -r path; do
            [ -n "$path" ] && report "$kind" "$path"
        done < <(git -C "$repo" grep -l -I -E -e "$re" 2>/dev/null || true)
    done
    while IFS= read -r path; do
        [ -n "$path" ] && report 'suspicious-filename' "$path"
    done < <(git -C "$repo" ls-files | grep -E "$suspicious" || true)
}

scan_history() {
    local entry kind re line path
    local revs
    mapfile -t revs < <(git -C "$repo" rev-list --all)
    [ "${#revs[@]}" -gt 0 ] || return 0
    for entry in "${patterns[@]}"; do
        kind="${entry%%|*}"
        re="${entry#*|}"
        while IFS= read -r line; do
            [ -n "$line" ] || continue
            path="${line#*:}"
            report "history:$kind" "$path"
        done < <(git -C "$repo" grep -l -I -E -e "$re" "${revs[@]}" 2>/dev/null | sort -u || true)
    done
}

scan_identities() {
    local name email
    while IFS=$'\t' read -r name email; do
        case "$email" in
            *users.noreply.github.com) ;;
            *) report 'author-identity' "$name" ;;
        esac
    done < <(git -C "$repo" log --all --format='%an%x09%ae' | sort -u)
}

scan_tree
scan_history
scan_identities

if [ "$findings" -eq 0 ]; then
    printf 'audit: no findings\n'
else
    printf 'audit: %d finding(s)\n' "$findings"
    exit 1
fi
