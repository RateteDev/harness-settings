---
name: CSS構造規約
description: |
  CSSの作成・改修・リファクタリングで従う構造化規約。Scope（Global / Local）と Role（Tokens / Structure / Design）の2軸、@layerによるRole表現、テーマToken、所有者単位のファイル分割、静的検査で強制する規則の範囲を定める。
metadata:
  user-review: false
---

# CSS構造規約

## このスキルの目的

CSSを「どこに属するか」と「何を担うか」の2軸で整理し、人間とエージェントの双方が変更先と責務を迷わず判断できる状態を作る。
細かく分類すること自体ではなく、誤った配置を静的検査で止められる状態にすることが目的である。

## 進め方

CSSを書くときは、宣言ごとに所有者（Scope）と役割（Role）を決めてから置き場を選ぶ。

### Scope

ScopeはセレクタではなくCSSの所有者で決める。

- **Global** — アプリケーション全体が所有する。
  layer順序の宣言、テーマToken、最小限のreset、`box-sizing: border-box`など、全体の基礎に限る。
- **Local / Page** — 特定のページが所有する。
  ページの大枠とページ固有のUIを扱う。
- **Local / Component** — ページから独立したUI単位が所有する。

PageとComponentはどちらもLocalで、親子関係ではない。
ページはComponentを配置するだけで、Component内部のCSSはComponent自身が所有する。
Componentにするかは再利用の回数ではなく、独立したUI単位として名付けられ、別の場所へ持ち出しても意味があるかで決める。
Localで解決できる問題は、Localの所有者ファイルで解決する。

### Role

Roleは次の3つに限り、CSS標準の`@layer`で表す。
順序はCSSのエントリーポイントで一度だけ宣言し、first-partyの宣言はすべていずれかのlayerへ入れる。

```css
@layer tokens, structure, design;
```

- **Tokens** — サイトで許可する色と、テーマで切り替わるその他の値を定義する。
- **Structure** — UIの構造・配置・可読性・操作性を成立させる。
- **Design** — UIが成立した後の視覚表現を担う。

### Structure / Designの分類

`design` layerを丸ごと削除しても、情報を読めて、主要な操作ができ、配置が破綻しない状態を保つ。
宣言を削除したときに、読めない、操作できない、要素が重なるか画面外へ出る、必要な境界が判別できない、レイアウトや折り返しが崩れる、のいずれかが起きるならStructureに置く。
色・影・角丸・装飾的な透明度やグラデーションが消えて素朴になるだけなら、Designに置く。
プロパティ名ではなく、この削除テストで決める。

この規約では、次の分類を固定する。

- フォントの指定（`font-size`・`line-height`・`font-weight`・`font-family`）は、幅と折り返しに影響するためStructureに置く。
- borderは分割し、`border-width`・`border-style`とUIに必要な境界の有無をStructure、`border-color`・`border-radius`をDesignに置く。

**判定に迷ったらStructureに置く**。
Designは消しても成立するという契約を負うため、誤ってDesignへ置くほうがUIを壊すからである。
ただし宣言を分割できるなら分ける。

### Tokens

**色は常にGlobal Tokenを通す**。
**色以外は、テーマで実際に切り替わる値だけをTokenにする**。
テーマで変わらない`padding: 24px`や`border-radius: 12px`は、同じ値を複数箇所で使う場合や将来変える可能性がある場合でも直値で書く。

Tokenはテーマ名を知るGlobalの`tokens` layerだけで定義し、Local CSSはテーマ名を知らずにTokenだけを参照する。
LocalのCustom Propertyは、Componentの引数や計算など明確な目的があるときだけ使い、色とテーマで変わる値はGlobal Tokenから受け取る。

### ファイル

Local CSSは所有者ごとに1ファイルとし、Roleは1ファイル内の`@layer`で分ける。
Roleごとにファイルを分けると、同じ所有者の変更で複数のファイルを往復することになるためである。
素のCSSを中央管理する場合は、`styles/global/`・`styles/pages/`・`styles/components/`の下に置く。
フレームワークがscoped CSSやCSS Modulesを持つ場合はScopeをそちらに任せ、Roleだけを`@layer`で表す。

### 変更手順

1. 変更対象の所有者を特定し、Global・Page・Componentのどれかを決める。
2. 既存の所有者ファイルを優先し、CSSファイルは必要なときだけ増やす。
3. 各宣言をTokens / Structure / Designへ分類する。
4. PageやComponentから別Componentの内部を変えたいときは、そのComponentの所有者ファイルで変更する。
5. セレクタは対象に意味のあるclassを付けて当て、DOM階層に依存させない。
6. 詳細度や順序の競合は、所有者とRoleの見直しで解決する。
7. 表示・非表示やモーダルの開閉は`hidden`・`<dialog>`・`aria-*`・条件描画・JavaScriptの状態で表し、`opacity`は視覚効果に限る。
8. 変更後にリポジトリ既定のLintとテストを実行する。
   Lintに通っても、分類や所有者のような意味の規則まで満たしたとは限らないため、上の手順で確かめる。

### Lintで強制する規則

リポジトリにLintがある場合、違反はコードを直して解消する。
Lintを新規に実装する場合は、判定の確実さで重さを分ける。

- 確実に判定できる規則はエラーにする。
  未知のlayer、layer外のfirst-party宣言、layer順序の再宣言、Localでの生の色、LocalでのTokenの定義、`!important`、IDセレクタが対象である。
- 生の色はshorthand・gradient・shadowの中にも現れるため、値の構文木まで解析する。
  `transparent`や`currentColor`を許すかは、リポジトリで決める。
- 未定義のTokenの参照と、テーマ間でToken名の集合が揃っているかも検査する。
- 意味に依存する規則は警告に留める。
  design内のレイアウト系プロパティや`transform`、structure内の`box-shadow`、深いセレクタが対象である。
