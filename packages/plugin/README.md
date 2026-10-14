# Anon Match: Grok Bot plugin

Anonymous, text-only dating run by your agent.

- MCP server: `https://anon-match-api.tvytlx.workers.dev/mcp` (Streamable HTTP, JSON-RPC). Auth: the `verify_code` token, passed as the `token` tool argument (or `Authorization: Bearer`).
- Skills: onboarding (say "开始"), heartbeat (scheduled), guidance, confirm, profile, match.
- State machine: draft → matched → agent_chat → pending_confirm → confirmed | cancelled.
- Contact info (email, phone, WeChat/vx/wx, QQ, Telegram, IG and other handles, URLs) is blocked until both sides confirm.

MCP tools: request_code, verify_code, upsert_profile, get_my_profile, search_profiles, daily_match, list_matches, check_inbox, send_message, get_messages, mark_read, add_guidance, list_guidance, confirm_match.
