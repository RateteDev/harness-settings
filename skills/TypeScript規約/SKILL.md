---
name: TypeScript規約
description: |
  TypeScriptのコードを書くとき、TSプロジェクトを立ち上げるときに従う規約。ランタイム、lint/format、ロガー、パッケージ初期化を定める。
metadata:
  user-review: false
  labels: [規約]
---

# TypeScript規約

## このスキルの目的

ツール選定をその場の判断で変えると、プロジェクトごとに設定と依存が分かれ、実行環境やテストの挙動も揃わない。
ランタイムからパッケージ初期化までを固定し、同じ選定を繰り返さずに済むようにする。

## あるべき状態

### ツール

- ツールは次の表のものを使う。

  | 用途 | 使うもの |
  |---|---|
  | Runtime・パッケージ管理・バンドル | Bun |
  | Lint / Format | Biome（設定は`biome.json`1つ、依存は`@biomejs/biome`のみ） |
  | Test | Bun組み込みの`bun:test` |
  | Logger | pino（開発時の整形には`pino-pretty`をdev依存に入れる） |

- `tsconfig.json`の`compilerOptions.types`に`"bun-types"`を入れる。
  `bun:test`の型は`@types/bun`に含まれるが、これが無いと`describe`・`expect`・`test`などが型エラーになるためである。

### package.json

- `bun init`などが生成した`package.json`の`scripts`は削除する。
  開発コマンドはルートの`justfile`に集約しており、各packageに置くと二重管理になるためである。
- `package.json`には、`name`・`version`・`type`・`dependencies`・`devDependencies`など、実際に機能するフィールドだけを残す。
- 公開しないpackageには`main`・`module`・`keywords`・`author`・`license`・`description`は置かず、説明はREADMEに書く。
