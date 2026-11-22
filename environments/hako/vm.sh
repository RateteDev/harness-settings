#!/bin/bash
# VMの中で動く。ホストの hako.ts が sbx exec で呼ぶ。
#   vm.sh install                      テンプレートを作るときに1回、開発道具とハーネスを入れる
#   vm.sh turn <ハーネス> <プロンプト>  設定を反映してから、ハーネスの非対話の1ターンを動かす
# ハーネスを足すときは、<名前>_setup と <名前>_run の2つの関数を足す。
set -euo pipefail
hako_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ホストは global/ と environments/hako/ を、リポジトリと同じ並びで写す。
repo_dir="$(cd "$hako_dir/../.." && pwd)"

install() {
  echo "== cc"
  # Rust はリンクにCのコンパイラを使うが、shell の土台には入っていない。
  sudo apt-get update -qq
  sudo apt-get install -y -qq build-essential >/dev/null

  echo "== bun"
  curl -fsSL https://bun.sh/install | bash >/dev/null

  echo "== rust"
  # 既定の構成はHTMLの説明書（約1GB）を含み、VMの中では読まないため、最小の構成に整形と静的検査だけを足す。
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component rustfmt,clippy >/dev/null 2>&1

  # sbx exec はログインシェルを通さない。sbx の土台は、どの bash からもこのファイルを読むようにしてある。
  # shellcheck disable=SC2016 # $HOME と $PATH は、読まれるときに展開させる。
  local line='export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"'
  grep -qxF "$line" /etc/sandbox-persistent.sh || echo "$line" | sudo tee -a /etc/sandbox-persistent.sh >/dev/null

  echo "== claude"
  # Docker の claude-mixin は使わない。追加部品が認証を引き受け、sbx に登録した鍵（CLAUDE_CODE_OAUTH_TOKEN）が効かなくなるため。
  # Codex と Playwright は、hako.ts の kits に書いた追加部品で入る。
  curl -fsSL https://claude.ai/install.sh | bash >/dev/null
}

# 行動規範の後ろに、環境の事情と Itoguchi での会話の仕方を足したもの。どのハーネスにも同じものを渡す。
instructions() {
  cat "$repo_dir/global/AGENTS.md" "$hako_dir/instructions.md"
}

claude_setup() {
  mkdir -p ~/.claude
  instructions > ~/.claude/CLAUDE.md
  # 消したスキルも反映されるよう、丸ごと置き換える。
  rm -rf ~/.claude/skills
  cp -r "$repo_dir/global/skills" ~/.claude/skills
  # attribution: Claude Code 本体がコミットと PR に帰属表記を付けるよう誘導するのを止める。
  # includeGitInstructions: システムプロンプトの commit と PR の手順を外す。コミット規約スキルと食い違うと規約を優先させたいため。
  # syncClaudeAi*: claude.ai に置いたスキルとプラグインを取り込まず、スキルはこのリポジトリのものだけにする。
  # deny: 呼ばれたことは連携サーバーが新しいターンとして届ける。ターンの中で待つと、プロセスが終わらずVMが止まらない。
  cat > ~/.claude/settings.json <<'JSON'
{
  "attribution": false,
  "includeGitInstructions": false,
  "syncClaudeAiSkills": false,
  "syncClaudeAiPlugins": false,
  "permissions": { "deny": ["mcp__itoguchi__wait_for_events"] }
}
JSON
  # 見出しの ${ITOGUCHI_TOKEN} は、書き込むときではなく Claude Code が接続するときに展開させる。
  # VMの環境変数には代わりの値が入っていて、sbx の中継が itoguchi.ratete.dev への要求のときだけ本物に差し替える。
  [ -f ~/.claude.json ] || echo '{}' > ~/.claude.json
  # shellcheck disable=SC2016 # ${ITOGUCHI_TOKEN} は jq の文字列としてそのまま書く。
  jq '.mcpServers.itoguchi = {type: "http", url: "https://itoguchi.ratete.dev/mcp", headers: {Authorization: "Bearer ${ITOGUCHI_TOKEN}"}}' \
    ~/.claude.json > ~/.claude.json.tmp
  mv ~/.claude.json.tmp ~/.claude.json
}

claude_run() {
  local id_file="$HAKO_STATE/session-id" id
  # VMの中で権限の確認を待つと、非対話では誰も答えられず止まる。
  local args=(-p --output-format stream-json --verbose --permission-mode bypassPermissions)
  # プロンプトが「-」で始まっても（箇条書きなど）、claude のオプションと読まれないよう -- で区切る。
  if [ -f "$id_file" ]; then
    claude "${args[@]}" --resume "$(cat "$id_file")" -- "$1"
    return
  fi
  id="$(cat /proc/sys/kernel/random/uuid)"
  claude "${args[@]}" --session-id "$id" -- "$1"
  # 会話を始められたときだけIDを残し、失敗したときは次のターンでもう一度始める。
  echo "$id" > "$id_file"
}

codex_setup() {
  # 追加部品が置いた sbx の案内（VMの使い方）は残し、その後ろに足す。2回目からは、取っておいた元の案内に足し直す。
  local agents="$HOME/.codex/AGENTS.md"
  [ -f "$agents.sbx" ] || cp "$agents" "$agents.sbx"
  { cat "$agents.sbx"; instructions; } > "$agents"
  # 鍵は環境変数の代わりの値を読ませ、sbx の中継に本物へ差し替えさせる。
  codex mcp get itoguchi >/dev/null 2>&1 ||
    codex mcp add itoguchi --url https://itoguchi.ratete.dev/mcp --bearer-token-env-var ITOGUCHI_TOKEN >/dev/null
}

codex_run() {
  # 認証は、ホストで sbx secret set openai --oauth を済ませておく。作業場所は Git のリポジトリとは限らない。
  if [ -f "$HAKO_STATE/started" ]; then
    codex exec --skip-git-repo-check resume --last -- "$1"
    return
  fi
  codex exec --skip-git-repo-check -- "$1"
  touch "$HAKO_STATE/started"
}

# 記録は ~/.hako/state/<ハーネス>/ に残し、失敗したときは末尾を標準エラーへ出す。
turn() {
  local harness="${1:?ハーネスを指定してください}" prompt="${2:?プロンプトを指定してください}" code
  declare -F "${harness}_run" >/dev/null || { echo "知らないハーネスです: $harness" >&2; exit 2; }
  : "${ITOGUCHI_TOKEN:?ITOGUCHI_TOKEN がありません。ホストで sbx secret set-custom --host itoguchi.ratete.dev --env ITOGUCHI_TOKEN を登録してください}"
  export HAKO_STATE="$HOME/.hako/state/$harness"
  mkdir -p "$HAKO_STATE" ~/workspace
  cd ~/workspace

  # 関数を条件の中で呼ぶと、途中の失敗で止まらなくなるため、条件の外でサブシェルとして動かす。
  set +e
  ( set -e; "${harness}_setup" ) > "$HAKO_STATE/setup.log" 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "設定を反映できませんでした:" >&2
    tail -n 5 "$HAKO_STATE/setup.log" >&2
    exit 1
  fi
  echo "--- turn $(date -Is)" >> "$HAKO_STATE/session.log"
  ( set -e; "${harness}_run" "$prompt" ) >> "$HAKO_STATE/session.log" 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "ハーネスが終了コード $code で終わりました:" >&2
    tail -n 5 "$HAKO_STATE/session.log" | cut -c1-500 >&2
  fi
  exit "$code"
}

case "${1:-}" in
  install) install ;;
  turn) turn "${2:-}" "${3:-}" ;;
  *) echo "使い方: vm.sh install | vm.sh turn <ハーネス> <プロンプト>" >&2; exit 2 ;;
esac
