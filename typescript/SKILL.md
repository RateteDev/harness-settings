---
name: typescript
description: |
  TypeScriptのコードを書くとき、TSプロジェクトを立ち上げるときに従う規約。ランタイム、lint/format、ロガー、パッケージ初期化を定める。
---

# TypeScript

TypeScript のコードに触れる前に参照する。ツールの選定はプロジェクト単位で固定し、その場の判断で変えない。

## Runtime

Bun を使用する。

- TypeScript をトランスパイルなしでネイティブ実行できるため、`ts-node` や `tsx` 等の中間ツールが不要になる。
- パッケージマネージャ・バンドラ・テストランナーを内蔵しており、ツールチェインの依存を大幅に減らせる。
- Node.js 互換 API を備えているため、既存の npm エコシステムをそのまま利用できる。

## Lint / Format

Biome を使用する。

- Rust 製のため ESLint + Prettier の組み合わせと比較して桁違いに高速。
- lint と format を単一ツールで提供するため、設定ファイルの分散や plugin 間の競合が発生しない。
- `biome.json` 一つで完結し、依存パッケージも `@biomejs/biome` のみで済む。

## Test

Bun 組み込みのテストランナー (`bun:test`) を使用する。

- 外部テストフレームワークへの依存が不要になる。
- Runtime と同一環境でテストが実行されるため、挙動の差異が発生しない。

### 型定義の追加

`bun:test` の型は `@types/bun` に含まれている。`tsconfig.json` の `compilerOptions.types` に `"bun-types"` を追加しないと `describe`, `expect`, `test` 等が型エラーになる。

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}
```

## Logger

pino を使用する。

- 構造化 JSON ログをデフォルトで出力するため、CloudWatch・Datadog 等のログ基盤にそのまま投入できる。
- V8 の最適化に沿った設計で、Node.js/Bun 向けロガーの中で最も低オーバーヘッド。
- `pino-pretty` を dev 依存に入れれば開発時の可読性も確保できる。

## packages の初期化

`bun init` 等で生成されるテンプレートには使わないフィールドやスクリプトが多く含まれる。
以下の方針で最小限に整理する。

### package.json の scripts は削除する

- モノレポ全体の開発コマンドはルートの `justfile` に集約する方針のため、各 package の `scripts` と二重管理になる。
- `justfile` 側から直接 `bun run` や `biome` を呼べば十分であり、`scripts` を経由する必要がない。

### 不要なフィールドを削除する

`name`, `version`, `type`, `dependencies`, `devDependencies` 等の実際に機能するフィールドのみ残し、以下のような不要フィールドは削除する：

- `main`, `module` — 公開パッケージでなければ不要
- `keywords`, `author`, `license` — 内部パッケージには不要
- `description` — README で十分
