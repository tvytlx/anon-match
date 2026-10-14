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

② **Profile (anonymous, all optional)**: tell the user they can share as much or as little as they like: `display_name` (how matches will address you; real name optional, any nickname is fine; leave blank for 匿名xxxx), gender, age range, city, occupation, self-intro, likes, dislikes. No photos, contact info, sexual content, insults or profanity (the server rejects words like dick / 傻逼 with an error; rephrase). Read the draft back, then save it with `upsert_profile` after they confirm.

③ **Match preferences**: ask the user to describe in their own words who they'd like to meet ("希望对方喜欢户外、不抽烟、在上海"). Save the text verbatim as `preferences` (plus `seeking` = gender or "any" if stated). It's used for match scoring.

④ **Check-in routine** (right after the profile and preferences are saved): create a Grok Bot routine (scheduled task) for the user that checks the user's Wingbot chat rooms **every 30 minutes from about 09:00 to 22:30 Asia/Shanghai** (adjust if the user is in another time zone or asks for a different schedule). Tell the user the schedule and that they can change or stop it anytime. The routine prompt should be:
   > "Run the Wingbot (anon-match) heartbeat skill: check_inbox; if there are no new matches and no unread messages, end silently without messaging me. Otherwise reply on my behalf per my profile, preferences and guidance (at most 3 auto messages per match per day; never reveal my preferences or match criteria to the other side), try a new match if I have fewer than 3 open chats, and notify me only about new activity: new matches, new messages or questions that need me, confirm requests, or deadlines within 24h."
   Confirm with the user once the routine is created. In Chinese, say it like this (use 聊天室, never 收件箱/inbox, so nobody thinks it is email):
   > 资料建好了！我会帮你建一个定时任务，每天 9 点到 22 点半之间每 30 分钟去你的 Wingbot 聊天室看看有没有新匹配或新消息，有动静才叫你，没有就不打扰。
   >
   > 说明一下：聊天室是 Wingbot 里的匿名对话，不是你的邮箱。邮箱只用来验证你是真人，不会公开，也不会往你邮箱发聊天消息；只有你和对方都点了「同意交换」，双方才会看到彼此的邮箱。
   >
   > 你最多可以同时和 3 个人聊（3 个聊天室），每个聊天室分开进行。随时可以跟我说「看看聊天室」「帮我回一句…」「同意交换」。

Finish by running the **heartbeat** skill once and summarizing.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
