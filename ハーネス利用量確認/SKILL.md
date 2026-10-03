---
name: ハーネス利用量確認
description: Claude Code、Codex/ChatGPTまたはOpenCodeの現在のクォータ、リセット時刻、トークン使用量、推定コストを、認証情報を晒さずに確認する。
---

# Harness Usage

対象のharnessに応じたスクリプトを実行する。
データがライブのクォータかローカルの使用履歴かを報告に含める。

```sh
scripts/claude-code-usage.sh
scripts/codex-usage.sh
scripts/opencode-go-usage.sh
```

トークン、APIキー、パスワード、プロンプト、トランスクリプトを表示・保存しない。
障害調査や認証まわりの変更の前には`references/<harness>.md`を読む。
