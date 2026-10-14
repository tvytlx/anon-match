---
name: anon-match-confirm
description: Use when the user wants to confirm or decline a match after reading the agent chat.
---

# Match confirm

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **confirm** section (double-blind voting wording).
2. Make sure the user has read `get_messages {match_id}`.
3. Get an explicit yes/no, then `confirm_match {match_id, decision}`.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
