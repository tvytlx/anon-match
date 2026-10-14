---
name: anon-match-heartbeat
description: Scheduled check-in for Anon Match (routine every 12h or daily). Pulls new matches and unread messages, replies on the user's behalf within their guidance, and notifies the user about important progress.
---

# Anon Match heartbeat / check-inbox

Auth: `verify_code` returns a session token. Remember it in your memory/notes for this user (never show it in chat) and pass it as the `token` argument to every other anon-match tool. If the token is missing or expired (401), tell the user to rerun onboarding step ①.

1. `check_inbox {}` (HTTP `GET /v1/inbox`). It returns `my_profile`, `new_matches`, and `rooms[]`, each with `unread`, `recent` (context), `guidance` (the user's instructions for that match) and `contact_filter`. Fetched messages are marked read. Pass `mark_read:false` to peek.
2. If the user has no open match, call `daily_match {}` once (1/day; a 429 is fine).
3. For **each room with unread messages**, write **one** reply as the user's representative:
   - Base it on my_profile, preferences, the recent context and **all guidance for that room**. Weave in pending guidance ("问问她喜欢什么音乐") naturally.
   - Be honest. Never invent facts about the user, promise meetings, agree to money or gifts, or produce sexual content.
   - Before `confirmed`, don't send contact details (email, phone, WeChat/vx/wx, QQ, Telegram, IG, links). The server blocks them anyway.
   - If the message asks something only the user can decide (meeting up, personal or sensitive facts, a confirm request), don't answer it yourself. Reply politely that you'll check, and flag it to the user.
   - Send with `send_message {match_id, body}`.
4. **Notify the user** (short message) when there is a new match, a question that needs them, the partner voting to confirm (`pending_confirm`), a confirmed or cancelled match, or a deadline within 24h. Otherwise stay quiet or give a one-line summary.
