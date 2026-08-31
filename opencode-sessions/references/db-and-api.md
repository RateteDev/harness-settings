# OpenCode セッションDB・API 詳細リファレンス

検証バージョン: `0.0.0-beta-18707` (V2)。スキーマは非公式のため、バージョン違いでは要確認。

## 1. DB直接アクセス

### 開き方

```sh
# 安全策: コピーしてから読む（-shm/-wal もセットで）
mkdir -p /tmp/ocdb && cp ~/.local/share/opencode/opencode.db* /tmp/ocdb/
DB="file:/tmp/ocdb/opencode.db?mode=ro"

# ライブDB直読みでも可（必ず mode=ro）
DB="file:$HOME/.local/share/opencode/opencode.db?mode=ro"

sqlite3 -header "$DB" ".tables"
```

その他のテーブル: `account, credential, event, kv, project, project_directory, workspace, worktree, permission, ...`

### セッション一覧

```sql
SELECT s.id, datetime(s.time_created/1000,'unixepoch','localtime') AS started,
       s.directory, s.title, s.parent_id,
       (SELECT count(*) FROM session_message m WHERE m.session_id=s.id) AS msgs
FROM session_v2 s ORDER BY s.time_created;
```

- `parent_id IS NOT NULL` → サブエージェント／サブタスクのセッション
- `directory` = そのセッションが起動されたcwd（フィルタの主キー）
- `time_created` / `time_updated` は**ミリ秒**

### 発言だけ抽出（user + assistantのtextパート）

```sql
WITH utt AS (
  SELECT s.directory, s.title, m.session_id, m.time_created, m.type,
         CASE m.type
           WHEN 'user' THEN m.data->>'text'
           ELSE (SELECT group_concat(je.value->>'text', char(10))
                 FROM json_each(m.data,'$.content') je
                 WHERE je.value->>'type'='text')
         END AS text
  FROM session_message m
  JOIN session_v2 s ON s.id = m.session_id
  WHERE m.type IN ('user','assistant')
    AND s.directory LIKE '%<repo名>%'
)
SELECT datetime(time_created/1000,'unixepoch','localtime') AS t,
       CASE type WHEN 'user' THEN 'USER' ELSE 'AI' END AS role,
       title, text
FROM utt
WHERE text IS NOT NULL AND trim(text) != ''
ORDER BY time_created;
```

- 「発言だけ」なら export JSON の約1/100の分量になる（例: 288KB → 2KB）
- assistantでtextパート無し（tool/reasoningのみ）の行は除外される

### 時刻フィルタの注意

- 入力する日時文字列は `'utc'` 修飾子で**ローカルタイムとして解釈**される:
  `strftime('%s','2026-08-31 18:00:00','utc')*1000`
- 表示は `datetime(ms/1000,'unixepoch','localtime')` と揃える
- **範囲外の日付はNULLになる**（例: `'9999-12-31'` → NULL → 条件が全部偽になり1行も返らない）。
  境界値は `COALESCE(strftime(...)*1000, 9223372036854775807)` のようにフォールバック必須

### 全文検索っぽいこと

```sql
-- 発言本文に特定ワードを含むセッション
SELECT DISTINCT s.id, s.title FROM session_message m
JOIN session_v2 s ON s.id = m.session_id
WHERE m.type='user' AND m.data LIKE '%キーワード%';
```

## 2. HTTP API

### 起動確認と認証

```sh
ss -tlnp | grep -E 'opencode2|bun'        # リスナー確認
opencode2 api get /api/health              # マネージドサービスは自動で認証まで処理
# → 401 (WWW-Authenticate: Basic) が返るサーバーには手動でBasic認証
curl -u "opencode:$PASSWORD" http://127.0.0.1:PORT/api/health
```

| サーバー種別 | URL/ポート | パスワードの場所 |
|---|---|---|
| マネージド（TUIと共有） | `~/.local/state/opencode/service.json` の `url` | 同ファイルの `password`（基本は `opencode2 api` に任せる） |
| 明示起動 `opencode2 serve` | 起動時の `--port` | `~/.config/opencode/serve.env` の `OPENCODE_SERVER_PASSWORD`、または `tr '\0' '\n' < /proc/<pid>/environ` |

Basic認証のユーザー名は `opencode`（空や別名は401）。

### 主要エンドポイント

| メソッド/パス | operationId | 用途 |
|---|---|---|
| `GET /api/session?limit=&order=` | v2.session.list | 一覧（デフォルト最新50） |
| `GET /api/session/{id}` | v2.session.get | 1件取得 |
| `GET /api/session/{id}/export` | v2.session.export | **トランスクリプト一括** |
| `GET /api/session/{id}/message` | v2.message.list | メッセージ一覧 |
| `GET /openapi.json` | — | 全エンドポイント定義 |

`GET /api/experimental/session/{id}/log` はイベントポインタ（`log.synced` + seq）のみで、
内容取得には使えない。

### export JSONの形

```jsonc
{ "data": {
    "info":   { "id": "ses_...", "title": "...", "directory": null, "time": {...} },
    "messages": [
      // user / synthetic
      { "type": "user", "text": "...", "metadata": { "displayText": "...", "model": {...} } },
      // assistant: content はパート配列
      { "type": "assistant", "model": {"providerID":"openai","id":"gpt-5.6-sol"},
        "content": [
          { "type": "reasoning", "text": "...", "state": {...} },
          { "type": "text", "text": "..." },
          { "type": "tool", "name": "read", "state": { "status": "completed", "input": {...}, "content": [...] } }
        ] }
    ] } }
```

- `info.directory` は null のことがある（ディレクトリは一覧API `GET /api/session` かDBで取る）
- reasoningの `state` にprovider固有の暗号化blobが含まれるため、exportは巨大になる
- ツール入力の主要キー: `path, command, pattern, description, query, url`

## 3. 同梱スクリプト

- `scripts/utts.sh` — DB直読み。`-l`一覧 / `-r`親のみ / dir部分一致 / since・until（ローカル時刻）。`OPENCODE_DB` でDB差し替え
- `scripts/export_md.py <dir>` — export JSON (`ses_*.json`) をMarkdown化（reasoningは引用、toolは1行サマリ）
