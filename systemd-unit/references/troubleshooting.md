# 調べ方

## まず見るもの

```sh
systemctl --user status {unit} --no-pager
systemctl --user show {unit} -p ActiveState -p Result -p NRestarts -p Type -p Restart
journalctl --user -u {unit} -n 30 --no-pager
```

`NRestarts` は最も雄弁な数字である。四桁なら、そのユニットは誰にも気付かれずに再起動を繰り返している。

## 症状別

### `status=203/EXEC`

`ExecStart` の実行ファイルが存在しない。`Environment=PATH=` が固定のインストールパスを指しており、その先が消えている場合がほとんどである。

```sh
systemctl --user show {unit} -p ExecStart --value
```

で実際のパスを取り、`test -x` する。mise shims を指しているのに解決されない場合は、そのリポジトリに `mise.toml` が無く、グローバル設定にもそのツールが宣言されていない。

### 再起動を繰り返すが `failed` にならない

`StartLimitIntervalSec` が既定の 10 秒のまま、`RestartSec` がそれと同程度以上の値になっている。窓の中に `StartLimitBurst` 回の失敗が収まらないため、制限に到達しない。

```sh
systemctl --user show {unit} -p StartLimitIntervalUSec -p StartLimitBurst -p RestartUSec
```

### 環境変数がユニットから見えない

user マネージャはシェルの `export` を継承しない。

```sh
systemctl --user show-environment | cut -d= -f1
```

に無ければ、そのユニットからは見えない。`~/.config/environment.d/` に置いて再ログインするか、`systemctl --user import-environment {KEY}` で一時的に注入する。

### 依存先を書いたのに効いていない

そのターゲットが user スコープに存在するか確認する。

```sh
systemctl --user list-units --type=target --all | grep {target}
```

`not-found` なら、その行は無視されている。`Wants=` は依存先が見つからなくてもエラーにならないため、書いた側は効いていると思い込む。

## ホスト側の点検

リポジトリ検査（repo-audit）の対象外。年に数回で足りる。

```sh
# 実体ファイルが紛れ込んでいないか。symlink 以外は Git の外にある
find ~/.config/systemd/user -maxdepth 1 -type f

# set-property の残骸が無いか
ls -A ~/.config/systemd/user.control 2>/dev/null

# リンク切れ
find ~/.config/systemd/user -xtype l

# 失敗したまま放置されているもの
systemctl --user --failed
```
