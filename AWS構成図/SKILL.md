---
name: AWS構成図
description: |
  AWSリソース構成図を、公式アイコン素材を埋め込んだ単一ファイルSVGとして作成・検証・共有するときに使う。Mermaidや手描きアイコンは使わない。
---

# AWS アーキテクチャ図

方式は決定済み。AWS Icon Packageの公式SVGをネスト`<svg>`として単一ファイルへインライン埋め込みする。公式アイコンの改造・着色はしない（リサイズのみ可）。Mermaid・ASCII・手描きアイコンは採用しない。Mermaidは公式ロゴを出せず、手描きは識別性と商標面で劣る。

## 手順

1. アセット取得: `scripts/build.py fetch`（アイコンページからzip URLを発見し`~/.cache/aws-diagram-icons/`へ展開）
2. テンプレート作成: `templates/diagram.svg` を起点に、公式アイコンはプレースホルダで埋め込む。書式は後述
3. 組立: `python3 scripts/build.py build --template 図.svg --out 完成図.svg`
4. 検証: レンダリングして画像を必ず目視確認する
   ```bash
   sed 's/font-family="'"'"'Inter'"'"'.*sans-serif"/font-family="Noto Sans CJK JP"/' 完成図.svg > 検証用.svg
   uvx --from cairosvg cairosvg 検証用.svg -o 検証用.png --output-width 1600
   ```
5. 共有: 認証不要の画像共有へアップロードし、URLを返す前に到達確認する

## プレースホルダ書式

テンプレート内に `{{IC:アイコンファイル名|X|Y|SIZE}}`（サービスアイコン、viewBox 0 0 80 80）と `{{GR:バッジファイル名|X|Y|SIZE}}`（グループバッジ、viewBox 0 0 40 40）を書く。拡張子は付けない。例: `{{IC:Arch_Amazon-EC2_64|156|268|48}}`、`{{GR:AWS-Account_32|72|102|22}}`

## 正本

| 事実 | 正本 |
|---|---|
| アイコン実体 | `aws.amazon.com/architecture/icons/` のHTMLから発見するzip。直URLは日付+ハッシュ付きで推測不可 |
| グループ枠スタイル | draw.ioの`Sidebar-AWS4.js`内`addAWS4GroupsPalette`（raw.githubusercontent.com/jgraph/drawio/dev/...） |
| バッジ素材 | zip内 `Architecture-Group-Icons_*/` |

グループスタイル定数（2026-09時点のスナップショット。draw.ioが正本）:

| グループ | 枠線 | 塗り | 文字色 | 破線 |
|---|---|---|---|---|
| AWS Account | #CD2264 | なし | #CD2264 | なし |
| AWS Cloud | #232F3E | なし | #232F3E | なし |
| VPC | #8C4FFF | なし | #232F3E（公式指定は#AAB7B8だが可読性のため濃色） | なし |
| Public subnet | なし | #F2F6E8 | #248814 | - |
| Private subnet | なし | #E6F6F7 | #147EBA | - |
| Security group（枠で括る場合） | #DD3522 | なし | #DD3522 | なし |

## 落とし穴

- Security Groupのリソースアイコンは現行パッケージに存在しない（廃止済み）。手描きの盾バッジか、上表のred frameで代用する
- cairosvgはCJKフォントをフォールバックしない。検証レンダリングはfont-familyを`"Noto Sans CJK JP"`へ差し替えたコピーで行う（ブラウザやPowerPointでは元のスタックで正しく表示される）
- ネストsvg間のid重複は、公式アイコンが内部参照を持たないため無害
- テキスト幅は推定でしかない。レンダリング後の目視確認は省略しない

## 共有

| サービス | 保持 | コマンド |
|---|---|---|
| Litterbox | 72h | `curl -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@f.png" https://litterbox.catbox.moe/resources/internals/api.php` |
| Uguu | 48h | `curl -F "files[]=@f.png" https://uguu.se/upload` |

catbox系は2026-09に一時障害（HTTP 500）があった。障害時はUguuへ切り替える。アップロード結果がHTMLエラーページでないことを必ず確認する。
