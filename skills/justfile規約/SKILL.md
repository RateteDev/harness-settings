---
name: justfile規約
description: |
  リポジトリの開発コマンドをjustfileで定義・変更するときの規約。recipeの命名とグループ、check/fixの対、just --listに出る説明、並列実行とshebang recipeで失敗を見逃さない書き方、CIからの呼び方を扱う。
metadata:
  user-review: false
  labels: [規約]
---

# justfile規約

## 目的

開発コマンドの入口をリポジトリルートの`justfile`に一本化する。
手元とCIで同一の検査を実行可能にし、開発者やエージェントが`just --list`を見るだけで実行可能な操作を迷わず把握できるようにする。

## 設計原則

### 1. エントリポイントの統一
- **CIとの一致**: すべての開発コマンドはルートの`justfile`に集約し、CIのステップからはjust recipeを呼ぶだけにする。
- **ローカルファースト**: すべての自動検査を実行する`just ci-local`を用意する。ローカルでの事前担保を基本とし、リモートCIは補助と位置づける。

### 2. recipeの命名・構成
- **命名規則**: `{app}-{action}` 形式とし、`[group]` 属性でアプリごとに分類する。
- **checkとfixの対定義**:
  - `{app}-check`: lint、format検証、型検査などを実行（ファイル変更は行わない）。CIやpre-commitで使用。
  - `{app}-fix`: 自動修正可能な処理をすべて実行。
- **内部用recipe**: 名前を `_` で始め、`[private]` 属性を付与してリストから隠蔽する。
- **引数**: 必ずデフォルト値を設定する。引数が複雑化する場合は別recipeに分割する。
- **全体検査**: リポジトリ全体で常に満たすべき条件は `repo-checks` にまとめ、アプリ個別・パス依存の検査は各 `{app}-check` に配置する。

### 3. コマンド説明（`just --list`）
- 各recipeには、一覧表示だけで目的が伝わる簡潔な1行説明を付ける。
- 複数行の解説が必要な場合は、`[doc("1行説明")]` で一覧用の文言を指定し、詳細や背景は直前の通常コメントとして残す。

### 4. エラーハンドリング
- **全体設定**: ファイル先頭に `set shell := ["bash", "-euo", "pipefail", "-c"]` を記述する。
- **Shebang recipe**: bashを使うShebang recipe内でも必ず `set -euo pipefail` を明記する（`set shell` の設定が引き継がれないため）。
- **並列実行時のエラー検知**: バックグラウンド処理のPIDを個別に `wait` し、いずれかの失敗を確実に検知する（引数なし `wait` は全プロセスの終了後に常に終了ステータス0を返すため使用禁止）。

## 実装例

### 並列実行recipe

```just
[doc('ローカルCIを一括実行する')]
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

### Cloudflare Workers Buildsでの利用

環境内にjustが存在しないため、ビルドコマンドでバージョンを指定して導入する。

```sh
curl -sSf https://just.systems/install.sh | bash -s -- --tag <version> --to ./bin && PATH=$PWD/bin:$PATH just build
```
