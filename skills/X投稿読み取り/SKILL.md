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

## 手段

1. 投稿URL`x.com/{user}/status/{id}`の`x.com`を`api.fxtwitter.com`に差し替えてGETする。
2. 返ってきたJSONの`tweet`から、本文・投稿者・投稿日時・反応数を読む。
3. 添付（`tweet.media.all[].url`）は必ず取得して、内容まで読む。
4. 引用（`tweet.quote`）があれば、その内容も読む。

- 読めるのは公開アカウントの投稿のみ。
  1回で1投稿ずつなので、スレッドは投稿ごとに取得する。
- `t.co`の短縮リンクは開けない。
  展開済みのURLは`raw_text.facets[].replacement`や`quote.card.url`にある。
- 動画の添付は`url`が動画ファイルなので、`thumbnail_url`の画像で内容を確かめる。
