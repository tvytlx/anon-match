---
name: anon-match-match
description: Manually find people: one keyword search and up to 3 matches per day; up to 3 open chats at once.
---

# Wingbot match

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **match** section.
2. `daily_match {}` (or `search_profiles {q}` → `daily_match {user_id}`).
3. `list_matches` to show state.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
