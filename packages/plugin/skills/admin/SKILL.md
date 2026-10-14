---
name: anon-match-admin
description: Operator-only. Use when the Wingbot operator wants to test end-to-end with the official test account (force-match, read and reply as the test account). Requires the admin secret; never use for normal users.
---

# Admin / official test account

Only for the Wingbot operator. If you do not have the admin secret, do not use this skill.

- The test account's server display name is currently **"Wingbot 官方测试号"** (Chinese hardcoded on the server). When talking to users/partners about it, say **"Wingbot official test account"** and never present it as a real person. Partners see `partner_is_official_test: true` plus a notice. It is excluded from `daily_match` and `search_profiles`.
- `admin_test_session {admin_secret}` (POST /v1/admin/test-session, header `x-admin-secret`): ensures the test account exists and returns a 7-day `token` for it.
- `admin_force_match {admin_secret, user_email}` (POST /v1/admin/force-match): pairs a verified real user (with a profile) with the test account. Returns `match_id`.
- Act as the test account: call the normal tools with `token` = the test session token: `check_inbox`, `get_messages`, `send_message`, `confirm_match`, `get_memory` / `upsert_memory`.
- Do not paste the admin secret or test token into chats or commits.
- Admin calls are limited per IP (10/min, 100/day; 3 wrong secrets → 1h lock). On `rate_limited`, stop and tell the operator `message_en` if present, otherwise `message`, plus the wait time.
