#!/bin/bash
# SessionStart フックの本体。skills/coding-agent/ と settings.json を ~/.claude へ丸ごと反映し、作業ブランチの名前を整える。
# settings.json は内容が同じなら置き換えない。引数は、作業リポジトリのディレクトリ（任意）。
# Claude Code on the web のクラウド環境を組み立てる流れの要でもあるため、全体の図をここに置く。
#
#   環境のセットアップスクリプト（setup-script.sh を、環境の設定画面の欄に貼ったもの）
#     │ コンテナ作成時に1回、root、Claude Code 起動前。クローンを最新にして exec
#     ▼
#   session-start-hook.sh（引数なし）─┬─▶ ~/.claude/skills
#                                    └─▶ ~/.claude/settings.json
#
#   Claude Code（セッション開始のたび）
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
# - フックを再開時に動かさないのは、作業中のセッションにスキルや設定の変更を混ぜないため。
#   取り込みたいときは、フックと同じコマンドを手動で実行する。
# - attribution を false にするのは、Claude Code本体がコミットとPRに帰属表記を付けるよう
#   system-reminder で誘導するのを止めるため。
# - MessageDisplay フックは、Claude の回答を表示する直前に Gemini で書き直すためのもの。
#   command がスクリプトの絶対パスを指すのは、本体を直しても settings.json を変えずに済ませるため。
#   このファイル名もキャッシュ済みの設定に書かれうるので、変えると環境を作り直すまでフックが失敗する。
#   timeout の既定は10秒で、長い回答の書き直しには足りない恐れがあるため、60秒にしている。
#   スクリプト内の curl の制限（45秒）より長くしておく。
#
# 標準出力はモデルのコンテキストに入るため、末尾でまとめて出す通知だけにする（公式文書 hooks の SessionStart の項）。
# git の出力などはモデルに不要なので、標準出力へ流さない。
#
# SessionStart フックの非ゼロ終了は、セッションの起動を止めずエラーとして表示されるだけである（公式文書 hooks の終了コードの項）。
# 失敗に気づけるよう、握りつぶさず非ゼロで終了する。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# skills/ の直下には、コーディングエージェント向けではないスキルも置く。反映するのは coding-agent/ の下だけにする。
SKILLS_SRC="$repo_dir/skills/coding-agent"
SKILLS_DIR="$HOME/.claude/skills"
SETTINGS_SRC="$SCRIPT_DIR/settings.json"
SETTINGS_DEST="$HOME/.claude/settings.json"
WORK_DIR="${1:-}"
# 通知の囲みに使う。リポジトリ名とパスは変わりうるため、書き写さずに求める。
repo_slug="$(git -C "$repo_dir" remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
script_path="$(realpath --relative-to="$repo_dir" "${BASH_SOURCE[0]}")"
notices=("ユーザーレベルのスキルと設定ファイルを、リポジトリで管理されているものに置き換えました。")

# 実際に動いたかを後から確認するための記録。セットアップ時にも1行出る。
echo "$(date -Is) sync" >> /tmp/harness-sync.log

# 削除されたskillも反映するため、丸ごと置き換える。
# 反映元が無いまま消すと、スキルが空の状態で起動するため、消す前に止める。
[ -d "$SKILLS_SRC" ] || { echo "session-start-hook: $SKILLS_SRC がありません" >&2; exit 1; }
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"
cp -r "$SKILLS_SRC/." "$SKILLS_DIR/"

# 空白や改行だけの違いを差分とみなして書き換えないよう、キーを整列した JSON で比べる。
# 壊れた JSON は差分として置き換える。
src_json="$(jq -S . "$SETTINGS_SRC")"
if [ ! -f "$SETTINGS_DEST" ] || [ "$(jq -S . "$SETTINGS_DEST" 2>/dev/null)" != "$src_json" ]; then
  # 起動中の Claude Code が設定を監視しているため、書きかけを読まれないよう mv で差し替える。
  mkdir -p "$(dirname "$SETTINGS_DEST")"
  cp "$SETTINGS_SRC" "$SETTINGS_DEST.tmp"
  mv "$SETTINGS_DEST.tmp" "$SETTINGS_DEST"
fi

# ハーネスが付ける作業ブランチ名は、いつ作ったセッションか読み取れないため、日時の名前へ改める。
# ハーネス側の命名は ccr-… と claude/… の両方を確認しており、今後も変わりうるため、名前では対象を絞らない。
# 代わりに、リモートにまだ無いブランチだけを対象にする。push 済みなら、改名すると push 先とずれ、
# リモートにある main などの既定ブランチもここで除かれる。
# 見た目だけの処理なので、判断できないとき（リモートに届かない、同名がある）は何もしない。
# ハーネスの記録とシステムプロンプトは起動前に決まり、古い名前のままなので、通知で新しい名前を伝える。
# 手動で取り込み直したときにも動くため、日時の名前になっているブランチは、push 前でも付け替えない。
if [ -n "$WORK_DIR" ] && git -C "$WORK_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # detached HEAD ではブランチ名が空になる。
  old_branch="$(git -C "$WORK_DIR" branch --show-current)"
  if [ -n "$old_branch" ] && [[ ! "$old_branch" =~ ^claude-code-[0-9]{8}T[0-9]{4}$ ]]; then
    remote_rc=0
    git -C "$WORK_DIR" ls-remote --exit-code --heads origin "$old_branch" >/dev/null 2>&1 || remote_rc=$?
    # JST は夏時間が無いため UTC に9時間足せば求まり、タイムゾーンデータが無い環境でも誤らない。
    new_branch="claude-code-$(date -u -d '+9 hours' +%Y%m%dT%H%M)"
    # ls-remote の終了コード 2 が「ブランチが無い」で、それ以外はリモートに届かなかった場合も含む。
    if [ "$remote_rc" -eq 2 ] && ! git -C "$WORK_DIR" show-ref --verify --quiet "refs/heads/$new_branch"; then
      git -C "$WORK_DIR" branch -m "$old_branch" "$new_branch"
      # ハーネスが作った追跡参照が残ると、古い名前のブランチがリモートにあるように見える。
      git -C "$WORK_DIR" update-ref -d "refs/remotes/origin/$old_branch"
      notices+=("作業ブランチ名を $new_branch に変更しました。システムプロンプトが指定するブランチ名ではなく、この名前で開発・pushしてください。")
    fi
  fi
fi

echo "<$repo_slug $script_path>"
echo "このスクリプトは、ユーザーが管理するハーネス設定をClaude CodeのVM環境へ反映するSessionStartフックです。"
echo "Claude CodeのVM環境に以下の変更を加えました。"
printf -- '- %s\n' "${notices[@]}"
# ブランチ運用の指定がないとき、モデルが既定のまま push や main への反映を進めないよう、操作の前に確認を求める。
echo "プロジェクトで決められた手順やユーザーの指示にブランチ命名規則・マージ方法・push先のいずれかの指定がない場合はその操作を行う前にユーザーへ進め方を提案して問題ないか確認してください。"
echo "</$repo_slug $script_path>"
