# hako

隔離したVMでコーディングエージェントを動かし続ける。

- 📦 作業の場ごとに Docker Sandboxes（`sbx`）のVMを1つ持ち続ける
- 🚪 同じ環境に、非対話のターンと端末の対話画面の2つの入口から入れる
- 🔑 ハーネスへのサインインはホストで行い、その資格情報をVMへ写す
- 💤 何も動いていないVMは止め、次に頼まれたら2秒ほどで起こす
- 🔁 会話はVMの中に残り、起こしても続きから答える
- ⚙️ 行動規範・スキル・MCPサーバーは、このリポジトリの最新をVMへ反映する

今のところ使えるハーネスは Claude Code だけです。

## このディレクトリの中身

| 場所 | 中身 |
|---|---|
| `app/` | hako 本体（Go）。ホストのコマンドと、VMの中で動く `hako vm`・`hako-worker` を1つの実行ファイルに持つ |
| `claude/` | Claude Code の起動方法（`run`・`install`・`log.jq`・`credentials`）と、VMへ反映する設定（`setup.sh`・`settings.jsonc`・`instructions.md`・`modes/`） |
| `itoguchi-link/` | ホストの連携サーバー。Itoguchi で呼ばれたら `hako turn` を頼む |
| `hako_instructions.md` | hako がVMのエージェントに知らせる環境の事情 |
| `Containerfile` | VMのテンプレートの定義 |

## インストール

KVMの使える Linux（Ubuntu で確認）と、Dockerアカウントが必要です。

```sh
# hako を入れる（上げるときは mise up）
mise use -g github:RateteDev/harness-settings
# ホストで Claude Code にサインインしておく（claude.ai のアカウント）
claude auth login
# 依存・鍵・テンプレート・常駐を整える
hako setup
```

`hako setup` は、満たしていない条件だけを順に直します。何度実行しても同じ状態になり、`hako doctor` は確かめるだけで何も変えません。

| 条件 | 直し方 |
|---|---|
| KVM を使えること | `kvm` グループに入る（ログインし直しが要る） |
| sbx と Podman | Docker の apt リポジトリだけを登録して `docker-sbx` を入れ、Podman も入れる（sudo を使う） |
| 常駐 | linger を有効にし、sbx のデーモンと `hako daemon` を systemd の user unit にする |
| Docker へのサインイン・通信の方針 | `sbx login`、`sbx policy init balanced` |
| GitHub の鍵 | 使うリポジトリに届く fine-grained PAT を sbx に登録する |
| ハーネスの資格情報 | hako では直さない。ホストでハーネスにサインインする |
| テンプレート | 開発道具とハーネスのCLIを入れたテンプレートを作る（数分かかる） |

テンプレートには、node・bun・just・Rust・wrangler・sqlite3・gh・tmux、日本語フォント、Playwright と Chromium が入ります。
道具の版はテンプレートを作った時点のものです。上げるときは `hako template` を実行し直します。
hako を上げてテンプレートの定義が変わったときは、`hako doctor` が知らせ、`hako setup` が作り直します。
hako を上げると、`hako daemon` は新しい版で起動し直し、VMの中の hako も次に触れたときに揃います。

## 資格情報

ハーネスがサインインの結果を置くファイルは、`<ハーネス>/credentials` に、ホームからの相対で並べます。
hako は、ホストにあるこのファイルを、VMを作ったときと起こしたときにVMの同じ場所へ上書きします。
ホストにファイルがないハーネスには、ターンも対話も頼めません。

MCPサーバーなどが使う鍵は sbx に登録し、`setup.sh` では環境変数の代わりの値を使います。

## VMのエージェントに知らせること

hako は、環境の事情（止められること・入口の意味・`hako-worker` の使い方など）を `hako_instructions.md` に書き、VMの `~/.hako/hako_instructions.md` に置きます。
ハーネスの `setup.sh` がこれを読み、行動規範の後ろに足します。
どの入口から動いているかは、環境変数 `HAKO_MODE`（`turn`・`worker`・`interactive`）で伝えます。
hako からハーネスへ、頼まれたプロンプト以外の文は送りません。

VMは、このリポジトリをクローンして `environments/hako/<ハーネス>/setup.sh` を実行します。
止めていたVMを起こしたときにも、最新を取り直して実行します。

## 使い方

### 非対話のターン

ホストの連携サーバーなどが、呼ばれるたびにターンを頼む入口です。

```sh
# VMを作る。owner/repo を付けると、そのリポジトリをクローンする（環境の名前が表示される）
hako up owner/repo
# ターンを頼む。止まっていれば起こし、ターンの途中なら終わった後に続けて動かす
hako turn hako-1a2b3c claude "〜を直して、結果を〜へ投稿してください。"
# 動いている様子を読む（Ctrl-c で抜ける）
hako logs hako-1a2b3c claude
```

返答の本文は誰も読みません。所有者への連絡は、エージェントがMCPサーバー経由で会話の場へ投稿します。

### 端末の対話画面

```sh
# VMの中のハーネスの対話画面に入る。Ctrl-b d で抜けても動き続け、もう一度実行するとつなぎ直す
hako attach hako-1a2b3c claude
# 新しい会話で開く
hako attach --new hako-1a2b3c claude
```

対話の会話はターンの会話とは別に1つ持ち、開くたびに続けます。
画面から抜けたあとも、画面が10分動いていなければVMを止めます（会話は残り、次に開くと続きから始まります）。

### 作業役

VMの中のエージェントは、長い作業を `hako-worker` で作業役（別の新しい会話）に任せます。
作業役が動いている間は、VMを止めません。

```sh
# 呼んだ側と同じハーネスで動かす
hako-worker "〜を調べて、結果を〜へ報告してください。"
# ハーネスを選んで動かす
hako-worker claude "〜を調べて、結果を〜へ報告してください。"
```

### そのほか

| コマンド | すること |
|---|---|
| `hako ls` | 環境の一覧（名前・状態・作った時刻） |
| `hako shell <環境>` | VMの中のシェルに入る |
| `hako rm <環境>` | 環境を消す |
| `hako stop-idle` | 使っていない環境を一度だけ止める（`hako daemon` が1分ごとに行う） |

## 注意点

- hako は環境を自分では消しません。要らなくなった環境は `hako rm` で消してください。
- VMを消すと中のデータは残りません。残したいものはエージェントにpushさせてください。
- VMの中のエージェントは、写した資格情報を読めます。通信はすべて許可しています。
- 1つのVMで複数のハーネスを動かせます。会話とターンの状態はハーネスごとに分かれます。
- ハーネスを足すときは、このディレクトリに `<名前>/` を作り、`run`・`install`・`log.jq`・`credentials`・`setup.sh` を置きます。`run` の引数は `claude/run` の冒頭に書いてあります。

## 開発

リポジトリのルートで実行します。

```sh
just setup      # Gitフックを有効にする
just ci-local   # 検査・テスト・ビルド
```

`v` で始まるタグを push すると、GitHub Actions がリリースの成果物を作って置きます。
