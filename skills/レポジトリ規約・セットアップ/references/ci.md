# CIガイド

テンプレートからプロジェクトを作成した後に参照し、セットアップ完了後は削除してよい。

## 基本方針

CIはリモート（GitHub Actions）で実行する。
pre-commitフックでコミット時の最低限の検査を担保し、push後のリモートCIで全チェックを行う。

ローカルでは変更に関連するアプリのCIレシピ（`just back-ci` / `just front-ci` 等）を手動で実行し、push前に確認する運用を推奨する。

## ローカルCI

`just ci-local` は全アプリのCIをまとめて並列実行するレシピである。
変更範囲が広い場合や、push前に全体の整合性を確認したい場合に使用する。

```just
ci-local:
    #!/usr/bin/env bash
    set -u
    just repo-checks
    just _check-hooks-configured
    pids=()
    just back-ci & pids+=($!)
    just front-ci & pids+=($!)
    failed=0
    for pid in "${pids[@]}"; do
        wait "$pid" || failed=1
    done
    exit $failed
```

引数なしの `wait` は待機する全ジョブの終了を待つが、終了ステータスは常に0を返す。
一括で待つと、どのアプリのCIが落ちても `ci-local` は成功で終わり、品質ゲートが
緑を返し続ける。
ジョブごとのPIDを保持して個別に `wait` し、1つでも落ちたら
非ゼロで終了させる。

通常の開発では変更したアプリのCIレシピを個別に実行すれば十分である。

```sh
just back-ci    # バックエンドの変更後
just front-ci   # フロントエンドの変更後
```

## リモートCI（GitHub Actions）

### ジョブ構成

ジョブはアプリ毎に分離する。
互いに依存しないため並列実行でき、片方が壊れてももう片方の結果がすぐわかる。

| ジョブ | 目的 |
|---|---|
| `repo-checks` | リポジトリ横断の整合性確認 |
| `{app}-ci` | アプリ毎のcheck → テスト → ビルド |

### ツールチェーン版数

版数の宣言は `mise.toml` ただ1箇所に置く。
CIは `jdx/mise-action` でその同じファイルを読み、自前の版数指定を持たない。

```yaml
jobs:
  back-ci:
    steps:
      - uses: actions/checkout@v7
      - uses: jdx/mise-action@v4
      - run: just back-ci
```

`setup-just` や `setup-bun` のようなsetup系アクションは置かない。
それらはmiseとは別の経路でツールを入れるため、同じツールに2つのインストーラが並ぶ。

以前の規約はワークフロー冒頭の `env` を版数の情報源としていたが、これは廃止した。
`env` に書くと、同じ事実が `mise.toml` と `env` の2箇所に存在し、規約で同期を義務付けることになる。
一致を機械検査で強制しても、**嘘をつける場所が残っている**という構造は変わらない。
実際に、CIだけが版数を宣言し開発機側は野放しという状態が検出されないまま残った例がある。
宣言を1箇所に畳めば、その状態は表現できなくなる。

`mise activate` を有効にしていれば、`mise.toml` を持つディレクトリへ `cd` した時点で版数が束縛される。
`.nvmrc` のように使う側の操作を必要としないため、「固定したつもりが効いていない」が起きない。

```toml
[tools]
just = "1.58.0"
bun = "1.4.0"
```

`latest` や `stable` は版数を指定したことにならない。
実行のたびに上流で解決されるため、省略した場合と同じ壊れ方をする。
これは `mise.toml` でも同様である。

アクション自体の参照は `@v4` のようにタグで固定する。
`@main` や `@master` は上流の変更をそのまま取り込むため使わない。

CIのジョブ開始時にmiseがツールを取得する分、setup系アクションより立ち上がりは遅い。
リモートCIを保険と位置づけ、`just ci-local` を主たる担保とする運用であれば、この差は許容してよい。

### 検査はjustfile経由で呼ぶ

CIのステップにコマンドを直接書かない。
justfileのレシピを呼ぶ。

直接書くと同じ検査がjustfileとCIの2箇所に存在することになり、片方だけが更新されて乖離する。
レシピ経由なら手元で `just` を叩けばCIと同じ検査が再現でき、CI側は何を実行するかだけを持つ。

```yaml
- run: just repo-checks
```

この規約によりjustはすべてのリポジトリでCIに必要となる。
`mise.toml` はアプリ構成に依らず常に `just` を宣言する。

### concurrency制御

同一ブランチのCIが重複実行されないよう、`concurrency` を設定する。

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### キャッシュ戦略

lockfileのハッシュをキーにして依存パッケージをキャッシュする。

```yaml
- uses: actions/cache@v6
  with:
    path: ~/.bun/install/cache
    key: bun-${{ runner.os }}-${{ hashFiles('apps/backend/bun.lock') }}
    restore-keys: bun-${{ runner.os }}-
```

## リポジトリ横断の検査

アプリケーションのpathに属さない不変条件は`repo-checks`recipeが持ち、同名のCI jobはそれを呼ぶ。
検査内容はリポジトリごとに異なるため、templateのplaceholderを実構成に合わせて置き換える。

## pre-commitフック

pre-commitではアプリ毎に変更スコープを絞り、関連するチェックだけを実行する。

```bash
#!/usr/bin/env bash
set -euo pipefail

if git diff --cached --name-only | grep -q "^apps/backend/"; then
  just back-check
fi

if git diff --cached --name-only | grep -q "^apps/frontend/"; then
  just front-check
fi
```
