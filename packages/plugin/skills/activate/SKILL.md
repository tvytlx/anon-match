---
name: anon-match-activate
description: Activate Anon Match account by reading the code from the Grok Bot inbox.
---

1. SearchEmailThreads for 'Anon Match activation' and read the 6-digit code. (MVP: the request_code response may already include activation_code.)
2. Call `verify_code {email, code}` (POST /v1/auth/verify) and keep the returned token as the Bearer token (ANON_MATCH_TOKEN). Never print it back to chat.
