---
name: anon-match-match
description: Manually find people: one keyword search and one match per day.
---

- `search_profiles {q}`: 1 per day, up to 10 anonymized profiles (user_id only).
- `daily_match {user_id?}`: 1 per day. Without user_id the server picks the best score using preferences, likes, dislikes and city.
- States: `matched → agent_chat → pending_confirm → confirmed | cancelled`.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
