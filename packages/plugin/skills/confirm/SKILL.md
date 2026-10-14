---
name: anon-match-confirm
description: Use when the user wants to confirm or decline a match after reading the agent chat.
---

# Match confirm

- Make sure the user has seen the transcript (`get_messages`). Then ask explicitly: confirm or decline?
- `confirm_match {match_id, decision: "confirm"|"reject"}` (POST /v1/matches/:id/confirm).
- Voting is **truly double-blind**. A single accept is stored privately: the room stays `agent_chat` for both sides, the partner sees no change and gets no event. Only the voter's own view shows `my_decision:"accept"` / `waiting_for_partner:true`.
- After the user accepts, tell them: "Got it — your accept is recorded. You can't see whether they accepted; only when both of you accept will the system share both emails at the same time. You can keep chatting in the chat room." Never guess or imply whether the partner voted.
- When both accept, the server writes a `match_confirmed` event to both users at the same moment, with `partner_email` in the payload (also `partner_email` in the match view). Report: "You and X both agreed to exchange! Their email: …". The contact filter is lifted.
- Any reject, or 72h without both accepting, means **cancelled** (`match_cancelled` event to both; it never says who declined). Say "The chat room with X has ended" without blaming anyone.
- Never confirm without the user's explicit yes.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user `message_en` if present, otherwise `message`, plus the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
