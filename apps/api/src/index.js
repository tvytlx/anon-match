// Wingbot API: Cloudflare Worker + D1. JSON API + thin MCP (JSON-RPC over HTTP) at /mcp.
const now = () => Date.now();
const day = () => new Date().toISOString().slice(0, 10);
const uid = (p) => p + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
class HttpErr extends Error { constructor(s, m) { super(m); this.status = s; } }
const fail = (s, m) => { throw new HttpErr(s, m); };
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const LIMITS = { display_name: 40, age_range: 20, gender: 20, seeking: 20, city: 60, occupation: 60, bio: 500, likes: 500, dislikes: 500, preferences: 500 };
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
// Insults / profanity / sexual slurs (EN + ZH). Applied to display_name, bio, likes, dislikes, occupation, messages, memories.
const PROFANE_EN = /\b(dicks?|dickhead|cocks?|cocksucker|pussy|pussies|cunts?|twats?|fuck\w*|fck|fuk|motherfucker|shit\w*|bullshit|bitch\w*|bastards?|assholes?|arsehole|whores?|sluts?|hoes?|wankers?|jerk ?off|blowjob|handjob|cum|rapist|rape|retard\w*|fag|faggots?|dyke|nigg\w*|chinks?|spic|kike|tranny|prick|douche\w*|tits?|boobs?|horny|milf|dildo|penis|vagina|anal)\b/i;
const PROFANE_ZH = /(傻逼|傻b|煞笔|沙比|操你|草你|肏|日你妈|干你娘|艹你|尼玛|他妈的|tmd|nmsl|去死|废物|贱人|贱货|婊子|骚货|骚逼|浪货|荡妇|妓女|鸡巴|几把|鸡吧|屌|屄|逼样|狗日|王八蛋|畜生|杂种|野种|滚蛋|脑残|智障|弱智|死妈|绿茶婊|白莲花婊|阴茎|阴道|做爱|性交|口交|撸管|打飞机|淫荡|奶子)/i;
const profaneHit = (t) => { const x = String(t || "").normalize("NFKC").replace(/[\s._\-*·]+/g, ""); return PROFANE_EN.test(String(t || "")) || PROFANE_ZH.test(x) || /(fuck|cunt|傻逼|鸡巴)/i.test(x); };
const MAX_OPEN = 3; // concurrent open chats per user
const PROFANE_MSG = (k) => `${k} contains insulting, profane or sexual words; please rephrase / ${k} 含有侮辱、脏话或性暗示词汇，请修改后再提交`;
// Partner/public view: NEVER include matching criteria (preferences, seeking, dislikes).
const PUBLIC_FIELDS = "user_id, display_name, age_range, gender, city, occupation, bio, likes";
const OWN_FIELDS = PUBLIC_FIELDS + ", seeking, dislikes, preferences, age, want_age_min, want_age_max, want_same_city, want_gender";
// ---- optional hard filters (private; never in PUBLIC_FIELDS) ----
export const normGender = (g) => { const x = String(g ?? "").trim().toLowerCase(); if (!x) return null;
  if (/^(男|男生|男性|male|m|man|men|boy)$/.test(x)) return "男"; if (/^(女|女生|女性|female|f|woman|women|girl)$/.test(x)) return "女"; return null; };
export const ageOf = (p) => { if (Number.isInteger(p.age)) return p.age; const n = String(p.age_range || "").match(/\d+/g); if (!n) return null;
  return n.length === 1 ? +n[0] : Math.round((+n[0] + +n[1]) / 2); };
const wantG = (p) => normGender(p.want_gender || p.seeking);
// does y satisfy x's hard filters?
export const fitsFilters = (x, y) => {
  if (x.want_age_min != null || x.want_age_max != null) { const a = ageOf(y); if (a == null) return false;
    if (x.want_age_min != null && a < x.want_age_min) return false; if (x.want_age_max != null && a > x.want_age_max) return false; }
  if (x.want_same_city) { if (!x.city || !y.city || x.city.trim() !== y.city.trim()) return false; }
  const g = wantG(x); if (g && normGender(y.gender) !== g) return false;
  return true;
};
export const mutualFit = (a, b) => fitsFilters(a, b) && fitsFilters(b, a);
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

// ---- rate limiting (D1 fixed windows + optional IP_RL binding) ----
const RL = { // [per minute, per day]
  check_inbox: [20, 500], get_messages: [30, 1000], send_message: [10, 300], upsert_profile: [5, 50], add_guidance: [10, 100],
  upsert_memory: [100, 1000], delete_memory: [30, 500], mark_summarized: [30, 500], confirm_match: [5, 30], _read: [60, 2000] };
const dur = (sec) => sec >= 3600 ? [`${Math.ceil(sec / 3600)} 小时`, `${Math.ceil(sec / 3600)} hour(s)`] : [`${Math.max(1, Math.ceil(sec / 60))} 分钟`, `${Math.max(1, Math.ceil(sec / 60))} minute(s)`];
class RateErr extends HttpErr { constructor(sec, scope, zh) { const [z, e] = dur(sec); super(429, `Too many requests, please retry in ${e}`); this.retry = sec; this.scope = scope; this.zh = zh || `请求太频繁，请 ${z}后再试`; } }
const rateBody = (e) => ({ error: "rate_limited", message: e.zh, message_en: e.message, retry_after_sec: e.retry, scope: e.scope });
const ipOf = (req) => req.headers.get("cf-connecting-ip") || "unknown";
// specs: [bucket, windowSec, max, scope, zhMsg?, increment?]
async function hit(env, specs) {
  const t = Math.floor(now() / 1000);
  const rs = await env.DB.batch(specs.map(([b, w, , , , inc = 1]) => env.DB.prepare("INSERT INTO rl(bucket,win,n) VALUES(?,?,?) ON CONFLICT(bucket,win) DO UPDATE SET n=n+excluded.n RETURNING n").bind(b, t - t % w, inc)));
  if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM rl WHERE win<? AND win<>0 OR (win=0 AND bucket LIKE 'agent:%' AND substr(bucket,-10)<?)").bind(t - 2 * 86400, new Date(now() - 2 * 864e5).toISOString().slice(0, 10)).run();
  specs.forEach(([, w, max, scope, zh], i) => { if (rs[i].results[0].n > max) throw new RateErr(w - t % w, scope, zh); });
}
async function peek(env, b, w) { const t = Math.floor(now() / 1000); const r = await env.DB.prepare("SELECT n FROM rl WHERE bucket=? AND win=?").bind(b, t - t % w).first(); return { n: r ? r.n : 0, left: w - t % w }; }
async function limitUser(env, s, tool, a = {}) {
  const [m, d] = RL[tool] || RL._read, inc = tool === "upsert_memory" ? (Array.isArray(a.items) ? Math.max(1, a.items.length) : 1) : 1;
  const k = RL[tool] ? tool : "read", specs = [[`u:${s.user_id}:${k}:m`, 60, m, "user", null, inc], [`u:${s.user_id}:${k}:d`, 86400, d, "user", null, inc]];
  if (tool === "send_message" && a.match_id) specs.push([`room:${s.user_id}:${a.match_id}`, 86400, 100, "room", "这个房间今天消息太多了，休息一下，明天再聊"]);
  await hit(env, specs);
}
async function authLimited(req, env, tok) {
  try { return await auth(req, env, tok); }
  catch (e) { if (e.status === 401) await hit(env, [[`badauth:${ipOf(req)}`, 600, 20, "ip", "无效凭证尝试过多，请 10 分钟后再试"]]); throw e; }
}
async function loadMatch(env, id, userId) {
  const m = await env.DB.prepare("SELECT * FROM matches WHERE id=?").bind(id).first();
  if (!m || (m.user_a !== userId && m.user_b !== userId)) fail(404, "match not found");
  if (m.state === "agent_chat" || m.state === "pending_confirm") {
    if (m.reveal_deadline && m.reveal_deadline < now()) { await setMatch(env, m.id, "cancelled"); m.state = "cancelled"; }
  }
  return m;
}
async function addEvent(env, userId, type, matchId, payload) {
  await env.DB.prepare("INSERT INTO events(user_id,type,match_id,payload,created_at) VALUES(?,?,?,?,?)").bind(userId, type, matchId || null, payload ? JSON.stringify(payload) : null, now()).run();
}
async function setMatch(env, id, state) {
  await env.DB.prepare("UPDATE matches SET state=?, updated_at=? WHERE id=?").bind(state, now(), id).run();
  if (state === "cancelled" || state === "confirmed") {
    const m = await env.DB.prepare("SELECT user_a,user_b FROM matches WHERE id=?").bind(id).first();
    if (state === "cancelled") for (const u of [m.user_a, m.user_b]) await addEvent(env, u, "match_cancelled", id, {});
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
  // double-blind: only my own vote is visible to me; partner's vote never exposed
  const mine = await env.DB.prepare("SELECT decision FROM reveal_votes WHERE match_id=? AND user_id=?").bind(m.id, me).first();
  if (mine && m.state === "agent_chat") { out.my_decision = mine.decision; out.waiting_for_partner = mine.decision === "accept"; }
  if (m.state === "confirmed") out.partner_email = (await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(other).first())?.email;
  if ((await env.DB.prepare("SELECT is_test FROM users WHERE id=?").bind(other).first())?.is_test) { out.partner_is_official_test = true; out.notice = "这是 Wingbot 官方测试账号（非真实用户） / Official Wingbot test account, not a real person"; }
  return out;
}

const MAX_BODY = 32 * 1024;
async function readBody(req) {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) fail(413, "request body too large (max 32KB)");
  const t = await req.text(); if (t.length > MAX_BODY) fail(413, "request body too large (max 32KB)"); return t;
}
const ops = {
  async health() { return { ok: true, service: "anon-match-api", time: new Date().toISOString() }; },
  async requestCode(env, b, ip = "unknown") {
    const email = String(b.email || "").trim().toLowerCase();
    if (email.length > 254 || !/^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(email) || email.includes("..")) fail(400, "invalid email address");
    const zh = "验证码发送太频繁，请稍后再试";
    await hit(env, [[`rc:e:${email}:m`, 60, 1, "email", "验证码发送太频繁，请 1 分钟后再试"], [`rc:e:${email}:h`, 3600, 5, "email"], [`rc:e:${email}:d`, 86400, 10, "email"],
      [`rc:ip:${ip}:m`, 60, 2, "ip"], [`rc:ip:${ip}:d`, 86400, 2, "ip"], ["rc:global:d", 86400, 500, "global", "系统繁忙，今日验证码额度已用完，请明天再试"]]);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    // attempts persist across resends; only reset once the previous code has expired
    await env.DB.prepare("INSERT INTO auth_codes(email,code_hash,expires_at,attempts) VALUES(?1,?2,?3,0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, attempts=CASE WHEN auth_codes.expires_at<?4 THEN 0 ELSE auth_codes.attempts END, expires_at=excluded.expires_at").bind(email, await sha(code), now() + 15 * 60e3, now()).run();
    let sent = false, mail_error;
    if (env.EMAIL && env.MAIL_FROM) {
      try {
        await env.EMAIL.send({ to: email, from: { email: env.MAIL_FROM, name: "Wingbot" }, subject: `Wingbot activation code: ${code}`,
          text: `Your Wingbot activation code is ${code}\nIt expires in 15 minutes. If you didn't request this, ignore this email.`,
          html: `<p>Your Wingbot activation code is <b style="font-size:20px">${code}</b></p><p>It expires in 15 minutes. If you didn't request this, ignore this email.</p>` });
        sent = true;
      } catch (e) { mail_error = `${e.code || ""} ${e.message}`.trim(); console.error("[mail] send failed", mail_error); }
    }
    if (env.DEV_RETURN_CODE === "true") console.log(`[activation] ${email} code=${code}`);
    if (!sent && env.DEV_RETURN_CODE !== "true") fail(502, "failed to send activation email, try again later");
    const r = { sent, email, expires_in_sec: 900, note: "Activation code was emailed to your inbox (subject: Wingbot activation code)." };
    if (mail_error && env.DEV_RETURN_CODE === "true") r.mail_error = mail_error;
    if (env.DEV_RETURN_CODE === "true") r.activation_code = code;
    return r;
  },
  async verify(env, b, ip = "unknown") {
    const email = String(b.email || "").trim().toLowerCase();
    await hit(env, [[`vf:ip:${ip}:m`, 60, 10, "ip"], [`vf:ip:${ip}:h`, 3600, 50, "ip"]]);
    const lock = await peek(env, `vf:fail:${email}`, 3600);
    if (lock.n >= 10) throw new RateErr(lock.left, "email", `验证码错误次数过多，请 ${dur(lock.left)[0]}后再试`);
    const row = await env.DB.prepare("SELECT * FROM auth_codes WHERE email=?").bind(email).first();
    if (!row || row.expires_at < now()) fail(400, "code expired or not requested");
    if (row.attempts >= 5) fail(429, "too many attempts, request a new code");
    if (row.code_hash !== await sha(String(b.code || ""))) { await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE email=?").bind(email).run(); await hit(env, [[`vf:fail:${email}`, 3600, 1e9, "email"]]); fail(400, "wrong code"); }
    await env.DB.prepare("DELETE FROM auth_codes WHERE email=?").bind(email).run();
    await env.DB.prepare("INSERT INTO users(id,email,status,created_at) VALUES(?,?,'active',?) ON CONFLICT(email) DO UPDATE SET status='active'").bind(uid("u"), email, now()).run();
    const u = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token), u.id, now() + 30 * 864e5).run();
    return { token, user_id: u.id, expires_in_days: 30 };
  },
  async upsertProfile(env, s, b) {
    const v = {};
    for (const [k, max] of Object.entries(LIMITS)) {
      const x = b[k] == null ? "" : Array.isArray(b[k]) ? b[k].join(", ") : String(b[k]);
      if (x.length > max) fail(400, `${k} too long: ${x.length} chars, max ${max} / ${k} 超出字数上限（${x.length}/${max} 字），请精简后再保存`);
      if (BANNED.test(x)) fail(400, `${k} contains disallowed content (text-only, non-sexual social profiles)`);
      if (profaneHit(x)) fail(400, PROFANE_MSG(k));
      v[k] = x.trim();
    }
    if (!v.display_name) v.display_name = "匿名" + s.user_id.slice(-4);
    for (const k of ["bio", "display_name", "occupation", "likes", "dislikes", "preferences"]) { const h = contactHit(v[k]); if (h) fail(400, `${k} must not contain contact info (${h})`); }
    // hard filters: a key that is absent keeps its stored value; null/"" clears it
    const cur = (await env.DB.prepare("SELECT age, want_age_min, want_age_max, want_same_city, want_gender FROM profiles WHERE user_id=?").bind(s.user_id).first()) || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    const intF = (k, lo, hi) => { if (!has(k)) return cur[k] ?? null; const x = b[k]; if (x == null || x === "") return null;
      const n = Number(x); if (!Number.isInteger(n) || n < lo || n > hi) fail(400, `${k} must be an integer ${lo}-${hi} or empty / ${k} 需为 ${lo}-${hi} 的整数或留空`); return n; };
    const f = { age: intF("age", 18, 120), want_age_min: intF("want_age_min", 18, 120), want_age_max: intF("want_age_max", 18, 120) };
    if (f.want_age_min != null && f.want_age_max != null && f.want_age_min > f.want_age_max) fail(400, "want_age_min > want_age_max / 最小年龄不能大于最大年龄");
    if (!has("want_same_city")) f.want_same_city = cur.want_same_city ?? null;
    else { const x = b.want_same_city; f.want_same_city = x == null || x === "" ? null : (x === true || x === 1 || /^(true|1|yes|是)$/i.test(String(x))) ? 1 : 0; }
    if (has("want_gender")) { const x = String(b.want_gender ?? "").trim(); if (x && !normGender(x) && !/^(any|都可以|不限|all|both)$/i.test(x)) fail(400, "want_gender must be 男/女/any / want_gender 只能是 男、女 或 any");
      f.want_gender = normGender(x); if (!has("seeking")) v.seeking = f.want_gender || (x ? "any" : ""); }
    else f.want_gender = has("seeking") ? normGender(v.seeking) : (cur.want_gender ?? null);
    await env.DB.prepare(`INSERT INTO profiles(user_id,display_name,age_range,gender,seeking,city,occupation,bio,likes,dislikes,preferences,age,want_age_min,want_age_max,want_same_city,want_gender,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)
      ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, age_range=excluded.age_range, gender=excluded.gender, seeking=excluded.seeking, city=excluded.city, occupation=excluded.occupation, preferences=excluded.preferences, bio=excluded.bio, likes=excluded.likes, dislikes=excluded.dislikes, age=excluded.age, want_age_min=excluded.want_age_min, want_age_max=excluded.want_age_max, want_same_city=excluded.want_same_city, want_gender=excluded.want_gender, updated_at=excluded.updated_at`)
      .bind(s.user_id, v.display_name, v.age_range, v.gender, v.seeking, v.city, v.occupation, v.bio, v.likes, v.dislikes, v.preferences, f.age, f.want_age_min, f.want_age_max, f.want_same_city, f.want_gender, now()).run();
    return ops.me(env, s);
  },
  async me(env, s) {
    const p = await env.DB.prepare(`SELECT ${OWN_FIELDS}, state FROM profiles WHERE user_id=?`).bind(s.user_id).first();
    return { user_id: s.user_id, email: s.email, profile: p || null };
  },
  async search(env, s, b) {
    const q = String(b.q || "").trim().slice(0, 50);
    if (!q) fail(400, "q required");
    await bump(env, s.user_id, "search", 1);
    const like = `%${q}%`;
    const r = await env.DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM profiles p WHERE user_id<>? AND p.user_id NOT IN (SELECT id FROM users WHERE is_test=1) AND (display_name LIKE ? OR city LIKE ? OR bio LIKE ? OR likes LIKE ? OR occupation LIKE ?) ORDER BY updated_at DESC LIMIT 10`).bind(s.user_id, like, like, like, like, like).all();
    return { q, results: r.results, remaining_today: 0 };
  },
  async daily(env, s, b) {
    const me = await env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(s.user_id).first();
    if (!me) fail(400, "create your profile first");
    const target = b && b.user_id;
    const openN = async (u) => (await env.DB.prepare(`SELECT COUNT(*) n FROM matches WHERE (user_a=? OR user_b=?) AND state IN ${OPEN}`).bind(u, u).first()).n;
    if (await openN(s.user_id) >= MAX_OPEN) fail(409, `you already have ${MAX_OPEN} open chats (max concurrent); finish or end one first / 已有 ${MAX_OPEN} 个进行中的聊天室`);
    await bump(env, s.user_id, "match", 3);
    let sql = `SELECT p.* FROM profiles p WHERE p.user_id<>?1 AND p.user_id NOT IN (SELECT id FROM users WHERE is_test=1)
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a=?1 AND m.user_b=p.user_id) OR (m.user_b=?1 AND m.user_a=p.user_id))
      AND (SELECT COUNT(*) FROM matches m WHERE (m.user_a=p.user_id OR m.user_b=p.user_id) AND m.state IN ${OPEN}) < ${MAX_OPEN}`;
    const args = [s.user_id];
    if (target) { sql += " AND p.user_id=?2"; args.push(target); }
    const cands = (await env.DB.prepare(sql + " LIMIT 500").bind(...args).all()).results.filter((y) => mutualFit(me, y));
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
    for (const [u, o] of [[s.user_id, c.user_id], [c.user_id, s.user_id]]) await addEvent(env, u, "new_match", id, { partner_name: (await env.DB.prepare("SELECT display_name FROM profiles WHERE user_id=?").bind(o).first())?.display_name });
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
    if (profaneHit(body)) fail(400, PROFANE_MSG("message"));
    if (m.state !== "confirmed") { const h = contactHit(body); if (h) fail(400, `contact info (${h}) is blocked until both sides confirm the match`); }
    await bump(env, s.user_id, "message", 100);
    // agent auto messages: max 3 per user per match per day (Asia/Shanghai day); guided:true (user-directed) skips the cap
    const guided = b.guided === true || b.guided === "true";
    const ak = `agent:${s.user_id}:${id}:${new Date(now() + 8 * 3600e3).toISOString().slice(0, 10)}`;
    if (!guided) {
      const c = await env.DB.prepare("SELECT n FROM rl WHERE bucket=? AND win=0").bind(ak).first();
      if (c && c.n >= 3) fail(429, "daily_agent_message_limit: agent auto messages for this match are capped at 3/day (resets 00:00 Asia/Shanghai). Wait for tomorrow or ask the user; user-guided replies can be sent with guided:true. 今天这个配对的自动消息已达 3 条上限，明天再聊，或由用户本人指示后发送。");
    }
    const msg = { id: uid("msg"), match_id: id, sender_id: s.user_id, body, created_at: now() };
    await env.DB.prepare("INSERT INTO messages(id,match_id,sender_id,body,created_at) VALUES(?,?,?,?,?)").bind(msg.id, id, s.user_id, body, msg.created_at).run();
    await addEvent(env, m.user_a === s.user_id ? m.user_b : m.user_a, "new_message", id, { message_id: msg.id, body: body.slice(0, 200) });
    if (!guided) await env.DB.prepare("INSERT INTO rl(bucket,win,n) VALUES(?,0,1) ON CONFLICT(bucket,win) DO UPDATE SET n=n+1").bind(ak).run();
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
    const ended = (await env.DB.prepare(`SELECT m.id, m.state FROM matches m WHERE (m.user_a=?1 OR m.user_b=?1) AND (m.state IN ('confirmed','cancelled') OR m.reveal_deadline<?2)
      AND EXISTS (SELECT 1 FROM messages x WHERE x.match_id=m.id AND x.sender_id=?1)
      AND NOT EXISTS (SELECT 1 FROM memory_summaries ms WHERE ms.match_id=m.id AND ms.user_id=?1) LIMIT 10`).bind(s.user_id, now()).all()).results;
    const to_summarize = [];
    for (const e of ended) { const m = await loadMatch(env, e.id, s.user_id); if (m.state === "confirmed" || m.state === "cancelled") to_summarize.push({ match_id: m.id, state: m.state }); }
    const mem_count = (await env.DB.prepare("SELECT COUNT(*) n FROM memories WHERE user_id=?").bind(s.user_id).first()).n;
    const events = (await ops.events(env, s, { since: b.since })).events;
    return { events, my_profile: me.profile, memory_count: mem_count, to_summarize, new_matches, rooms, total_unread: rooms.reduce((a, r) => a + r.unread.length, 0) };
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
  async listMemory(env, s, q) {
    let sql = "SELECT id, kind, key, value, source_match_id, updated_at FROM memories WHERE user_id=?", a = [s.user_id];
    if (q.kind) { sql += " AND kind=?"; a.push(q.kind); }
    if (q.q) { sql += " AND (key LIKE ? OR value LIKE ?)"; a.push(`%${q.q}%`, `%${q.q}%`); }
    return { memories: (await env.DB.prepare(sql + " ORDER BY kind, updated_at DESC LIMIT 500").bind(...a).all()).results };
  },
  async upsertMemory(env, s, b) {
    const items = Array.isArray(b.items) ? b.items : [b];
    if (items.length > 50) fail(400, "max 50 items per call");
    const out = [];
    for (const it of items) {
      const kind = String(it.kind || ""), key = String(it.key || "").trim(), value = String(it.value || "").trim();
      if (!["fact", "preference", "style"].includes(kind)) fail(400, "kind must be fact|preference|style");
      if (!key || key.length > 200 || !value || value.length > 1000) fail(400, "key (≤200) and value (≤1000) required");
      for (const [k, v] of [["key", key], ["value", value]]) { const h = contactHit(v); if (h) fail(400, `memory ${k} must not contain contact info (${h})`); if (BANNED.test(v)) fail(400, "disallowed content"); if (profaneHit(v)) fail(400, PROFANE_MSG(`memory ${k}`)); }
      if (it.source_match_id) await loadMatch(env, it.source_match_id, s.user_id);
      await env.DB.prepare("INSERT INTO memories(id,user_id,kind,key,value,source_match_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,kind,key) DO UPDATE SET value=excluded.value, source_match_id=COALESCE(excluded.source_match_id, memories.source_match_id), updated_at=excluded.updated_at")
        .bind(uid("mem"), s.user_id, kind, key, value, it.source_match_id || null, now()).run();
      out.push(await env.DB.prepare("SELECT id, kind, key, value, source_match_id, updated_at FROM memories WHERE user_id=? AND kind=? AND key=?").bind(s.user_id, kind, key).first());
    }
    return { memories: out };
  },
  async deleteMemory(env, s, id) {
    const r = await env.DB.prepare("DELETE FROM memories WHERE id=? AND user_id=?").bind(id, s.user_id).run();
    if (!r.meta.changes) fail(404, "memory not found");
    return { deleted: id };
  },
  async historyAnswers(env, s, q) {
    // only the caller's own sent messages
    const terms = String(q.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
    let sql = "SELECT id, match_id, body, created_at FROM messages WHERE sender_id=?", a = [s.user_id];
    if (q.match_id) { await loadMatch(env, q.match_id, s.user_id); sql += " AND match_id=?"; a.push(q.match_id); }
    if (terms.length) { sql += " AND (" + terms.map(() => "body LIKE ?").join(" OR ") + ")"; a.push(...terms.map(t => `%${t}%`)); }
    return { answers: (await env.DB.prepare(sql + " ORDER BY created_at DESC LIMIT 50").bind(...a).all()).results };
  },
  async markSummarized(env, s, id) {
    const m = await loadMatch(env, id, s.user_id);
    await env.DB.prepare("INSERT OR IGNORE INTO memory_summaries(match_id,user_id,created_at) VALUES(?,?,?)").bind(id, s.user_id, now()).run();
    return { match_id: id, state: m.state, summarized: true };
  },
  async getMessages(env, s, id) {
    await loadMatch(env, id, s.user_id);
    const r = await env.DB.prepare("SELECT id, sender_id, body, created_at FROM messages WHERE match_id=? ORDER BY created_at ASC LIMIT 500").bind(id).all();
    return { match_id: id, messages: r.results.map(x => ({ ...x, from_me: x.sender_id === s.user_id })) };
  },
  async events(env, s, q) {
    const since = Number(q.since || 0);
    const r = (await env.DB.prepare("SELECT id, type, match_id, payload, created_at FROM events WHERE user_id=? AND id>? ORDER BY id DESC LIMIT 100").bind(s.user_id, since).all()).results.reverse();
    return { events: r.map(e => ({ ...e, payload: e.payload ? JSON.parse(e.payload) : {} })), next_since: r.length ? r[r.length - 1].id : since };
  },
  async confirm(env, s, id, b) {
    const m = await loadMatch(env, id, s.user_id);
    const d = b.decision;
    if (d === "confirm") b.decision = "accept"; const dd = b.decision; if (!["accept", "reject"].includes(dd)) fail(400, "decision must be confirm|accept|reject");
    if (!["agent_chat", "pending_confirm"].includes(m.state)) fail(409, `cannot confirm in state ${m.state} (chat via agent first)`);
    await env.DB.prepare("INSERT INTO reveal_votes(match_id,user_id,decision,created_at) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET decision=excluded.decision, created_at=excluded.created_at").bind(id, s.user_id, dd, now()).run();
    let state = m.state === "pending_confirm" ? "agent_chat" : m.state;
    if (dd === "reject") { state = "cancelled"; await setMatch(env, id, state); }
    else {
      const v = await env.DB.prepare("SELECT COUNT(*) n FROM reveal_votes WHERE match_id=? AND decision='accept'").bind(id).first();
      if (v.n >= 2) {
        // atomic-ish: only the request that flips the state writes the events
        const u = await env.DB.prepare("UPDATE matches SET state='confirmed', updated_at=? WHERE id=? AND state<>'confirmed'").bind(now(), id).run();
        if (u.meta.changes) {
          await env.DB.prepare("UPDATE profiles SET state='confirmed' WHERE user_id IN (?,?)").bind(m.user_a, m.user_b).run();
          const em = async (x) => (await env.DB.prepare("SELECT u.email, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?").bind(x).first());
          const A = await em(m.user_a), B = await em(m.user_b);
          await addEvent(env, m.user_a, "match_confirmed", id, { partner_name: B.display_name, partner_email: B.email });
          await addEvent(env, m.user_b, "match_confirmed", id, { partner_name: A.display_name, partner_email: A.email });
        }
      }
      // single accept: stored privately, public state unchanged (no event, no profile change)
    }
    // double-blind: the other side's vote is never exposed until both accept
    return { match: await matchView(env, await loadMatch(env, id, s.user_id), s.user_id) };
  },
};


// ---- admin (ADMIN_SECRET) : test account + force match ----
async function adminCheck(req, env, given) {
  await hit(env, [[`adm:${ipOf(req)}:m`, 60, 10, "ip"], [`adm:${ipOf(req)}:d`, 86400, 100, "ip"]]);
  const g = given || req.headers.get("x-admin-secret") || "";
  if (!env.ADMIN_SECRET || (await sha(g)) !== (await sha(env.ADMIN_SECRET))) {
    await hit(env, [[`adm:bad:${ipOf(req)}`, 3600, 3, "ip", "管理员验证失败次数过多，请 1 小时后再试"]]); fail(403, "forbidden");
  }
}
const TEST_NAME = "Wingbot 官方测试号";
const adminOps = {
  async testSession(env, b) { // ensure test user (is_test=1) + labeled profile, return a session for it
    const email = String(b.test_email || env.TEST_EMAIL || "").trim().toLowerCase(); if (!email) fail(400, "test_email required");
    await env.DB.prepare("INSERT INTO users(id,email,status,is_test,created_at) VALUES(?,?,'active',1,?) ON CONFLICT(email) DO UPDATE SET is_test=1, status='active'").bind(uid("u"), email, now()).run();
    const u = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    await env.DB.prepare("INSERT INTO profiles(user_id,display_name,bio,state,updated_at) VALUES(?,?,?,'draft',?) ON CONFLICT(user_id) DO NOTHING").bind(u.id, TEST_NAME, "这是 Wingbot 官方测试账号，用于产品测试，不是真实用户。", now()).run();
    await env.DB.prepare("UPDATE profiles SET display_name=CASE WHEN display_name LIKE '%官方测试%' THEN display_name ELSE ? || ' · ' || COALESCE(display_name,'') END WHERE user_id=?").bind(TEST_NAME, u.id).run();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token), u.id, now() + 7 * 864e5).run();
    return { test_user_id: u.id, email, token, expires_in_days: 7, note: "Use this token with normal tools to act as the test account." };
  },
  async forceMatch(env, b) {
    const ue = String(b.user_email || "").trim().toLowerCase(), te = String(b.test_email || env.TEST_EMAIL || "").trim().toLowerCase();
    const u = await env.DB.prepare("SELECT id FROM users WHERE email=? AND status='active'").bind(ue).first(); if (!u) fail(404, "real user not found (must verify first)");
    const t = await env.DB.prepare("SELECT id FROM users WHERE email=? AND is_test=1").bind(te).first(); if (!t) fail(404, "test account not set up (call admin_test_session first)");
    if (!(await env.DB.prepare("SELECT 1 FROM profiles WHERE user_id=?").bind(u.id).first())) fail(400, "real user has no profile yet");
    const ex = await env.DB.prepare(`SELECT id FROM matches WHERE ((user_a=?1 AND user_b=?2) OR (user_a=?2 AND user_b=?1)) AND state IN ${OPEN}`).bind(u.id, t.id).first();
    if (ex) return { match_id: ex.id, existing: true };
    const id = uid("m"), n = now();
    await env.DB.prepare("INSERT INTO matches(id,user_a,user_b,state,created_at,updated_at,reveal_deadline) VALUES(?,?,?,'matched',?,?,?)").bind(id, u.id, t.id, n, n, n + Number(env.REVEAL_TIMEOUT_HOURS) * 3600e3).run();
    await env.DB.prepare("UPDATE profiles SET state='matched' WHERE user_id IN (?,?)").bind(u.id, t.id).run();
    return { match_id: id, existing: false, user_id: u.id, test_user_id: t.id };
  },
};

// ---- thin MCP adapter (Streamable HTTP, JSON responses) ----
const T = "string";
const TOOLS = [
  ["request_code", "Request an activation code to the user's own email address (human verification only; never shown to anyone)", { email: T }, false, (e, s, a, ip) => ops.requestCode(e, a, ip)],
  ["verify_code", "Verify code; returns session token. Pass it as `token` to every other tool (or Authorization: Bearer).", { email: T, code: T }, false, (e, s, a, ip) => ops.verify(e, a, ip)],
  ["upsert_profile", "Create/update anonymous text profile; all fields optional. preferences = natural-language match preferences (bio/likes/dislikes/preferences max 500 chars each). Optional PRIVATE hard filters (omit any; null clears): want_age_min/want_age_max (int), want_same_city (bool), want_gender (男/女/any; alias of seeking). Applied both ways. age = my own age (int)", { display_name: T, age_range: T, age: "integer", gender: T, want_gender: T, want_age_min: "integer", want_age_max: "integer", want_same_city: "boolean", seeking: T, city: T, occupation: T, bio: T, likes: T, dislikes: T, preferences: T }, true, (e, s, a) => ops.upsertProfile(e, s, a)],
  ["get_my_profile", "Get my profile", {}, true, (e, s) => ops.me(e, s)],
  ["search_profiles", "Keyword search (1/day), up to 10 anonymized profiles", { q: T }, true, (e, s, a) => ops.search(e, s, a)],
  ["daily_match", "Create today's best-scored match (1/day); optional user_id from search", { user_id: T }, true, (e, s, a) => ops.daily(e, s, a)],
  ["list_matches", "List my matches, states, unread counts", {}, true, (e, s) => ops.listMatches(e, s)],
  ["check_inbox", "Heartbeat: new matches + unread messages per room with recent context and my guidance. Marks them read unless mark_read=false", { mark_read: "boolean" }, true, (e, s, a) => ops.inbox(e, s, a)],
  ["send_message", "Relay a message within a match (contact info blocked until confirmed). Agent auto messages capped at 3/day per match; set guided=true only when the user explicitly told you what to send", { match_id: T, body: T, guided: "boolean" }, true, (e, s, a) => ops.postMessage(e, s, a.match_id, a)],
  ["get_messages", "Read full relayed conversation for a match", { match_id: T }, true, (e, s, a) => ops.getMessages(e, s, a.match_id)],
  ["mark_read", "Mark a room's messages read", { match_id: T }, true, (e, s, a) => ops.markRead(e, s, a.match_id)],
  ["add_guidance", "Save the user's instruction for this match (used by heartbeat replies)", { match_id: T, body: T }, true, (e, s, a) => ops.addGuidance(e, s, a.match_id, a)],
  ["list_guidance", "List my guidance for a match", { match_id: T }, true, (e, s, a) => ops.listGuidance(e, s, a.match_id)],
  ["get_memory", "List my personal memory (facts/preferences/style). Optional kind filter and keyword q", { kind: T, q: T }, true, (e, s, a) => ops.listMemory(e, s, a)],
  ["upsert_memory", "Save memories. Either one {kind,key,value,source_match_id?} or items:[...]. kind=fact|preference|style; key=question/topic. No contact info", { kind: T, key: T, value: T, source_match_id: T, items: "array" }, true, (e, s, a) => ops.upsertMemory(e, s, a)],
  ["delete_memory", "Delete one of my memories by id", { id: T }, true, (e, s, a) => ops.deleteMemory(e, s, a.id)],
  ["search_my_answers", "Keyword search over messages I (the user's side) sent in past chats; optional match_id. Never returns the partner's messages", { q: T, match_id: T }, true, (e, s, a) => ops.historyAnswers(e, s, a)],
  ["mark_summarized", "Mark an ended match as summarized into memory", { match_id: T }, true, (e, s, a) => ops.markSummarized(e, s, a.match_id)],
  ["get_events", "Typed events for me: new_match, new_message, match_confirmed (payload has partner_email), match_cancelled. Pass since=<last id> to get only newer", { since: T }, true, (e, s, a) => ops.events(e, s, a)],
  ["confirm_match", "Double-blind vote accept|reject. A single accept is private (partner sees nothing; you see my_decision/waiting_for_partner). Both accept → confirmed + match_confirmed event with emails to both. Any reject/72h timeout → cancelled", { match_id: T, decision: T }, true, (e, s, a) => ops.confirm(e, s, a.match_id, a)],
  ["admin_test_session", "ADMIN ONLY. Ensure the official test account exists (labeled, excluded from matching) and get a session token for it", { admin_secret: T, test_email: T }, false, async (e, s, a, ip, req) => { await adminCheck(req, e, a.admin_secret); return adminOps.testSession(e, a); }],
  ["admin_force_match", "ADMIN ONLY. Force-match a verified real user (by email) with the official test account", { admin_secret: T, user_email: T, test_email: T }, false, async (e, s, a, ip, req) => { await adminCheck(req, e, a.admin_secret); return adminOps.forceMatch(e, a); }],
];
async function mcp(req, env) {
  if (req.method !== "POST") return json({ error: "POST JSON-RPC to /mcp" }, 405);
  let m; try { m = JSON.parse(await readBody(req)); } catch (e) { if (e.status) throw e; return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  if (Array.isArray(m)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch not supported" } });
  const reply = (result) => json({ jsonrpc: "2.0", id: m.id, result });
  if (m.id === undefined) return new Response(null, { status: 202 });
  if (m.method === "initialize") return reply({ protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "anon-match", version: "0.2.0" } });
  if (m.method === "ping") return reply({});
  if (m.method === "tools/list") return reply({ tools: TOOLS.map(([name, description, props]) => ({ name, description, inputSchema: { type: "object", properties: Object.fromEntries([...Object.entries(props), ...(TOOLS.find(x => x[0] === name)[3] ? [["token", T]] : [])].map(([k, t]) => [k, t === "array" ? { type: "array", items: { type: "object" } } : { type: t }])) } })) });
  if (m.method === "tools/call") {
    const t = TOOLS.find(x => x[0] === m.params?.name);
    if (!t) return json({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "unknown tool" } });
    try {
      const args = m.params.arguments || {};
      const s = t[3] ? await authLimited(req, env, args.token) : null;
      if (s) await limitUser(env, s, t[0], args);
      const r = await t[4](env, s, args, ipOf(req), req);
      return reply({ content: [{ type: "text", text: JSON.stringify(r) }] });
    } catch (e) {
      if (e instanceof RateErr) return reply({ isError: true, content: [{ type: "text", text: JSON.stringify(rateBody(e)) }], _meta: { error: "rate_limited", retry_after_sec: e.retry } });
      return reply({ isError: true, content: [{ type: "text", text: e.message }] });
    }
  }
  return json({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return json({});
    const url = new URL(req.url), p = url.pathname, M = req.method;
    const ip = ipOf(req);
    const body = async () => { const t = await readBody(req); try { return JSON.parse(t || "{}"); } catch { return {}; } };
    try {
      if (env.IP_RL) { const { success } = await env.IP_RL.limit({ key: ip }); if (!success) throw new RateErr(60, "ip"); }
      if (p === "/mcp") return await mcp(req, env);
      if (p === "/" || p === "/v1/health") return json(await ops.health());
      if (M === "POST" && p === "/v1/auth/request-code") return json(await ops.requestCode(env, await body(), ip));
      if (M === "POST" && p === "/v1/auth/verify") return json(await ops.verify(env, await body(), ip));
      if (M === "POST" && p === "/v1/admin/test-session") { const b = await body(); await adminCheck(req, env); return json(await adminOps.testSession(env, b)); }
      if (M === "POST" && p === "/v1/admin/force-match") { const b = await body(); await adminCheck(req, env); return json(await adminOps.forceMatch(env, b)); }
      const s = await authLimited(req, env);
      const mmx = p.match(/^\/v1\/matches\/([\w-]+)\/(\w+)$/);
      const tool = M === "GET" && p === "/v1/inbox" ? "check_inbox" : M === "POST" && p === "/v1/profile" ? "upsert_profile" : p === "/v1/memory" && M === "POST" ? "upsert_memory"
        : p.startsWith("/v1/memory/") && M === "DELETE" ? "delete_memory" : mmx && M === "POST" ? ({ messages: "send_message", guidance: "add_guidance", summarized: "mark_summarized", confirm: "confirm_match", reveal: "confirm_match" })[mmx[2]]
        : mmx && mmx[2] === "messages" ? "get_messages" : "_read";
      let lb = {}; if (tool === "upsert_memory") { lb = await body(); req.__b = lb; } if (mmx) lb = { ...lb, match_id: mmx[1] };
      await limitUser(env, s, tool, lb);
      if (M === "POST" && p === "/v1/profile") return json(await ops.upsertProfile(env, s, await body()));
      if (M === "GET" && p === "/v1/profile/me") return json(await ops.me(env, s));
      if (M === "POST" && p === "/v1/search") return json(await ops.search(env, s, await body()));
      if (M === "POST" && p === "/v1/match/daily") return json(await ops.daily(env, s, await body()));
      if (M === "GET" && p === "/v1/inbox") return json(await ops.inbox(env, s, { mark_read: url.searchParams.get("mark_read") !== "0", since: url.searchParams.get("since") }));
      if (M === "GET" && p === "/v1/events") return json(await ops.events(env, s, Object.fromEntries(url.searchParams)));
      if (M === "GET" && p === "/v1/matches") return url.searchParams.get("unread") === "1" ? json(await ops.inbox(env, s, { mark_read: false })) : json(await ops.listMatches(env, s));
      if (p === "/v1/memory" && M === "GET") return json(await ops.listMemory(env, s, Object.fromEntries(url.searchParams)));
      if (p === "/v1/memory" && M === "POST") return json(await ops.upsertMemory(env, s, req.__b || await body()));
      const md = p.match(/^\/v1\/memory\/([\w-]+)$/);
      if (md && M === "DELETE") return json(await ops.deleteMemory(env, s, md[1]));
      if (p === "/v1/history/answers" && M === "GET") return json(await ops.historyAnswers(env, s, Object.fromEntries(url.searchParams)));
      const mm = p.match(/^\/v1\/matches\/([\w-]+)\/(messages|reveal|confirm|guidance|read|summarized)$/);
      if (mm && mm[2] === "summarized" && M === "POST") return json(await ops.markSummarized(env, s, mm[1]));
      if (mm && mm[2] === "guidance") return json(M === "POST" ? await ops.addGuidance(env, s, mm[1], await body()) : await ops.listGuidance(env, s, mm[1]));
      if (mm && mm[2] === "read" && M === "POST") return json(await ops.markRead(env, s, mm[1]));
      if (mm && mm[2] === "messages" && M === "POST") return json(await ops.postMessage(env, s, mm[1], await body()));
      if (mm && mm[2] === "messages" && M === "GET") return json(await ops.getMessages(env, s, mm[1]));
      if (mm && (mm[2] === "confirm" || mm[2] === "reveal") && M === "POST") return json(await ops.confirm(env, s, mm[1], await body()));
      return json({ error: "not found" }, 404);
    } catch (e) {
      if (e instanceof RateErr) { const r = json(rateBody(e), 429); r.headers.set("retry-after", String(e.retry)); return r; }
      return json({ error: e.message }, e.status || 500);
    }
  },
};
