---
name: anon-match-match
description: Find people: one keyword search and one match per day.
---

- `search_profiles {q}` (POST /v1/search): 1/day, up to 10 anonymized profiles (user_id only, never emails).
- `daily_match {user_id?}` (POST /v1/match/daily): 1/day; optionally pick a user_id from search. Show partner profile and the reveal deadline (72h).
- `list_matches` to check states: matched → agent_chat → pending_reveal → revealed | cancelled.
