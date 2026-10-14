---
name: anon-match-memory-summarize
description: Summarize what the user's side said in a Wingbot chat into personal memory (facts, preferences, speaking style). Triggered by heartbeat when `check_inbox` lists `to_summarize`, or when the user says "summarize memory" / "总结记忆".
---

# Summarize chat into memory

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **memory-summarize** section.
2. `get_messages {match_id}` → extract facts/preferences/style (no contact info).
3. `upsert_memory {items:[...]}` → `mark_summarized {match_id}`.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
