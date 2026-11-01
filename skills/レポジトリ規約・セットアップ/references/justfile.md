# justfileガイド

テンプレートからプロジェクトを作成した後に参照し、セットアップ完了後は削除してよい。

## justとは

justはコマンドランナーである。
Makeと異なりファイルの依存グラフ解決を行わず、タスクの実行に特化している。

### 採用理由

- `just --list` でレシピ一覧・グループ分け・引数表示が組み込みで得られるため、ヘルプ生成の自作が不要。
- `[private]`・`[group]` 等のアトリビュートで表示制御を宣言的に記述できる。
- Makefileと書き味が近く、学習コストが低い。

## justfileの規約

### グループ

`[group]` アトリビュートでレシピをセクション分けする。
`just --list` の出力に反映される。

```just
# Start development servers
[group('Development')]
dev:
    bun run dev
```

### 説明

レシピの説明は `just --list` に一行で出るものを指す。
`just --list` は直前のコメントブロックの**最終行だけ**を拾うため、複数行のコメントを書くと説明欄に文の断片が並ぶ。

```just
# What the context window is made of and where a shrink would land. Reads the
# running server, which measured its fixed section at startup.
window:
```

```
window    # running server, which measured its fixed section at startup.
```

理由を複数行書きたい場合は、`[doc]` で一行の説明を明示する。
コメントは理由の記録としてそのまま残せる。

```just
# What the context window is made of and where a shrink would land. Reads the
# running server, which measured its fixed section at startup.
[doc('What the context window is made of and where a shrink would land')]
window:
```

この規約が要るのは、`just --list` がエージェントにとってコマンドの唯一の発見面だからである。
説明を一行に削ってコメントを捨てると理由が失われ、コメントを厚く書くと発見面が壊れる。
`[doc]` は両方を成立させる。

同梱のaudit scriptは、複数行コメントを持ちながら`[doc]`を持たないrecipeを検出する。

### check / fixパターン

アプリ毎に `{app}-check` と `{app}-fix` の2レシピを用意する。
lintとフォーマットのツールが分離しているか一体型かはアプリによって異なるが、この2レシピで吸収し、開発者がツールの違いを意識しなくて済むようにする。

- `check` — lint + フォーマットチェック + 型検査等を実行する。
  ファイルを書き換えない。
  CIとpre-commitで使用する。
- `fix` — 自動修正可能な処理をすべて実行する。
  lintのautofixとフォーマットの適用を含む。

```just
# Biome (lint + format が一体型) の場合
[private]
_back-check:
    cd apps/backend && bunx biome check .

[private]
_back-fix:
    cd apps/backend && bunx biome check --write .

# ESLint + Prettier (lint と format が分離型) の場合
[private]
_front-check:
    cd apps/frontend && bunx eslint .
    cd apps/frontend && bunx prettier --check .

[private]
_front-fix:
    cd apps/frontend && bunx eslint --fix .
    cd apps/frontend && bunx prettier --write .
```

### 内部レシピ

外部に公開しないレシピには `[private]` アトリビュートを付け、名前を `_` で始める。
`just --list` に表示されなくなる。

### 命名規則

モノレポでアプリが複数ある場合、`{app}-{action}` の形式でレシピを命名する。

```just
[group('Backend')]
back-ci:
back-test:
back-up:

[group('Frontend')]
front-ci:
front-test:
front-dev:
```

### 引数

レシピに引数を持たせる場合、デフォルト値を設定する。
引数が複雑になる場合はレシピを分割する。

```just
# Start frontend dev server
front-dev port="3000":
    cd apps/frontend && bun run dev --port {{ port }}
```

## リポジトリ横断の検査

特定のアプリケーションに属さない不変条件は`repo-checks`に置く。
pre-commit、`ci-local`、remote CIは同じrecipeを呼び、検査を別々に実装しない。

`repo-checks`には、そのリポジトリで常に成立すべき条件だけを置く。
特定pathの変更時だけ必要なcheckは各アプリケーションの`check`へ置く。

## CI環境での導入

版数は `mise.toml` に宣言し、CIはそれを読む。
CI側に版数を書かない。
詳細は `references/ci.md` の「ツールチェーン版数」を参照。

### GitHub Actions

```yaml
- uses: jdx/mise-action@v4
- run: just ci-local
```

### Cloudflare Workers Builds

`install.sh` は `--tag` で版数を指定する。
指定しなければ最新が入り、ビルドの再現性が失われる。

```toml
[build]
command = "curl -sSf https://just.systems/install.sh | bash -s -- --tag 1.58.0 --to ./bin && PATH=$PWD/bin:$PATH just build"
```
