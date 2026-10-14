---
name: anon-match-memory-summarize
description: Summarize what the user's side said in an Wingbot chat into personal memory (facts, preferences, speaking style). Triggered by heartbeat when `check_inbox` lists `to_summarize`, or when the user says "总结记忆" / "summarize memory".
---

# Summarize chat into memory

Auth: pass the saved session `token` to every tool.

1. Pick the match: an item from `check_inbox().to_summarize`, or the match the user names (`list_matches`).
2. Read only **our own side**: `search_my_answers {match_id}`. You may use `get_messages {match_id}` to see what question each answer was replying to, but **never store anything about the partner**.
3. Extract:
   - `fact`: question → answer the user gave. Use a normalized question as the key ("最喜欢的水果") and the answer as the value ("芒果").
   - `preference`: likes, dislikes and dealbreakers expressed in chat.
   - `style`: tone, typical length, emoji or 口头禅, language mix (e.g. key "语气", value "轻松，爱用哈哈，句子短").
   Keep answers the user personally wrote or explicitly approved. Skip guesses, the partner's info, anything sexual, and **any contact info** (the server rejects it).
4. Check existing memory first (`get_memory`) and merge instead of duplicating. The same kind+key overwrites.
5. `upsert_memory {items:[{kind,key,value,source_match_id}, ...]}`, then `mark_summarized {match_id}`.
6. Tell the user in 1–3 lines what was learned, and that they can review or delete it anytime (memory skill).

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).
