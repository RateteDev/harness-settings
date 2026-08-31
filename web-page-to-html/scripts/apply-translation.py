#!/usr/bin/env python3

import html as html_module
import json
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            f"Usage: {sys.argv[0]} <INPUT_HTML> <TRANSLATED_JSON> <OUTPUT_HTML> <TARGET_LANG>"
        )
    input_html, translated_json, output_html = map(Path, sys.argv[1:4])
    target_lang = sys.argv[4]
    if not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", target_lang):
        raise SystemExit(f"ERROR: invalid BCP 47 language tag: {target_lang}")

    html = input_html.read_text(encoding="utf-8")
    entries = json.loads(translated_json.read_text(encoding="utf-8"))
    replaced = 0
    missed: list[int] = []

    for entry in entries:
        original = entry["text"]
        translated = entry["translated"]
        raw_candidates = (original, html_module.escape(original, quote=False))
        replacement = html_module.escape(translated, quote=False)
        for candidate in raw_candidates:
            if candidate in html:
                html = html.replace(candidate, replacement, 1)
                replaced += 1
                break
        else:
            identifier = entry["id"]
            print(f"MISS (id={identifier}): {original[:60]}...", file=sys.stderr)
            missed.append(identifier)

    lang_pattern = re.compile(r"(<html\b[^>]*\blang\s*=\s*)([\"'])[^\"']*\2", re.IGNORECASE)
    if lang_pattern.search(html):
        html = lang_pattern.sub(lambda match: f'{match.group(1)}"{target_lang}"', html, count=1)
    else:
        html = re.sub(r"<html\b", f'<html lang="{target_lang}"', html, count=1, flags=re.IGNORECASE)

    if missed:
        raise SystemExit(f"ERROR: {len(missed)} translation segment(s) were not found; output was not written")

    output_html.write_text(html, encoding="utf-8")
    print(f"Applied {replaced} translations -> {output_html} ({output_html.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
