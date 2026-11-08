---
name: SPUIポータル
description: |
  starting-point-uiの公式Sidebar例を起点に、左サイドバーとダミー本文を持つ白黒モダンな試作ポータルの単体HTMLを作るときに従う差分と規則。
metadata:
  user-review: false
  labels: [規約]
---

# SPUIポータル

## このスキルの目的

公式のSidebar例を複製して育てると、上流の更新へ追随できず、独自変更の意図も分からなくなる。
起点を都度取得して差分だけを管理し、上流と自分の変更を比較できる状態を保つ。

## あるべき状態

### 起点

- HTMLは、作成時に公式Webから取得した最新のSidebar例に、次の差分だけを適用したものである。
- 公式Sidebar例の複製は、スキルにもプロジェクトにも無い。

### 適用する差分

- トリガー要素（`data-sp-toggle`）は1つのサイドバーにつき1つだけある。
  ライブラリが内部で`document.querySelector`を使い、最初の1つだけを拾うためである。
- 内側の操作ボタンはサイドバーヘッダー内のブランド（`.js-brand`）の横にあり、PC幅でだけ表示される（`max-sidebar:hidden`）。
- 折りたたみ時はブランドが隠れ、ボタンだけが中央に残る。
  この挙動は独自CSSで実現している。
- 本文ヘッダーにはモバイル幅でだけ表示される代理ボタン（`sidebar:hidden`）があり、押すと内側のボタンを`.click()`で発火させる。
- アイコンはLucide互換のインラインSVG（24px・`stroke-width="2"`）で統一されている。
- トグルアイコンは、山括弧を含まない`panel-left`単体（`<rect>`＋`<path d="M9 3v18" />`）である。

### ビルド

- Tailwindでビルドする場合、生成したHTMLはTailwindの`@source`の探索範囲に入っている。
  Sidebarは`@utility`形式のため、範囲外だとSidebar一式のスタイルが除去されるためである。

## 手段

起点の公式Sidebar例は<https://startingpointui.com/components/sidebar>から取得する。
