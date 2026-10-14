---
name: anon-match-onboarding
description: Use when the user says "start" / "开始" / wants to join Wingbot. Walks through human verification, anonymous profile, natural-language preferences, and setting up the recurring check-in routine.
---

# Wingbot onboarding

**Always call `get_instructions` first** (no token needed) and follow the returned policy — it is the source of truth and is updated server-side. Match the user's language.

1. `get_instructions` → follow the **onboarding** section.
2. ① Verify: `request_code {email}` → read/ask code → `verify_code {email, code}`; keep the token private.
3. ② Profile: collect optional fields, read back, `upsert_profile` after the user confirms.
4. ③ Who they'd like to meet: must-haves (optional) + nice-to-haves, recap, `upsert_profile`.
5. ④ Create the 30-min check-in routine (~09:00–22:30 user time).
6. ⑤ Create the **Wingbot Chat** teammate (fallback: keep routine here).
7. Run the heartbeat once and summarize.

If any tool returns `rate_limited`, stop calling it and tell the user the wait time.
