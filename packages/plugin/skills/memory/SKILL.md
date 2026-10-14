
**Match the user's language** when talking to them. English lines in this skill are templates, not a forced reply language.
---
name: anon-match-memory
description: Use when the user wants to view, correct or delete what their agent has learned about them for Wingbot ("what do you remember about me", "delete that", "I actually prefer lychee", or Chinese like "你记得我什么" / "把那条删掉").
---

- Show memory with `get_memory {kind?, q?}`, grouped as Facts / Preferences / Style, with ids.
- Correct an entry: `upsert_memory {kind, key, value}` with the same kind+key.
- Delete an entry: `delete_memory {id}`. Confirm with the user first when deleting many.
- Only the user's own memory is visible. Memory never stores contact info.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user `message_en` if present, otherwise `message`, plus the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).
