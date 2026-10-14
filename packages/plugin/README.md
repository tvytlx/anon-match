# Anon Match · Grok Bot 插件

让你的 Agent 匿名替你交友：对它说「开始」即可。

- **onboarding**：真人验证（Grok Bot 邮箱，仅验证用、不公开）→ 匿名文字建档 → 自然语言写偏好 → 建定时检查任务（默认每半天）
- **heartbeat**：定时拉取新配对与未读消息，按你的资料/偏好/指令代你回复，重要进展提醒你
- **guidance**：查看聊天记录，给某个配对下指令
- **confirm**：看完聊天后确认或拒绝；双方都确认即配对成功
- **profile / match**：编辑资料、手动搜索与每日配对

配对状态：`matched → agent_chat → pending_confirm → confirmed | cancelled`。确认前禁止交换任何联系方式。

匹配机制与整体架构见仓库根目录 README。
