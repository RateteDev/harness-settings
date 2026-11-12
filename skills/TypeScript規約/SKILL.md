---
name: TypeScript規約
description: |
  TypeScriptのコードを書くとき、TSプロジェクトを立ち上げるときに従う規約。ランタイム、lint/format、ロガー、パッケージ初期化を定める。
metadata:
  user-review: false
  labels: [規約]
---

# TypeScript規約

## 目的

ツール選定とプロジェクト構成を統一し、環境差分や設定の重複管理を防ぐ。

## 標準ツール

以下のツール選定に従う。特別な理由がない限り変更しない。

| 用途 | 採用ツール | 備考 |
|---|---|---|
| ランタイム / パッケージ管理 / バンドル | **Bun** | - |
| Lint / Format | **Biome** | 設定ファイルは `biome.json` のみ。依存は `@biomejs/biome` のみ追加する。 |
| テスト | **`bun:test`** | Bun組み込み機能を使用する。 |
| ロガー | **Pino** | 開発環境のログ整形用として `pino-pretty` を devDependencies に追加する。 |

## 設定ルール

### tsconfig.json

`bun:test` のグローバル型（`describe`, `test`, `expect` など）を有効化するため、以下を指定する。

```json
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}
```

### package.json

プロジェクトの設定を最小限かつ一元管理された状態に保つ。

- **`scripts` は定義しない**: コマンドの二重管理を防ぐため、開発・実行コマンドはルートの `justfile` に集約する。`bun init` 等で生成された `scripts` は削除する。
- **機能するフィールドのみ記載する**: `name`, `version`, `type`, `dependencies`, `devDependencies` などの必須項目に絞る。
- **非公開パッケージの不要なメタデータは削除する**: npm等に公開しないパッケージには、`main`, `module`, `keywords`, `author`, `license`, `description` を記載しない（説明は `README.md` に記載する）。
