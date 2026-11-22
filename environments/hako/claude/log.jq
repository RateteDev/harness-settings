# hako logs が session.log の1行ずつ（jq -R）に当てる。JSON でない行（エラーの出力など）はそのまま出す。
. as $line
| (try fromjson catch null) as $e
| if $e == null then $line
  elif $e.hako then "--- \($e.hako) \($e.at)"
  elif $e.type == "system" and $e.subtype == "init" then "[開始] MCP: \([$e.mcp_servers[]? | "\(.name)=\(.status)"] | join(", "))"
  elif $e.type == "assistant" then
    ($e.message.content[]
     | if .type == "text" then "[返答] \(.text)"
       elif .type == "tool_use" then "[道具] \(.name) \(.input | tostring | .[0:200])"
       else empty end)
  elif $e.type == "user" then
    ($e.message.content[]? | select(.type == "tool_result") | "[結果] \(.content | tostring | .[0:200])")
  elif $e.type == "result" then "[終了] \($e.num_turns)手 \($e.total_cost_usd)ドル\(if $e.is_error then " エラー" else "" end)"
  else empty end
