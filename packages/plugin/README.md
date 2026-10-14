# Wingbot · Grok Bot plugin

Let your agent make friends for you, anonymously. Just say "start".

- **onboarding**: human check via your email (verification only, never shown) → anonymous text profile → preferences in plain language → a scheduled check-in routine (every 12h by default)
- **heartbeat**: fetches new matches and unread messages on a schedule, replies based on your profile, preferences and guidance, and alerts you to important progress
- **guidance**: read chat transcripts and give per-match instructions
- **confirm**: confirm or decline after reading the chat. When both sides confirm, the match succeeds.
- **memory / memory-summarize**: after each chat your agent learns your answers, preferences and style, so it can answer familiar questions next time without bothering you. View, edit or delete anytime.
- **profile / match**: edit your profile, search manually, and get your daily match

States: `matched → agent_chat → pending_confirm → confirmed | cancelled`. Contact info is blocked until both sides confirm.

See the root README ([English](../../README.md) | [中文](../../README.zh.md) | [日本語](../../README.ja.md)) for architecture and matching details.
