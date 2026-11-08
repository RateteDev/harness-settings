---
name: CSS構造規約
description: |
  CSSの作成・改修・リファクタリングで従う構造化規約。Scope（Global / Local）と Role（Tokens / Structure / Design）の2軸、@layerによるRole表現、テーマToken、所有者単位のファイル分割、静的検査で強制する規則の範囲を定める。
metadata:
  user-review: false
  labels: [規約]
---

# CSS構造規約

## このスキルの目的

CSSを「どこに属するか」と「何を担うか」の2軸で整理し、人間とエージェントの双方が変更先と責務を迷わず判断できる状態を作る。
細かく分類すること自体ではなく、誤った配置を静的検査で止められる状態にすることが目的である。

## あるべき状態

### Scope

- Scopeは、セレクタではなくCSSの所有者で決める。
- Global CSSには、layer順序の宣言、テーマToken、最小限のreset、`box-sizing: border-box`など、全体の基礎だけを置く。
- Local / PageのCSSには、そのページの大枠とページ固有のUIを置く。
- Local / Componentは、独立したUI単位として名付けられ、別の場所へ持ち出しても意味がある単位にする。
  再利用の回数ではなく、この基準でComponentにするかを決める。
- PageとComponentはどちらもLocalとし、親子関係を持たせない。
  ページはComponentを配置するだけにし、Component内部のCSSはそのComponentの所有者ファイルだけに置く。
- Localで解決できる問題は、そのLocalの所有者ファイルで解決する。

### Role

- CSSのエントリーポイントで、Roleの順序を`@layer tokens, structure, design;`として一度だけ宣言する。
- first-partyの宣言は、すべて`tokens`・`structure`・`design`のいずれかのlayerに置く。
- `tokens`には、サイトで許可する色と、テーマで切り替わるその他の値を定義する。
- `structure`では、UIの構造・配置・可読性・操作性を成立させる。
- `design`には、UIが成立した後の視覚表現だけを担わせる。

### Structure / Designの分類

- `design` layerを丸ごと削除しても、情報を読めて、主要な操作ができ、配置が破綻しないようにする。
- 分類はプロパティ名ではなく、この削除テストで決める。
  宣言を削除したときに、読めない、操作できない、要素が重なるか画面外へ出る、必要な境界が判別できない、レイアウトや折り返しが崩れる、のいずれかが起きるならStructureに置く。
  色・影・角丸・装飾的な透明度やグラデーションが消えて素朴になるだけなら、Designに置く。
- フォントの指定（`font-size`・`line-height`・`font-weight`・`font-family`）は、幅と折り返しに影響するためStructureに置く。
- borderは分割し、`border-width`・`border-style`とUIに必要な境界の有無をStructure、`border-color`・`border-radius`をDesignに置く。
- **判定に迷った宣言はStructureに置く**。
  Designは消しても成立するという契約を負うため、誤ってDesignへ置くほうがUIを壊すからである。
  分割できる宣言は分割し、それぞれの分類先に置く。

### Tokens

- **色は常にGlobal Tokenを通す**。
- **色以外では、テーマで実際に切り替わる値だけをTokenにする**。
  テーマで変わらない`padding: 24px`や`border-radius: 12px`は、同じ値を複数箇所で使う場合や将来変える可能性がある場合でも直値で書く。
- Tokenはテーマ名を知るGlobalの`tokens` layerだけで定義し、Local CSSはテーマ名を知らずにTokenを参照するだけにする。
- LocalのCustom Propertyは、Componentの引数や計算など明確な目的があるときだけ使い、色とテーマで変わる値はGlobal Tokenから受け取る。

### ファイル

- Local CSSは所有者ごとに1ファイルにし、Roleは1ファイル内の`@layer`で分ける。
  Roleごとにファイルを分けると、同じ所有者の変更で複数のファイルを往復することになるためである。
- 素のCSSを中央管理する場合、CSSは`styles/global/`・`styles/pages/`・`styles/components/`の下に置く。
- フレームワークがscoped CSSやCSS Modulesを持つ場合、Scopeはそちらに任せ、Roleだけを`@layer`で表す。

### セレクタと表示制御

- セレクタは対象に意味のあるclassで当て、DOM階層に依存させない。
- 詳細度や順序の競合は、所有者とRoleの見直しで解決する。
- 表示・非表示やモーダルの開閉は`hidden`・`<dialog>`・`aria-*`・条件描画・JavaScriptの状態で表し、`opacity`は視覚効果だけに使う。

### 検査

- 変更後に、リポジトリ既定のLintとテストを通す。
- 分類と所有者は、Lintの結果とは別に上の状態に照らして確かめる。
  Lintに通っても、分類や所有者のような意味の規則まで満たしたとは限らないためである。
- リポジトリにLintがある場合、違反はコードを直して解消する。
- Lintを新規に実装する場合、判定の確実さで重さを分ける。
  - 確実に判定できる規則はエラーにする。
    未知のlayer、layer外のfirst-party宣言、layer順序の再宣言、Localでの生の色、LocalでのTokenの定義、`!important`、IDセレクタが対象である。
  - 生の色はshorthand・gradient・shadowの中にも現れるため、値の構文木まで解析する。
    `transparent`や`currentColor`を許すかは、リポジトリが決める。
  - 未定義のTokenの参照と、テーマ間でToken名の集合が揃っているかも検査する。
  - 意味に依存する規則は警告にする。
    design内のレイアウト系プロパティや`transform`、structure内の`box-shadow`、深いセレクタが対象である。
