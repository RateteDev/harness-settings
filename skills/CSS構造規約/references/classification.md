# Structure / Design Classification Reference

この文書は、CSS宣言をStructureとDesignへ分類するときの判断基準を定義します。

## 1. 分類の中心は「削除テスト」

プロパティ名だけで分類しないでください。

同じCSSプロパティでも、使い方によってStructureにもDesignにもなります。

最初に次を問います。

> この宣言、またはこの宣言群を削除しても、UIは情報を読めて、主要な操作ができ、配置が成立したままか？

### Yes

Design候補です。

### No

Structureです。

## 2. Designの契約

`design` layerをすべて削除しても、UIは成立しなければなりません。

Designを削除して許容されるもの:

- 色が変わる
- 背景がなくなる
- 影がなくなる
- 角丸がなくなる
- 装飾的な透明度がなくなる
- 装飾的なアニメーションがなくなる
- 見た目が簡素になる

Designを削除して起きてはいけないもの:

- 要素が重なる
- 重要な要素が画面外へ出る
- テキストやコンテンツが読めなくなる
- 操作対象が消える
- 操作位置が成立しなくなる
- 必要な領域の境界が判別不能になる
- レイアウトや折り返しが破綻する
- DOM上は存在しているが実用上利用不能になる

## 3. 迷ったときの既定値

**Structure / Designの判定に迷ったらStructureに置きます**。

理由は、Designが「削除しても成立する」という強い契約を持つためです。

誤ってStructureへ置いた場合、主な被害はDesignの再利用性や純度が少し下がることです。

誤ってDesignへ置いた場合、Designを無効化しただけでUIが壊れる可能性があります。

したがって安全側はStructureです。

ただし、次のような運用は禁止します。

```text
よく分からない
→ 全部Structure
```

宣言を分割できるなら分けてください。

## 4. Structureの典型例

次はStructureになりやすい指定です。

- `display`
- `position`
- `inset`, `top`, `right`, `bottom`, `left`
- `grid-*`
- `flex-*`
- `width`, `height`, `min-*`, `max-*`
- `margin`, `padding`, `gap`
- 折り返しや可読性に影響するTypography
- `overflow`
- `white-space`
- UI成立に必要なborder geometry
- 位置を機能的に変える `transform`

ただし、これは絶対的なproperty whitelistではありません。
最終判断は削除テストで行います。

## 5. Designの典型例

次はDesignになりやすい指定です。

- `color`
- `background-color`
- 装飾的な `background-image` / gradient
- `box-shadow`
- `text-shadow`
- `border-color`
- `border-radius`
- 装飾的な `opacity`
- 視覚効果としての `filter`
- 装飾的なtransition / animation

これも絶対的なproperty whitelistではありません。

## 6. Typography

Typographyを独立Roleにはしません。

フォント指定は見た目だけでなく、幅、高さ、折り返し、行数へ影響します。

例えば次はStructureです。

```css
@layer structure {
  .article-title {
    font-size: 2rem;
    line-height: 1.2;
    font-weight: 700;
  }
}
```

`font-family` も文字幅や行高へ影響し得るため、テーマ上の単なる装飾として安全に外せると明確でない限りStructureへ寄せます。

重要なのは「TypographyだからDesign」と決めないことです。

## 7. border

borderは一括でDesign扱いしません。

### Structureになりやすい部分

- `border-width`
- UIの認識に必要なborderの存在
- 入力欄、セル、領域などの必須境界

理由は、borderが内部の利用可能領域や折り返しに影響し、さらにUIの構造認識に必要な場合があるためです。

```css
@layer structure {
  .input {
    border-width: 1px;
    border-style: solid;
  }
}
```

### Designになりやすい部分

- `border-color`
- `border-radius`
- 純粋に装飾として追加されたborder表現

```css
@layer design {
  .input {
    border-color: var(--color-input-border);
    border-radius: 8px;
  }
}
```

ただし、色の違い自体が情報伝達に必須なら、CSSだけに依存せずHTML上の意味付けやテキスト表現も検討してください。

## 8. box-sizing

Global Structureで次を強制することを推奨します。

```css
@layer structure {
  *, *::before, *::after {
    box-sizing: border-box;
  }
}
```

これにより、明示した `width` / `height` にpaddingやborderを含めやすくなり、外側への寸法波及を抑えられます。

ただし `border-box` でもborderを太くすると内部content領域は狭くなります。
折り返し等への影響が消えるわけではありません。

そのため `border-width` は依然としてStructure寄りです。

## 9. opacity

`opacity` は通常Designです。

```css
@layer design {
  .secondary {
    opacity: 0.7;
  }
}
```

これは占有領域や配置を変えず、見え方だけを変えます。

ただし次のような使い方は避けます。

```css
.modal {
  opacity: 0;
}

.modal.is-open {
  opacity: 1;
}
```

これがモーダルの表示状態そのものを担っているなら、CSSの視覚表現とアプリケーション状態が混ざっています。

可能なら `hidden`、`<dialog>`、条件描画、JS stateなどへ状態責務を移し、opacityはフェード等のDesignへ限定してください。

## 10. transform

`transform` は用途によって変わります。

### Structure

```css
@layer structure {
  .side-panel {
    transform: translateX(-100%);
  }
}
```

位置変更がUI配置、重なり、操作位置、画面内外の存在に関係するならStructureです。

### Design

```css
@layer design {
  .button:hover {
    transform: translateY(-2px);
  }
}
```

削除してもボタンの位置・操作性・情報構造が成立し、単なる視覚効果ならDesignです。

## 11. display / visibility / hidden state

表示状態の制御は、可能ならHTML / JS / フレームワークへ寄せます。

### 推奨

```html
<div hidden>...</div>
```

```html
<dialog>...</dialog>
```

または条件描画を使います。

CSSが状態表現を担当する場合でも、Designを外すことで機能状態が変わる構造にはしないでください。

## 12. pseudo-classと状態

`:hover`, `:focus`, `:active`, `[disabled]` などを別Roleにはしません。

変更内容の意味でStructure / Designへ分類します。

例:

```css
@layer design {
  .button:hover {
    background: var(--color-button-hover);
  }
}
```

```css
@layer structure {
  .menu[hidden] {
    display: none;
  }
}
```

ただし、機能状態は可能な限りHTML属性やフレームワークstateを真実のソースにします。

## 13. 分類に迷ったときの手順

1. 宣言を一時的に削除した状態を想像する。
2. 読めるか確認する。
3. 操作できるか確認する。
4. 配置、占有領域、重なりが成立するか確認する。
5. UIの必要な境界や構造が判別できるか確認する。
6. すべて成立するならDesign候補。
7. どれか一つでも成立しないならStructure。
8. 判断できない場合はStructure。

## 14. 「見た目」と「Design」は同義ではない

CSSは最終的にほぼすべて画面の見た目へ影響します。

そのため、

```text
見た目に関係する
→ Design
```

という分類は使えません。

この規約でのDesignは、**UI成立後に追加される取り外し可能な視覚表現**です。
