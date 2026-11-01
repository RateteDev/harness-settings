# Architecture Reference

この文書は、CSSのScope、所有者、ディレクトリ構造、Tokens、フロントエンドフレームワークとの統合を詳しく説明します。

## 1. Scopeは「CSSを誰が所有するか」

Scopeは、単純なセレクタの広さではなく、そのCSSの所有者で考えます。

```text
Scope
├─ Global
└─ Local
   ├─ Page
   └─ Component
```

### Global

アプリケーション全体が所有するCSSです。

典型的には次を含みます。

- `@layer` の順序宣言
- テーマTokenの定義
- reset / normalizeに相当する最小限の初期化
- `box-sizing: border-box`
- `html`, `body` などアプリケーション全体に必要な基礎Structure

Globalは便利な退避場所ではありません。
Localで解決できる問題をGlobalへ移してはいけません。

### Local / Page

特定ページが所有するCSSです。

例:

```text
pages/
├─ article.css
├─ slide.css
└─ settings.css
```

Page CSSは、そのページ固有の大枠やページ固有UIを扱います。

例えば `article.css` は次のようなものを担当できます。

- 記事本文領域の最大幅
- 記事ページ固有のカラム構成
- ページ固有の余白
- ページ専用セクションのStructure / Design

ただし、記事ページ内で使われる `CodeBlock` Componentの内部スタイルまで `article.css` から変更してはいけません。

### Local / Component

ページから独立したUI単位が所有するCSSです。

例:

```text
components/
├─ button.css
├─ code-block.css
├─ toolbar.css
└─ modal.css
```

Componentは複数ページで再利用できる単位です。

「現在1ページでしか使っていない」ことだけでPage所有にする必要はありません。
UIとしてページから独立して意味を持つならComponentです。

## 2. PageとComponentは親子のScopeではない

次のように考えないでください。

```text
Page
└─ Component
```

PageがComponentを利用することはありますが、CSS所有までPage配下になるわけではありません。

例:

```text
Article Page
├─ article.css       # Article Pageが所有
├─ Heading           # heading.cssはHeadingが所有
├─ CodeBlock         # code-block.cssはCodeBlockが所有
└─ Toolbar           # toolbar.cssはToolbarが所有
```

ページはComponentを配置します。
Component内部のCSS契約はComponent自身が所有します。

## 3. Page / Componentの判断基準

次の順に考えます。

### Pageに置く

- そのページの存在を前提としたCSS
- 他ページへ持ち出しても意味が薄い
- ページ全体の大枠を作る
- ページ固有のセクションを扱う

### Componentに置く

- 独立したUI単位として名前を付けられる
- 別ページや別領域へ持ち出しても意味がある
- 自身のmarkup / behavior / styleを一まとまりとして所有できる

再利用回数そのものは判定基準ではありません。
再利用可能な所有単位かどうかで判断します。

## 4. ディレクトリ構造

素のCSSを中央管理する場合の標準形:

```text
styles/
├─ global/
│  ├─ tokens.css
│  └─ global.css
├─ pages/
│  ├─ article.css
│  └─ slide.css
└─ components/
   ├─ button.css
   ├─ toolbar.css
   └─ code-block.css
```

Page / Componentごとに1ファイルを基本とします。

次のようにRoleでファイルを分けません。

```text
components/
├─ button-structure.css
└─ button-design.css
```

同じ所有者に対する変更で複数ファイルを往復することになり、所有単位が崩れるためです。

Roleは1ファイル内の `@layer` で分離します。

```css
@layer structure {
  .button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
  }
}

@layer design {
  .button {
    color: var(--color-button-text);
    background: var(--color-button-background);
    border-radius: 8px;
  }
}
```

## 5. フレームワークではScopeをフレームワークへ任せる

Vue、React、Svelteなどでローカルスコープ機構がある場合、Scopeを独自CSS命名で再実装しないでください。

### Vue

```vue
<template>
  <button class="button">
    <slot />
  </button>
</template>

<style scoped>
@layer structure {
  .button {
    display: inline-flex;
    padding: 8px 16px;
  }
}

@layer design {
  .button {
    background: var(--color-button-background);
    border-radius: 8px;
  }
}
</style>
```

`scoped` がLocal Scopeを担い、`@layer` がRoleを担います。

### React / Next.js

CSS Modulesを使う場合も同様です。

```text
Button.tsx
Button.module.css
```

```css
@layer structure {
  .button {
    display: inline-flex;
  }
}

@layer design {
  .button {
    background: var(--color-button-background);
  }
}
```

ファイルの配置とCSS ModulesがLocal ownershipを担い、Roleは `@layer` で表します。

## 6. Layer順序

アプリケーションのCSSエントリーポイントで一度だけ宣言します。

```css
@layer tokens, structure, design;
```

この順序を各ファイルで再定義しません。

First-party CSSは原則として、これらのいずれかのLayer内へ入れます。
Layer外の通常宣言はlayer内の通常宣言よりカスケード上強くなるため、意図せず規約を迂回する経路になります。

外部ライブラリを導入するリポジトリでは、そのCSSをどのように扱うかをリポジトリ側で別途決めてください。
first-partyのRoleを増やして外部CSSを吸収しないでください。

## 7. Tokensは「テーマとLocal CSSのインターフェース」

Tokensは値の共通化機構ではありません。

この規約では、**色は常にGlobal Token**です。
色以外の値は、テーマによって実際に切り替わる場合だけTokenにします。

次のように考えます。

```text
Theme
  ↓
Tokens
  ↓
Local Structure / Design
```

Local CSSは `sea` や `mountain` といったテーマ名を直接知る必要がありません。

```css
@layer tokens {
  :root[data-theme="sea"] {
    --color-page-background: #eaf7ff;
    --color-text: #12324a;
    --color-accent: #168aad;
    --shadow-card: 0 4px 16px rgb(0 90 120 / 18%);
  }

  :root[data-theme="mountain"] {
    --color-page-background: #f3f1e8;
    --color-text: #2f3528;
    --color-accent: #5f7a4a;
    --shadow-card: 0 4px 16px rgb(40 50 30 / 22%);
  }
}
```

Componentはテーマ名ではなくTokenだけを参照します。

```css
@layer design {
  .card {
    color: var(--color-text);
    background: var(--color-page-background);
    box-shadow: var(--shadow-card);
  }
}
```

## 8. Token化する条件

Token化の条件は、色とそれ以外で異なります。

### 色

色はテーマ差分の有無にかかわらずGlobal Tokenを通します。
これにより、Local CSSでサイトの許可色以外を使用できないよう静的検査できます。

### 色以外

**テーマによって実際に切り替わる値だけ**Tokenにします。

Tokenになり得るもの:

- shadow
- blur
- 透明度
- gradient
- border表現
- radius
- その他のテーマ依存パラメータ

ただし、プロパティの種類だけでToken化しません。

例えば `border-radius` がSeaで20px、Mountainで4pxへ実際に変わるならTokenにできます。

```css
--radius-card: 20px;
```

しかし全テーマで12px固定なら、次の方が良いです。

```css
border-radius: 12px;
```

## 9. Token化してはいけない理由

次だけを理由にToken化しないでください。

- 2箇所以上で同じ値を使うから
- 変数名を付けられるから
- 将来変更するかもしれないから
- DRYにしたいから
- デザインシステムでよく見るから

このスキルでは、追跡しやすさを優先します。

```css
padding: 24px;
gap: 16px;
border-radius: 12px;
```

は、その場で寸法が分かります。

```css
padding: var(--space-lg);
gap: var(--space-md);
border-radius: var(--radius-md);
```

のような間接参照は、テーマ差分など明確な理由がない限り増やしません。

## 10. CSS Custom PropertiesとTokenは同義ではない

CSS Custom Propertyを使っただけでTokenになるわけではありません。

テーマ値としてGlobalの `tokens` layerに定義したCustom Propertyが、この規約上のTokenです。

Local Custom Propertyを使う必要がある場合は、それがComponent APIやCSS計算上の明確な目的を持つか確認してください。
単発の定数へ名前を付けるためだけに導入しないでください。

Local Custom Propertyにテーマ依存の生値を隠して、Token規則を迂回してはいけません。
