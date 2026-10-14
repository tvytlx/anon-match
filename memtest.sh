#!/usr/bin/env bash
# Memory feature test (needs DEV_RETURN_CODE=true, e.g. local wrangler dev --var DEV_RETURN_CODE:true)
B=${1:-http://localhost:8787}; S=$RANDOM
j(){ curl -s -X "$1" "$B$2" -H 'content-type: application/json' ${T:+-H "authorization: Bearer $T"} ${3:+-d "$3"}; echo; }
# Mark created accounts is_test=1 on exit (so they never enter the real match pool).
# Done at the end because the normal match pool excludes is_test users. Needs ADMIN_SECRET env or ~/.wingbot/admin_secret.
CREATED=()
mark_test(){ local s=${ADMIN_SECRET:-$(cat ~/.wingbot/admin_secret 2>/dev/null)}; [ -z "$s" ] && { echo "!! no admin secret: created test accounts NOT marked is_test" >&2; return; }
  for e in "${CREATED[@]}"; do curl -s -o /dev/null -w "mark is_test $e -> %{http_code}\n" -X POST "$B/v1/admin/test-session" -H 'content-type: application/json' -H "x-admin-secret: $s" -d "{\"test_email\":\"$e\"}"; done; }
trap mark_test EXIT
login(){ c=$(j POST /v1/auth/request-code "{\"email\":\"$1\"}" | sed -E 's/.*"activation_code":"([0-9]+)".*/\1/'); j POST /v1/auth/verify "{\"email\":\"$1\",\"code\":\"$c\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
CREATED=("ma$S@mail.grokbot.com" "mb$S@mail.grokbot.com"); TA=$(login "ma$S@mail.grokbot.com"); TB=$(login "mb$S@mail.grokbot.com")
T=$TA j POST /v1/profile '{"display_name":"MA","gender":"female","seeking":"male"}' >/dev/null
BID=$(T=$TB j POST /v1/profile '{"display_name":"MB","gender":"male","seeking":"female"}' | sed -E 's/^\{"user_id":"([^"]+)".*/\1/')
M=$(T=$TA j POST /v1/match/daily "{\"user_id\":\"$BID\"}" | sed -E 's/.*"match_id":"([^"]+)".*/\1/')
T=$TB j POST /v1/matches/$M/messages '{"body":"你最喜欢什么水果？"}' >/dev/null
T=$TA j POST /v1/matches/$M/messages '{"body":"最喜欢芒果，夏天天天吃哈哈"}' >/dev/null
T=$TB j POST /v1/matches/$M/messages '{"body":"我也是"}' >/dev/null
echo "== A own answers (q=芒果) — must not include B msgs"; T=$TA j GET "/v1/history/answers?q=%E8%8A%92%E6%9E%9C"
echo "== A all own answers in match"; T=$TA j GET "/v1/history/answers?match_id=$M"
echo "== B reject → cancelled"; T=$TA j POST /v1/matches/$M/confirm '{"decision":"confirm"}' >/dev/null; T=$TB j POST /v1/matches/$M/confirm '{"decision":"reject"}' | grep -o '"state":"[a-z_]*"'
echo "== A inbox to_summarize"; T=$TA j GET /v1/inbox | grep -o '"to_summarize":\[[^]]*\]'
echo "== upsert batch"; R=$(T=$TA j POST /v1/memory "{\"items\":[{\"kind\":\"fact\",\"key\":\"最喜欢的水果\",\"value\":\"芒果\",\"source_match_id\":\"$M\"},{\"kind\":\"style\",\"key\":\"语气\",\"value\":\"轻松，爱用哈哈\"}]}"); echo "$R"
ID=$(echo "$R" | grep -o '"id":"mem_[^"]*"' | head -1 | cut -d'"' -f4)
echo "== update same key"; T=$TA j POST /v1/memory '{"kind":"fact","key":"最喜欢的水果","value":"芒果和荔枝"}'
echo "== contact info blocked"; T=$TA j POST /v1/memory '{"kind":"fact","key":"微信","value":"vx abc12345"}'
echo "== search memory q=水果"; T=$TA j GET "/v1/memory?q=%E6%B0%B4%E6%9E%9C"
echo "== B cannot see A memory"; T=$TB j GET /v1/memory; T=$TB j DELETE /v1/memory/$ID
echo "== mark summarized → gone from inbox"; T=$TA j POST /v1/matches/$M/summarized; T=$TA j GET /v1/inbox | grep -o '"to_summarize":\[[^]]*\]'
echo "== delete"; T=$TA j DELETE /v1/memory/$ID; T=$TA j GET /v1/memory
echo "== mcp tools"; curl -s -X POST $B/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"' | tr '\n' ' '; echo
