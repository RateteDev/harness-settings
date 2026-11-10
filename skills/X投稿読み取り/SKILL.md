---
name: X投稿読み取り
description: |
  X（Twitter）の投稿URL（x.com / twitter.com の /status/）を渡されたら、FxTwitter API経由で本文・画像・引用を読む。
metadata:
  user-review: false
  labels: [使い方]
---

# X投稿読み取り

## このスキルの目的

Xの投稿URLは、直接取得しても本文を読めないことが多い。
FxTwitterのAPIからJSONで取得し、投稿の本文だけでなく添付や引用まで読めるようにする。

## あるべき状態

- 投稿の本文・投稿者・投稿日時・反応数を読む。
- 添付は必ず取得し、内容まで読む。
- 引用があれば、その内容も読む。
- 本文中の`t.co`の短縮リンクは開かず、展開済みのURLで扱う。
- スレッドは投稿ごとに取得して読む。
  APIは1回の取得で1投稿だけを返すためである。

## 手段

- 投稿URL`x.com/{user}/status/{id}`の`x.com`を`api.fxtwitter.com`に差し替えてGETする。
  `twitter.com`のURLも同じように差し替える。
- 返ってくるJSONの`tweet`に投稿の情報がある。
  - 添付：`tweet.media.all[].url`。
    動画は`url`が動画ファイルなので、`thumbnail_url`の画像で内容を確かめる。
  - 引用：`tweet.quote`。
  - 展開済みのURL：`tweet.raw_text.facets[].replacement`、リンクカードは`tweet.card.url`（引用では`tweet.quote.card.url`）。
- 読めるのは公開アカウントの投稿だけである。
