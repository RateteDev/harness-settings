#!/bin/bash
# MessageDisplay フックの本体。Claude の回答を、画面に出す直前に Gemini で読みやすい日本語へ書き直す。
# 置き換わるのは画面の表示だけで、会話の履歴と Claude が読む文面は原文のまま（公式文書 hooks の MessageDisplay の項）。
#
# 回答は複数のバッチに分かれて届く。バッチごとに書き直すと、文脈の切れた断片を直すことになるため、
# 途中のバッチは空文字で置き換えて隠し、一時ファイルへ溜める。final のバッチで全文を Gemini へ渡し、結果をまとめて表示する。
# そのため、回答の表示は書き直しが終わるまで待たされる。
#
# 途中を隠している以上、final が届かなければその回答の本文は画面に出ない。
# - 生成中に中断した（Esc、通信エラーなど）とき。原文は verbose モードで読める。
# - このフックが settings.json の timeout で打ち切られたとき。
#   そうならないよう、curl の制限時間を timeout より短くし、時間切れでも溜めた原文を返せるようにしている。
# 中断したとき、溜めた一時ファイルは残る。環境が使い捨てなので掃除しない。
#
# 書き直しに失敗したときは、溜めた原文の全体を表示する。理由はログにだけ残し、画面には出さない。
# 書き直しに成功したときだけ、末尾に注記を付ける。注記の有無で、見ているのが書き直しか原文か分かる。
# 注記には、その書き直し1回分の Gemini の費用も添える。Claude 側の費用は含まない。
#
# 短い回答は書き直さず、原文のまま表示する。ツール呼び出しの前の途中発言まで書き直すと、待たされるうえに呼び出しも増えるため。
# 途中発言と最終回答を区別する項目は、このフックの入力に無い。
# フックの実行中は、transcript にも現在のメッセージがまだ書かれず、そこからも判別できない（実測で、3秒待っても書かれなかった）。
# そこで長さで代用する。読みづらい回答は長くなりがち、という判断に基づく。
# 1セッションの実測では、途中発言は127文字以下、最終回答は377文字以上で、300文字でちょうど分かれた。標本は1セッションのため、外れることはありうる。
# 外れても、長い途中発言が書き直されるだけで、短い最終回答は原文のまま読める。
# 短い回答も、メッセージの終わりまで画面に出ない。途中のバッチの時点では、最終的な長さが分からないため。
#
# 出力の形を JSON（構造化出力）に固定するのは、平文だと前置きやコードフェンスの囲みが混ざることがあるため。
# skills の gemini-rewrite.ts が、その混入を取り除く処理を持っている。
#
# 必須: 環境変数 GEMINI_API_KEY。無いときは書き直さず、原文を表示してログに残す。
# モデルは版を固定する。別名は新しい版が出ると黙って切り替わり、結果を後から再現できなくなるため。
# skills の gemini-rewrite.ts とは用途（文書の推敲と、会話の回答の書き直し）が違うので、モデルは別に持つ。
set -u

STATE_DIR=/tmp/message-display-hook
LOG=/tmp/message-display-hook.log
MODEL=gemini-3.8-flash
# 100万トークンあたりの米ドル。API の応答には料金が含まれないため、モデルとセットで持つ。
# MODEL を変えるときは、料金表（ai.google.dev/gemini-api/docs/pricing）に合わせて両方を直す。
# この値は2026年12月31日までの導入価格で、2027年1月1日から入力1.50・出力7.50になる。
PRICE_IN_PER_M=0.75
PRICE_OUT_PER_M=3.75
ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent"
# settings.json の timeout（60秒）より短くする。
MAX_TIME=45
NOTE_LABEL='Geminiによる書き直し'
# これ未満の文字数の回答は書き直さない。
MIN_CHARS=300

SYSTEM_PROMPT='次の文章はAIコーディングエージェントがユーザー宛に書いた回答です。
読みやすい文章になるように意味は残したままで表現を直してください。
読みやすくするために順序・構造・用語・表現方法は大きく変えて問題ありません。
レポジトリでの用語・コマンド例など編集によって意味の取り違えや実行ミスに繋がるものは触れないようにします。
前置きや説明は付けず直した文章だけを出力。
ヒント：GFM（GitHub Flavored Markdown）の仕様にある記法はプレビューされます。表・見出し・太字・コード・引用など、使用できる記法を最大限活用してください。
GFMの仕様にない記法は描画されないため使わないでください（Mermaid、> [!NOTE] のようなアラート記法など）。
箇条書きは入れ子にしないでください。階層が必要な内容は、見出しや表で表します。'

SCHEMA='{"type":"object","properties":{"text":{"type":"string","description":"書き直した文章だけ。前置きや説明を含めない。"}},"required":["text"]}'

input=$(cat)
mid=$(jq -er .message_id <<<"$input") || { echo "message-display-hook: 入力に message_id がありません" >&2; exit 1; }
final=$(jq -r .final <<<"$input")

emit() {
  jq -n --arg t "$1" '{hookSpecificOutput:{hookEventName:"MessageDisplay",displayContent:$t}}'
}

mkdir -p "$STATE_DIR"
file="$STATE_DIR/$mid"
jq -j .delta <<<"$input" >>"$file"

if [ "$final" != true ]; then
  emit ""
  exit 0
fi

original=$(<"$file")
rm -f "$file"

# 失敗の理由を reason に入れて 1 を返す。理由には、応答の本文や鍵を含めない。
reason=""
# 呼び出し1回分の費用（米ドル、小数4桁）。応答から求められないときは空のままにして、金額を出さない。
cost=""
rewrite() {
  [ -n "${GEMINI_API_KEY:-}" ] || { reason="GEMINI_API_KEY が未設定"; return 1; }

  local request response status json finish
  request=$(jq -n --arg system "$SYSTEM_PROMPT" --arg doc "$original" --argjson schema "$SCHEMA" '{
    systemInstruction: {parts: [{text: $system}]},
    contents: [{role: "user", parts: [{text: ("以下がエージェントの出力した文章です。\n<agent_output>\n" + $doc + "\n</agent_output>")}]}],
    generationConfig: {responseMimeType: "application/json", responseJsonSchema: $schema}
  }')

  # 鍵がプロセス一覧に出ないよう、ヘッダーは引数ではなくファイル経由で渡す（printf は組み込みコマンド）。
  local rc=0
  response=$(curl -sS --max-time "$MAX_TIME" -X POST "$ENDPOINT" \
    -H @<(printf 'x-goog-api-key: %s\n' "$GEMINI_API_KEY") -H 'Content-Type: application/json' \
    --data-binary @- -w $'\n%{http_code}' <<<"$request" 2>/dev/null) || rc=$?
  [ "$rc" -eq 0 ] || { reason="curl が終了コード $rc で失敗"; return 1; }
  status=${response##*$'\n'}
  json=${response%$'\n'*}
  [ "$status" = 200 ] || { reason="HTTP $status"; return 1; }

  # 課金される出力には思考トークンが含まれ、出力の数倍になることがある（実測で、出力66に対し思考483）。
  # thoughtsTokenCount を足さず、総数から入力を引くのは、その項目が応答に無い場合も取りこぼさないため。
  cost=$(jq -er --argjson pin "$PRICE_IN_PER_M" --argjson pout "$PRICE_OUT_PER_M" '.usageMetadata
    | (.promptTokenCount * $pin + (.totalTokenCount - .promptTokenCount) * $pout) / 1000000' <<<"$json" 2>/dev/null) \
    && cost=$(LC_ALL=C printf '%.4f' "$cost") || cost=""

  # 出力が上限などで途中で切れていると、回答の後半が黙って消えるため、STOP で終わったものだけ使う。
  text=$(jq -er '.candidates[0] | select(.finishReason == "STOP")
    | [.content.parts[] | select(.thought | not) | .text] | join("") | fromjson | .text | select(length > 0)' <<<"$json" 2>/dev/null) || {
    finish=$(jq -r '.candidates[0].finishReason // "なし"' <<<"$json" 2>/dev/null)
    reason="応答を検証できない（finishReason: ${finish:-不明}）"
    return 1
  }
}

log() { echo "$(date -Is) ${mid:0:8} $*" >>"$LOG"; }

# bash の ${#var} はロケールによってバイト数を返すため、文字数は jq で数える。
chars=$(printf '%s' "$original" | jq -Rs 'length')
if [ "$chars" -lt "$MIN_CHARS" ]; then
  log "skip: ${chars}文字 < ${MIN_CHARS}文字"
  emit "$original"$'\n'
  exit 0
fi

text=""
if rewrite; then
  log "ok ${SECONDS}s cost=${cost:-不明}"
  emit "$text"$'\n\n'"（${NOTE_LABEL}${cost:+ \$${cost}}）"$'\n'
else
  log "fallback: $reason ${SECONDS}s cost=${cost:-不明}"
  emit "$original"$'\n'
fi
