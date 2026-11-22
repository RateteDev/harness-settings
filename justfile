set shell := ["bash", "-euo", "pipefail", "-c"]

hako := "environments/hako"

[private]
default:
    just --list

# Gitフックを有効にする（クローン直後に一度実行する）
setup:
    git config core.hooksPath .githooks

# 整形・静的検査を確かめる（ファイルは変えない）
[group('hako')]
hako-check:
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{ hako }}
    unformatted="$(gofmt -l .)"
    if [ -n "$unformatted" ]; then echo "gofmt を当てていないファイル: $unformatted" >&2; exit 1; fi
    go vet ./...
    shellcheck -x */install */run */setup.sh

# 整形を当てる
[group('hako')]
hako-fix:
    cd {{ hako }} && gofmt -w .

# ユニットテストを動かす
[group('hako')]
hako-test:
    cd {{ hako }} && go test ./...

# 手元の環境向けに作る（dist/hako）
[group('hako')]
hako-build version="dev":
    cd {{ hako }} && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version={{ version }}" -o "{{ justfile_directory() }}/dist/hako" ./app

# リリースの成果物（Linux の各アーキテクチャの tar.gz と checksums.txt）を dist/ に作る
[group('release')]
release-build version="0.0.0-dev":
    #!/usr/bin/env bash
    set -euo pipefail
    out="$PWD/dist"
    rm -rf "$out"
    mkdir -p "$out"
    cd {{ hako }}
    for arch in amd64 arm64; do
      dir="$(mktemp -d)"
      CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -trimpath -ldflags "-s -w -X main.version={{ version }}" -o "$dir/hako" ./app
      tar -C "$dir" -czf "$out/hako-{{ version }}-linux-$arch.tar.gz" hako
      rm -rf "$dir"
    done
    cd "$out"
    sha256sum -- *.tar.gz > checksums.txt

# 検査・テスト・ビルドをまとめて動かす（CIと同じ）
ci-local:
    #!/usr/bin/env bash
    set -euo pipefail
    pids=()
    just hako-check & pids+=($!)
    just hako-test & pids+=($!)
    just hako-build & pids+=($!)
    failed=0
    for pid in "${pids[@]}"; do
      wait "$pid" || failed=1
    done
    exit $failed
