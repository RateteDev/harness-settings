#!/usr/bin/env python3
"""AWS Icon Packageを取得・展開し、テンプレートのプレースホルダへ公式アイコンを埋め込む。

プレースホルダ書式:
  {{IC:サービスアイコン名|X|Y|SIZE}}   viewBox 0 0 80 80 の64px公式アイコン
  {{GR:グループバッジ名|X|Y|SIZE}}     viewBox 0 0 40 40 の32px公式バッジ

アイコン名は拡張子なし（例: Arch_Amazon-EC2_64 / AWS-Account_32）。
"""
import argparse
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ICONS_PAGE = "https://aws.amazon.com/architecture/icons/"
DEFAULT_ASSETS = Path.home() / ".cache" / "aws-diagram-icons"

PLACEHOLDER = re.compile(
    r"\{\{(IC|GR):([^}|]+)\|(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\}\}"
)

VIEWBOX = {"IC": "0 0 80 80", "GR": "0 0 40 40"}


def fetch(assets: Path) -> None:
    """アイコンページからzip URLを発見し、必要なディレクトリだけassetsへ展開する。"""
    if (assets / ".fetched").exists():
        print(f"already fetched: {assets}")
        return
    page = urllib.request.urlopen(ICONS_PAGE, timeout=60).read().decode()
    urls = sorted(set(re.findall(r'href="([^"]*Icon-package[^"]*\.zip)"', page)))
    if not urls:
        sys.exit(f"no Icon-package zip found on {ICONS_PAGE}")
    url = urls[0]
    print(f"downloading {url}")
    data = urllib.request.urlopen(url, timeout=300).read()

    wanted = ("Architecture-Service-Icons_", "Architecture-Group-Icons_")
    with zipfile.ZipFile(__import__("io").BytesIO(data)) as zf:
        for info in zf.infolist():
            name = info.filename
            if name.startswith("__MACOSX") or not name.startswith(wanted):
                continue
            if info.is_dir():
                continue
            target = assets / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(info))
    (assets / ".fetched").write_text(url + "\n")
    print(f"extracted to {assets}")


def load_inner(svg_path: Path) -> str:
    """外側のsvgタグと<title>を除いた中身を返す。"""
    text = svg_path.read_text()
    inner = re.sub(r"^.*?<svg[^>]*>", "", text, count=1, flags=re.S)
    inner = re.sub(r"</svg>\s*$", "", inner, flags=re.S)
    return re.sub(r"<title>.*?</title>", "", inner, flags=re.S)


def resolve(assets: Path, kind: str, name: str) -> Path:
    pattern = f"**/{name}.svg"
    hits = sorted(assets.rglob(pattern))
    if not hits:
        sys.exit(f"icon not found in {assets}: {name}")
    if len(hits) > 1:
        print(f"warning: multiple matches for {name}, using {hits[0]}", file=sys.stderr)
    return hits[0]


def embed(assets: Path, match: re.Match) -> str:
    kind, name, x, y, size = match.groups()
    path = resolve(assets, kind, name)
    return (
        f'<svg x="{x}" y="{y}" width="{size}" height="{size}" '
        f'viewBox="{VIEWBOX[kind]}" overflow="visible">{load_inner(path)}</svg>'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("fetch", help="アイコンパッケージを取得して展開する")
    build = sub.add_parser("build", help="テンプレートへ公式アイコンを埋め込む")
    build.add_argument("--template", required=True)
    build.add_argument("--out", required=True)
    build.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    args = parser.parse_args()

    if args.command == "fetch":
        fetch(DEFAULT_ASSETS)
        return
    if args.command != "build":
        parser.print_help()
        sys.exit(1)

    template = Path(args.template).read_text()
    result = PLACEHOLDER.sub(lambda m: embed(args.assets, m), template)
    leftover = PLACEHOLDER.search(result)
    if leftover:
        sys.exit(f"unresolved placeholder remains: {leftover.group(0)}")
    Path(args.out).write_text(result)
    print(f"written: {args.out} ({Path(args.out).stat().st_size} bytes)")


if __name__ == "__main__":
    main()
