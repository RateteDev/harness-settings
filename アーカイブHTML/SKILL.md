---
name: アーカイブHTML
description: |
  調査・検証・デザインなどの経過を、あとから人とエージェントが振り返れる形にまとめるときに使う。ファイル名に「アーカイブ」を含むHTMLを読むときも、この形式の可能性があるため先に読み方を確かめる。
metadata:
  user-review: false
---

# アーカイブHTML

試行錯誤の経過を、振り返り用のHTMLと原本zipの2ファイルで残す。
HTMLは図と記録を読みやすく載せ、zipは作業フォルダをそのまま持つ。
どちらも作業フォルダの隣に置く。

## 作る

1. 記録を[経過と記録](templates/経過と記録.md)の型で書く。
   図（成果物）を選ぶ。
2. [index.mdx](templates/index.mdx)をコピーして記入する。
   記録.mdのh1をタイトルにし、h1以降を本文へ貼る。
   本文の`{`と`<`（大文字が続く場合）は、`\{`・`&lt;`にするかコード表記にする。
3. `article-preview fix-spacing <index.mdx>`の後、`article-preview <index.mdx> --out <名前>-アーカイブ.html --media inline`でHTMLを作る。
4. 作業フォルダを`<名前>-原本.zip`にする（`node_modules`・`.git`等を除く）。
5. `unzip`と`diff -r`でzipの中身の一致を確かめ、秘密情報が無いことを確認する。
6. ユーザーの確認後、作業フォルダをローカルから消す。

HTMLのファイル名には「アーカイブ」を含め、zipは同じ名前を使う。
`article-preview`コマンドを前提とし、作業用の`index.mdx`は/tmpに置く。

## 読む

- HTMLはそのまま読める。
  本編は図と記録。
- 素材の原本は、隣の`-原本.zip`を`unzip`して読む。
