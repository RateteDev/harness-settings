#!/bin/bash
# VMを作った直後に1回、VMの中で動かす。開発道具と、追加部品（kits）では入れないハーネスを入れる。
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== cc"
# Rust はリンクにCのコンパイラを使うが、shell の土台には入っていない。
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential >/dev/null

echo "== bun"
curl -fsSL https://bun.sh/install | bash >/dev/null

echo "== rust"
# 既定の構成はHTMLの説明書（約1GB）を含み、VMの中では読まないため、最小の構成に整形と静的検査だけを足す。
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component rustfmt,clippy >/dev/null 2>&1

# sbx exec はログインシェルを通さない。sbx の土台は、どの bash からもこのファイルを読むようにしてある。
# shellcheck disable=SC2016 # $HOME と $PATH は、読まれるときに展開させる。
line='export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"'
grep -qxF "$line" /etc/sandbox-persistent.sh || echo "$line" | sudo tee -a /etc/sandbox-persistent.sh >/dev/null

for f in "$here"/*/install; do
  [ -f "$f" ] || continue
  echo "== $(basename "$(dirname "$f")")"
  bash "$f"
done
echo "== 済み"
