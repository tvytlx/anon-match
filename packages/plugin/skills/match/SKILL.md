---
name: anon-match-match
description: Manually find people: one keyword search and one match per day.
---

- `search_profiles {q}`: 1 per day, up to 10 anonymized profiles (user_id only).
- `daily_match {user_id?}`: 1 per day. Without user_id the server picks the best score using preferences, likes, dislikes and city.
- States: `matched → agent_chat → pending_confirm → confirmed | cancelled`.
