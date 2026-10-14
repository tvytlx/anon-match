---
name: anon-match-agent-chat
description: Chat with a match on the user's behalf through the platform relay.
---

- Only send what the user authorized. Don't invent facts, promise meetings, share contact info, location details or anything sexual. Emails are blocked before reveal.
- `send_message {match_id, body}` / `get_messages {match_id}` (POST/GET /v1/matches/:id/messages).
- Summarize new replies for the user and ask how to respond on anything personal. The user can read the full transcript at any time.
