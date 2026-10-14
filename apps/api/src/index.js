// Anon Match API: Cloudflare Worker + D1. JSON API + thin MCP (JSON-RPC over HTTP) at /mcp.
const now = () => Date.now();
const day = () => new Date().toISOString().slice(0, 10);
const uid = (p) => p + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" } });
class HttpErr extends Error { constructor(s, m) { super(m); this.status = s; } }
const fail = (s, m) => { throw new HttpErr(s, m); };
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const LIMITS = { display_name: 40, age_range: 20, gender: 20, seeking: 20, city: 60, occupation: 60, bio: 1000, likes: 500, dislikes: 500, preferences: 1000 };
// Contact-info filter: active only before a match is confirmed.
const CONTACT = [
  [/[a-z0-9._%+-]+\s*(@|＠|\(at\)|\[at\])\s*[a-z0-9-]+(\s*(\.|\(dot\)|点)\s*[a-z]{2,})+/i, "email"],
  [/(\+?86[\s-]?)?1[3-9]\d([\s-]?\d){8}/, "phone number"],
  [/(\+?\d[\s-]?){10,}/, "phone number"],
  [/(微信|威信|薇信|wechat|weixin|v信|vx|wx|ｖｘ)\s*(号|id)?\s*[:：]?\s*[a-z0-9_-]{4,}/i, "WeChat"],
  [/(qq|扣扣|企鹅)\s*(号)?\s*[:：]?\s*\d{5,}/i, "QQ"],
  [/(telegram|tg|电报|飞机)\s*[:：@]?\s*@?[a-z0-9_]{4,}/i, "Telegram"],
  [/(instagram|\bins\b|\big\b|小红书|抖音|douyin|twitter|line|whatsapp|snap(chat)?|discord)\s*(号|id)?\s*[:：@]?\s*@?[a-z0-9_.]{3,}/i, "social handle"],
  [/(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|cn|net|org|io|me|co|app|xyz|cc|ly)\b/i, "URL"],
  [/t\.me\/|wa\.me\//i, "messaging link"],
];
const contactHit = (t) => { for (const [re, n] of CONTACT) if (re.test(t)) return n; return null; };
const BANNED = /(nude|nudes|porn|色情|裸照|约炮|escort)/i;
const PUBLIC_FIELDS = "user_id, display_name, age_range, gender, seeking, city, occupation, bio, likes, dislikes, preferences";
const OPEN = "('matched','agent_chat','pending_confirm')";

async function bump(env, userId, action, max) {
  const d = day();
  const r = await env.DB.prepare("SELECT count FROM rate_limits WHERE user_id=? AND action=? AND day=?").bind(userId, action, d).first();
  if (r && r.count >= max) fail(429, `daily limit reached for ${action}`);
  await env.DB.prepare("INSERT INTO rate_limits(user_id,action,day,count) VALUES(?,?,?,1) ON CONFLICT(user_id,action,day) DO UPDATE SET count=count+1").bind(userId, action, d).run();
}
async function auth(req, env, tok) {
  const t = tok || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) fail(401, "missing bearer token");
  const s = await env.DB.prepare("SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?").bind(await sha(t), now()).first();
  if (!s) fail(401, "invalid or expired session");
  return s;
}
async function loadMatch(env, id, userId) {
  const m = await env.DB.prepare("SELECT * FROM matches WHERE id=?").bind(id).first();
  if (!m || (m.user_a !== userId && m.user_b !== userId)) fail(404, "match not found");
  if (m.state === "agent_chat" || m.state === "pending_confirm") {
    if (m.reveal_deadline && m.reveal_deadline < now()) { await setMatch(env, m.id, "cancelled"); m.state = "cancelled"; }
  }
  return m;
}
async function setMatch(env, id, state) {
  await env.DB.prepare("UPDATE matches SET state=?, updated_at=? WHERE id=?").bind(state, now(), id).run();
  if (state === "cancelled" || state === "confirmed") {
    const m = await env.DB.prepare("SELECT user_a,user_b FROM matches WHERE id=?").bind(id).first();
    if (state === "cancelled") for (const u of [m.user_a, m.user_b]) {
      const open = await env.DB.prepare("SELECT 1 FROM matches WHERE (user_a=? OR user_b=?) AND state IN ('matched','agent_chat','pending_confirm')").bind(u, u).first();
      if (!open) await env.DB.prepare("UPDATE profiles SET state='draft' WHERE user_id=?").bind(u).run();
    }
  }
}
async function matchView(env, m, me) {
  const other = m.user_a === me ? m.user_b : m.user_a;
  const p = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE user_id=?`).bind(other).first();
  const out = { match_id: m.id, state: m.state, partner: p, created_at: m.created_at, confirm_deadline: m.reveal_deadline };
  out.unread = (await env.DB.prepare("SELECT COUNT(*) n FROM messages WHERE match_id=? AND sender_id<>? AND read_at IS NULL").bind(m.id, me).first()).n;
  out.contact_filter = m.state !== "confirmed";
  return out;
}

const ops = {
  async health() { return { ok: true, service: "anon-match-api", time: new Date().toISOString() }; },
  async requestCode(env, b) {
    const email = String(b.email || "").trim().toLowerCase();
    if (!new RegExp(`^[a-z0-9._+-]+@${env.EMAIL_DOMAIN.replace(/\./g, "\\.")}$`).test(email)) fail(400, `only *@${env.EMAIL_DOMAIN} emails are accepted`);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await env.DB.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING").bind(uid("u"), email, now()).run();
    await env.DB.prepare("INSERT INTO auth_codes(email,code_hash,expires_at,attempts) VALUES(?,?,?,0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0").bind(email, await sha(code), now() + 15 * 60e3).run();
    let sent = false, mail_error;
    if (env.EMAIL && env.MAIL_FROM) {
      try {
        await env.EMAIL.send({ to: email, from: { email: env.MAIL_FROM, name: "Anon Match" }, subject: `Anon Match activation code: ${code}`,
          text: `Your Anon Match activation code is ${code}\nIt expires in 15 minutes. If you didn't request this, ignore this email.`,
          html: `<p>Your Anon Match activation code is <b style="font-size:20px">${code}</b></p><p>It expires in 15 minutes. If you didn't request this, ignore this email.</p>` });
        sent = true;
      } catch (e) { mail_error = `${e.code || ""} ${e.message}`.trim(); console.error("[mail] send failed", mail_error); }
    }
    if (env.DEV_RETURN_CODE === "true") console.log(`[activation] ${email} code=${code}`);
    if (!sent && env.DEV_RETURN_CODE !== "true") fail(502, "failed to send activation email, try again later");
    const r = { sent, email, expires_in_sec: 900, note: "Activation code was emailed to your Grok Bot inbox (subject: Anon Match activation code)." };
    if (mail_error && env.DEV_RETURN_CODE === "true") r.mail_error = mail_error;
    if (env.DEV_RETURN_CODE === "true") r.activation_code = code;
    return r;
  },
  async verify(env, b) {
    const email = String(b.email || "").trim().toLowerCase();
    const row = await env.DB.prepare("SELECT * FROM auth_codes WHERE email=?").bind(email).first();
    if (!row || row.expires_at < now()) fail(400, "code expired or not requested");
    if (row.attempts >= 5) fail(429, "too many attempts, request a new code");
    if (row.code_hash !== await sha(String(b.code || ""))) { await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE email=?").bind(email).run(); fail(400, "wrong code"); }
    await env.DB.prepare("DELETE FROM auth_codes WHERE email=?").bind(email).run();
    await env.DB.prepare("UPDATE users SET status='active' WHERE email=?").bind(email).run();
    const u = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token), u.id, now() + 30 * 864e5).run();
    return { token, user_id: u.id, expires_in_days: 30 };
  },
  async upsertProfile(env, s, b) {
    const v = {};
    for (const [k, max] of Object.entries(LIMITS)) {
      const x = b[k] == null ? "" : Array.isArray(b[k]) ? b[k].join(", ") : String(b[k]);
      if (x.length > max) fail(400, `${k} too long (max ${max})`);
      if (BANNED.test(x)) fail(400, `${k} contains disallowed content (text-only, non-sexual social profiles)`);
      v[k] = x.trim();
    }
    if (!v.display_name) v.display_name = "匿名" + s.user_id.slice(-4);
    for (const k of ["bio", "display_name", "occupation", "likes", "dislikes", "preferences"]) { const h = contactHit(v[k]); if (h) fail(400, `${k} must not contain contact info (${h})`); }
    await env.DB.prepare(`INSERT INTO profiles(user_id,display_name,age_range,gender,seeking,city,occupation,bio,likes,dislikes,preferences,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft',?)
      ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, age_range=excluded.age_range, gender=excluded.gender, seeking=excluded.seeking, city=excluded.city, occupation=excluded.occupation, preferences=excluded.preferences, bio=excluded.bio, likes=excluded.likes, dislikes=excluded.dislikes, updated_at=excluded.updated_at`)
      .bind(s.user_id, v.display_name, v.age_range, v.gender, v.seeking, v.city, v.occupation, v.bio, v.likes, v.dislikes, v.preferences, now()).run();
    return ops.me(env, s);
  },
  async me(env, s) {
    const p = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS}, state FROM profiles WHERE user_id=?`).bind(s.user_id).first();
    return { user_id: s.user_id, email: s.email, profile: p || null };
  },
  async search(env, s, b) {
    const q = String(b.q || "").trim().slice(0, 50);
    if (!q) fail(400, "q required");
    await bump(env, s.user_id, "search", 1);
    const like = `%${q}%`;
    const r = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE user_id<>? AND (display_name LIKE ? OR city LIKE ? OR bio LIKE ? OR likes LIKE ? OR occupation LIKE ?) ORDER BY updated_at DESC LIMIT 10`).bind(s.user_id, like, like, like, like, like).all();
    return { q, results: r.results, remaining_today: 0 };
  },
  async daily(env, s, b) {
    const me = await env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(s.user_id).first();
    if (!me) fail(400, "create your profile first");
    const target = b && b.user_id;
    await bump(env, s.user_id, "match", 1);
    let sql = `SELECT p.* FROM profiles p WHERE p.user_id<>?1
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a=?1 AND m.user_b=p.user_id) OR (m.user_b=?1 AND m.user_a=p.user_id))
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a=p.user_id OR m.user_b=p.user_id) AND m.state IN ${OPEN})`;
    const args = [s.user_id];
    if (target) { sql += " AND p.user_id=?2"; args.push(target); }
    else if (me.seeking && me.seeking !== "any") { sql += " AND (p.gender=?2 OR p.gender='')"; args.push(me.seeking); }
    const cands = (await env.DB.prepare(sql + " LIMIT 200").bind(...args).all()).results;
    const toks = (t) => new Set(String(t || "").toLowerCase().split(/[\s,，、。;；/|]+|(?<=[\u4e00-\u9fff])(?=[\u4e00-\u9fff])/).filter(x => x.length > 0));
    const score = (x, y) => { // y's profile vs x's preferences/likes
      const want = toks(x.preferences + " " + x.likes), have = toks([y.bio, y.likes, y.city, y.occupation, y.age_range, y.gender].join(" "));
      let sc = 0; for (const w of want) if (have.has(w)) sc++;
      for (const w of toks(x.dislikes)) if (have.has(w)) sc -= 2;
      if (x.city && x.city === y.city) sc += 2; return sc;
    };
    let c = null, best = -1e9;
    for (const y of cands) { const sc = score(me, y) + score(y, me) + Math.random(); if (sc > best) { best = sc; c = y; } }
    if (!c) return { matched: false, reason: "no available candidate today; try tomorrow" };
    const id = uid("m"), t = now();
    await env.DB.prepare("INSERT INTO matches(id,user_a,user_b,state,created_at,updated_at,reveal_deadline) VALUES(?,?,?,'matched',?,?,?)").bind(id, s.user_id, c.user_id, t, t, t + Number(env.REVEAL_TIMEOUT_HOURS) * 3600e3).run();
    await env.DB.prepare("UPDATE profiles SET state='matched' WHERE user_id IN (?,?)").bind(s.user_id, c.user_id).run();
    console.log(`[notify] match ${id} created; would email both users`);
    return { matched: true, match: await matchView(env, await loadMatch(env, id, s.user_id), s.user_id) };
  },
  async listMatches(env, s) {
    const r = await env.DB.prepare("SELECT id FROM matches WHERE user_a=? OR user_b=? ORDER BY created_at DESC LIMIT 50").bind(s.user_id, s.user_id).all();
    const out = [];
    for (const x of r.results) out.push(await matchView(env, await loadMatch(env, x.id, s.user_id), s.user_id));
    return { matches: out };
  },
  async postMessage(env, s, id, b) {
    const m = await loadMatch(env, id, s.user_id);
    if (["cancelled"].includes(m.state)) fail(409, `cannot relay messages in state ${m.state}`);
    const body = String(b.body || "").trim();
    if (!body || body.length > 2000) fail(400, "body required (max 2000 chars)");
    if (BANNED.test(body)) fail(400, "message contains disallowed content");
    if (m.state !== "confirmed") { const h = contactHit(body); if (h) fail(400, `contact info (${h}) is blocked until both sides confirm the match`); }
    await bump(env, s.user_id, "message", 100);
    const msg = { id: uid("msg"), match_id: id, sender_id: s.user_id, body, created_at: now() };
    await env.DB.prepare("INSERT INTO messages(id,match_id,sender_id,body,created_at) VALUES(?,?,?,?,?)").bind(msg.id, id, s.user_id, body, msg.created_at).run();
    if (m.state === "matched") { await setMatch(env, id, "agent_chat"); await env.DB.prepare("UPDATE profiles SET state='agent_chat' WHERE user_id IN (?,?)").bind(m.user_a, m.user_b).run(); }
    return { message: msg, match_state: m.state === "matched" ? "agent_chat" : m.state };
  },
  async inbox(env, s, b) {
    const ms = (await env.DB.prepare(`SELECT * FROM matches WHERE (user_a=?1 OR user_b=?1) AND state IN ${OPEN.replace(")", ",'confirmed')")} ORDER BY created_at DESC`).bind(s.user_id).all()).results;
    const new_matches = [], rooms = [];
    for (const m0 of ms) {
      const m = await loadMatch(env, m0.id, s.user_id); if (m.state === "cancelled") continue;
      const seen = await env.DB.prepare("SELECT 1 FROM match_seen WHERE match_id=? AND user_id=?").bind(m.id, s.user_id).first();
      const v = await matchView(env, m, s.user_id);
      if (!seen) new_matches.push(v);
      const unread = (await env.DB.prepare("SELECT id, body, created_at FROM messages WHERE match_id=? AND sender_id<>? AND read_at IS NULL ORDER BY created_at").bind(m.id, s.user_id).all()).results;
      const g = (await env.DB.prepare("SELECT body, created_at FROM guidance WHERE match_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20").bind(m.id, s.user_id).all()).results;
      const recent = (await env.DB.prepare("SELECT sender_id, body, created_at FROM messages WHERE match_id=? ORDER BY created_at DESC LIMIT 10").bind(m.id).all()).results.reverse().map(x => ({ from_me: x.sender_id === s.user_id, body: x.body, created_at: x.created_at }));
      if (unread.length || !seen) rooms.push({ match_id: m.id, state: m.state, partner: v.partner, unread, recent, guidance: g, contact_filter: v.contact_filter });
    }
    const me = await ops.me(env, s);
    if (b.mark_read !== false) {
      for (const r of rooms) if (r.unread.length) await env.DB.prepare("UPDATE messages SET read_at=? WHERE match_id=? AND sender_id<>? AND read_at IS NULL").bind(now(), r.match_id, s.user_id).run();
      for (const v of new_matches) await env.DB.prepare("INSERT OR IGNORE INTO match_seen(match_id,user_id) VALUES(?,?)").bind(v.match_id, s.user_id).run();
    }
    return { my_profile: me.profile, new_matches, rooms, total_unread: rooms.reduce((a, r) => a + r.unread.length, 0) };
  },
  async markRead(env, s, id) {
    await loadMatch(env, id, s.user_id);
    const r = await env.DB.prepare("UPDATE messages SET read_at=? WHERE match_id=? AND sender_id<>? AND read_at IS NULL").bind(now(), id, s.user_id).run();
    return { match_id: id, marked: r.meta.changes };
  },
  async addGuidance(env, s, id, b) {
    await loadMatch(env, id, s.user_id);
    const body = String(b.body || "").trim(); if (!body || body.length > 1000) fail(400, "body required (max 1000)");
    const g = { id: uid("g"), match_id: id, body, created_at: now() };
    await env.DB.prepare("INSERT INTO guidance(id,match_id,user_id,body,created_at) VALUES(?,?,?,?,?)").bind(g.id, id, s.user_id, body, g.created_at).run();
    return { guidance: g };
  },
  async listGuidance(env, s, id) {
    await loadMatch(env, id, s.user_id);
    return { match_id: id, guidance: (await env.DB.prepare("SELECT id, body, created_at FROM guidance WHERE match_id=? AND user_id=? ORDER BY created_at DESC").bind(id, s.user_id).all()).results };
  },
  async getMessages(env, s, id) {
    await loadMatch(env, id, s.user_id);
    const r = await env.DB.prepare("SELECT id, sender_id, body, created_at FROM messages WHERE match_id=? ORDER BY created_at ASC LIMIT 500").bind(id).all();
    return { match_id: id, messages: r.results.map(x => ({ ...x, from_me: x.sender_id === s.user_id })) };
  },
  async confirm(env, s, id, b) {
    const m = await loadMatch(env, id, s.user_id);
    const d = b.decision;
    if (d === "confirm") b.decision = "accept"; const dd = b.decision; if (!["accept", "reject"].includes(dd)) fail(400, "decision must be confirm|accept|reject");
    if (!["agent_chat", "pending_confirm"].includes(m.state)) fail(409, `cannot confirm in state ${m.state} (chat via agent first)`);
    await env.DB.prepare("INSERT INTO reveal_votes(match_id,user_id,decision,created_at) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET decision=excluded.decision, created_at=excluded.created_at").bind(id, s.user_id, dd, now()).run();
    let state;
    if (dd === "reject") state = "cancelled";
    else {
      const v = await env.DB.prepare("SELECT COUNT(*) n FROM reveal_votes WHERE match_id=? AND decision='accept'").bind(id).first();
      state = v.n >= 2 ? "confirmed" : "pending_confirm";
    }
    await setMatch(env, id, state);
    if (state !== "cancelled") await env.DB.prepare("UPDATE profiles SET state=? WHERE user_id IN (?,?)").bind(state, m.user_a, m.user_b).run();
    // double-blind: the other side's vote is never exposed until both accept
    return { match: await matchView(env, await loadMatch(env, id, s.user_id), s.user_id) };
  },
};

// ---- thin MCP adapter (Streamable HTTP, JSON responses) ----
const T = "string";
const TOOLS = [
  ["request_code", "Request an activation code for the user's *@mail.grokbot.com email (human verification only)", { email: T }, false, (e, s, a) => ops.requestCode(e, a)],
  ["verify_code", "Verify code; returns session token. Pass it as `token` to every other tool (or Authorization: Bearer).", { email: T, code: T }, false, (e, s, a) => ops.verify(e, a)],
  ["upsert_profile", "Create/update anonymous text profile; all fields optional. preferences = natural-language match preferences", { display_name: T, age_range: T, gender: T, seeking: T, city: T, occupation: T, bio: T, likes: T, dislikes: T, preferences: T }, true, (e, s, a) => ops.upsertProfile(e, s, a)],
  ["get_my_profile", "Get my profile", {}, true, (e, s) => ops.me(e, s)],
  ["search_profiles", "Keyword search (1/day), up to 10 anonymized profiles", { q: T }, true, (e, s, a) => ops.search(e, s, a)],
  ["daily_match", "Create today's best-scored match (1/day); optional user_id from search", { user_id: T }, true, (e, s, a) => ops.daily(e, s, a)],
  ["list_matches", "List my matches, states, unread counts", {}, true, (e, s) => ops.listMatches(e, s)],
  ["check_inbox", "Heartbeat: new matches + unread messages per room with recent context and my guidance. Marks them read unless mark_read=false", { mark_read: "boolean" }, true, (e, s, a) => ops.inbox(e, s, a)],
  ["send_message", "Relay an agent message within a match (contact info blocked until confirmed)", { match_id: T, body: T }, true, (e, s, a) => ops.postMessage(e, s, a.match_id, a)],
  ["get_messages", "Read full relayed conversation for a match", { match_id: T }, true, (e, s, a) => ops.getMessages(e, s, a.match_id)],
  ["mark_read", "Mark a room's messages read", { match_id: T }, true, (e, s, a) => ops.markRead(e, s, a.match_id)],
  ["add_guidance", "Save the user's instruction for this match (used by heartbeat replies)", { match_id: T, body: T }, true, (e, s, a) => ops.addGuidance(e, s, a.match_id, a)],
  ["list_guidance", "List my guidance for a match", { match_id: T }, true, (e, s, a) => ops.listGuidance(e, s, a.match_id)],
  ["confirm_match", "Vote confirm|reject. Both confirm → confirmed (contact filter lifted). Any reject/72h timeout → cancelled", { match_id: T, decision: T }, true, (e, s, a) => ops.confirm(e, s, a.match_id, a)],
];
async function mcp(req, env) {
  if (req.method !== "POST") return json({ error: "POST JSON-RPC to /mcp" }, 405);
  const m = await req.json();
  const reply = (result) => json({ jsonrpc: "2.0", id: m.id, result });
  if (m.id === undefined) return new Response(null, { status: 202 });
  if (m.method === "initialize") return reply({ protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "anon-match", version: "0.2.0" } });
  if (m.method === "ping") return reply({});
  if (m.method === "tools/list") return reply({ tools: TOOLS.map(([name, description, props]) => ({ name, description, inputSchema: { type: "object", properties: Object.fromEntries([...Object.entries(props), ...(TOOLS.find(x => x[0] === name)[3] ? [["token", T]] : [])].map(([k, t]) => [k, { type: t }])) } })) });
  if (m.method === "tools/call") {
    const t = TOOLS.find(x => x[0] === m.params?.name);
    if (!t) return json({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "unknown tool" } });
    try {
      const args = m.params.arguments || {};
      const s = t[3] ? await auth(req, env, args.token) : null;
      const r = await t[4](env, s, args);
      return reply({ content: [{ type: "text", text: JSON.stringify(r) }] });
    } catch (e) { return reply({ isError: true, content: [{ type: "text", text: e.message }] }); }
  }
  return json({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return json({});
    const url = new URL(req.url), p = url.pathname, M = req.method;
    const body = async () => { try { return await req.json(); } catch { return {}; } };
    try {
      if (p === "/mcp") return await mcp(req, env);
      if (p === "/" || p === "/v1/health") return json(await ops.health());
      if (M === "POST" && p === "/v1/auth/request-code") return json(await ops.requestCode(env, await body()));
      if (M === "POST" && p === "/v1/auth/verify") return json(await ops.verify(env, await body()));
      const s = await auth(req, env);
      if (M === "POST" && p === "/v1/profile") return json(await ops.upsertProfile(env, s, await body()));
      if (M === "GET" && p === "/v1/profile/me") return json(await ops.me(env, s));
      if (M === "POST" && p === "/v1/search") return json(await ops.search(env, s, await body()));
      if (M === "POST" && p === "/v1/match/daily") return json(await ops.daily(env, s, await body()));
      if (M === "GET" && p === "/v1/inbox") return json(await ops.inbox(env, s, { mark_read: url.searchParams.get("mark_read") !== "0" }));
      if (M === "GET" && p === "/v1/matches") return url.searchParams.get("unread") === "1" ? json(await ops.inbox(env, s, { mark_read: false })) : json(await ops.listMatches(env, s));
      const mm = p.match(/^\/v1\/matches\/([\w-]+)\/(messages|reveal|confirm|guidance|read)$/);
      if (mm && mm[2] === "guidance") return json(M === "POST" ? await ops.addGuidance(env, s, mm[1], await body()) : await ops.listGuidance(env, s, mm[1]));
      if (mm && mm[2] === "read" && M === "POST") return json(await ops.markRead(env, s, mm[1]));
      if (mm && mm[2] === "messages" && M === "POST") return json(await ops.postMessage(env, s, mm[1], await body()));
      if (mm && mm[2] === "messages" && M === "GET") return json(await ops.getMessages(env, s, mm[1]));
      if (mm && (mm[2] === "confirm" || mm[2] === "reveal") && M === "POST") return json(await ops.confirm(env, s, mm[1], await body()));
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: e.message }, e.status || 500); }
  },
};
