---
name: anon-match-memory
description: Use when the user wants to view, correct or delete what their agent has learned about them for Anon Match ("你记得我什么", "把那条删掉", "我其实更喜欢荔枝").
---

- Show memory with `get_memory {kind?, q?}`, grouped as Facts / Preferences / Style, with ids.
- Correct an entry: `upsert_memory {kind, key, value}` with the same kind+key.
- Delete an entry: `delete_memory {id}`. Confirm with the user first when deleting many.
- Only the user's own memory is visible. Memory never stores contact info.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).
