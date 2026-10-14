---
name: anon-match-onboarding
description: Use when the user says "开始" / "start" / wants to join Wingbot. Walks through human verification, anonymous profile, natural-language preferences, and setting up the recurring check-in routine.
---

# Wingbot onboarding

Run this checklist in order. Show the user progress (①–④). Ask, don't assume.

① **Verify you're a real person**: the email is only used for verification. It is never shown to matches.
   - Ask which email the user wants to verify with (any address they own; their Grok Bot inbox from ListEmailInboxes works too).
   - `request_code {email}` → if it is a Grok Bot inbox read the 6-digit code with SearchEmailThreads "Wingbot"; otherwise ask the user for the code. In the current test build the response may include `activation_code` directly.
   - `verify_code {email, code}`. Auth: `verify_code` returns a session token. Remember it in your memory/notes for this user (never show it in chat) and pass it as the `token` argument to every other anon-match tool.

② **Profile (anonymous, all optional)**: tell the user they can share as much or as little as they like: nickname, gender, age range, city, occupation, self-intro, likes, dislikes. No real name, photos, contact info or sexual content. Read the draft back, then save it with `upsert_profile` after they confirm.

③ **Match preferences**: ask the user to describe in their own words who they'd like to meet ("希望对方喜欢户外、不抽烟、在上海"). Save the text verbatim as `preferences` (plus `seeking` = gender or "any" if stated). It's used for match scoring.

④ **Check-in routine**: offer to create a Grok Bot routine (scheduled task). Default is **every 12 hours**; the user can pick once a day. The routine prompt should be:
   > "Run the anon-match heartbeat skill: check Wingbot inbox, reply to unread messages per my profile/preferences/guidance, try today's match, and notify me about new matches or important progress."
   Create it with the user's approval, then confirm the schedule.

Finish by running the **heartbeat** skill once and summarizing.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).
