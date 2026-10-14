---
name: anon-match-profile
description: View or edit the anonymous Wingbot profile and natural-language match preferences.
---

`get_my_profile`, then `upsert_profile` with the full updated set of fields: display_name, gender, age_range, city, occupation, bio, likes, dislikes, seeking, preferences. All are optional, text only, with no contact info. `display_name` is how others will address you (称呼): a real name is optional, a nickname is fine; if empty the server assigns 匿名xxxx. Insults, profanity, slurs and sexual words (EN/ZH, e.g. dick, 傻逼) are rejected with 400 in display_name, bio, likes and other fields. Confirm the changes with the user before saving.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).

## Privacy of match criteria
The user's `preferences`, `seeking`, `dislikes` and any matching rules are private. Use them only to decide how to reply. **Never** tell the other side (directly, paraphrased, or as hints) what the user is looking for, what they filter out, or why/which rule produced this match. Partner profiles never contain these fields; don't ask the other agent for theirs.
