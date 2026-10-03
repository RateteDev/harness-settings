---
name: CSS構造規約
description: |
  CSSの作成・改修・リファクタリングで従う構造化規約。Scope（Global / Local）と Role（Tokens / Structure / Design）の2軸、@layerによるRole表現、テーマToken、所有者単位のファイル分割、静的検査で強制する規則の範囲を定める。
metadata:
  user-review: false
---

# CSS Structure

このスキルは、CSSを「どこに属するか」と「何を担うか」の2軸で整理するための規約です。

目的は、CSSを細かく分類すること自体ではありません。
人間とエージェントの双方が、変更先と責務を迷わず判断でき、誤った配置を静的検査で止められる状態を作ることです。

## 基本モデル

CSSは次の2軸で考えます。

```text
Scope
├─ Global
└─ Local
   ├─ Page
   └─ Component

Role
├─ Tokens
├─ Structure
└─ Design
```

### Scope

- **Global**: アプリケーション全体で共有されるCSS。
- **Local / Page**: 特定ページだけが所有するCSS。
  原則として他ページで再利用しない。
- **Local / Component**: ページから独立したUI単位が所有するCSS。
  複数箇所から再利用できる。

PageとComponentはScope上の親子関係ではありません。
どちらもLocalです。
違いは主に所有者と再利用性です。

### Role

- **Tokens**: サイト全体で許可する色と、テーマによって切り替わるその他の値を定義する。
- **Structure**: UIの構造・配置・可読性・操作性を成立させる。
- **Design**: UIが成立した後の視覚表現を担当する。

RoleはCSS標準の `@layer` で表現します。

```css
@layer tokens, structure, design;
```

この順序はアプリケーション全体で一度だけ宣言し、変更しません。

## 最重要契約: Designは外しても成立する

`design` layerを丸ごと削除しても、ページは情報を読めて、主要な操作ができ、配置上の破綻が起きない状態を維持してください。

Designを外した結果として、次の変化は許容します。

- 色が素朴になる
- 影が消える
- 角丸が消える
- 装飾的な透明度やグラデーションが消える
- 見栄えが簡素になる

一方、次の変化を起こす指定はStructureです。

- 要素が重なる、画面外へ移動する
- テキストが読めなくなる、必要な情報が欠落する
- 操作対象の位置や大きさが成立しなくなる
- 重要な境界や領域が判別できなくなる
- レイアウト、折り返し、占有領域が成立しなくなる

**Structure / Designの判定に迷ったらStructureに置いてください。
**

Designは「消しても成立する」という契約を負うため、境界例をDesignへ誤配置するより、Structure側へ倒す方が安全です。
ただし、単に「念のため」という理由だけで何でもStructureへ寄せないでください。
宣言を分割できる場合は、Structure部分とDesign部分を分けます。

詳細な判断基準は [references/classification.md](references/classification.md) を読んでください。

## Tokensの定義

Tokensは「共通値」ではありません。

**色は常にGlobal Tokenを通します。
色以外は、テーマによって実際に切り替わる値だけをTokenにします。
**

これは2つの目的を両立するためです。

- サイト内で使用可能な色をGlobalで一元管理する
- Sea / Mountainなどのテーマ差分を、色以外の視覚パラメータにも拡張できるようにする

典型例:

- 色: テーマ差分の有無にかかわらずToken
- 影の色・濃さ・ぼかし: テーマで変わる場合のみToken
- 透明度: テーマで変わる場合のみToken
- 境界表現: テーマで変わる場合のみToken
- その他の視覚パラメータ: テーマで実際に変わる場合のみToken

次の理由だけではToken化しません。

- 同じ値を複数箇所で使っている
- 名前を付けられる
- 将来変えるかもしれない
- デザインシステムらしく見える

テーマで変わらない `padding: 24px`、`gap: 16px`、`border-radius: 12px` などは原則として直値で書きます。

Tokensの詳細とテーマ例は [references/architecture.md](references/architecture.md) と [references/examples.md](references/examples.md) を読んでください。

## ファイル所有の原則

Local CSSはPageまたはComponentの所有者ごとに1ファイルを基本とします。

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

`button-structure.css` と `button-design.css` のようにRoleごとにファイルを分割しません。
同じ所有者の変更で複数ファイルを往復する状態を避けます。

フレームワークがscoped CSSやCSS Modulesを提供する場合は、Scopeをフレームワーク側へ任せて構いません。

```vue
<style scoped>
@layer structure {
  /* ... */
}

@layer design {
  /* ... */
}
</style>
```

詳しくは [references/architecture.md](references/architecture.md) を読んでください。

## エージェントがCSSを変更するときの手順

1. 変更対象の所有者を特定する。
2. GlobalかLocalかを決める。
3. LocalならPageかComponentかを、所有者と再利用性で決める。
4. 既存の所有者ファイルを優先し、不必要にCSSファイルを増やさない。
5. 各宣言をTokens / Structure / Designへ分類する。
6. Structure / Designで迷ったら `references/classification.md` の削除テストを使う。
7. それでも迷う場合はStructureへ置く。
8. 別Componentの内部をセレクタで直接変更しない。
9. 状態や機能をCSSだけで無理に表現せず、HTML / JS / フレームワーク側の責務を確認する。
10. 変更後にリポジトリ既定のLintとテストを実行する。

## 強制規則と判断規則を混同しない

このスキルの規則には2種類あります。

### Enforced Rules

AST、Stylelint、ファイルパス、設定ファイルなどから機械的に判定できる規則です。
リポジトリにLint実装がある場合、違反をエラーとして扱います。

例:

- 許可されていない `@layer` の使用禁止
- Localでの生の色指定禁止
- `!important` 禁止
- ID selector禁止
- Layer外にfirst-partyの宣言を書かない
- Tokensの定義場所をGlobalに限定する

### Semantic Rules

意味やUI上の役割を見ないと判断できない規則です。
Lintだけで完全に判定しようとしません。

例:

- ある `border` がStructureかDesignか
- `opacity` が純粋な装飾か、機能的な表示制御か
- あるUIをPage所有にするかComponent所有にするか
- 新しい値をテーマTokenにする必要が本当にあるか

**Lintに通ったことは、Semantic Rulesまで満たしたことを意味しません。
**

どの規則をLintで強制するか、Lintを新規実装するときの方針は [references/enforcement.md](references/enforcement.md) を読んでください。

## 禁止事項

次をデフォルトで禁止します。

- 新しいRoleや `@layer` を勝手に追加する
- Localの問題をGlobalへ移して解決する
- Page CSSからComponent内部を直接上書きする
- Component CSSから別Component内部を直接上書きする
- `!important` で競合を解決する
- 色やその他のテーマ依存値をLocalにハードコードする
- テーマで変わらない単発値を、抽象化のためだけにToken化する
- UIの表示状態を `opacity: 0` だけで機能的に制御する
- DOM階層へ深く依存したセレクタを作る
- Roleごとに所有者ファイルを分割する

## 状態制御

CSSは状態の見た目を表現できますが、アプリケーション状態そのものをCSSへ押し込みすぎないでください。

表示・非表示やモーダル開閉などは、可能なら次を優先します。

- `hidden`
- `<dialog>`
- `aria-*` と適切なHTML属性
- フレームワークの条件描画
- JavaScriptの状態

`opacity` は純粋な視覚効果ならDesignです。
機能上の表示制御に使っている場合は、まずHTML / JS側へ状態責務を移せないか検討してください。

## 変更時に読むリファレンス

- **Scope、ディレクトリ、フレームワーク統合、Tokensを確認する**: [references/architecture.md](references/architecture.md)
- **Structure / Designの境界を判断する**: [references/classification.md](references/classification.md)
- **Stylelint/PostCSS/ASTで規則を強制する、またはLint規則を変更する**: [references/enforcement.md](references/enforcement.md)
- **具体例や境界例を見る**: [references/examples.md](references/examples.md)

必要なリファレンスだけを読み、すべてを毎回ロードしないでください。
