# Enforcement Reference

この文書は、CSS規約のうち何を静的検査で強制し、何を意味判断として残すかを定義します。

## 1. 原則

規則を次の2種類に分けます。

```text
Enforced Rules
→ AST / Stylelint / file path等で機械的に判定する

Semantic Rules
→ UIの意味や目的が必要。エージェントまたは人間が判断する
```

Lintで判定できるものは、可能な限りLintへ移します。

エージェントへ「規約を覚えて守れ」と要求するより、違反コードをCIで拒否する方が信頼できます。

ただし、意味判断を無理にproperty whitelistへ変換して誤検出を増やさないでください。

## 2. Enforced Rulesとして推奨するもの

### 2.1許可Layerを固定する

First-party CSSで許可するRoleは次だけです。

```text
tokens
structure
design
```

次はエラーにします。

```css
@layer animation {
  /* ... */
}
```

```css
@layer components {
  /* ... */
}
```

新しいRoleが必要に見える場合は、まず既存3Roleで表せない理由を検討します。

### 2.2 Layer外のfirst-party宣言を禁止する

次のような宣言を原則禁止します。

```css
.card {
  display: grid;
}
```

次のようにRoleを明示します。

```css
@layer structure {
  .card {
    display: grid;
  }
}
```

Layer外の通常スタイルはlayer内の通常スタイルより優先されるため、Roleとカスケード順序の規約を迂回する経路になります。

### 2.3 Layer順序を固定する

GlobalのCSSエントリーポイントで一度だけ次を宣言します。

```css
@layer tokens, structure, design;
```

別ファイルで異なる順序宣言を行わないよう検査します。

### 2.4 Localでの生の色指定を禁止する

Page / Componentで次を禁止します。

```css
color: #333;
background: rgb(255 255 255);
border-color: hsl(20 10% 40%);
box-shadow: 0 0 4px #0008;
fill: red;
stroke: #fff;
background-image: linear-gradient(#fff, #000);
```

色はGlobal Tokensを参照します。

```css
color: var(--color-text);
background: var(--color-surface);
```

色はshorthandやgradient、shadow内部にも現れるため、単純な `color` propertyだけの検査では不十分です。
値ASTまで解析してください。

`transparent`、`currentColor` などを許可するかはリポジトリ側で明示的に決めます。

### 2.5 Theme Tokenの定義場所をGlobalに限定する

テーマTokenはGlobal `tokens` layerで定義します。

Localにテーマ依存の値を隠してはいけません。

NG:

```css
@layer design {
  .card {
    --color-card: #123456;
    background: var(--color-card);
  }
}
```

これでは生色禁止を迂回できます。

Custom Property全般をLocalで禁止するか、Component API用途を許可するかはリポジトリ側で決められます。
ただしテーマ依存値のLocal定義は許可しません。

### 2.6未定義Token参照を禁止する

可能なら、Localから参照するテーマTokenがGlobal Tokensに存在することを検査します。

NG:

```css
color: var(--color-unknown);
```

Global theme定義間でToken集合が揃っていることも検査すると安全です。

例:

```text
sea theme      : --color-text, --color-bg, --shadow-card
mountain theme : --color-text, --color-bg, --shadow-card
```

片方だけTokenが欠ける状態をCIで検出します。

### 2.7 `!important` を禁止する

```css
.button {
  color: red !important;
}
```

競合はScope、selector、layer設計を修正して解決します。

### 2.8 ID selectorを禁止する

```css
#article .button {
  /* ... */
}
```

詳細度を不必要に上げ、所有境界を曖昧にするため禁止します。

### 2.9過度に深いselectorを制限する

例えば最大複合数を決めます。

NG例:

```css
.article > section > div > ul > li > a {
  /* ... */
}
```

厳密な上限値はリポジトリに合わせますが、DOM階層への強い依存はLintで抑制できます。

### 2.10ファイルScope違反

ディレクトリからScopeを判定できる構成なら、次を検査できます。

```text
styles/global/**
styles/pages/**
styles/components/**
```

例えば `styles/pages/**` でToken定義を禁止する、といったルールを適用できます。

## 3. 一部だけLint可能な規則

### 3.1 Design内のStructure property

明らかなものはLintできます。

例えば `design` 内の次を警告またはエラーにできます。

```text
display
position
width / height
min-* / max-*
margin / padding / gap
grid-*
flex-*
overflow
```

ただし完全な禁止リストとして扱わないでください。

`transform`、`opacity`、`border`、Typographyなどは用途でRoleが変わります。

厳しすぎるproperty whitelistは、意味規則を壊します。

### 3.2 Structure内の純装飾property

`box-shadow` や単純な `background-color` など、明らかなDesign propertyを警告することは可能です。

ただしStructure上必要な視覚境界などがあるため、誤検出しない範囲に限定します。

推奨は、最初から完全な双方向property whitelistを作らず、明らかな違反だけを増やしていくことです。

## 4. Semantic Rulesとして残すもの

次はLintだけで完全判定しません。

### 4.1 Structure / Designの最終判定

`border` が装飾か、UI成立に必要かは画面上の意味に依存します。

`opacity` も装飾か、表示状態の代用かで意味が変わります。

### 4.2 Page / Component所有

UIがページ固有か、独立Componentとして所有すべきかは、再利用性と設計意図に依存します。

### 4.3 Token化の必要性

「この値がテーマによって実際に変わるか」は、CSSだけでは確定できないことがあります。

### 4.4状態責務

`opacity: 0` が単なるフェードなのか、機能上の非表示なのかは、HTML / JSを含めて確認する必要があります。

## 5. StylelintとPostCSS AST

既存のStylelint標準ルールで表現できるものは標準ルールを優先します。

リポジトリ固有の規則はCustom Stylelint PluginまたはPostCSS AST走査で実装します。

特に次はAST向きです。

- `@layer` 名の検証
- 現在のRuleがどのLayer内にあるかの検証
- ファイルパスとLayerの組み合わせ検証
- 色値の検出
- Custom Property定義位置の検証
- Theme間のToken集合比較

## 6. Lint実装時の優先順位

最初からすべて実装しないでください。

推奨順:

1. `!important` 禁止
2. ID selector禁止
3. Layer名固定
4. Layer外宣言禁止
5. Local raw color禁止
6. Global-only theme token定義
7. 未定義Token参照
8. Theme間Token集合整合
9. 明らかなStructure / Design property違反
10. selector depth等の補助規則

前半ほど誤検出が少なく、規約の骨格を強く守れます。

## 7. エラーと警告

判定が確実な規則はエラーにします。

```text
ERROR
- unknown layer
- local raw color
- !important
- ID selector
- layer outside declaration
```

意味依存性が残るものは、最初はwarningまたはレビュー項目として扱う方が安全です。

```text
WARNING / REVIEW
- design内のtransform
- structure内のbox-shadow
- 深いselector
```

## 8. エージェントへの運用指示

Lintが存在する場合:

1. CSS変更後に必ずLintを実行する。
2. Lintを無効化するコメントで逃げない。
3. 規則違反を `!important` やGlobal overrideで回避しない。
4. Lintが不合理に見える場合、コードを無理に合わせる前に規約との不一致を確認する。

Lintが存在しない場合:

- 通常のCSS修正依頼で、勝手に大規模Lint基盤まで追加しない。
- ユーザーが規約の機械的強制、Lint実装、CSS基盤の作り直しを求めている場合は、この文書に従ってLint実装を対象に含める。

これにより「CSS規約に従うこと」と「Lint基盤を新規構築すること」を別タスクとして扱えます。
