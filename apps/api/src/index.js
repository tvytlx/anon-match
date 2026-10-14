// Anon Match API: Cloudflare Worker + D1. JSON API + thin MCP (JSON-RPC over HTTP) at /mcp.
const now = () => Date.now();
const day = () => new Date().toISOString().slice(0, 10);
const uid = (p) => p + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" } });
class HttpErr extends Error { constructor(s, m) { super(m); this.status = s; } }
const fail = (s, m) => { throw new HttpErr(s, m); };
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const LIMITS = { display_name: 40, age_range: 20, gender: 20, seeking: 20, city: 60, bio: 1000, likes: 500, dislikes: 500 };
const BANNED = /(nude|nudes|porn|色情|裸照|约炮|escort)/i;
const PUBLIC_FIELDS = "user_id, display_name, age_range, gender, seeking, city, bio, likes, dislikes";

async function bump(env, userId, action, max) {
  const d = day();
  const r = await env.DB.prepare("SELECT count FROM rate_limits WHERE user_id=? AND action=? AND day=?").bind(userId, action, d).first();
  if (r && r.count >= max) fail(429, `daily limit reached for ${action}`);
  await env.DB.prepare("INSERT INTO rate_limits(user_id,action,day,count) VALUES(?,?,?,1) ON CONFLICT(user_id,action,day) DO UPDATE SET count=count+1").bind(userId, action, d).run();
}
async function auth(req, env) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) fail(401, "missing bearer token");
  const s = await env.DB.prepare("SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?").bind(await sha(t), now()).first();
  if (!s) fail(401, "invalid or expired session");
  return s;
}
async function loadMatch(env, id, userId) {
  const m = await env.DB.prepare("SELECT * FROM matches WHERE id=?").bind(id).first();
  if (!m || (m.user_a !== userId && m.user_b !== userId)) fail(404, "match not found");
  if (m.state === "agent_chat" || m.state === "pending_reveal") {
    if (m.reveal_deadline && m.reveal_deadline < now()) { await setMatch(env, m.id, "cancelled"); m.state = "cancelled"; }
  }
  return m;
}
async function setMatch(env, id, state) {
  await env.DB.prepare("UPDATE matches SET state=?, updated_at=? WHERE id=?").bind(state, now(), id).run();
  if (state === "cancelled" || state === "revealed") {
    const m = await env.DB.prepare("SELECT user_a,user_b FROM matches WHERE id=?").bind(id).first();
    if (state === "cancelled") for (const u of [m.user_a, m.user_b]) {
      const open = await env.DB.prepare("SELECT 1 FROM matches WHERE (user_a=? OR user_b=?) AND state IN ('matched','agent_chat','pending_reveal')").bind(u, u).first();
      if (!open) await env.DB.prepare("UPDATE profiles SET state='draft' WHERE user_id=?").bind(u).run();
    }
  }
}
async function matchView(env, m, me) {
  const other = m.user_a === me ? m.user_b : m.user_a;
  const p = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE user_id=?`).bind(other).first();
  const out = { match_id: m.id, state: m.state, partner: p, created_at: m.created_at, reveal_deadline: m.reveal_deadline };
  if (m.state === "revealed") out.partner_email = (await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(other).first()).email;
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
    console.log(`[activation] ${email} code=${code}`); // MVP: no mail provider wired yet
    const r = { sent: true, email, expires_in_sec: 900, note: "Activation code is delivered to the Grok Bot inbox (MVP: logged / returned in dev mode)." };
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
    if (!v.display_name) fail(400, "display_name required");
    await env.DB.prepare(`INSERT INTO profiles(user_id,display_name,age_range,gender,seeking,city,bio,likes,dislikes,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'draft',?)
      ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, age_range=excluded.age_range, gender=excluded.gender, seeking=excluded.seeking, city=excluded.city, bio=excluded.bio, likes=excluded.likes, dislikes=excluded.dislikes, updated_at=excluded.updated_at`)
      .bind(s.user_id, v.display_name, v.age_range, v.gender, v.seeking, v.city, v.bio, v.likes, v.dislikes, now()).run();
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
    const r = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM profiles WHERE user_id<>? AND (display_name LIKE ? OR city LIKE ? OR bio LIKE ? OR likes LIKE ?) ORDER BY updated_at DESC LIMIT 10`).bind(s.user_id, like, like, like, like).all();
    return { q, results: r.results, remaining_today: 0 };
  },
  async daily(env, s, b) {
    const me = await env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(s.user_id).first();
    if (!me) fail(400, "create your profile first");
    const target = b && b.user_id;
    await bump(env, s.user_id, "match", 1);
    let sql = `SELECT p.user_id FROM profiles p WHERE p.user_id<>?1
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a=?1 AND m.user_b=p.user_id) OR (m.user_b=?1 AND m.user_a=p.user_id))
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a=p.user_id OR m.user_b=p.user_id) AND m.state IN ('matched','agent_chat','pending_reveal'))`;
    const args = [s.user_id];
    if (target) { sql += " AND p.user_id=?2"; args.push(target); }
    else if (me.seeking) { sql += " AND (p.gender=?2 OR ?2='any')"; args.push(me.seeking); }
    sql += " ORDER BY (p.city=(SELECT city FROM profiles WHERE user_id=?1)) DESC, random() LIMIT 1";
    const c = await env.DB.prepare(sql).bind(...args).first();
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
    if (!["matched", "agent_chat"].includes(m.state)) fail(409, `cannot relay messages in state ${m.state}`);
    const body = String(b.body || "").trim();
    if (!body || body.length > 2000) fail(400, "body required (max 2000 chars)");
    if (BANNED.test(body)) fail(400, "message contains disallowed content");
    if (/[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(body)) fail(400, "do not share email addresses before reveal");
    await bump(env, s.user_id, "message", 100);
    const msg = { id: uid("msg"), match_id: id, sender_id: s.user_id, body, created_at: now() };
    await env.DB.prepare("INSERT INTO messages(id,match_id,sender_id,body,created_at) VALUES(?,?,?,?,?)").bind(msg.id, id, s.user_id, body, msg.created_at).run();
    if (m.state === "matched") { await setMatch(env, id, "agent_chat"); await env.DB.prepare("UPDATE profiles SET state='agent_chat' WHERE user_id IN (?,?)").bind(m.user_a, m.user_b).run(); }
    return { message: msg, match_state: "agent_chat" };
  },
  async getMessages(env, s, id) {
    await loadMatch(env, id, s.user_id);
    const r = await env.DB.prepare("SELECT id, sender_id, body, created_at FROM messages WHERE match_id=? ORDER BY created_at ASC LIMIT 500").bind(id).all();
    return { match_id: id, messages: r.results.map(x => ({ ...x, from_me: x.sender_id === s.user_id })) };
  },
  async reveal(env, s, id, b) {
    const m = await loadMatch(env, id, s.user_id);
    const d = b.decision;
    if (!["accept", "reject"].includes(d)) fail(400, "decision must be accept|reject");
    if (!["agent_chat", "pending_reveal"].includes(m.state)) fail(409, `cannot reveal in state ${m.state} (chat via agent first)`);
    await env.DB.prepare("INSERT INTO reveal_votes(match_id,user_id,decision,created_at) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET decision=excluded.decision, created_at=excluded.created_at").bind(id, s.user_id, d, now()).run();
    let state;
    if (d === "reject") state = "cancelled";
    else {
      const v = await env.DB.prepare("SELECT COUNT(*) n FROM reveal_votes WHERE match_id=? AND decision='accept'").bind(id).first();
      state = v.n >= 2 ? "revealed" : "pending_reveal";
    }
    await setMatch(env, id, state);
    if (state !== "cancelled") await env.DB.prepare("UPDATE profiles SET state=? WHERE user_id IN (?,?)").bind(state, m.user_a, m.user_b).run();
    // double-blind: the other side's vote is never exposed until both accept
    return { match: await matchView(env, await loadMatch(env, id, s.user_id), s.user_id) };
  },
};

// ---- thin MCP adapter (Streamable HTTP, JSON responses) ----
const TOOLS = [
  ["request_code", "Request an activation code for a *@mail.grokbot.com email", { email: "string" }, false, (e, s, a) => ops.requestCode(e, a)],
  ["verify_code", "Verify code; returns session token to use as Bearer", { email: "string", code: "string" }, false, (e, s, a) => ops.verify(e, a)],
  ["upsert_profile", "Create/update text-only profile", { display_name: "string", age_range: "string", gender: "string", seeking: "string", city: "string", bio: "string", likes: "string", dislikes: "string" }, true, (e, s, a) => ops.upsertProfile(e, s, a)],
  ["get_my_profile", "Get my profile", {}, true, (e, s) => ops.me(e, s)],
  ["search_profiles", "Keyword search (1/day), up to 10 anonymized profiles", { q: "string" }, true, (e, s, a) => ops.search(e, s, a)],
  ["daily_match", "Create today's match (1/day); optional user_id from search", { user_id: "string" }, true, (e, s, a) => ops.daily(e, s, a)],
  ["list_matches", "List my matches and states", {}, true, (e, s) => ops.listMatches(e, s)],
  ["send_message", "Relay an agent message within a match", { match_id: "string", body: "string" }, true, (e, s, a) => ops.postMessage(e, s, a.match_id, a)],
  ["get_messages", "Read relayed conversation for a match", { match_id: "string" }, true, (e, s, a) => ops.getMessages(e, s, a.match_id)],
  ["reveal_decision", "Vote accept|reject on swapping emails", { match_id: "string", decision: "string" }, true, (e, s, a) => ops.reveal(e, s, a.match_id, a)],
];
async function mcp(req, env) {
  if (req.method !== "POST") return json({ error: "POST JSON-RPC to /mcp" }, 405);
  const m = await req.json();
  const reply = (result) => json({ jsonrpc: "2.0", id: m.id, result });
  if (m.id === undefined) return new Response(null, { status: 202 });
  if (m.method === "initialize") return reply({ protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "anon-match", version: "0.1.0" } });
  if (m.method === "ping") return reply({});
  if (m.method === "tools/list") return reply({ tools: TOOLS.map(([name, description, props]) => ({ name, description, inputSchema: { type: "object", properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, { type: t }])) } })) });
  if (m.method === "tools/call") {
    const t = TOOLS.find(x => x[0] === m.params?.name);
    if (!t) return json({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "unknown tool" } });
    try {
      const s = t[3] ? await auth(req, env) : null;
      const r = await t[4](env, s, m.params.arguments || {});
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
      if (M === "GET" && p === "/v1/matches") return json(await ops.listMatches(env, s));
      const mm = p.match(/^\/v1\/matches\/([\w-]+)\/(messages|reveal)$/);
      if (mm && mm[2] === "messages" && M === "POST") return json(await ops.postMessage(env, s, mm[1], await body()));
      if (mm && mm[2] === "messages" && M === "GET") return json(await ops.getMessages(env, s, mm[1]));
      if (mm && mm[2] === "reveal" && M === "POST") return json(await ops.reveal(env, s, mm[1], await body()));
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: e.message }, e.status || 500); }
  },
};
