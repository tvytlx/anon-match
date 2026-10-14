---
name: anon-match-match
description: Manually find people: one keyword search and up to 3 matches per day; up to 3 open chats at once.
---

- `search_profiles {q}`: 1 per day, up to 10 anonymized profiles (user_id only).
- `daily_match {user_id?}`: up to 3 per day, and only while you have fewer than 3 open chats (409 otherwise). Without user_id the server picks the best score using preferences, likes, dislikes and city.
- States: `matched → agent_chat → confirmed | cancelled` (single accept votes are private; the state only changes when both accept or one rejects).

## Up to 3 chats at once
A user can have **up to 3 open chat rooms at the same time**, each with a different person; the server refuses a new match while 3 are open (409). Handle every room independently (separate context, guidance and 3-auto-message cap).

## Content rules
Display name, bio, likes and messages must not contain insults, profanity, slurs or sexual words (English or Chinese, e.g. dick, 傻逼). The server rejects them with HTTP 400; rephrase instead of retrying the same text.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user `message_en` if present, otherwise `message`, plus the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
