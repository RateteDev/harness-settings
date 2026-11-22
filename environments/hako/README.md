# hako

Itoguchi で呼ばれたコーディングエージェントを、ホストから隔てたVM（Docker Sandboxes、`sbx`）の中で動かす。

- 📦 スレッドごとにVMを1つ持ち、呼ばれたハーネス（`claude`・`codex`）はどれも同じVMで動く
- 🔑 鍵は sbx に登録し、VMには代わりの値だけが入る
- 💤 VMは、ターンが終わって30秒ほどで sbx が止め、次に呼ばれたら2秒ほどで起こす
- ⚙️ 行動規範・スキル・設定は、ターンのたびにホストのこのクローンから写す

| ファイル | 中身 |
|---|---|
| `hako.ts` | ホストで常駐する。Itoguchi の知らせを受け、sbx でVMを用意してターンを動かす |
| `vm.sh` | VMの中で動く。道具とハーネスを入れる（`install`）、設定を反映して1ターン動かす（`turn`） |
| `instructions.md` | VMのエージェントに知らせる、環境の事情と Itoguchi での会話の仕方 |

## ホストの準備

sbx と Bun の入った Linux で、次を1回行う。

```sh
# Docker へのサインインと、通信の方針
sbx login
sbx policy init balanced

# Claude Code の鍵。claude setup-token が表示したトークンを貼る。
# 代わりの値を sk-ant-oat01- で始めるのは、Claude Code がトークンの形を手元で確かめるため
sbx secret set-custom --host api.anthropic.com --env CLAUDE_CODE_OAUTH_TOKEN --placeholder 'sk-ant-oat01-{rand}' --value-stdin

# Itoguchi のキー
sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN --value-stdin

# Codex のサインイン（ブラウザが開く）
sbx secret set openai --oauth
```

そのあと、`bun environments/hako/hako.ts` を常駐させ、Cloudflare Tunnel でポートを公開する。
Itoguchi の設定の「連携」で、知らせる先を `https://<トンネルのホスト名>/events/<RECEIVE_TOKEN>` にする。

設定は環境変数で渡す。ファイルに置くときは権限を 600 にする。

| 変数 | 中身 |
|---|---|
| `PORT` | 待ち受けるポート（127.0.0.1） |
| `RECEIVE_TOKEN` | 知らせを受けるパス `/events/<RECEIVE_TOKEN>` の秘密の部分。推測できない長い値にする |
| `NOTICE_URL` | Itoguchi の連携の「受け取り用のURL」 |
| `AGENTS` | 呼ばれる名前とハーネスの組（例: `claude:claude,codex:codex`）。カンマで区切る |

## 動き方

1. Itoguchi で `AGENTS` の名前が呼ばれると、スレッドのidからVMの名前を決める。
2. VMがなければ「環境を用意しています」を出し、テンプレート（`hako-base:latest`）から作る。テンプレートもなければ先に作る（5分ほど）。
3. このクローンの `global/` と `environments/hako/` をVMへ写す。
4. VMの中で `vm.sh turn <ハーネス> <プロンプト>` を動かす。プロンプトは、呼ばれたスレッドのURL・id・投稿の位置・呼んだ人だけを伝える。
5. ターンが終わると、sbx がVMを止める。動かせなかったときは「〜 のターンを動かせませんでした」を出す。

同じVMではターンを1つずつ動かす。ターンの途中に呼ばれた分は、終わった後に、ハーネスごとに1つのターンにまとめて渡す。
ターンの記録は、VMの `~/.hako/state/<ハーネス>/session.log` に残る。

## 所有者が行うこと

hako はVMを消さず、道具の版も上げない。

```sh
# 止まっている古いVMを消す
sbx prune --filter until=168h
# VMの中に入る
sbx exec -it <VMの名前> bash
# 道具とハーネスの版を上げる（テンプレートを作り直す。作り済みのVMには効かない）
bun environments/hako/hako.ts template
```

## ハーネスを足す

1. `vm.sh` に `<名前>_setup`（設定を反映する）と `<名前>_run`（プロンプトを1つ受け取って1ターン動かし、2回目からは同じ会話を続ける）を足す。
2. 入れ方を決める。Docker 公式の追加部品があり、ほかと両立するなら `hako.ts` の `kits` に足す。なければ `vm.sh` の `install` に足す。
3. 鍵を sbx に登録し、テンプレートを作り直す。

追加部品は、認証の宣言が重なるものを一緒に足せない（`opencode-mixin` は `codex-mixin` と両立しない）。
`claude-mixin` を使わないのは、追加部品が認証を引き受け、登録した鍵が効かなくなるため。

## 注意点

- VMを消すと中のデータは残らない。残したいものはエージェントにpushさせる。
- VMからの通信はすべて許可している。
- テンプレートに入った道具とハーネスの版は、テンプレートを作った時点のもの。
