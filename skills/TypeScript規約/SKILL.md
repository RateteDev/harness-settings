---
name: TypeScript規約
description: |
  TypeScriptのコードを書くとき、TSプロジェクトを立ち上げるときに従う規約。ランタイム、lint/format、ロガー、パッケージ初期化を定める。
metadata:
  user-review: false
---

# TypeScript開発規約

TypeScriptの新規作成・実装時は、以下のツールチェーンおよび設定に従ってください。

## 1. 標準ツールスタック

独自判断でのツール追加・変更は行わず、以下に統一します。

| 用途 | 採用ツール | 備考 |
|---|---|---|
| ランタイム / パッケージ管理 / バンドル | **Bun** | 全面採用 |
| Lint / Formatter | **Biome** | 依存は `@biomejs/biome` のみ、設定は `biome.json` に集約 |
| テスト | **`bun:test`** | Bun組み込み機能を使用 |
| ロガー | **Pino** | 開発用の整形ツールとして `pino-pretty` をdevDependenciesに追加 |

### 型定義の設定 (`tsconfig.json`)
`bun:test` のグローバル関数（`test`, `expect`, `describe` など）を型エラーなく扱うため、`tsconfig.json` に以下を明記してください。

```jsonc
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}
```

## 2. package.jsonの最小化ルール

`bun init` などで生成された `package.json` は、不要なフィールドを削除して最小限に保ちます。

- **`scripts` は作成しない（全削除）**: コマンド管理はルートの `justfile` に集約するため。
- **公開しないパッケージの不要フィールドを削除**:
  - `main`, `module`, `keywords`, `author`, `license` は削除する。
  - 説明文は `README.md` に記載するため、`description` も削除する。
- **残すべき必須フィールド**:
  - `name`, `version`, `type` (`"module"`), `dependencies`, `devDependencies` のみ。
