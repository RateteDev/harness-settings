---
name: OpenCode Sessions
description: Find, filter, and export past OpenCode session transcripts (conversation history) from the local SQLite DB or HTTP API. Use when the user asks about past, previous, or other sessions, transcripts, chat history, prompts and replies, or session logs, including filtering by project directory (cwd) or time range.
---

# OpenCode セッション検索・エクスポート

過去のOpenCodeセッション（会話履歴・トランスクリプト）を探して取り出す手順。
データはユーザー単位で1つのSQLite DBに集約されている。

## 絶対ルール

1. **DBは必ず読み取り専用で開く**: URIに `?mode=ro` を付ける。稼働中サーバーが常時書き込んでいるため、書き込みは絶対しない。確実にやるなら先に `~/.local/share/opencode/opencode.db*`（-shm/-wal込み）をコピーしてコピー側を読む。
2. スキーマ（`session_v2` など）は**非公式**。beta版で変わる可能性がある。ツールとして継続利用するならAPI側が安定。
3. 認証情報（パスワード）を成果物に書き込まない。

## データの場所

- DB: `~/.local/share/opencode/opencode.db`（WALモード。環境変数 `OPENCODE_DB` で上書き可）
- 主要テーブル:
  - `session_v2` — セッション。`id, project_id, parent_id, directory, title, time_created(ms), cost, tokens_*`
  - `session_message` — メッセージ。`id, session_id, type('user'|'assistant'|'synthetic'), seq, time_created(ms), data(JSON)`
- `data` の中身はAPIのexportと同じJSON形:
  - user: トップレベル `text`（表示用は `$.metadata.displayText`）
  - assistant: `$.content[]` に `type: 'reasoning' | 'text' | 'tool'` のパート配列。**textパートを持たない（tool/reasoningのみの）メッセージがある**

## ワークフロー

**1. セッションを探す** — 一覧表示（cwd・時刻でフィルタ可）:

```sh
scripts/utts.sh -l                         # 全セッション
scripts/utts.sh -l -r myrepo               # -r は親セッションのみ（サブエージェント除外）
scripts/utts.sh -l myrepo '2026-08-31 17:00' '2026-08-31 21:00'
```

**2. 発言（ユーザー発言＋アシスタントの文章）だけ拾う** — DB直読みが最速:

```sh
scripts/utts.sh myrepo                     # ディレクトリ部分一致の全発言
scripts/utts.sh myrepo '2026-08-31 18:00'  # 以降の発言（入力時刻はローカルタイム扱い）
OPENCODE_DB=/tmp/copy.db scripts/utts.sh   # コピーDBを指定する場合
```

**3. 完全なトランスクリプト（ツール入出力・reasoning込み）が必要なら** API exportを使う:

```sh
mkdir -p out && opencode2 api get "/api/session/<ses_id>/export" > out/<ses_id>.json
python3 scripts/export_md.py out           # 読みやすいMarkdownに変換
```

API exportは1セッション数百KBになる（reasoningの暗号化blob等を含む）。発言だけなら utts.sh / DB直が軽い。

## APIを使う場合

- 一覧: `GET /api/session`（`?limit=` / `?order=asc|desc`。デフォルトは最新50件）
- エクスポート: `GET /api/session/{id}/export` → `{"info":{...},"messages":[...]}`
- エンドポイント一覧は稼働中サーバーの `/openapi.json` を見る（`/api/experimental/session/{id}/log` はポインタのみで中身は取れない）
- 認証: `opencode2 api ...` はマネージドサービス（`~/.local/state/opencode/service.json` の url/password）を自動処理する。**明示起動されたサーバー**（`opencode2 serve --port NNNN`）はBasic認証が必要で、ユーザー名 `opencode`、パスワードは `~/.config/opencode/serve.env` の `OPENCODE_SERVER_PASSWORD` か、当該プロセスの環境変数（`tr '\0' '\n' < /proc/<pid>/environ | grep OPENCODE_SERVER`）。
- サーバーが動いているか: `ss -tlnp | grep opencode2`。401が返ったら認証要。

## 詳細

- 実行例・生SQL・export形式の詳細は `references/db-and-api.md` を読むこと。
