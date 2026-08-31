#!/usr/bin/env python3

import json
import sys
from pathlib import Path
from typing import Any


def load_array(path: Path) -> list[Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array")
    return data


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(f"Usage: {sys.argv[0]} <TEXTS_JSON> <TRANSLATIONS_JSON> <OUTPUT_JSON>")
    texts_path, translations_path, output_path = map(Path, sys.argv[1:4])

    try:
        originals = load_array(texts_path)
        translations = load_array(translations_path)
        original_map = {entry["id"]: entry["text"] for entry in originals}
        translation_map: dict[int, str] = {}
        for entry in translations:
            identifier = entry["id"]
            translated = entry["translated"]
            if not isinstance(identifier, int) or not isinstance(translated, str) or not translated.strip():
                raise ValueError("each translation requires an integer id and a non-empty translated string")
            if identifier in translation_map:
                raise ValueError(f"duplicate translation id: {identifier}")
            translation_map[identifier] = translated

        missing = sorted(original_map.keys() - translation_map.keys())
        extra = sorted(translation_map.keys() - original_map.keys())
        if missing:
            raise ValueError(f"missing translation ids: {', '.join(map(str, missing))}")
        if extra:
            raise ValueError(f"unknown translation ids: {', '.join(map(str, extra))}")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"ERROR: invalid translation data: {error}") from error

    result = [
        {"id": identifier, "text": text, "translated": translation_map[identifier]}
        for identifier, text in original_map.items()
    ]
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Merged {len(result)} translations -> {output_path}")


if __name__ == "__main__":
    main()
