---
name: api-mcp-convention
description: |
  API・MCPサーバーなどバックエンドを外部公開する際の共通規約スキル。認証・エラー設計・命名・スキーマ・バージョニング等の規約を定める。
  TRIGGER when: REST/GraphQL API や MCP サーバーを新規作成・改修する場合、外部公開インターフェースの設計を行う場合。
---

# api-mcp-convention

API（REST/GraphQL等）および MCP サーバーを実装する際は、以下の共通規約に従うこと。

## Schema Definition

- すべてのエンドポイント・ツールに対して input / output スキーマを必ず定義する
- スキーマは単一の真実源（e.g. zod）から型・バリデーション・ドキュメントを派生させる
- `optional`（省略可）と `nullable`（null許容）を明確に区別する
- 各フィールドには `description` と `example` を付与する

## Common Error Handling

- レスポンス形式は **Google API Design Guide ライク**
- 成功時はリソースを直返し、エラー時のみ `error` でラップする
- HTTPステータスはレスポンス側で表現し、ボディには含めない
- エラー定義は1ヶ所に集約し、`code`（独自エラーID）/ `message` の2フィールドで統一する

成功例:

```json
{ "id": "u_123", "email": "alice@example.com" }
```

エラー例:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with id 'u_123' was not found."
  }
}
```

## Null / Empty String

- `null` および `""`（空文字）の扱いはフィールド単位で適切に決める
- 厳密にすべきフィールドは reject し、許容すべきフィールドはスキーマで明示的に許可する
- 暗黙の同一視（`null` ≒ `""` ≒ 省略）はしない

## Strict Input Validation

- 入力は **厳格モード** で検証し、以下は即座にエラーで弾く
    - 同一フィールドの重複指定
    - スキーマで定義されていない未サポートフィールド（`additionalProperties: false` 相当）
- 「寛容に受け入れる」よりも「明示的に拒否」を優先する

## Naming

- JSONフィールド: `camelCase`
- URLパス: `kebab-case` + 複数形リソース（例: `/user-profiles/{id}`）
- URLに動詞を含めず、HTTPメソッドで表現する（`POST /users` ⭕ / `POST /createUser` ❌）
- MCPツール名: `snake_case` の `動詞_対象` 形式（例: `create_user`, `list_orders`）

## Datetime / ID

- 時刻は `ISO8601` の UTC + ミリ秒 + `Z` サフィックスに統一する（例: `2026-05-20T01:12:00.000Z`）
- サーバー側は常にUTCで保持・送信し、表示時にクライアントで変換する
- ID は **UUID v7** を採用する
    - 公開IDはプレフィックス付き推奨（例: `u_01HQXY...`, `ord_01HQXY...`）
    - 用途によっては UUID v7 をそのまま出してもよい
- 連番ID（`1, 2, 3`）は採用しない

## Pagination

- **カーソル方式に統一**（オフセット方式は採用しない）
- レスポンス形式: `{ "items": [...], "nextPageToken": "..." }`
- 次ページが無い場合は `nextPageToken` を省略する
- `pageSize` クエリパラメータでサイズ指定可、サーバー側で上限を設ける（例: max 100）

## Versioning

- **HTTP API**: URLパスでバージョン管理する（`/v1/users`）
    - 破壊的変更時は `v2` を新設し、`v1` は非推奨期間を設けて維持する
    - 非破壊的変更（フィールド追加など）ではバージョンを上げない
- **MCP**: 基本的にバージョン管理を行わない
