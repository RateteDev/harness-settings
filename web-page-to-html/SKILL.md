---
name: web-page-to-html
description: |
  WebページをCSS埋め込み・URL絶対化した単一HTMLへ変換し、必要なら現在のagent自身が翻訳版も作る。
---

# web-page-to-html

スクリプトの正本はこのskillの`scripts/`である。以下の`SKILL_ROOT`は、skill toolが返すBase directoryである。作業先には現在のrepositoryの`.tmp/`を使い、repository外の作業なら`$XDG_RUNTIME_DIR`を使う。

## 単一HTML化

```bash
"${SKILL_ROOT}/scripts/fetch.sh" "<URL>" "<WORK_DIR>"
```

`<WORK_DIR>/standalone.html`ができる。外部CSSを埋め込み、root-relative URLを絶対化する。Next.jsの`/_next/image`も元画像URLへ戻す。画像・動画・font自体はdata URI化せず、元サイトを参照する。

## 翻訳版

翻訳するときだけ`references/translation-workflow.md`を読み、次を順番に行う。

1. `extract-texts.py`で`standalone.html`から翻訳対象を抽出する。
2. 現在のOpenCode agent自身が対象言語へ翻訳し、`translations.json`を書く。外部CLIや特定provider/modelを呼ばない。
3. `merge-translations.py`でIDの過不足を検査し、原文付きの`translated.json`を作る。
4. `apply-translation.py`で`translated.html`へ適用する。

## 検証

生成後は終了statusだけで判断せず、HTMLの存在と大きさを確認する。可能ならbrowserで開き、本文、layout、画像、linkを確認する。翻訳時は`apply-translation.py`が`MISS`を出していないことと、対象言語の表示を確認する。

Next.js向けの処理を含むため、他frameworkでCSSが残った場合は成果物を手修正せず、取得処理の不足として報告する。
