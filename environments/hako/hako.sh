#!/bin/bash
# VMの中に hako という名前で置かれる。
#   hako turn <ハーネス> <プロンプト>   ハーネスを非対話で1ターン動かす。ホストの hako.ts が呼ぶ
#   hako later <コマンド> <プロンプト>   コマンドが終わったら、このVMで次のターンを始める。PIDを返す。later-mcp.ts が呼ぶ
set -euo pipefail

usage() {
  sed -n '3,4s/^# *//p' "$0" >&2
  exit 2
}

turn() {
  local harness=$1 prompt=$2 cmd
  case $harness in
    # 直近の会話があれば続ける。
    claude) cmd=(claude -p --continue --permission-mode bypassPermissions --system-prompt-file ~/.claude/system-prompt.md --) ;;
    *) echo "知らないハーネスです: $harness" >&2; exit 2 ;;
  esac
  export HAKO_HARNESS=$harness
  # ハーネスは子プロセスへ認証の環境変数を渡さないため、予約のターンが使えるように残しておく。
  [[ -n ${HAKO_WAIT-} ]] || (umask 077 && export -p >~/.hako-env)
  cd ~/workspace
  # 呼ばれたターンと予約のターンが同じ会話を同時に書き換えないよう、1つずつ動かす。
  # 標準入力を閉じないと、ハーネスが追加の入力を待つ。
  exec flock ~/.hako-turn.lock "${cmd[@]}" "$prompt" </dev/null
}

[[ $# -eq 3 ]] || usage
case $1 in
  turn) turn "$2" "$3" ;;
  later)
    # ターンが終わっても待ち続けるよう、端末とプロセスグループから切り離す。
    setsid nohup "$0" wait "$2" "$3" >>~/.hako-later.log 2>&1 </dev/null &
    echo $!
    ;;
  wait)
    # shellcheck disable=SC1090
    source ~/.hako-env
    export HAKO_WAIT=1
    # kill <PID> だけで、待っているコマンドごと止まるようにする。bash は子を待つ間シグナルを処理しないため、後ろで動かして wait する。
    trap 'trap - TERM; kill 0' TERM
    code=0
    bash -c "$2" &
    wait $! || code=$?
    turn "$HAKO_HARNESS" "[hako later] cmd=${2@Q} exit=$code"$'\n'"$3"
    ;;
  *) usage ;;
esac
