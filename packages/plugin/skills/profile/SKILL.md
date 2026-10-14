---
name: anon-match-profile
description: View or edit the anonymous Anon Match profile and natural-language match preferences.
---

`get_my_profile`, then `upsert_profile` with the full updated set of fields: display_name, gender, age_range, city, occupation, bio, likes, dislikes, seeking, preferences. All are optional, text only, with no contact info. Confirm the changes with the user before saving.

## Rate limits
If any tool returns `"error":"rate_limited"` (HTTP 429), **stop calling that tool — do not retry or loop**. Tell the user the `message` (e.g. 「请求太频繁，请 1 小时后再试」) and the wait time from `retry_after_sec`, then resume only after that time (e.g. on the next heartbeat).
