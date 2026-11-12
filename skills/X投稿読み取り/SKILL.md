---
name: X投稿読み取り
description: |
  X（Twitter）の投稿URL（x.com / twitter.com の /status/）を渡されたら、FxTwitter API経由で本文・画像・引用を読む。
metadata:
  user-review: false
  labels: [使い方]
---

# X投稿読み取り

X（Twitter）のWebページは直接取得が難しいため、FxTwitter APIを利用して投稿データ（本文、メディア、引用）を取得・解析します。

## 実行手順

1. **API URLの生成**
   - 投稿URLのドメイン（`x.com` または `twitter.com`）を `api.fxtwitter.com` に置換してGETリクエストを送る。
   - 例: `https://x.com/{user}/status/{id}` → `https://api.fxtwitter.com/{user}/status/{id}`

2. **基本情報の抽出**
   - 返ってきたJSONの `tweet` から以下を取得する。
     - 本文、投稿者、投稿日時、エンゲージメント数（RT・いいね等）

3. **添付メディアの確認**
   - `tweet.media.all[]` が存在する場合は必ず内容を確認する。
     - **静止画**: `url` の画像を取得する。
     - **動画**: `url` は動画ファイルのため、`thumbnail_url` の画像を取得して内容を把握する。

4. **引用・リンクの処理**
   - **引用（Quote）**: `tweet.quote` があれば、その本文やメディアも同様に読み取る。
   - **短縮リンク（t.co）**: 直接アクセスせず、展開済みURL（`raw_text.facets[].replacement` や `quote.card.url`）を参照する。

## 注意事項

- **取得対象**: 公開アカウントの投稿のみ対応。
- **スレッド**: 一括取得は不可。スレッドを読む場合は1投稿ずつ個別に取得する。
