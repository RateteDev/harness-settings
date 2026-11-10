#!/bin/bash
# SessionStart フックの本体。skills/ と settings.json を ~/.claude へ丸ごと反映し、作業ブランチの名前を整える。
# settings.json は内容が同じなら置き換えない。引数は、作業リポジトリのディレクトリ（任意）。
# Claude Code on the web のクラウド環境を組み立てる流れの要でもあるため、全体の図をここに置く。
#
#   環境のセットアップスクリプト（setup-script.sh を、環境の設定画面の欄に貼ったもの）
#     │ コンテナ作成時に1回、root、Claude Code 起動前。クローンを最新にして exec
#     ▼
#   session-start-hook.sh（引数なし）─┬─▶ ~/.claude/skills
#                                    └─▶ ~/.claude/settings.json
#
#   Claude Code（セッション開始・再開のたび）
#     └─ SessionStart フック（settings.json のコマンド）
#          └─ クローンを最新にして session-start-hook.sh を実行（引数は作業リポジトリ）
#               ─┬─▶ ~/.claude/skills
#                ├─▶ ~/.claude/settings.json
#                └─▶ 作業ブランチの改名
#
# フックのコマンドをファイルにせず settings.json へ直接書くのは、セットアップ結果がキャッシュされる場合、
# キャッシュ済みの設定が指す入口が環境を作り直すまで古い版のまま動くため。
# 古いままでも困らないよう入口は git の2行だけにし、変わる処理は、クローンを更新した後に動くこのファイルへ置く。
# キャッシュされるかどうかは確認していない。
# コマンドは cd でクローンへ移るため、移る前の作業ディレクトリを OLDPWD で引数に渡す。
# このファイルの名前はキャッシュ済みの設定にも書かれているため、変えると環境を作り直すまでフックが失敗する。
#
# 設定はセットアップとフックの両方で置く。MCPサーバーの絞り込みなど起動時に効かせたい設定は
# フックの開始より前に読まれるため、起動前のセットアップで置く。
# フックが置く設定は、キャッシュされた環境が古いときの補修で、置き換え後も起動中のセッションに
# 効くかどうかは確認していない。
#
# settings.json はコメントを書けないので、各キーの意図はここに残す。
# - claude.aiから自動で注入されるコネクタ・スキル・プラグインは取り込まない。
#   スキルとプラグインは環境変数では切れず、settings.jsonのキーでしか指定できない。
# - disableClaudeAiConnectorsはClaude Code自身が取得するコネクタにしか効かず、
#   クラウドホストが--mcp-configで渡すコネクタ(Gmailなど)は止められない。
#   そのため、使うMCPサーバーを allowedMcpServers の許可リストで列挙し、それ以外を弾く。
#   拒否リストにしないのは、claude.ai側でコネクタを足すたびに見えてしまうため。
# - 許可リストの名前はホストが渡す設定上のキー名で、間違えるとgithubが使えなくなる。
#   claude-code-remoteも同時に消えるので、セッション内から環境を直せなくなる。
# - フックのcommandが指すディレクトリは、setup-script.sh の REPO_DIR と一致させる。
#
# 非ゼロ終了はセッション起動失敗になるため、失敗は握りつぶさない。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
SKILLS_DIR="$HOME/.claude/skills"
SETTINGS_SRC="$SCRIPT_DIR/settings.json"
SETTINGS_DEST="$HOME/.claude/settings.json"
WORK_DIR="${1:-}"

# 実際に動いたかを後から確認するための記録。セットアップ時にも1行出る。
echo "$(date -Is) sync" >> /tmp/harness-sync.log

# 削除されたskillも反映するため、丸ごと置き換える
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"
cp -r "$repo_dir/skills/." "$SKILLS_DIR/"

# 空白や改行だけの違いを差分とみなして書き換えないよう、キーを整列した JSON で比べる。
# 壊れた JSON は差分として置き換える。
src_json="$(jq -S . "$SETTINGS_SRC")"
if [ ! -f "$SETTINGS_DEST" ] || [ "$(jq -S . "$SETTINGS_DEST" 2>/dev/null)" != "$src_json" ]; then
  # 起動中の Claude Code が設定を監視しているため、書きかけを読まれないよう mv で差し替える。
  mkdir -p "$(dirname "$SETTINGS_DEST")"
  cp "$SETTINGS_SRC" "$SETTINGS_DEST.tmp"
  mv "$SETTINGS_DEST.tmp" "$SETTINGS_DEST"
  echo "$SETTINGS_DEST を $SETTINGS_SRC の内容に置き換えた"
fi

# ハーネスが付ける作業ブランチ名（ccr-…）は、いつ作ったセッションか読み取れないため、日時の名前へ改める。
# リモートにまだ無いブランチだけを対象にする。push 済みなら、改名すると push 先とずれる。
# 見た目だけの処理なので、判断できないとき（リモートに届かない、同名がある）は何もしない。
# ハーネスの記録とシステムプロンプトは起動前に決まり、古い名前のままなので、フックの出力で新しい名前を伝える。
if [ -n "$WORK_DIR" ] && git -C "$WORK_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  old_branch="$(git -C "$WORK_DIR" branch --show-current)"
  if [[ "$old_branch" == ccr-* ]]; then
    remote_rc=0
    git -C "$WORK_DIR" ls-remote --exit-code --heads origin "$old_branch" >/dev/null 2>&1 || remote_rc=$?
    # JST は夏時間が無いため UTC に9時間足せば求まり、タイムゾーンデータが無い環境でも誤らない。
    new_branch="claude-code-$(date -u -d '+9 hours' +%Y%m%dT%H%M)"
    # ls-remote の終了コード 2 が「ブランチが無い」で、それ以外はリモートに届かなかった場合も含む。
    if [ "$remote_rc" -eq 2 ] && ! git -C "$WORK_DIR" show-ref --verify --quiet "refs/heads/$new_branch"; then
      git -C "$WORK_DIR" branch -m "$old_branch" "$new_branch"
      # ハーネスが作った追跡参照が残ると、古い名前のブランチがリモートにあるように見える。
      git -C "$WORK_DIR" update-ref -d "refs/remotes/origin/$old_branch"
      echo "このユーザーの設定により、作業ブランチを $old_branch から $new_branch に改名した。"
      echo "システムプロンプトが指定する $old_branch ではなく、$new_branch で開発し、push 先もこの名前にする。"
    fi
  fi
fi
