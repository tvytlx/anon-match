---
name: anon-match-confirm
description: Use when the user wants to confirm or decline a match after reading the agent chat.
---

# Match confirm

- Make sure the user has seen the transcript (`get_messages`). Then ask explicitly: confirm or decline?
- `confirm_match {match_id, decision: "confirm"|"reject"}` (POST /v1/matches/:id/confirm).
- Voting is **truly double-blind**. A single accept is stored privately: the room stays `agent_chat` for both sides, the partner sees no change and gets no event. Only the voter's own view shows `my_decision:"accept"` / `waiting_for_partner:true`.
- After the user accepts, tell them: 「已记录你的同意交换。对方是否同意你看不到；只有双方都同意时，系统才会同时把双方邮箱发给你们。聊天室可以继续聊。」 Never guess or imply whether the partner voted.
- When both accept, the server writes a `match_confirmed` event to both users at the same moment, with `partner_email` in the payload (also `partner_email` in the match view). Report: 「你和 X 互相同意交换！对方邮箱：…」. The contact filter is lifted.
- Any reject, or 72h without both accepting, means **cancelled** (`match_cancelled` event to both; it never says who declined). Say 「X 的聊天室已结束」 without blaming anyone.
- Never confirm without the user's explicit yes.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
