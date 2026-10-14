---
name: anon-match-onboarding
description: Use when the user says "start" / "开始" / wants to join Wingbot. Walks through human verification, anonymous profile, natural-language preferences, and setting up the recurring check-in routine.
---

# Wingbot onboarding

Run this checklist in order. Show the user progress (①–⑤). Ask, don't assume. **Speak to the user in English** (or mirror their language if they clearly prefer another; default scripts below are English).

① **Verify you're a real person**: the email is only used for verification. It is never shown to matches.
   - Ask which email the user wants to verify with (any address they own; their Grok Bot inbox from ListEmailInboxes works too).
   - `request_code {email}` → if it is a Grok Bot inbox read the 6-digit code with SearchEmailThreads "Wingbot"; otherwise ask the user for the code. In the current test build the response may include `activation_code` directly.
   - `verify_code {email, code}`. Auth: `verify_code` returns a session token. Remember it in your memory/notes for this user (never show it in chat) and pass it as the `token` argument to every other anon-match tool.

② **Profile (anonymous, all optional)**: tell the user they can share as much or as little as they like: `display_name` (how matches will address you; real name optional, any nickname is fine; leave blank and the server assigns a default anonymous nickname like anonymousxxxx — agent note: server prefix is `匿名` + last 4 of user id), gender, age range, city, occupation, self-intro, likes, dislikes. No photos, contact info, sexual content, insults or profanity (the server rejects words like dick / 傻逼 with an error; rephrase). Read the draft back, then save it with `upsert_profile` after they confirm.

③ **Who they'd like to meet** — two short parts, in plain words (**never** say "hard rules" / "soft rules" jargon to the user):
   - **Must-haves first (each one can be skipped):** ask simply — "What age range are you looking for?" / "Do you need someone in the same city, or is elsewhere fine?" / "Are you looking to meet men, women, or anyone?". Tell the user: each item is optional; if they set one, people who don't match won't be shown — but stricter filters mean fewer matches, and the other person's filters must fit them too. Save only what they actually stated: `want_age_min` / `want_age_max` (integers, either may be empty), `want_same_city` (true only if they insist on same city), `want_gender`. **Agent mapping (not user-facing speech):** API stores `want_gender` as `男` / `女` / `any` — map men→男, women→女, anyone→any when calling the tool. Also ask their own age as a number for `age` (people who set an age range only see people whose age is known).
   - **Then nice-to-haves, conversationally:** "What kind of person do you click with? Any hobbies, values, or things you're not into?". Tell them: the more specific the better (up to about 500 characters per field); these never exclude anyone — they only rank better fits higher. Save as `preferences` (and `likes` / `dislikes` where it fits).
   - **Recap and confirm** before saving, e.g. "Must-haves: ages 20–30, women (any city). Nice-to-haves: into AI, outdoorsy, non-smoker." Remind them: these criteria stay private to their own agent — matches never see them, and nobody is told why they were matched.

④ **Check-in routine** (right after the profile and preferences are saved): create a Grok Bot routine (scheduled task) for the user that checks the user's Wingbot **chat rooms** **every 30 minutes from about 09:00 to 22:30 Asia/Shanghai** (adjust if the user is in another time zone or asks for a different schedule). Tell the user the schedule and that they can change or stop it anytime. The routine prompt should be:
   > "Run the Wingbot (anon-match) heartbeat skill: check_inbox; if there are no new matches and no unread messages, end silently without messaging me. Otherwise report updates grouped by partner name (\"Alex matched with you\" / \"Lucy: … (new message)\") and reply on my behalf per my profile, preferences and guidance (at most 3 auto messages per match per day; never reveal my preferences or match criteria to the other side), try a new match if I have fewer than 3 open chats, and notify me only about new activity: new matches, new messages or questions that need me, confirm requests, or deadlines within 24h."
   Confirm with the user once the routine is created. Say it like this (call them **chat rooms**, never inbox/email, so nobody thinks chats are email):
   > Your profile is set up! I'll create a routine that checks your Wingbot chat rooms every 30 minutes between about 9:00 and 22:30, and only ping you when there's something new.
   >
   > Quick note: chat rooms are anonymous conversations inside Wingbot — not your email. Email is only for verification; it stays private and we never email you chat messages. Contact (email) is exchanged only when **both** of you accept.
   >
   > You can chat with up to 3 people at once (3 chat rooms), each separately. Anytime you can say "check chat rooms", "any updates", "reply to X: …", or "agree to exchange".

⑤ **Dedicated teammate Wingbot Chat** (after ② profile and ④ routine): create a dedicated Grok Bot teammate with `CreateAgent`, name **Wingbot Chat**. Its job: check the user's Wingbot chat rooms, report updates per the heartbeat skill's format, reply on the user's behalf (3 auto messages/match/day cap, guided sends uncapped, never reveal preferences/match criteria), and own the 30-minute routine (~09:00–22:30 Asia/Shanghai, silent when nothing new). Give it the Wingbot plugin skills and the session token (in its private notes, never in chat). Move the routine from ④ to the teammate (create it there, then remove the duplicate on the current bot) so the user isn't notified twice.
   - Tell the user the new bot's name and link, e.g. "I created a dedicated teammate **Wingbot Chat**: <link>. It will check your chat rooms, reply for you, and run the 30-minute check-in. You can also open it and say \"check chat rooms\" anytime."
   - **Fallback:** if `CreateAgent` is not available in this environment or fails, keep the routine on the current bot and tell the user: "This environment can't create a new teammate, so the scheduled check-in stays with me — same effect." Don't retry in a loop.

Finish by running the **heartbeat** skill once and summarizing.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user `message_en` if present, otherwise `message`, plus the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, must-haves (`want_*`, `seeking`), `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
