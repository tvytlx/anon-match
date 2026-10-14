---
name: anon-match-guidance
description: Use when the user wants to see a match's chat history or tell the agent how to steer that conversation ("ask what music she likes", "don't talk about work", or Chinese like "问问她喜欢什么音乐" / "别聊工作").
---

# View chats & give guidance

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **guidance** section.
2. `list_matches` → `get_messages {match_id}` (label **you** / **them**).
3. Save steering with `add_guidance {match_id, body}`; review with `list_guidance`.
4. Dictated message now → `send_message {match_id, body, guided:true}`.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
