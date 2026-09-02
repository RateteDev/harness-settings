---
name: systemd-unit
description: |
  常駐サーバーや定期実行を systemd の user ユニットとして構成するときに従う規約。ユニットの置き場・書式・失敗時の可視化と、それらの雛形一式を持つ。
---

# systemd ユニット

規約と雛形を持つ。検査は repo-audit が `audit.sh` で行う。

| 何をするか | 読むもの |
|---|---|
| user / system の選定、`%h`、探索パス、drop-in | `references/scope.md` |
| 秘匿値をユニットへ渡す | `references/secrets.md` |
| 定期実行を仕込む | `references/timer.md` |
| 起動しない・再起動を繰り返す | `references/troubleshooting.md` |

写して使う雛形は `templates/` にある。

| 雛形 | 用途 |
|---|---|
| `standing.service` | 常駐プロセス |
| `oneshot.service` + `oneshot.timer` | 定期実行 |
| `justfile-snippet` | 登録・撤去・再起動のレシピ |
| `notify-failure@.service` | 失敗通知の接続。`{notifier}`はホストが用意し、本skillには含めない |

## 原則

**定義はリポジトリ、有効化はホスト。** ユニットの中身は `just` のレシピ名・`mise.toml` の版数・作業ディレクトリで埋まっており、これはリポジトリの知識である。リポジトリの外に置けば、片方だけ変更されて壊れる。一方どのユニットを `enable` するかはマシンの判断であり、リポジトリはそれを強制しない。置いてあるだけで、レシピを叩かなければ何も起きない。

**ユニットの実体は `infra/systemd/` に置き、`~/.config/systemd/user` には symlink だけを張る。** `~/.config/systemd/user` は登録簿であって置き場ではない。実体をそこに置いた瞬間、そのユニットは履歴もバックアップもレビューもない存在になる。

## 書式

| 項目 | 規約 | 理由 |
|---|---|---|
| スコープ | user 既定 | 選定条件は `references/scope.md` |
| ホームの表記 | `%h` 必須 | `~` は `WorkingDirectory=` でしか展開されず、`$HOME` は指示子によって展開されたりされなかったりする。`%h` だけがどこでも同じ意味になる |
| ツールチェーン | mise shims 経由 | 版数の SSoT が `mise.toml` に一本化され、CI と同じものが動く。固定のインストールパスは、その先が消えても書いた側が気付かない |
| `ExecStart` | 実在する実行ファイルを指すこと | 存在しなければ `203/EXEC`。`Type=exec` はこれを起動時に露出させるが、露出先を見るのは人間である |
| `Type=` | 常駐は `exec`、バッチは `oneshot` | `simple` は fork 成功を起動成功と見なすため、実行ファイルの欠落が `systemctl start` に現れない |
| ネットワーク依存 | 書かない | `network-online.target` は user スコープに存在しない。`Wants=` は依存先が無くてもエラーにならないため、効いているように読めるだけになる |
| `Restart=` | 常駐は `always` | この種のプロセスの正常終了は誰も望んでいないので、クラッシュと区別する意味がない |
| 再起動間隔 | `RestartSec` + `RestartSteps` + `RestartMaxDelaySec` | 一過性の故障は数秒で復帰し、恒久的な故障は CPU を焼かない |
| 起動制限 | `StartLimitIntervalSec` / `StartLimitBurst` を明示 | 既定の 10 秒窓は、バックオフの遅延が窓を追い越すため埋まらない。埋まらなければ `failed` に到達せず、`OnFailure=` も発火しない |
| 失敗通知 | 常駐には `OnFailure=`、oneshot は個別判断 | 失敗が想定内のものに付けると通知が日常化して読まれなくなる |
| ログ | 何も書かない | 既定の journald のままにしないと `journalctl --user -u {unit}` の一本道が崩れる |

### 起動制限は `[Unit]` に置く

`StartLimitIntervalSec` と `StartLimitBurst` はどちらも `[Unit]` の指示子である。`[Service]` に書いた場合の挙動が**対称でない**点に注意する。

| 書き方 | 結果 |
|---|---|
| `[Service] StartLimitIntervalSec=` | 未知のキーとして警告つきで無視され、既定の 10 秒に戻る |
| `[Service] StartLimitBurst=` | **警告なく適用される** |
| `[Service] StartLimitInterval=`（旧綴り） | 警告なく適用される |

両方を `[Service]` に書くと、burst だけが効いて窓が 10 秒に戻る。これは「永久に再試行して `failed` にならない」という、この規約が防ごうとしている状態そのものである。

### 起動制限の値は再起動間隔と噛み合わせる

`StartLimitBurst` 回の起動に要する時間が `StartLimitIntervalSec` を超えると、制限は永久に発火しない。バックオフの遅延は等比数列であり、その総和に加えて**各試行が生きていた時間**も窓を消費する。

雛形の既定値（`RestartSec=1` / `RestartSteps=5` / `RestartMaxDelaySec=1min` / `Burst=10` / `Interval=1h`）では、遅延の総和が約 5 分となり、1 時間の窓に対して 55 分の余裕が残る。1 回あたり数十秒生きてから落ちるプロセスでも制限に到達する。

`RestartMaxDelaySec` や `Burst` を大きくする場合は、この計算をやり直すこと。

## プレースホルダ

雛形の `{...}` は次のとおり。

| プレースホルダ | 埋める値 |
|---|---|
| `{unit}` | ユニット名（拡張子を除く）。service と timer で同じ語幹 |
| `{what}` | 何を動かすものかの短い説明。レシピの `[doc]` に入る |
| `{repo-path}` | リポジトリの絶対パス。`%h` で始める |
| `{recipe}` | `ExecStart` が呼ぶ just のレシピ名 |
| `{script}` | `ExecStart` が呼ぶスクリプトのリポジトリ内パス |
| `{one line, ...}` | `Description=` の一行 |
| `{schedule}` | `OnCalendar=` の値。例 `Sun 04:00` |
| `{notifier}` | 失敗を報告する実行ファイルの絶対パス。ホストが用意する |

## コメント

選択が分かれる箇所にだけ理由を書く。具体的には次の 3 点。

1. user / system スコープの選定理由
2. `Restart=` の選択
3. ツールチェーンの解決方式

`Type=exec` や `Persistent=true` のような一択の項目に理由を書くと、雛形がコメントで埋まって肝心の判断が埋もれる。それらの理由はこの文書が一度だけ持つ。

## 導入と撤去

`templates/justfile-snippet` を対象リポジトリの justfile に追記し、プレースホルダを埋める。`service-install` / `service-uninstall` / `service-restart` の 3 本が入る。前 2 本は必須で、repo-audit が名前を検査する。`service-restart` は、そのリポジトリに既により内容の厚い再起動レシピがあるなら省いてよい。

ユニットを 2 本以上持つリポジトリでは、`{unit}` を埋める代わりに `infra/systemd/*` を走査する形にする。後から足したユニットが、レシピを書き換えなくても登録される。その際、`[Install]` を持たないユニット（timer に起こされる oneshot）は `enable` の対象から外すこと。有効化すると、そのバッチが起動時にも走る。

**`systemctl --user disable` は、そのユニットを指す symlink を手で張ったものも含めてすべて削除する。** したがって撤去そのものは `disable --now` 一本で足りる。それでも `service-uninstall` を用意するのは、撤去がレシピとして書かれていなければ、導入したユニットの消し方を導入した本人しか知らない状態になるためである。リポジトリを移動・削除したあとでは `disable` が対象を解決できなくなるため、レシピは symlink の削除も行う。

linger は install レシピで検査し、未設定なら失敗させる。自動で有効化はしない。アカウント全体のセッション寿命を変える操作を、ユニット 1 本の都合で張るべきではない。

## 失敗通知

`OnFailure=notify-failure@%n.service` と書けば、`%n` に自分のユニット名が渡る。1 本の雛形が全ユニットを賄うため、ユニットごとに通知処理を複製しない。

何をどこへ report するかはホストの裁量であり、この規約は定めない。定めるのは接続の形だけである。

| 決めごと | 内容 |
|---|---|
| ユニット名 | `notify-failure@.service` |
| 置き場 | ホストの `~/.config/systemd/user`。リポジトリのレシピは登録しない |
| 通知先への引数 | 失敗したユニット名を第 1 引数で受け取る。それ以外は systemd から読み直す |

登録は symlink と `daemon-reload` だけでよい。テンプレートユニットは実体を伴わずに `enable` できない。

前提が 2 つある。

1. **ユニットが `failed` に到達できること。** 起動制限を明示していないユニットは永久に再試行し続け、`failed` にならないため `OnFailure=` も発火しない
2. **通知先の実行ファイルが実在すること。** 失敗を報告する仕組み自身が `203/EXEC` で失敗した場合、その沈黙に気付く経路は無い

導入したら一度、意図的に失敗するユニットを立てて経路を通しておくこと。`ExecStart` を存在しないパスにし、`StartLimitBurst` を 2 程度に絞った捨てユニットで足りる。
