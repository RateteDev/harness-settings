---
name: SPUIポータル
description: |
  starting-point-uiの公式Sidebar例を起点に、左サイドバーとダミー本文を持つ白黒モダンな試作ポータルの単体HTMLを作るときに従う差分と規則。
metadata:
  user-review: false
---

# SPUIポータル

starting-point-uiで白黒モダンの試作ポータルUIを作るときに使う。
左サイドバーとダミー本文を持つ単体HTMLが対象。

## 規則

- 起点は公式Sidebar例（https://startingpointui.com/components/sidebar）とし、複製を持たない。
  都度webfetchで取得する
- 例に以下の差分を適用する
  - 操作ボタンをサイドバーヘッダー内のブランド横へ移動する（`data-sp-toggle`の指す要素を移す）
  - アイコンは山括弧なしのpanel-left（`rect`＋`M9 3v18`）単体にする
  - 折りたたみ時はブランド（`.js-brand`）を隠し、ボタンのみ中央残しにする独自CSSを添える
  - 本文ヘッダーにモバイル専用の代理ボタンを置き（`sidebar:hidden`）、代理ボタンは内側ボタンを`click()`する。
    内側ボタンはPC幅のみ表示（`max-sidebar:hidden`）にする
  - 1サイドバー1トリガー制約（内部で`document.querySelector`）のため、トリガー要素を複製しない
- アイコンはLucide互換のインラインSVG（24px・stroke-width 2）で統一する
- ビルド時は対応HTMLをTailwindの`@source`範囲に入れる。
  `@utility`形式のため範囲外だとSidebar一式が除去される
