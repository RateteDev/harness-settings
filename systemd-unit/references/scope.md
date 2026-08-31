# スコープ・探索パス・drop-in

## user か system か

user を既定とする。system を選ぶのは次のいずれかを満たす時だけ。

- 1024 未満のポートを直接握る
- ログインユーザーに紐付かない（ログインしていないマシンでも動く必要がある）

条件を明文化しておかないと、迷ったときに「本番っぽいから system」という理由で選ばれる。system にしたところで増えるのは `User=` 行と sudo パスワードだけ、という場合がほとんどである。

user スコープを選んだ場合、そのユニットの永続性は `loginctl enable-linger` に等しい。linger が無ければログアウトで停止する。

## `%h` はスコープで意味が変わる

`%h` は「そのユニットを実行するユーザーのアカウント DB 上のホーム」に解決される。

| スコープ | `%h` |
|---|---|
| user | そのユーザーのホーム |
| system | **`/root`。`User=` を書いても変わらない** |

`%h` が解決するのは「サービスマネージャを走らせているユーザー」のホームであって、
そのユニットが実行されるユーザーのホームではない。`User=nobody` と書いた system ユニットでも
`%h` は `/root` である。

user 用に書いたユニットを `/etc/systemd/system` にコピーすると、`%h` は無言で `/root` を指して起動に失敗する。これは `%h` の欠陥ではなく、スコープを変えたら書き直しが要るという事実の現れである。絶対パスで書いてあった場合はもっと悪く、`/home/{user}/...` のまま root 権限で動き、ホーム配下のファイルが root 所有に書き換わる。

## その他の specifier

| specifier | 意味 | 用途 |
|---|---|---|
| `%h` | ホーム | 既定の道具 |
| `%t` | `XDG_RUNTIME_DIR`（system スコープでは `/run`） | ソケット、PID ファイル。再起動で消えるべきもの |
| `%S` | 状態ディレクトリ基底 | `StateDirectory=` と組で使う |
| `%n` / `%N` | ユニット名（拡張子あり / なし） | `OnFailure=` への受け渡し |
| `%i` | インスタンス名 | テンプレートユニットの中で受け取る |

`StateDirectory=` を書くと systemd がディレクトリを作るため、スクリプト側の `mkdir -p` が不要になる。`%` そのものを書きたい場合は `%%` とエスケープする。

## 探索パス

user マネージャは以下の順で探し、先に見つかったものが勝つ。

```
~/.config/systemd/user.control   systemctl set-property が書く。手で触らない
~/.config/systemd/user           自分の領域。最優先
/etc/systemd/user                distro / snap が置く
~/.local/share/systemd/user      パッケージがホームへ入れる場所
/usr/lib/systemd/user            distro 本体
```

自分の領域が最優先なので、distro のユニットと同名のファイルを置けばそれを完全に覆い隠せる。部分的に変えたいだけなら drop-in を使う。

## drop-in

```
~/.config/systemd/user/{unit}.service.d/local.conf
```

元のユニットに**マージ**される（全置換ではない）。このマシン固有の値だけを足したい時はこちらが正しい。ただし drop-in も Git の外にあるため、恒久的な設定は結局リポジトリのユニットへ戻すべきであり、一時的な実験に限る。

## user スコープに存在するターゲット

`network-online.target` は user スコープに**存在しない**。user マネージャは system のターゲットを
一切参照できない。ネットワーク待ちに相当するものは無く、その役目は `Restart=` と backoff が担う。

依存先にできる主なものは次のとおり（網羅ではない。実在は
`systemctl --user list-units --type=target --all` で確認する）。

```
basic.target  sockets.target  timers.target  paths.target
default.target  graphical-session.target  shutdown.target
```

デスクトップセッションが要る用途（GUI、通知、クリップボード）なら `graphical-session.target` が
正しい依存先である。ただし**これが active になるのはグラフィカルセッションの中だけ**で、
`enable-linger` によって SSH 越しに起動した user マネージャの下では永久に待ち続ける。
常駐サーバーの依存先にしてはならない。
