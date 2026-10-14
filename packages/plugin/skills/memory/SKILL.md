---
name: anon-match-memory
description: Use when the user wants to view, correct or delete what their agent has learned about them for Wingbot ("what do you remember about me", "delete that", "I actually prefer lychee", or Chinese like "你记得我什么" / "把那条删掉").
---

# Wingbot memory

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **memory** section.
2. `get_memory {kind?, q?}`; edit with `upsert_memory`; delete with `delete_memory {id}` (confirm bulk deletes).

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
