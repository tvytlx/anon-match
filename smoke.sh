#!/usr/bin/env bash
# Usage: ./smoke.sh [BASE_URL]   (default http://localhost:8787)
set -e; B=${1:-http://localhost:8787}; S=$RANDOM
j(){ curl -s -X "$1" "$B$2" -H 'content-type: application/json' ${T:+-H "authorization: Bearer $T"} ${3:+-d "$3"}; echo; }
# Mark created accounts is_test=1 on exit (so they never enter the real match pool).
# Done at the end because the normal match pool excludes is_test users. Needs ADMIN_SECRET env or ~/.wingbot/admin_secret.
CREATED=()
mark_test(){ local s=${ADMIN_SECRET:-$(cat ~/.wingbot/admin_secret 2>/dev/null)}; [ -z "$s" ] && { echo "!! no admin secret: created test accounts NOT marked is_test" >&2; return; }
  for e in "${CREATED[@]}"; do curl -s -o /dev/null -w "mark is_test $e -> %{http_code}\n" -X POST "$B/v1/admin/test-session" -H 'content-type: application/json' -H "x-admin-secret: $s" -d "{\"test_email\":\"$e\"}"; done; }
trap mark_test EXIT
login(){ local e=$1; c=$(j POST /v1/auth/request-code "{\"email\":\"$e\"}" | sed -E 's/.*"activation_code":"([0-9]+)".*/\1/'); j POST /v1/auth/verify "{\"email\":\"$e\",\"code\":\"$c\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
echo "== health"; j GET /v1/health
echo "== reject non-grokbot"; j POST /v1/auth/request-code '{"email":"a@gmail.com"}'
CREATED=("alice$S@mail.grokbot.com" "bob$S@mail.grokbot.com"); TA=$(login "alice$S@mail.grokbot.com"); TB=$(login "bob$S@mail.grokbot.com")
echo "== profiles"; T=$TA j POST /v1/profile '{"display_name":"A'$S'","age_range":"25-30","gender":"female","seeking":"male","city":"Shanghai","occupation":"设计师","bio":"爱读书爬山","likes":"hiking","dislikes":"smoking","preferences":"希望对方喜欢户外、爬山，不抽烟"}'
BP=$(T=$TB j POST /v1/profile '{"display_name":"B'$S'","age_range":"28-32","gender":"male","seeking":"female","city":"Shanghai","bio":"程序员 喜欢爬山","likes":"hiking","dislikes":""}'); echo "$BP"; BID=$(echo "$BP" | sed -E 's/^\{"user_id":"([^"]+)".*/\1/')
echo "== search (B)"; T=$TB j POST /v1/search '{"q":"爬山"}'
echo "== search again (should 429)"; T=$TB j POST /v1/search '{"q":"x"}'
echo "== daily match (A)"; R=$(T=$TA j POST /v1/match/daily "{\"user_id\":\"$BID\"}"); echo "$R"; M=$(echo "$R" | sed -E 's/.*"match_id":"([^"]+)".*/\1/')
echo "== relay"; T=$TA j POST /v1/matches/$M/messages '{"body":"你好，周末喜欢去哪爬山？"}'; T=$TB j POST /v1/matches/$M/messages '{"body":"佘山！"}'
echo "== contact filter (all should be blocked)"; for b in "my mail x@y.com" "加我vx abc12345" "电话 138 1234 5678" "qq 12345678" "tg @abcdef" "看 www.foo.com"; do T=$TB j POST /v1/matches/$M/messages "{\"body\":\"$b\"}"; done
echo "== guidance + inbox (A)"; T=$TA j POST /v1/matches/$M/guidance '{"body":"问问他喜欢什么音乐"}'; T=$TA j GET /v1/inbox; echo "-- inbox again (unread should be 0)"; T=$TA j GET /v1/inbox
T=$TB j GET /v1/matches/$M/messages
echo "== confirm"; T=$TA j POST /v1/matches/$M/confirm '{"decision":"confirm"}'; T=$TB j POST /v1/matches/$M/confirm '{"decision":"confirm"}'
echo "== after confirm contact allowed"; T=$TB j POST /v1/matches/$M/messages '{"body":"我的微信 abc12345"}'
echo "== mcp tools/list"; curl -s -X POST $B/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 200; echo
