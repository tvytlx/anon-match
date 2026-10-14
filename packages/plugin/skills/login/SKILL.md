---
name: anon-match-login
description: Start Anon Match sign-in with the user's Grok Bot email.
---

1. Find the user's own address with ListEmailInboxes (must end in @mail.grokbot.com). Never ask for any other email.
2. Call MCP tool `request_code {email}` (HTTP: POST /v1/auth/request-code).
3. Continue with the activate skill.
