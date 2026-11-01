---
name: TypeScript規約
description: |
  TypeScriptのコードを書くとき、TSプロジェクトを立ち上げるときに従う規約。ランタイム、lint/format、ロガー、パッケージ初期化を定める。
metadata:
  user-review: false
---

# TypeScript規約

## このスキルの目的

ツール選定をその場の判断で変えると、プロジェクトごとに設定と依存が分かれ、実行環境やテストの挙動も揃わない。
ランタイムからパッケージ初期化までを固定し、同じ選定を繰り返さずに済むようにする。

## 進め方

TypeScriptのコードに触れる前に参照する。
ツールの選定はプロジェクト単位で固定し、その場の判断で変えない。

### Runtime

Bunを使用する。

- TypeScriptをトランスパイルなしでネイティブ実行できるため、`ts-node` や `tsx` 等の中間ツールが不要になる。
- パッケージマネージャ・バンドラ・テストランナーを内蔵しており、ツールチェインの依存を大幅に減らせる。
- Node.js互換APIを備えているため、既存のnpmエコシステムをそのまま利用できる。

### Lint / Format

Biomeを使用する。

- Rust製のためESLint + Prettierの組み合わせと比較して桁違いに高速。
- lintとformatを単一ツールで提供するため、設定ファイルの分散やplugin間の競合が発生しない。
- `biome.json` 一つで完結し、依存パッケージも `@biomejs/biome` のみで済む。

### Test

Bun組み込みのテストランナー (`bun:test`) を使用する。

- 外部テストフレームワークへの依存が不要になる。
- Runtimeと同一環境でテストが実行されるため、挙動の差異が発生しない。

**型定義の追加**

`bun:test` の型は `@types/bun` に含まれている。
`tsconfig.json` の `compilerOptions.types` に `"bun-types"` を追加しないと `describe`, `expect`, `test` 等が型エラーになる。

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}
```

### Logger

pinoを使用する。

- 構造化JSONログをデフォルトで出力するため、CloudWatch・Datadog等のログ基盤にそのまま投入できる。
- V8の最適化に沿った設計で、Node.js/Bun向けロガーの中で最も低オーバーヘッド。
- `pino-pretty` をdev依存に入れれば開発時の可読性も確保できる。

### packagesの初期化

`bun init` 等で生成されるテンプレートには使わないフィールドやスクリプトが多く含まれる。
以下の方針で最小限に整理する。

**package.jsonのscriptsは削除する**

- モノレポ全体の開発コマンドはルートの `justfile` に集約する方針のため、各packageの `scripts` と二重管理になる。
- `justfile` 側から直接 `bun run` や `biome` を呼べば十分であり、`scripts` を経由する必要がない。

**不要なフィールドを削除する**

`name`, `version`, `type`, `dependencies`, `devDependencies` 等の実際に機能するフィールドのみ残し、以下のような不要フィールドは削除する：

- `main`, `module` — 公開パッケージでなければ不要
- `keywords`, `author`, `license` — 内部パッケージには不要
- `description` — READMEで十分
