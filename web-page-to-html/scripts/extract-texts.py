#!/usr/bin/env python3

import json
import sys
from html.parser import HTMLParser
from pathlib import Path


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_main = False
        self.main_depth = 0
        self.skip_tags = {"script", "style", "noscript", "svg", "button"}
        self.skip_depth = 0
        self.entries: list[dict[str, int | str]] = []

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main":
            self.in_main = True
            self.main_depth = 0
        if self.in_main:
            self.main_depth += 1
            if tag in self.skip_tags and self.skip_depth == 0:
                self.skip_depth = self.main_depth

    def handle_endtag(self, tag: str) -> None:
        if not self.in_main:
            return
        if self.skip_depth == self.main_depth:
            self.skip_depth = 0
        self.main_depth -= 1
        if tag == "main":
            self.in_main = False

    def handle_data(self, data: str) -> None:
        if not self.in_main or self.skip_depth > 0:
            return
        text = data.strip()
        if len(text) < 4:
            return
        ascii_alpha = sum(character.isascii() and character.isalpha() for character in text)
        total_alpha = sum(character.isalpha() for character in text)
        if total_alpha > 3 and ascii_alpha / total_alpha > 0.7:
            self.entries.append({"id": len(self.entries) + 1, "text": text})


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(f"Usage: {sys.argv[0]} <INPUT_HTML> <OUTPUT_JSON>")
    input_html, output_json = map(Path, sys.argv[1:3])
    parser = TextExtractor()
    parser.feed(input_html.read_text(encoding="utf-8"))
    output_json.write_text(
        json.dumps(parser.entries, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Extracted {len(parser.entries)} translatable segments -> {output_json}")


if __name__ == "__main__":
    main()
