#!/usr/bin/env bash
# Usage: ./smoke.sh [BASE_URL]   (default http://localhost:8787)
set -e; B=${1:-http://localhost:8787}; S=$RANDOM
j(){ curl -s -X "$1" "$B$2" -H 'content-type: application/json' ${T:+-H "authorization: Bearer $T"} ${3:+-d "$3"}; echo; }
login(){ local e=$1; c=$(j POST /v1/auth/request-code "{\"email\":\"$e\"}" | sed -E 's/.*"activation_code":"([0-9]+)".*/\1/'); j POST /v1/auth/verify "{\"email\":\"$e\",\"code\":\"$c\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
echo "== health"; j GET /v1/health
echo "== reject non-grokbot"; j POST /v1/auth/request-code '{"email":"a@gmail.com"}'
TA=$(login "alice$S@mail.grokbot.com"); TB=$(login "bob$S@mail.grokbot.com")
echo "== profiles"; T=$TA j POST /v1/profile '{"display_name":"A'$S'","age_range":"25-30","gender":"female","seeking":"male","city":"Shanghai","bio":"爱读书爬山","likes":"hiking","dislikes":"smoking"}'
T=$TB j POST /v1/profile '{"display_name":"B'$S'","age_range":"28-32","gender":"male","seeking":"female","city":"Shanghai","bio":"程序员 喜欢爬山","likes":"hiking","dislikes":""}'
echo "== search (B)"; T=$TB j POST /v1/search '{"q":"爬山"}'
echo "== search again (should 429)"; T=$TB j POST /v1/search '{"q":"x"}'
echo "== daily match (A)"; R=$(T=$TA j POST /v1/match/daily '{}'); echo "$R"; M=$(echo "$R" | sed -E 's/.*"match_id":"([^"]+)".*/\1/')
echo "== relay"; T=$TA j POST /v1/matches/$M/messages '{"body":"你好，周末喜欢去哪爬山？"}'; T=$TB j POST /v1/matches/$M/messages '{"body":"佘山！"}'
T=$TB j POST /v1/matches/$M/messages '{"body":"my mail x@y.com"}'
T=$TB j GET /v1/matches/$M/messages
echo "== reveal"; T=$TA j POST /v1/matches/$M/reveal '{"decision":"accept"}'; T=$TB j POST /v1/matches/$M/reveal '{"decision":"accept"}'
echo "== mcp tools/list"; curl -s -X POST $B/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 200; echo
