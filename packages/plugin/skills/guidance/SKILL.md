---
name: anon-match-guidance
description: Use when the user wants to see a match's chat history or tell the agent how to steer that conversation ("问问她喜欢什么音乐", "别聊工作").
---

# View chats & give guidance

- List matches with `list_matches`. Show the full transcript with `get_messages {match_id}`, labeling messages 我方 or 对方.
- When the user gives an instruction for a match, save it with `add_guidance {match_id, body}` (POST /v1/matches/:id/guidance). The heartbeat uses it on later replies. Review saved instructions with `list_guidance`.
- If the user wants it sent now, also send one message with `send_message` (same rules as heartbeat).
