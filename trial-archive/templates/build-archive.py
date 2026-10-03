#!/usr/bin/env python3
"""試行錯誤アーカイブの雛形ビルダー。

試行ディレクトリの全ファイルを、1つの自己完結HTMLにまとめる。
読むためのもの（記録・図）を前、残すためのもの（素材＝ソース・入力・テーマ・生データ）を
後ろへ畳んで置き、読者エージェント向けの説明書を末尾へ埋め込む。

使うときは作業場所へコピーし、下の「規約」を題材に合わせて直す。
作業用の中間ファイルは /tmp に作り、リポジトリには残さない。

    ARTICLE_PREVIEW='...' python3 build-archive.py <試行ディレクトリ> \
        [--out <出力.html>] [--guide <説明書.md>] [--keep-work]

環境変数:
    ARTICLE_PREVIEW  article-preview の起動コマンド（既定: article-preview）
"""

from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

# ─── 規約（題材に合わせて直す） ───

RECORD_NAME = "記録.md"          # 記録。h1がタイトルになる
FIGURES_FIRST = True             # 前（読むため）の並び。True: 図→記録 / False: 記録→図
FIGURES_HEADING = "図"
RECORD_HEADING = "記録"
MATERIAL_HEADING = "素材"        # 後（残すため）: ソース・入力・テーマ・生データ
GUIDE_ID = "archive-guide"

SKIP_DIRS = {".git", "node_modules", ".archive-build", ".tmp"}
IMAGE_SUFFIXES = {".svg", ".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"}
# 証跡・部分拡大など、図ではなく素材として扱う画像のディレクトリ名
MATERIAL_IMAGE_DIRS = {"検証", "視覚検査", "素材", "evidence"}
LANG = {
    ".ts": "typescript",
    ".mts": "typescript",
    ".js": "javascript",
    ".mjs": "javascript",
    ".css": "css",
    ".sh": "bash",
    ".py": "python",
    ".json": "json",
    ".md": "markdown",
    ".html": "html",
}


# ─── 補助 ───

def language_of(path: Path) -> str:
    return LANG.get(path.suffix, "text")


def fence_for(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def code_block(path: Path, text: str) -> str:
    text = text.rstrip()
    fence = fence_for(text)
    return f"{fence}{language_of(path)}\n{text}\n{fence}\n"


def split_title(record: str) -> tuple[str, str]:
    """記録のh1をタイトルとして取り出し、残りを返す。"""
    lines = record.splitlines()
    if not lines or not lines[0].startswith("# "):
        raise ValueError(f"{RECORD_NAME} does not start with an h1")
    return lines[0][2:].strip(), "\n".join(lines[1:]).lstrip("\n")


def image_size(path: Path) -> str | None:
    """`幅/高さ` を返す。読み取り前の枠を予約するために使う。"""
    if path.suffix == ".svg":
        head = path.read_text(encoding="utf-8", errors="replace")[:2000]
        match = re.search(r'viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"', head)
        return f"{match.group(1)}/{match.group(2)}" if match else None
    if path.suffix == ".webp":
        data = path.read_bytes()
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = 1 + (data[24] | data[25] << 8 | data[26] << 16)
            h = 1 + (data[27] | data[28] << 8 | data[29] << 16)
            return f"{w}/{h}"
        if chunk == b"VP8 ":
            w = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            h = struct.unpack("<H", data[28:30])[0] & 0x3FFF
            return f"{w}/{h}"
        if chunk == b"VP8L":
            bits = data[21] | data[22] << 8 | data[23] << 16 | data[24] << 24
            return f"{(bits & 0x3FFF) + 1}/{((bits >> 14) & 0x3FFF) + 1}"
    return None


def skipped(path: Path, root: Path) -> bool:
    parts = path.relative_to(root).parts
    return any(part in SKIP_DIRS or part.startswith(".") for part in parts)


def collect(step: Path) -> tuple[list[Path], list[Path]]:
    """(図, 素材) を返す。記録はどちらにも入れない。素材には画像も入り得る。

    - 同名のSVGがあるラスター（PNG/WebP）は、SVGを図とし、ラスターは素材にする。
    - MATERIAL_IMAGE_DIRS 配下の画像は、素材にする。
    """
    files = [
        p for p in sorted(q for q in step.rglob("*") if q.is_file())
        if not skipped(p, step) and not (p.parent == step and p.name == RECORD_NAME)
    ]
    svg_bases = {(p.parent, p.stem) for p in files if p.suffix.lower() == ".svg"}
    figures: list[Path] = []
    materials: list[Path] = []
    for path in files:
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            evidence = any(part in MATERIAL_IMAGE_DIRS for part in path.relative_to(step).parts[:-1])
            redundant = suffix != ".svg" and (path.parent, path.stem) in svg_bases
            (materials if (evidence or redundant) else figures).append(path)
        else:
            materials.append(path)
    return figures, materials


# ─── 組み立て ───

def compose_mdx(step: Path, work: Path, label: str) -> str:
    record = (step / RECORD_NAME).read_text(encoding="utf-8").rstrip() + "\n"
    title, body = split_title(record)
    figures, materials = collect(step)

    def figures_part() -> str:
        (work / "figs").mkdir(parents=True, exist_ok=True)
        out = [f"\n## {FIGURES_HEADING}\n"]
        for path in figures:
            rel = path.relative_to(step).as_posix()
            work_name = rel.replace("/", "__")
            (work / "figs" / work_name).write_bytes(path.read_bytes())
            ratio = image_size(path)
            ratio_attr = f' ratio="{ratio}"' if ratio else ""
            out.append(
                f'<Image src="figs/{work_name}" zoom{ratio_attr} '
                f'alt="{label}の図。{rel}" caption="図: {rel}" />\n'
            )
        return "".join(out)

    def record_part() -> str:
        # 記録は生のMarkdownとしてそのまま置く。h1はタイトルに使う済み。
        return f"\n## {RECORD_HEADING}\n\n" + code_block(step / RECORD_NAME, body)

    parts = [f"# {title}\n"]
    if FIGURES_FIRST:
        if figures:
            parts.append(figures_part())
        parts.append(record_part())
    else:
        parts.append(record_part())
        if figures:
            parts.append(figures_part())

    if materials:
        (work / "figs").mkdir(parents=True, exist_ok=True)
        parts.append(f"\n## {MATERIAL_HEADING}\n")
        for path in materials:
            rel = path.relative_to(step).as_posix()
            if path.suffix.lower() in IMAGE_SUFFIXES:
                work_name = rel.replace("/", "__")
                (work / "figs" / work_name).write_bytes(path.read_bytes())
                ratio = image_size(path)
                ratio_attr = f' ratio="{ratio}"' if ratio else ""
                parts.append(
                    f'### > {rel}\n\n<Image src="figs/{work_name}" zoom{ratio_attr} '
                    f'alt="{label}の素材。{rel}" caption="{rel}" />\n'
                )
            else:
                parts.append(f"### > {rel}\n\n{code_block(path, path.read_text(encoding='utf-8', errors='replace'))}")

    return "\n".join(parts)


def run_cli(mdx: Path, html: Path) -> None:
    argv = shlex.split(os.environ.get("ARTICLE_PREVIEW", "article-preview"))
    if not argv:
        sys.exit("ARTICLE_PREVIEW is empty")
    try:
        subprocess.run([*argv, "fix-spacing", str(mdx)], check=True)
        subprocess.run([*argv, str(mdx), "--out", str(html), "--media", "inline"], check=True)
    except FileNotFoundError:
        sys.exit(f"article-preview not found: {argv[0]}")


def check_coverage(step: Path, included: list[str], record_names: list[str]) -> list[str]:
    """step内の全ファイルが内包されたかを照合し、欠けを返す。"""
    on_disk = [
        p.relative_to(step).as_posix()
        for p in sorted(q for q in step.rglob("*") if q.is_file())
        if not skipped(p, step)
    ]
    embedded = set(included) | set(record_names)
    return [rel for rel in on_disk if rel not in embedded]


# ─── 説明書 ───

def section_index(html: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for match in re.finditer(r'id="(section-\d\d)"', html):
        segment = html[match.start() : match.start() + 2000]
        heading = re.search(r"<h2[^>]*>(.*?)</h2>", segment, re.S)
        text = re.sub(r"<[^>]+>", "", heading.group(1)).strip() if heading else "?"
        if not any(existing == match.group(1) for existing, _ in found):
            found.append((match.group(1), text))
    return found


def section_of(sections: list[tuple[str, str]], heading: str) -> str | None:
    return next((sid for sid, text in sections if text == heading), None)


def first_code_block_in(html: str, section_id: str) -> str | None:
    start = html.find(f'id="{section_id}"')
    if start < 0:
        return None
    match = re.search(r'id="(code-block-\d+)"', html[start:])
    return match.group(1) if match else None


def count_images_in(html: str, section_id: str) -> int:
    start = html.find(f'id="{section_id}"')
    if start < 0:
        return 0
    nxt = html.find('<section id="section-', start + 1)
    segment = html[start : nxt if nxt > 0 else len(html)]
    return len(re.findall(r'id="image-\d+"', segment))


def default_guide(html: str, label: str) -> str:
    sections = section_index(html)
    record = section_of(sections, RECORD_HEADING)
    figures = section_of(sections, FIGURES_HEADING)
    material = section_of(sections, MATERIAL_HEADING)
    record_block = first_code_block_in(html, record) if record else None
    lines = [
        "# このアーカイブの説明書",
        "",
        f"{label} の試行錯誤アーカイブである。読むためのもの（記録・図）を前、残すためのもの（素材）を後ろに置く。記録・図・素材をすべて内包し、外部のファイル・URL・フォントを参照しない。",
        "",
        "## 読む順",
        "",
        f"1. 記録：`#{record}` の `{record_block}`。生のMarkdownをそのまま持つ。ここが本筋である。",
    ]
    order = 2
    if figures:
        count = count_images_in(html, figures)
        lines.append(f"{order}. 図：`#{figures}` に{count}枚。原本を内包し、拡大マークから全画面で見られる。")
        order += 1
    if material:
        count = len(re.findall(rf'id="section-{material[-2:]}-\d\d"', html))
        lines.append(f"{order}. {MATERIAL_HEADING}：`#{material}` に{count}件。残すためのもので、読む必要はない。畳んだサブセクションで持つ。")
        order += 1
    lines += [
        "",
        "## 注意",
        "",
        "- 記録は生のMarkdownで、描画した本文ではない。見出しは記録の中の文字である。",
        "- 図は data URI として内包する。図が指定するフォントは、SVGに内包されていれば表示される。",
        f"- 説明書は読者エージェント向けで、画面には表示されない。`{GUIDE_ID}` の data block の中だけを読めばよい。",
    ]
    return "\n".join(lines)


def inject_guide(html: str, guide: str) -> str:
    if "</script>" in guide:
        sys.exit("the guide contains </script>; write it without that sequence")
    at = html.rindex("</body>")
    if html[at:].rstrip() != "</body>\n</html>":
        sys.exit("unexpected document tail; cannot place the guide")
    block = f'<script type="text/markdown" id="{GUIDE_ID}">\n{guide}\n</script>\n'
    return html[:at] + block + html[at:]


# ─── 入口 ───

def main() -> None:
    parser = argparse.ArgumentParser(description="Build one trial archive as a single HTML.")
    parser.add_argument("step", type=Path, help="試行ディレクトリ（記録.md と成果物を置く）")
    parser.add_argument("--out", type=Path, help="出力HTML（既定: <step>-アーカイブ.html を隣に）")
    parser.add_argument("--guide", type=Path, help="説明書のMarkdown。省略時は節構成から生成する")
    parser.add_argument("--keep-work", action="store_true", help="作業用の中間ファイルを残す")
    args = parser.parse_args()

    step = args.step.resolve()
    if not (step / RECORD_NAME).is_file():
        sys.exit(f"{RECORD_NAME} not found in {step}")
    out = args.out or step.parent / f"{step.name}-アーカイブ.html"
    figures, materials = collect(step)

    work = Path(tempfile.mkdtemp(prefix="trial-archive-"))
    try:
        mdx = work / "index.mdx"
        mdx.write_text(compose_mdx(step, work, step.name), encoding="utf-8")
        built = work / "built.html"
        run_cli(mdx, built)

        html = built.read_text(encoding="utf-8")
        guide = args.guide.read_text(encoding="utf-8").strip() if args.guide else default_guide(html, step.name)
        out.write_text(inject_guide(html, guide), encoding="utf-8")
    finally:
        if args.keep_work:
            print(f"work kept: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)

    included = [p.relative_to(step).as_posix() for p in figures + materials]
    missing = check_coverage(step, included, [RECORD_NAME])
    print(f"written: {out} ({out.stat().st_size / 1024:.0f} KiB)")
    print(f"included: figures={len(figures)} materials={len(materials)} record=1")
    if missing:
        print("COVERAGE MISSING: " + ", ".join(missing), file=sys.stderr)
        sys.exit(2)
    print("coverage ok")


if __name__ == "__main__":
    main()
