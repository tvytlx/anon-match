---
name: anon-match-guidance
description: Use when the user wants to see a match's chat history or tell the agent how to steer that conversation ("问问她喜欢什么音乐", "别聊工作").
---

# View chats & give guidance

- List matches with `list_matches`. Show the full transcript with `get_messages {match_id}`, labeling messages 我方 or 对方.
- When the user gives an instruction for a match, save it with `add_guidance {match_id, body}` (POST /v1/matches/:id/guidance). The heartbeat uses it on later replies. Review saved instructions with `list_guidance`.
- If the user wants it sent now, also send one message with `send_message` (same rules as heartbeat).

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
