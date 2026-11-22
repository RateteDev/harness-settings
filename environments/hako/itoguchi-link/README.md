# ホストの連携サーバー（Itoguchi と hako）

Itoguchi のスレッドで、hako のエージェントの名前が呼ばれたら、そのスレッド用の hako の環境でターンを1つ動かす。
スレッドとハーネスの組ごとに環境を1つ持ち、スレッドが閉じたら消す。
環境を止める・起こす・作り直すのは hako が行い、ここは「どのスレッドがどの環境か」だけを覚える。

| 知らせ | すること |
|---|---|
| 発言で、`AGENTS` の名前が呼ばれた | 環境がなければ `hako up` で作り、`hako turn` でターンを頼む。「環境を用意しました」を出す |
| 同上で、環境がある | `hako turn` でターンを頼む。作り直されたときは「環境を作り直しました」を出す |
| スレッドが閉じた | そのスレッドの環境を `hako rm` で消し、「環境を片付けました」を出す |

ターンのプロンプトは、呼ばれたスレッドのURL・id・投稿の位置・呼んだ人だけを伝える。
どう読んで答えるかは `hako/claude/instructions.md` に書く。

## 設定

ホストの `~/.config/hako/itoguchi-link.env`（権限 600）に置く。

| 変数 | 中身 |
|---|---|
| `PORT` | 待ち受けるポート（127.0.0.1） |
| `RECEIVE_TOKEN` | 知らせを受けるパス `/events/<RECEIVE_TOKEN>` の秘密の部分。推測できない長い値にする |
| `NOTICE_URL` | Itoguchi の連携の「受け取り用のURL」 |
| `AGENTS` | 呼ばれる名前と hako のハーネスの組（例: `claude:claude`）。カンマで区切る |

Itoguchi の設定の「連携」で、知らせる先を `https://<トンネルのホスト名>/events/<RECEIVE_TOKEN>` にする。
スレッドと環境の対応は `~/.local/state/hako/itoguchi-link.json` に残る。

## 動かし方

`hako` に PATH が通ったホストで、`bun hako/itoguchi-link/server.ts` を常駐させ、Cloudflare Tunnel でポートを公開する。
依存のパッケージは持たない。
