---
name: SPUIポータル
description: |
  starting-point-uiの公式Sidebar例を起点に、左サイドバーとダミー本文を持つ白黒モダンな試作ポータルの単体HTMLを作るときに従う差分と規則。
metadata:
  user-review: false
---

# SPUIポータル実装ルール

## 目的
公式のSidebarコードを直に抱え込まず、公式実装に以下の独自差分のみを適用することで、上流の更新追随性と保守性を担保する。

## ベースコードの取得
- 起点：https://startingpointui.com/components/sidebar
- 方針：ローカルに保持せず、作成時に公式Webから最新を取得してベースとする。

---

## 適用する差分と実装仕様

### 1. トグルボタンの配置とレスポンシブ制御
ライブラリの仕様（内部で `document.querySelector` を使用）上、**1つのサイドバーに対してトリガー要素（`data-sp-toggle`）は1つのみ**配置する（複製不可）。

- **PC表示（`max-sidebar:hidden`）**:
  - トグルボタンはサイドバーヘッダー内のブランド要素（`.js-brand`）の横へ移動する。
  - 折りたたみ時は `.js-brand` を非表示にし、ボタンのみ中央に配置する（独自CSSで制御）。
- **モバイル表示（`sidebar:hidden`）**:
  - 本文ヘッダーに「代理ボタン」を配置する。
  - 代理ボタンを押した際は、JavaScriptの `.click()` でサイドバー内の本来のボタンを発火させる。

### 2. アイコン仕様
- **規格**: Lucide互換のインラインSVG（サイズ: `24x24`、`stroke-width="2"`）。
- **トグルアイコン**: 山括弧（chevron）を含まない単体の `panel-left` アイコン（`<rect>` ＋ `<path d="M9 3v18" />`）を使用する。

### 3. ビルド設定（Tailwind CSS）
- 生成するHTMLファイルは、必ずTailwindの `@source` 探索対象に含めること。
  - ※Sidebarコンポーネントは `@utility` 形式のため、スキャン対象外になるとスタイルが一括削除される。
