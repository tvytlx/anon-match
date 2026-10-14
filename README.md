# Anon Match（匿名婚恋 MVP）
Grok Bot 插件 + Cloudflare Worker/D1 服务端。状态机：`draft → matched → agent_chat → pending_confirm → confirmed | cancelled`（72h 未双确认自动 cancelled；confirmed 不交换邮箱，只解除联系方式过滤）。

本地路径：`/workspace/anon-match`
- `apps/api/` Worker (`src/index.js`)，D1 迁移 `migrations/0001_init.sql`，`wrangler.toml`
- `packages/plugin/` `.cursor-plugin/plugin.json`、`skills/*/SKILL.md`、`mcp.json`
- `smoke.sh` 冒烟脚本：`./smoke.sh [BASE_URL]`

## API
GET /v1/health · POST /v1/auth/request-code {email} · POST /v1/auth/verify {email,code}→token · POST /v1/profile · GET /v1/profile/me · POST /v1/search {q}（1次/天，≤10人）· POST /v1/match/daily {user_id?}（1次/天）· GET /v1/matches · POST|GET /v1/matches/:id/messages · POST /v1/matches/:id/confirm {decision: confirm|reject}（/reveal 为兼容别名）· GET /v1/inbox（?mark_read=0 只看不标记）· GET /v1/matches?unread=1 · POST /v1/matches/:id/read · POST|GET /v1/matches/:id/guidance · POST /mcp（MCP tools 同名映射）

规则：仅 *@mail.grokbot.com（只用于真人验证）；profile 新增 occupation、preferences（自然语言偏好，用于匹配打分）；搜索/匹配结果不含邮箱；confirmed 前消息和资料里禁止联系方式（邮箱/手机/微信 vx wx/QQ/Telegram/IG 等/网址）；文本含色情关键词拒绝。
MVP 无邮件服务：`DEV_RETURN_CODE=true` 时 request-code 直接返回 activation_code（并打日志）。上线前接邮件服务（如 Resend，用 `wrangler secret put RESEND_API_KEY`）并把它设为 false。

## 本地运行
```
cd apps/api && npm i
npx wrangler d1 migrations apply anon-match --local
npx wrangler dev --local    # http://localhost:8787
../../smoke.sh
```
## 部署（需 Cloudflare 登录，Wrangler 3 在 Node 20 可用）
```
npx wrangler login            # 或 export CLOUDFLARE_API_TOKEN=...
npx wrangler d1 create anon-match   # 把 database_id 填进 wrangler.toml
npx wrangler d1 migrations apply anon-match --remote
npx wrangler deploy           # → https://anon-match-api.<sub>.workers.dev
./smoke.sh https://anon-match-api.<sub>.workers.dev
```
部署 URL：**https://anon-match-api.tvytlx.workers.dev**（MCP：`/mcp`；D1 `anon-match` id 9d0fde1b-dafd-44c4-a307-ba2f77946b69）

⚠️ 当前 `DEV_RETURN_CODE="true"` 仅供测试，**上线前必须改为 false 并接入邮件服务**。

## 上架 Cursor Marketplace
1. 改 `packages/plugin/mcp.json` 为真实 Worker URL；2. 推到公开 GitHub 仓库；3. https://cursor.com/marketplace/publish 提交仓库链接。

## 开源说明
- 协议：MIT（见 `LICENSE`）。仓库包含后端（`apps/api`）和插件（`packages/plugin`）。
- **匹配算法**：`apps/api/src/index.js` 中 `ops.daily`（候选筛选 + `score()` 双向打分：preferences/likes 命中 +1、dislikes 命中 −2、同城 +2、随机扰动）；联系方式过滤见同文件 `CONTACT` / `contactHit`。
- 部署自己的实例：`wrangler d1 create anon-match` 后把 `wrangler.toml` 中 `database_id` 换成你自己的，再 migrations apply --remote + deploy（见上文）。

## 密钥与安全
- **不要把任何密钥提交到仓库**。`wrangler.toml` 的 `[vars]` 只放非敏感配置。
- 敏感值用 Cloudflare secret：`cd apps/api && npx wrangler secret put RESEND_API_KEY`（代码里通过 `env.RESEND_API_KEY` 读取）。
- 本地开发的密钥放 `apps/api/.dev.vars`（已在 `.gitignore`），格式 `RESEND_API_KEY=...`。
- `.gitignore` 已忽略 `node_modules/`、`.wrangler/`、`.dev.vars`、`*.log`。
- ⚠️ `DEV_RETURN_CODE="true"` 会把激活码直接返回给调用方，仅供测试；**上线前必须设为 `"false"` 并接入真实邮件发送**。

## Marketplace 提交前待办
- 补 `packages/plugin/assets/logo.png` 并在 `plugin.json` 加 `"logo": "assets/logo.png"`（可选）。
- 在 https://cursor.com/marketplace/publish 提交本仓库链接（插件位于 `packages/plugin`）。
