---
name: CSS構造規約
description: |
  CSSの作成・改修・リファクタリングで従う構造化規約。Scope（Global / Local）と Role（Tokens / Structure / Design）の2軸、@layerによるRole表現、テーマToken、所有者単位のファイル分割、静的検査で強制する規則の範囲を定める。
metadata:
  user-review: false
  labels: [規約]
---

# CSS構造規約

## 目的

CSSを「Scope（所有者）」と「Role（責務）」の2軸で整理し、人間とエージェントの双方が変更箇所と責務境界を迷わず判断・検査できる状態を維持する。

---

## 1. Scope（所有単位）

ScopeはセレクタではなくCSSの所有者（ファイル単位）で決定する。

- **Global**: layer順序の宣言・テーマToken・最小限のリセット（`box-sizing: border-box` 等）のみを配置する。
- **Page (Local)**: ページ固有の大枠レイアウトと、そのページ限定のUIを配置する。
- **Component (Local)**: 単一のUI部品を定義する。再利用頻度ではなく「独立した名前を持ち、別画面へ移動しても意味を成すか」を基準にComponent化する。
- **親子関係の禁止**: PageとComponentは対等なLocalスコープとする。PageはComponentの配置のみを担当し、Component内部のスタイルを外部から上書きしてはならない。

---

## 2. Role（責務レイヤー）

CSSエントリポイントでRoleの優先順序を1度だけ宣言する。

```css
@layer tokens, structure, design;
```

自作（first-party）のCSS宣言は、必ず上記3つのいずれかのlayerに配置する。

| Layer | 責務 | 主な内容 |
| :--- | :--- | :--- |
| `tokens` | 定数定義 | サイト定義色、テーマ切り替え用Custom Property |
| `structure` | 構造・配置 | レイアウト・可読性・操作性の担保（消すとUIが壊れるもの） |
| `design` | 純粋な装飾 | 色・影・角丸など（消してもUIの機能・配置が成立するもの） |

### Structure と Design の分類基準

**「`design` layerを丸ごと削除しても、情報が読め主要な操作ができ配置が崩れないか」** で判定する。プロパティ名単体では判断しない。

- **削除テスト**:
  - 読めない操作不能、重なり画面外へのはみ出し境界消失、レイアウト崩壊が発生する → **`structure`**
  - 単に装飾（色・影・角丸・装飾的グラデーション）が失われて素朴な見た目になるだけ → **`design`**
- **フォント指定**: `font-size`, `line-height`, `font-weight`, `font-family` は折り返しや専有面積に影響するため **`structure`** に置く。
- **Borderの分割**:
  - `border-width`, `border-style`（境界の有無）→ **`structure`**
  - `border-color`, `border-radius` → **`design`**
- **迷ったときのルール**: **必ず `structure` に配置する**（Designへの誤配置はレイアウト破壊の原因となるため）。

---

## 3. Tokens

- **色は常にGlobal Tokenを使用する**（直値でのカラー指定は禁止）。
- **色以外のプロパティはテーマで動的に切り替わる値のみToken化する**。テーマ共通の `padding: 24px` や `border-radius: 12px` は、複数箇所で使われていても直値で記述する。
- Token定義はGlobalの `tokens` layerのみで行う。Local CSS側でテーマ名を意識させずTokenの参照のみに留める。
- Local内のCustom Propertyは、Component内部の計算や外部引数（Props）目的に限定し、色やテーマ値はGlobal Tokenから受け取る。

---

## 4. ファイル構成

- **1所有者 = 1ファイル**: Local CSSは1コンポーネント（または1ページ）につき1ファイルとし、Roleはファイル内の `@layer` で分ける（ファイル往復の防止）。
- **ディレクトリ構成（素のCSSを管理する場合）**:
  - `styles/global/`
  - `styles/pages/`
  - `styles/components/`
- **Scoped CSS・CSS Modules を使用する場合**: Scope管理はフレームワーク側に任せ、ファイル内ではRole（`@layer`）のみを管理する。

---

## 5. セレクタと表示制御

- セレクタは意味のある単一クラスで指定し、DOM階層に依存させない（深いネストの禁止）。
- 詳細度の競合はセレクタの強化ではなく、ScopeやRoleの配置を見直して解決する。
- 表示・非表示やモーダルの開閉は、`hidden` 属性・`<dialog>`・`aria-*`・JSの条件付きレンダリングで制御する。`opacity` は視覚効果のみに使用し状態制御に使ってはならない。

---

## 6. 静的検査（Lint）方針

コード変更後はリポジトリ既定のLint・テストを実行する。意味的な正しさ（責務の妥当性）はLint通過後に目視・セルフレビューで確認する。

### 違反判定基準

- **エラー（機械的・確実に判定できるもの）**:
  - 未定義layerの使用・layer外への記述・layer順序の再宣言
  - Localでの直値カラー指定（shorthand, gradient, shadow内を含む）
  - LocalでのToken定義
  - `!important`IDセレクタの使用
  - 未定義Tokenの参照、テーマ間でのToken定義の不一致
- **警告（文脈に応じた確認を促すもの）**:
  - `design` 内の配置・レイアウト系プロパティ、`transform`
  - `structure` 内の `box-shadow`
  - 3階層以上の深いセレクタ
