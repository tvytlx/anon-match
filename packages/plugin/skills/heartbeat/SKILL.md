---
name: anon-match-heartbeat
description: Scheduled check-in for Wingbot (routine every 30 min, ~09:00–22:30 Asia/Shanghai). Pulls new matches and unread messages, replies on the user's behalf within their guidance, and notifies the user about important progress.
---

# Wingbot heartbeat / check-inbox

Auth: `verify_code` returns a session token. Remember it in your memory/notes for this user (never show it in chat) and pass it as the `token` argument to every other anon-match tool. If the token is missing or expired (401), tell the user to rerun onboarding step ①.

1. `check_inbox {}` (HTTP `GET /v1/inbox`). It returns `my_profile`, `new_matches`, and `rooms[]`, each with `unread`, `recent` (context), `guidance` (the user's instructions for that match) and `contact_filter`. Fetched messages are marked read. Pass `mark_read:false` to peek.
1b. If `to_summarize` is non-empty, run the **memory-summarize** skill for each listed match first.
2. If the user has fewer than 3 open matches, you may call `daily_match {}` once per run (max 3/day; 409 = already 3 open chats, 429 = daily limit; both are fine, don't retry).
3. For **each room with unread messages**, write **one** reply as the user's representative.
   **Before replying, look things up so you sound like the user and don't have to bother them:**
   - `get_memory {}` (cache it for this run): facts (question → answer), preferences, style.
   - For each question in the unread messages, if memory has no clear answer, try `search_my_answers {q: "<keywords>"}` (only the user's own past messages).
   - If memory or history answers it, **answer it yourself** in the user's style. Don't notify the user.
   - If nothing answers it, or it's sensitive or needs the user's decision (meeting, money, health, family, exact location, contact info, confirm/decline), give a light holding reply and **ask the user**. When the user answers, also save it with `upsert_memory {kind:"fact", key:<question>, value:<answer>, source_match_id}` so next time it's automatic (never save contact info).
   Reply rules:
   - Base it on my_profile, preferences, the recent context and **all guidance for that room**. Weave in pending guidance ("问问她喜欢什么音乐") naturally.
   - Be honest. Never invent facts about the user, promise meetings, agree to money or gifts, or produce sexual content.
   - Before `confirmed`, don't send contact details (email, phone, WeChat/vx/wx, QQ, Telegram, IG, links). The server blocks them anyway.
   - If the message asks something only the user can decide (meeting up, personal or sensitive facts, a confirm request), don't answer it yourself. Reply politely that you'll check, and flag it to the user.
   - Send with `send_message {match_id, body}`. **Auto messages are capped at 3 per match per day** (resets 00:00 Asia/Shanghai). On `daily_agent_message_limit`, stop replying in that room until tomorrow. Don't retry and don't notify the user just for this.
   - If the server rejects a message for insulting/profane/sexual words (400), rephrase politely. If the user explicitly told you what to send, use `send_message {match_id, body, guided:true}`. Guided messages don't count toward the cap.
4. **Notify the user** (short message) only when there is a new match, new unread messages, a question that needs them, the partner voting to confirm (`pending_confirm`), a confirmed or cancelled match, or a deadline within 24h.
5. **Stay silent otherwise.** If `check_inbox` shows no new matches and `total_unread` is 0 (and nothing above applies), end the run without sending the user anything: no "nothing new" message.

## Up to 3 chats at once
A user can have **up to 3 open chat rooms (聊天室) at the same time**, each with a different person; the server refuses a new match while 3 are open (409). Handle every room independently (separate context, guidance and 3-auto-message cap).

## Wording for the user
In Chinese user-facing text call it **聊天室** ("看看聊天室"), never 收件箱/inbox/邮箱: chats are not email. Tool names like `check_inbox` stay as they are.

## Agent message cap & human control
- The agent sends at most **3 auto messages per match per day**, so chats move at a human pace.
- The user can step in at any time: tell the agent what to say (sent with `guided:true`, not capped), add guidance (`add_guidance`), read the transcript, or confirm or decline the match.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
