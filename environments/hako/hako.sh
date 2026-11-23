#!/bin/bash
# VMの中に hako という名前で置かれる。
#   hako turn <ハーネス> <プロンプト>   ハーネスを非対話で1ターン動かす。ホストの hako.ts が呼ぶ
#   hako later --after 30m <プロンプト>   時間が過ぎたら、このVMで次のターンを始める。エージェントが呼ぶ
#   hako later --when '<コマンド>' [--every 5m] <プロンプト>   コマンドが成功したら始める
set -euo pipefail

usage() {
  sed -n '3,5s/^# *//p' "$0" >&2
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

later() {
  local after="" when="" every=5m duration='^[0-9]+[smhd]?$'
  while [[ ${1-} == --* ]]; do
    [[ $# -ge 2 ]] || usage
    case $1 in
      --after) after=$2 ;;
      --when) when=$2 ;;
      --every) every=$2 ;;
      *) usage ;;
    esac
    shift 2
  done
  [[ $# -eq 1 && -n $after$when && $every =~ $duration ]] || usage
  [[ -z $after || $after =~ $duration ]] || usage
  : "${HAKO_HARNESS:?hako later は、hako turn で始まったターンの中から呼ぶ}"
  # ターンが終わっても待ち続けるよう、端末とプロセスグループから切り離す。
  AFTER=$after WHEN=$when EVERY=$every PROMPT=$1 setsid nohup "$0" wait >>~/.hako-later.log 2>&1 </dev/null &
  echo "予約しました。"
}

case ${1-} in
  turn) [[ $# -eq 3 ]] || usage; turn "$2" "$3" ;;
  later) shift; later "$@" ;;
  wait)
    after=$AFTER when=$WHEN every=$EVERY prompt=$PROMPT
    # shellcheck disable=SC1090
    source ~/.hako-env
    export HAKO_WAIT=1
    [[ -z $after ]] || sleep "$after"
    [[ -z $when ]] || until bash -c "$when"; do sleep "$every"; done
    turn "$HAKO_HARNESS" "hako later で予約していたターンです。予約のときに渡した文: $prompt"
    ;;
  *) usage ;;
esac
