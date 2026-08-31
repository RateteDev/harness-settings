#!/usr/bin/env bash
set -euo pipefail

url="${1:?Usage: $0 <URL> <OUTPUT_DIR>}"
out_dir="${2:?Usage: $0 <URL> <OUTPUT_DIR>}"
mkdir -p "$out_dir"

origin="$(python3 - "$url" <<'PY'
import sys
from urllib.parse import urlsplit

parts = urlsplit(sys.argv[1])
if parts.scheme not in {"http", "https"} or not parts.netloc:
    raise SystemExit("URL must be an absolute HTTP(S) URL")
print(f"{parts.scheme}://{parts.netloc}")
PY
)"

raw="${out_dir}/raw.html"
css="${out_dir}/all-styles.css"
output="${out_dir}/standalone.html"

echo "[1/3] Fetching ${url} ..."
curl --fail --location --silent --show-error --output "$raw" "$url"
[[ -s "$raw" ]] || { echo "ERROR: empty response from ${url}" >&2; exit 1; }

echo "[2/3] Downloading external CSS ..."
: > "$css"
mapfile -t css_paths < <(grep -oE "/_next/static/chunks/[^\"']+\\.css" "$raw" | sort -u || true)
for path in "${css_paths[@]}"; do
    curl --fail --location --silent --show-error "${origin}${path}" >> "$css"
    printf '\n' >> "$css"
done
css_size="$(wc -c < "$css")"
echo "  CSS total: ${css_size} bytes"

echo "[3/3] Building standalone HTML ..."
python3 - "$raw" "$css" "$output" "$origin" <<'PY'
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urljoin

raw_path, css_path, output_path, origin = sys.argv[1:5]
html = Path(raw_path).read_text(encoding="utf-8")
css = Path(css_path).read_text(encoding="utf-8")

# Next.jsが生成したstylesheetだけを除き、取得した内容を一つのstyleへまとめる。
html = re.sub(
    r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])(?=[^>]*\bhref=["\']/_next/static/chunks/[^"\']+\.css["\'])[^>]*>',
    "",
    html,
    flags=re.IGNORECASE,
)
html = re.sub(r"</head\s*>", f"<style>{css}</style>\n</head>", html, count=1, flags=re.IGNORECASE)

# 最適化endpointは元画像を指すencoded URLへ戻す。
html = re.sub(
    r"/_next/image\?url=([^&\"']+)(?:&amp;[^\"']*)?",
    lambda match: unquote(match.group(1)),
    html,
)

def absolutize_attribute(match: re.Match[str]) -> str:
    prefix, quote, value = match.groups()
    return f"{prefix}{quote}{urljoin(origin + '/', value)}{quote}"

html = re.sub(
    r"((?:href|src|poster|action)\s*=\s*)([\"'])(/[^\"']*)\2",
    absolutize_attribute,
    html,
    flags=re.IGNORECASE,
)
html = html.replace("url(/_next/", f"url({origin}/_next/")
html = re.sub(r"\s*nonce=[\"'][^\"']*[\"']", "", html, flags=re.IGNORECASE)

Path(output_path).write_text(html, encoding="utf-8")
print(f"  Output: {output_path} ({Path(output_path).stat().st_size} bytes)")
PY

echo "Done: ${output}"
