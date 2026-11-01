---
name: テーマ切り替え
description: |
  Webサイトにミニマルなライト/ダークテーマ切り替えを実装するときに使う。
  初期表示のちらつき防止、テーマの保存と復元、アイコンとラベルの更新を扱う。
metadata:
  user-review: true
---

# テーマ切り替え

## このスキルの目的

テーマ切り替えは、初期表示のちらつきや保存の取りこぼしなく動いて初めて成立する。
テーマの決定・保存・復元と表示の更新を一続きの動作として実装する。

## 進め方

テーマ管理は外部ライブラリを使わず自前のスクリプトで実装し、既存サイトのデザインや構成を維持する。

### HTML構造

header内にボタンを配置し、余計なラッパーを作らない。

```html
<header>
  <button id="theme-toggle" type="button" aria-label="ダークテーマに切り替える">
    <svg aria-hidden="true">
      <use href="#icon-moon"></use>
    </svg>
  </button>
</header>
```

### アイコン

- Lucideの太陽・月アイコンを使い、ライト時は月、ダーク時は太陽を表示する。
- アイコンの参照方法は環境に応じて変更する。
  - **単体HTML:** HTML内にLucideのSVGを`<symbol>`で定義し、`<use href="#icon-moon">`で参照する。
  - **通常のWebサイト:** `assets/icons/`に配置したSVGをビルド時にインライン展開する。
- ボタンに背景・枠・影を付けない。

### テーマの管理

- テーマは`<html data-theme="light|dark">`で管理する。
- 初回訪問時はOSのテーマを取得し、localStorageに保存する。
- 以降は保存値を優先し、切り替え時に更新する。
- JavaScriptでテーマ・アイコンの参照先・aria-labelを更新する。

### ちらつき防止とトランジション

- 初期表示時のちらつきを防ぐ。
- 背景・文字・枠線の色を約0.2秒で滑らかに切り替える。
- `prefers-reduced-motion`を尊重する。
