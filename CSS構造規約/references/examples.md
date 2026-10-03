# Examples Reference

この文書は、Scope / Tokens / Structure / Designの具体例をまとめます。

## 1. 基本的なComponent

```css
@layer structure {
  .card {
    display: grid;
    gap: 16px;
    padding: 24px;
    width: 100%;
  }
}

@layer design {
  .card {
    color: var(--color-text);
    background: var(--color-surface);
    border-radius: 12px;
    box-shadow: var(--shadow-card);
  }
}
```

Designを消しても、Cardの配置、余白、本文は成立します。

## 2. Sea / Mountainテーマ

Global Tokens:

```css
@layer tokens {
  :root[data-theme="sea"] {
    --color-page-background: #eaf7ff;
    --color-surface: #ffffff;
    --color-text: #12324a;
    --color-accent: #168aad;
    --shadow-card: 0 4px 16px rgb(0 90 120 / 18%);
  }

  :root[data-theme="mountain"] {
    --color-page-background: #f3f1e8;
    --color-surface: #faf9f4;
    --color-text: #2f3528;
    --color-accent: #5f7a4a;
    --shadow-card: 0 4px 16px rgb(40 50 30 / 22%);
  }
}
```

Local Component:

```css
@layer design {
  .card {
    color: var(--color-text);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
  }
}
```

Componentは `sea` / `mountain` を知りません。

## 3. テーマでradiusも変える場合

Seaを柔らかく、Mountainを硬質に見せるという明確なテーマ仕様がある場合:

```css
@layer tokens {
  :root[data-theme="sea"] {
    --radius-card: 20px;
  }

  :root[data-theme="mountain"] {
    --radius-card: 4px;
  }
}
```

```css
@layer design {
  .card {
    border-radius: var(--radius-card);
  }
}
```

テーマ差分が存在しないならToken化しません。

```css
@layer design {
  .card {
    border-radius: 12px;
  }
}
```

## 4. Article PageとComponent

```text
pages/
└─ article.css

components/
├─ code-block.css
└─ toolbar.css
```

`article.css`:

```css
@layer structure {
  .article-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 32px;
    max-width: 1200px;
    margin-inline: auto;
    padding: 24px;
  }
}
```

`code-block.css`:

```css
@layer structure {
  .code-block {
    overflow-x: auto;
    padding: 16px;
  }
}

@layer design {
  .code-block {
    color: var(--color-code-text);
    background: var(--color-code-background);
    border-radius: 8px;
  }
}
```

Article PageはCodeBlockを配置できますが、次のように内部を直接上書きしません。

```css
/* NG */
@layer design {
  .article-page .code-block {
    background: var(--color-special);
  }
}
```

必要ならCodeBlock側にvariantやComponent APIを設計します。

## 5. Slide Page

```css
@layer structure {
  .slide-page {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 32px;
  }
}

@layer design {
  .slide-page {
    background: var(--color-page-background);
  }
}
```

Page固有の大枠なので `pages/slide.css` が所有します。

## 6. Button

```css
@layer structure {
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    padding: 8px 16px;
    font-size: 16px;
    line-height: 1.25;
  }
}

@layer design {
  .button {
    color: var(--color-button-text);
    background: var(--color-button-background);
    border-radius: 8px;
  }

  .button:hover {
    background: var(--color-button-hover);
  }
}
```

`font-size` は文字幅、折り返し、ボタン寸法へ影響するためStructureです。

## 7. borderを分割する

```css
@layer structure {
  .input {
    min-height: 40px;
    padding: 8px 12px;
    border-width: 1px;
    border-style: solid;
  }
}

@layer design {
  .input {
    color: var(--color-input-text);
    background: var(--color-input-background);
    border-color: var(--color-input-border);
    border-radius: 8px;
  }
}
```

borderの存在・太さが入力領域の認識や内部寸法に関係するためStructureへ置き、色と角丸をDesignへ分けています。

## 8. opacityはDesign

```css
@layer design {
  .disabled-hint {
    opacity: 0.6;
  }
}
```

削除しても要素の配置と情報は残るためDesignです。

ただし、次のような実装は避けます。

```css
.modal {
  opacity: 0;
}

.modal.is-open {
  opacity: 1;
}
```

opacityがモーダルの存在状態を担っています。

HTML / JS側で状態を持ちます。

```html
<dialog id="settings-dialog">
  ...
</dialog>
```

```js
settingsDialog.showModal();
settingsDialog.close();
```

フェードが必要なら、開閉状態とは別にDesignとして追加します。

## 9. transformがStructureになる例

```css
@layer structure {
  .drawer {
    position: absolute;
    inset: 0 auto 0 0;
    width: 320px;
    transform: translateX(-100%);
  }

  .drawer[data-open="true"] {
    transform: translateX(0);
  }
}
```

このtransformは画面内の位置と操作領域に直接関係するためStructureです。

ただし、状態そのものは `data-open` 等のHTML / JS stateが持っています。

## 10. transformがDesignになる例

```css
@layer design {
  .card:hover {
    transform: translateY(-2px);
  }
}
```

削除してもCardの配置・読みやすさ・操作性が成立する単なる視覚効果ならDesignです。

## 11. Token化しすぎるNG例

```css
@layer tokens {
  :root {
    --space-card: 24px;
    --space-card-gap: 16px;
    --radius-card: 12px;
  }
}
```

テーマで変わらないなら不要です。

```css
@layer structure {
  .card {
    padding: 24px;
    gap: 16px;
  }
}

@layer design {
  .card {
    border-radius: 12px;
  }
}
```

値がその場で分かる方を優先します。

## 12. Local raw colorのNG例

```css
@layer design {
  .notice {
    color: #223344;
    background: #eef6ff;
  }
}
```

NGです。

```css
@layer design {
  .notice {
    color: var(--color-notice-text);
    background: var(--color-notice-background);
  }
}
```

色はテーマ差分がなくてもGlobal Tokenを通します。

この規約では、色だけは「テーマで変わるか」ではなく「サイト全体で許可色を一元管理する」ことを優先します。色以外の値は、テーマで実際に変わる場合だけToken化します。

## 13. 深いselectorのNG例

```css
@layer structure {
  .article > section > div:nth-child(2) > ul > li {
    margin-top: 8px;
  }
}
```

DOM変更に弱く、所有者も分かりにくくなります。

対象に意味のあるclassを付けます。

```css
@layer structure {
  .article-related-list {
    margin-top: 8px;
  }
}
```

## 14. PageからComponent内部へ侵入するNG例

```css
@layer design {
  .article-page .toolbar .toolbar-button {
    color: var(--color-article-accent);
  }
}
```

Toolbar内部の責務をPageが奪っています。

必要ならToolbar側へvariantを追加します。

```html
<Toolbar variant="article" />
```

variantのStructure / DesignはToolbar自身が所有します。

## 15. Design削除テスト

通常状態:

```css
@layer structure {
  .profile-card {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 16px;
    padding: 16px;
  }
}

@layer design {
  .profile-card {
    background: var(--color-surface);
    border-radius: 12px;
    box-shadow: var(--shadow-card);
  }
}
```

`design` を無効化したとき:

- avatarと本文の2カラムは維持される
- 余白は維持される
- テキストは読める
- クリック等の操作はできる
- 背景、角丸、影だけ消える

この状態なら分離は成功しています。
