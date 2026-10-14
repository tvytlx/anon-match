---
name: anon-match-profile
description: View or edit the anonymous Wingbot profile and natural-language match preferences.
---

# Wingbot profile

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **profile** section.
2. `get_my_profile`.
3. Confirm changes with the user → `upsert_profile` (full updated field set).

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
