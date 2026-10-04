---
name: 記事風HTML
description: |
  MD/MDXを読みやすい記事styleの自己完結HTMLへ変換し、Linux host上で表示を検証する。
metadata:
  user-review: false
---

# 記事風HTML

## このスキルの目的

MD/MDXをその場でレンダリングすると、環境によって見た目が変わり、画像や参照も欠けやすい。
自己完結HTMLへ変換して表示を検証し、同じ成果物をどこでも開けるようにする。

## 進め方

`article-preview`コマンドがPATHにあることを前提とする。
無ければ作業を始めず、導入を所有者へ確認する。
引数と終了コードは使用前に`article-preview --help`で確認する。

### 変換

現在のrepositoryに属する成果物は`.tmp/article-preview/`へ出す。

```bash
mkdir -p .tmp/article-preview
article-preview \
  "<INPUT.mdx>" \
  --out ".tmp/article-preview/<NAME>.html" \
  --media inline
```

`--media inline`ならlocal画像を含めて1ファイルにできる。
到達可能な絶対URLをそのまま参照させたい場合だけ`--media link`へ変える。
入力記法は`article-preview skills --help`の項目から必要なものを読む。
npmの`md-preview`は無関係なpackageなので使わない。

### 検証

変換commandの成功後、次を確認する。

1. 出力が空でなく、入力のtitleと本文を含む。
2. browserで開き、本文、目次、code block、画像、表など入力に存在する要素を確認する。
3. `--media inline`の成果物では、意図しないlocal file pathがHTMLに残っていないことを確認する。

### 配信

外部URLでの共有が必要な場合、このスキルは配信先を推測しない。
現在のprojectが所有する公開手順へ生成済みHTMLを渡す。
