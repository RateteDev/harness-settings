---
name: justfile規約
description: |
  リポジトリの開発コマンドをjustfileで定義・変更するときの規約。recipeの命名とグループ、check/fixの対、just --listに出る説明、並列実行とshebang recipeで失敗を見逃さない書き方、CIからの呼び方を扱う。
metadata:
  user-review: false
  labels: [規約]
---

# justfile規約

## このスキルの目的

開発コマンドが手元のスクリプト、`package.json`の`scripts`、CIの設定に散ると、手元とCIで違う検査が走り、エージェントも使えるコマンドを見つけられない。
`justfile`をコマンドの入口に揃え、`just --list`を見れば何ができるか分かり、手元とCIで同じ検査が走るようにする。

## あるべき状態

### 入口

- 開発コマンドはリポジトリのルートの`justfile`に集め、CIのstepはjustのrecipeを呼ぶだけにする。
  手元の`just`でCIと同じ検査を再現できるようにするためである。
- 自動検査はすべて`just ci-local`から実行できるようにし、これを主な担保とする。
  リモートCIは保険と位置づける。

### recipeの名前と構成

- recipeは`{app}-{action}`で名付け、`[group]`でアプリごとにまとめる。
- アプリごとに`{app}-check`と`{app}-fix`を対で用意する。
  `check`はファイルを書き換えずにlint・format検査・型検査を行い、CIとpre-commitから呼ぶ。
  `fix`は自動修正できる処理をすべて行う。
- 外部に見せないrecipeには`[private]`を付け、名前を`_`で始める。
- 引数にはdefaultを設け、引数が複雑になる場合はrecipeを分ける。
- `repo-checks`には、そのリポジトリで常に成立すべき条件だけを置き、特定パスの変更時だけ要る検査は各アプリの`check`に置く。

### just --listに出る説明

- 各recipeの説明は、それだけで意味の通る一行にする。
  `just --list`は直前のcommentの最終行だけを表示し、コマンドを見つける唯一の面だからである。
- commentが複数行あるrecipeは`[doc]`で一行の説明を明示し、commentは理由の記録として残す。

### 失敗を見逃さない

- ファイルの先頭で`set shell := ["bash", "-euo", "pipefail", "-c"]`を宣言する。
- bashのshebang recipeは、本文でも`set -euo pipefail`を設定する。
  `set shell`はshebang recipeに届かず、途中で失敗したコマンドが見過ごされるためである。
- 複数の検査を並列に走らせるrecipeは、ジョブごとのPIDを個別に`wait`する。
  引数なしの`wait`は常に0で終わり、どれかが落ちても成功に見えるためである。

## 手段

- 並列実行のrecipeは次の形で書く。

  ```just
  [doc('Run local CI')]
  ci-local:
      #!/usr/bin/env bash
      set -euo pipefail
      just repo-checks
      pids=()
      just back-ci & pids+=($!)
      just front-ci & pids+=($!)
      failed=0
      for pid in "${pids[@]}"; do
          wait "$pid" || failed=1
      done
      exit $failed
  ```

- Cloudflare Workers Buildsでjustを使う場合は、build commandで公式のインストーラに`--tag`で版数を渡して入れる。
  Workers Buildsの環境にはjustが無く、版を指定しないと最新が入るためである。

  ```sh
  curl -sSf https://just.systems/install.sh | bash -s -- --tag <版> --to ./bin && PATH=$PWD/bin:$PATH just build
  ```
