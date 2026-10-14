---
name: anon-match-reveal
description: Decide whether to swap Grok Bot emails with a match.
---

After the user reads the transcript, ask explicitly: accept or reject. Call `reveal_decision {match_id, decision}` (POST /v1/matches/:id/reveal).
Double-blind: nothing is shown until both accept → state revealed and partner_email appears. Any reject or 72h timeout → cancelled, emails stay hidden. Never accept without the user's explicit yes.
