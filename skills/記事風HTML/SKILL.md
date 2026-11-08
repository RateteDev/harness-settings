---
name: 記事風HTML
description: |
  MD/MDXを読みやすい記事styleの自己完結HTMLへ変換し、Linux host上で表示を検証する。MD/MDXを読みやすい形で見たい・人へ渡したい依頼で使う。
metadata:
  user-review: false
---

# 記事風HTML

## このスキルの目的

MD/MDXをその場でレンダリングすると、環境によって見た目が変わり、画像や参照も欠けやすい。
自己完結HTMLへ変換して表示を検証し、同じ成果物をどこでも開けるようにする。

## あるべき状態

- HTMLは`md-render`で変換された1ファイルで、ローカル画像も`--media inline`で埋め込まれている。
  到達可能な絶対URLをそのまま参照させたい場合だけ、`--media link`で変換されている。
- 現在のリポジトリに属する成果物は、`.tmp/md-render/`に出力されている。
- 出力は空でなく、入力のタイトルと本文を含む。
- ブラウザで開くと、本文、目次、コードブロック、画像、表など、入力に存在する要素が表示される。
- `--media inline`の成果物には、意図しないローカルのファイルパスが残っていない。
- 外部URLで共有する場合は、配信先を推測せず、現在のプロジェクトが持つ公開手順へ生成済みHTMLが渡されている。

## 手段

`md-render`コマンドがPATHにあることを前提とする。
無い場合は作業を始めず、導入をユーザーへ確認する。
npmの`md-preview`は無関係なパッケージである。

```bash
mkdir -p .tmp/md-render
md-render \
  "<INPUT.mdx>" \
  --out ".tmp/md-render/<NAME>.html" \
  --media inline
```

- 引数と終了コードは`md-render --help`が示す。
- 入力記法は、`md-render skills --help`の項目から必要なものを読む。
