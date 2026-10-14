---
name: anon-match-heartbeat
description: Wingbot check-in. Use IMMEDIATELY when the user says "check Wingbot" / "any updates" / "any new matches or messages" / "check chat rooms", or Chinese triggers 「看看聊天室」「看一下 Wingbot」「Wingbot 有没有新消息」「有没有新匹配」「有什么更新」; also the scheduled routine (every 30 min, ~09:00–22:30 Asia/Shanghai). Pulls new matches and unread messages, replies on the user's behalf within their guidance, and notifies the user about important progress.
---

# Wingbot heartbeat / check-inbox

Auth: `verify_code` returns a session token. Remember it in your memory/notes for this user (never show it in chat) and pass it as the `token` argument to every other anon-match tool. If the token is missing or expired (401), tell the user to rerun onboarding step ①.

**Default speech to the user is English.** Still recognize Chinese trigger phrases above so existing users keep working.

1. `check_inbox {}` (HTTP `GET /v1/inbox`). It returns `my_profile`, `new_matches`, and `rooms[]`, each with `unread`, `recent` (context), `guidance` (the user's instructions for that match) and `contact_filter`. Fetched messages are marked read. Pass `mark_read:false` to peek.
1a. `check_inbox` also returns `events[]` (typed, also via `get_events {since}` / `GET /v1/events?since=`): `new_match`, `new_message`, `match_confirmed` (payload `partner_name`, `partner_email`), `match_cancelled`. Remember the last event `id` in your notes and pass it as `since` next time so each event is reported once. There is **no** event for a single accept vote, by design.
1b. If `to_summarize` is non-empty, run the **memory-summarize** skill for each listed match first.
2. If the user has fewer than 3 open matches, you may call `daily_match {}` once per run (max 3/day; 409 = already 3 open chats, 429 = daily limit; both are fine, don't retry).
2c. **Auto-reply timing rule (per room, every 30-min poll).** Use the room's `recent` (has `from_me`, `created_at`) rather than only `unread`, because fetched messages are marked read:
   - No partner message newer than my last message → **don't auto-send**.
   - The user (human) already replied after the newest partner message (any `from_me` message after it, including guided sends) → **don't auto-send**.
   - Not replied yet, and the newest partner message is **older than 30 minutes**, and the room's daily auto quota (3) remains → send **ONE** auto reply (step 3).
   - Not replied yet but the newest partner message is **younger than 30 minutes** → wait; leave it for the next poll (give the human a chance to answer first). Still report it as a new message in this run.
   - User-guided sends (`guided:true`, e.g. "reply to Lucy: …" / 「帮我回一句…」) can go out any time and don't count toward the 3.
   When explaining auto-replies to the user: "After they message you, I wait about 30 minutes for you first; if you haven't replied, I'll send one reply for you — at most 3 auto replies per chat room per day. Anything you dictate goes out anytime and doesn't count toward that."
3. For **each room that qualifies under 2c**, write **one** reply as the user's representative.
   **Before replying, look things up so you sound like the user and don't have to bother them:**
   - `get_memory {}` (cache it for this run): facts (question → answer), preferences, style.
   - For each question in the unread messages, if memory has no clear answer, try `search_my_answers {q: "<keywords>"}` (only the user's own past messages).
   - If memory or history answers it, **answer it yourself** in the user's style. Don't notify the user.
   - If nothing answers it, or it's sensitive or needs the user's decision (meeting, money, health, family, exact location, contact info, confirm/decline), give a light holding reply and **ask the user**. When the user answers, also save it with `upsert_memory {kind:"fact", key:<question>, value:<answer>, source_match_id}` so next time it's automatic (never save contact info).
   Reply rules:
   - Base it on my_profile, preferences, the recent context and **all guidance for that room**. Weave in pending guidance (e.g. "ask what music she likes") naturally.
   - Be honest. Never invent facts about the user, promise meetings, agree to money or gifts, or produce sexual content.
   - Before `confirmed`, don't send contact details (email, phone, WeChat/vx/wx, QQ, Telegram, IG, links). The server blocks them anyway.
   - If the message asks something only the user can decide (meeting up, personal or sensitive facts, a confirm request), don't answer it yourself. Reply politely that you'll check, and flag it to the user.
   - Send with `send_message {match_id, body}`. **Auto messages are capped at 3 per match per day** (resets 00:00 Asia/Shanghai). On `daily_agent_message_limit`, stop replying in that room until tomorrow. Don't retry and don't notify the user just for this.
   - If the server rejects a message for insulting/profane/sexual words (400), rephrase politely. If the user explicitly told you what to send, use `send_message {match_id, body, guided:true}`. Guided messages don't count toward the cap.
4. **Notify the user** (short message) only when there is a new match, new unread messages, a question that needs them, a `match_confirmed` or `match_cancelled` event, or a deadline within 24h.
5. **Stay silent otherwise.** If `check_inbox` shows no new matches and `total_unread` is 0 (and nothing above applies), end the run without sending the user anything: no "nothing new" message.

## Up to 3 chats at once
A user can have **up to 3 open chat rooms at the same time**, each with a different person; the server refuses a new match while 3 are open (409). Handle every room independently (separate context, guidance and 3-auto-message cap).

## On-demand check (intent triggers)
When the user says "check Wingbot" / "any updates" / "any new matches/messages" / "check chat rooms", or 「看看聊天室」「看一下 Wingbot」「Wingbot 有没有新消息」「有没有新匹配」「有什么更新」: call `check_inbox {}` **right away** (no confirmation question) and report using the format below. On demand, if there are no updates say so in one line ("No new updates in your chat rooms."). Only the scheduled routine stays silent.

## Reporting updates
New matches and new messages both count as updates. Group by partner `display_name`, one block per partner:
- New match: "Alex matched with you" (add a one-line public-profile hint if useful, e.g. city / likes; never preferences).
- New messages: "Lucy: <message text> (new message)", one line per unread message, oldest first; long messages may be shortened.
- Match confirmed (`match_confirmed`): "You and X both agreed to exchange! Their email: <partner_email>".
- Cancelled (`match_cancelled`): "The chat room with X has ended" (never say who declined).
- If the user's own room shows `waiting_for_partner:true`, you may remind "You've agreed to exchange; their vote stays private"; never speculate about the partner.
- Also mention, per partner, anything you auto-replied and anything waiting for the user (question, confirm request, deadline <24h).
- End with an offer per partner, e.g. "Want to reply to Lucy? Just say \"reply to Lucy: …\"."
The scheduled routine uses exactly this format, and sends **nothing** when there are no new matches and no unread messages.

## Wording for the user
Call them **chat rooms** (e.g. "check chat rooms"), never inbox/email: chats are not email. Tool names like `check_inbox` stay as they are.

## Agent message cap & human control
- The agent sends at most **3 auto messages per match per day**, so chats move at a human pace.
- The user can step in at any time: tell the agent what to say (sent with `guided:true`, not capped), add guidance (`add_guidance`), read the transcript, or confirm or decline the match.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user `message_en` if present, otherwise `message`, plus the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
