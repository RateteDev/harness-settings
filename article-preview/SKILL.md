---
name: article-preview
description: |
  MD/MDXを読みやすい記事styleの自己完結HTMLへ変換し、Linux host上で表示を検証する。
---

# article-preview

変換前に`references/input-format.md`を読む。以下の`SKILL_ROOT`は、skill toolが返すBase directoryである。rendererと依存するfirst-party assetは`runtime/`に同梱されており、他repositoryや旧plugin checkoutを探索しない。

## 変換

現在のrepositoryに属する成果物は`.tmp/article-preview/`へ出す。

```bash
mkdir -p .tmp/article-preview
"${SKILL_ROOT}/scripts/article-preview" \
  "<INPUT.mdx>" \
  --out ".tmp/article-preview/<NAME>.html" \
  --media inline
```

`--media inline`ならlocal画像を含めて1ファイルにできる。到達可能な絶対URLをそのまま参照させたい場合だけ`--media link`へ変える。引数の詳細は記法referenceに集約し、この本文へ複製しない。

依存packageが無いという明示的なerrorが出た場合だけ、次を1回実行してから再試行する。

```bash
"${SKILL_ROOT}/scripts/setup.sh"
```

## 検証

変換commandの成功後、次を確認する。

1. 出力が空でなく、入力のtitleと本文を含む。
2. browserで開き、本文、目次、code block、画像、Mermaidなど入力に存在する要素を確認する。
3. `--media inline`の成果物では、意図しないlocal file pathがHTMLに残っていないことを確認する。

外部URLでの共有が必要な場合、このskillは配信先を推測しない。現在のprojectが所有する公開手順へ生成済みHTMLを渡す。
