---
name: ハーネス利用量確認
description: Claude Code、Codex/ChatGPTまたはOpenCodeの現在のクォータ、リセット時刻、トークン使用量、推定コストを、認証情報を晒さずに確認する。残りの利用枠や使用量、コストを尋ねられたときに使う。
metadata:
  user-review: false
  labels: [使い方]
---

# ハーネス利用量確認

## このスキルの目的

クォータやコストは作業が止まる前に把握したいが、確認のためとはいえ認証情報へ触れるのは避けたい。
ハーネスごとのスクリプトで利用状況を取得し、秘密値を露出させずに報告できるようにする。

## あるべき状態

- 利用状況は、対象ハーネスのスクリプトで取得されている。
- 報告には、データがライブのクォータかローカルの使用履歴かが明記されている。
- トークン、APIキー、パスワード、プロンプト、トランスクリプトは、表示もファイルへの保存もされず、スクリプトの中だけで扱われている。
- 認証の更新に必要な操作は、秘密値をチャットで受け取らず、ユーザー自身のログインやスクリプトの対話入力で行われている。

## 手段

| ハーネス | スクリプト | 障害調査・認証変更の前に読む文書 |
|---|---|---|
| Claude Code | `scripts/claude-code-usage.sh` | [references/claude-code.md](references/claude-code.md) |
| Codex / ChatGPT | `scripts/codex-usage.sh` | [references/codex.md](references/codex.md) |
| OpenCode Go | `scripts/opencode-go-usage.sh` | [references/opencode.md](references/opencode.md) |

各文書には、スクリプトが呼ぶ非公開エンドポイント、認証情報の扱い、出力の読み方がある。
