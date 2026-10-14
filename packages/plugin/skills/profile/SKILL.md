---
name: anon-match-profile
description: Create or edit the user's text-only dating profile.
---

Ask the user for display_name (nickname, not real name), age_range, gender, seeking (gender or 'any'), city, bio, likes, dislikes. Text only, no photos, no sexual content, no contact info.
Call `upsert_profile` (POST /v1/profile); show back with `get_my_profile`. Confirm with the user before saving.
