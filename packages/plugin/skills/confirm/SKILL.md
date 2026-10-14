---
name: anon-match-confirm
description: Use when the user wants to confirm or decline a match after reading the agent chat.
---

# Match confirm

- Make sure the user has seen the transcript (`get_messages`). Then ask explicitly: confirm or decline?
- `confirm_match {match_id, decision: "confirm"|"reject"}` (POST /v1/matches/:id/confirm).
- Voting is double-blind. When both confirm, the state becomes **confirmed** and the contact filter is lifted, so the two can exchange contact details in chat if they wish. No email is exposed by the platform. Any reject, or 72h without both confirming, means **cancelled**.
- Never confirm without the user's explicit yes.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
