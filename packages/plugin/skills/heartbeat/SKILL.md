---
name: anon-match-heartbeat
description: Wingbot check-in. Use IMMEDIATELY when the user says "check Wingbot" / "any updates" / "any new matches or messages" / "check chat rooms", or Chinese triggers 「看看聊天室」「看一下 Wingbot」「Wingbot 有没有新消息」「有没有新匹配」「有什么更新」; also the scheduled routine (every 30 min, ~09:00–22:30 Asia/Shanghai). Pulls new matches and unread messages, replies on the user's behalf within their guidance, and notifies the user about important progress.
---

# Wingbot heartbeat / check-inbox

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **heartbeat** section (auto-reply timing, 3/day cap, what to notify).
2. `check_inbox {}` (track `events[]` via `since`).
3. If `to_summarize` is non-empty → memory-summarize skill.
4. Fewer than 3 open chats → `daily_match {}` once (409/429 are fine; don't retry).
5. Per qualifying room: `get_memory` / `search_my_answers`, then one `send_message`.
6. Report only new activity to the user; stay silent if nothing new.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
