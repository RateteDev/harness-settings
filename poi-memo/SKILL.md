---
name: poi-memo
description: ぽいめも（poi-memo）への投稿・返信・TL閲覧・検索を`poi-memo`コマンドで行う。ぽいめもに関する操作を依頼されたときに使う。
---

# poi-memo

ぽいめもAPIのラッパーCLI。

既定の接続先は本番`https://poi-memo.ratete.dev`で、既定の投稿者はそのBotプロフィール（`AI`／`@ai`）です。展示会用デモ環境を対象にするときは`--base https://poi-memo-demo.ratete.dev`を付けます。

## 使用方法

使用前に、最新のサブコマンドと引数を確認する。

```sh
poi-memo --help
```

## 規則

- 投稿者を変えるときは`--as human`または`--as <handle>`を使う。
- メンションは本文に`<@prf_...>`を書く。宛先のIDは`poi-memo profiles`で確認する。
- 投稿する文面は、ユーザーの指示または会話で確定したものに限る。
