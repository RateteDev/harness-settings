---
name: CSS構造規約
description: |
  CSSの作成・改修・リファクタリングで従う構造化規約。Scope（Global / Local）と Role（Tokens / Structure / Design）の2軸、@layerによるRole表現、テーマToken、所有者単位のファイル分割、静的検査で強制する規則の範囲を定める。
metadata:
  user-review: false
---

# CSS構造規約

## 目的
CSSの配置先と責務を「所有者（Scope）」と「役割（Role）」の2軸で明確化し、実装の迷いをなくすとともに、誤った配置を静的検査で検知できるようにする。

---

## 2つの軸（ScopeとRole）

すべてのCSS宣言は、**Scope（誰が持つか）** と **Role（何を担うか）** を決定してから記述する。

### 1. Scope（所有者）
セレクタではなく「どの単位が所有するか」で判断する。

- **Global**: アプリ全体で共有する基礎定義（layer順序宣言、テーマToken、リセットCSS、全体適用ルールなど）。
- **Local / Page**: 特定ページの大枠レイアウトやページ固有のUI。
- **Local / Component**: ページから独立したUIパーツ（再利用回数に関わらず、単独で命名でき持ち出し可能な単位）。

**原則:**
- PageとComponentは親子関係ではない。
  PageはComponentを「配置」するだけで、Component内部のCSSには干渉しない。
- Localの問題は、そのLocalを所有するファイル内で解決する。

### 2. Role（役割）
CSS標準の `@layer` を用いて、以下の3層・順序で管理する。
※ エントリーポイントで順序を一度だけ宣言し、自作の宣言は必ずいずれかのlayerに配置する。

```css
@layer tokens, structure, design;
```

- **tokens**: 許可するカラーパレットや、テーマ切り替えに必要な変数を定義する。
- **structure**: レイアウト、配置、サイズ、可読性、操作性を担保する（骨組み）。
- **design**: 装飾的な視覚表現（見た目の装飾）。

---

## Roleの判定基準（削除テスト）

**「`design` layerを丸ごと消しても、UIが壊れず読めて操作できるか」** で判断する。

- **Structureに配置（骨組み）:**
  - 削除すると「読めない」「操作できない」「重なる/はみ出る」「境界が不明」「レイアウトが崩れる」もの。
  - **フォント指定**（`font-size`, `line-height`, `font-weight`, `font-family`）：折り返しや幅に影響するため。
  - **境界線の有無・太さ・形状**（`border-width`, `border-style`）。
- **Designに配置（装飾）:**
  - 削除しても素朴（ブラウザ標準風）になるだけで、破綻しないもの。
  - **色・装飾**（`color`, `background-color`, `border-color`, `border-radius`, `box-shadow`, 装飾用グラデーション/透明度）。

> **迷ったら `structure` に配置する。**  
> `design` に誤配置して骨組みが壊れるリスクを避けるため。
> プロパティが複合している場合（例: `border`）は分割して各layerへ配置する。

---

## トークン（Tokens）の扱い

- **色は常にGlobal Tokenを使用する:** CSS内に生の色コード（Hex, RGB等）を直書きしない。
- **色以外の値（余白・角丸など）:** 
  - テーマ切り替えで実際に変化する値のみToken化する。
  - テーマで不変な値（例: `padding: 24px`, `border-radius: 12px`）は、複数箇所で使う場合でも**直値で記述**する。
- **参照ルール:**
  - Globalの `tokens` layerで定義し、Localからは変数を参照するのみとする。
  - Local固有のCustom Propertyは、コンポーネントの引数や計算処理など明確な目的がある場合のみ許容する。

---

## ファイル構成

- **1所有者 = 1ファイル:**
  Local CSSは所有者（PageまたはComponent）ごとに1ファイルとし、Roleの違いは同一ファイル内の `@layer` で分ける（ファイル往復の防止）。
- **配置ディレクトリ（素のCSSの場合）:**
  - `styles/global/`
  - `styles/pages/`
  - `styles/components/`
- **Scoped CSS / CSS Modulesを使う場合:**
  Scope分離はフレームワーク機能に任せ、ファイル内でのRole分割に `@layer` を使用する。

---

## 実装・変更手順

1. **所有者を特定:** 変更対象がGlobal / Page / Componentのどれに属するか決める。
2. **既存ファイルを優先:** 既存の所有者ファイルへ追記・修正し、安易にファイルを増やさない。
3. **Roleへ分類:** 各CSSプロパティを `structure` または `design` に分類して記述する。
4. **他コンポーネントへの不干渉:** 親から子コンポーネントの内部スタイルを上書きしない（対象コンポーネント側で変更する）。
5. **セレクタ設計:** DOM階層に依存させず、対象に意味のあるクラスを付与して指定する。
6. **競合解消:** 詳細度ハック（`!important` 等）を使わず、ScopeとRoleの配置を見直して解決する。
7. **表示制御:** 状態の開閉・表示切替は `hidden` 属性、`<dialog>`、`aria-*`、JS条件描画で行う（`opacity` はアニメーション等の視覚効果のみに限定）。
8. **静的検証:** 作業後にLintとテストを実行し、構文だけでなく所有権や分類の妥当性を確認する。

---

## 静的検査（Lint）の適用基準

リポジトリでLintを実装・運用する際の重大度基準。

### エラー（ビルド停止）
- 未知の `@layer` 名の使用、layer外でのfirst-party宣言。
- `@layer` 順序の再宣言。
- Localでの生の色コード直書き、LocalでのGlobal Token再定義。
- `!important` の使用。
- IDセレクタの使用。
- 未定義Tokenの参照、テーマ間でのToken定義漏れ。
- ※ shorthand・gradient・shadow内の生色もAST（構文木）解析で検知する。

### 警告（レビューで確認）
- `design` layer内でのレイアウト系プロパティ（`display`, `width`, `margin` 等）や `transform` の使用。
- `structure` layer内での `box-shadow` や色の使用。
- 深すぎるネストセレクタ。
