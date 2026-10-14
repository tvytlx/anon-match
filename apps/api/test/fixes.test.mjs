// Run: node --experimental-sqlite --test test/*.test.mjs  (Node 22+; or npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { ops, normEmail } from "../src/index.js";

function makeEnv() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  // D1 supports ?NNN numbered params with positional bind; rewrite for node:sqlite
  const norm = (sql, args) => { if (!/\?\d/.test(sql)) return [sql, args]; const out = []; return [sql.replace(/\?(\d+)/g, (_, n) => { out.push(args[n - 1]); return "?"; }), out]; };
  const stmt = (sql0, args0 = []) => { const [sql, args] = norm(sql0, args0); return {
    bind: (...a) => stmt(sql0, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  }; };
  return { DB: { prepare: (sql) => stmt(sql), batch: async (xs) => Promise.all(xs.map((x) => x.all())) }, DEV_RETURN_CODE: "true", MAIL_FROM: "t@x", _db: db };
}
async function login(env, email, ip) {
  let code; const orig = console.log; console.log = (m) => { const x = /code=(\d+)/.exec(String(m)); if (x) code = x[1]; };
  try { const r = await ops.requestCode(env, { email }, ip); code = code || r.code; } finally { console.log = orig; }
  return ops.verify(env, { email, code }, ip);
}

test("normEmail strips +tag and lowercases", () => {
  assert.equal(normEmail(" QQ+NewUser1015@Mail.GrokBot.com "), "qq@mail.grokbot.com");
  assert.equal(normEmail("a@b.co"), "a@b.co");
});

test("verify: is_new_user + returning profile; aliases map to one account", async () => {
  const env = makeEnv();
  const a = await login(env, "alice@example.com", "1.1.1.1");
  assert.equal(a.is_new_user, true); assert.equal(a.profile, undefined);
  await ops.upsertProfile(env, { user_id: a.user_id, email: "alice@example.com" }, { display_name: "Alice", bio: "hi", city: "长沙" });
  // alias shares the canonical email's rate-limit bucket (proves normalization); reset to log in again
  await assert.rejects(login(env, "Alice+again@example.com", "2.2.2.2"), /Too many|频繁/);
  env._db.exec("DELETE FROM rl");
  const b = await login(env, "Alice+again@example.com", "2.2.2.2");
  assert.equal(b.is_new_user, false); assert.equal(b.user_id, a.user_id);
  assert.equal(b.profile.display_name, "Alice"); assert.equal(b.state, "draft");
});

test("upsertProfile: absent fields keep stored value; explicit null/'' clears", async () => {
  const env = makeEnv();
  const a = await login(env, "bob@example.com", "3.3.3.3"); const s = { user_id: a.user_id, email: "bob@example.com" };
  await ops.upsertProfile(env, s, { display_name: "Bob", bio: "b", likes: "AI", city: "北京", age: 30 });
  let r = await ops.upsertProfile(env, s, { city: "上海" });
  assert.equal(r.profile.display_name, "Bob"); assert.equal(r.profile.bio, "b"); assert.equal(r.profile.likes, "AI");
  assert.equal(r.profile.city, "上海"); assert.equal(r.profile.age, 30);
  r = await ops.upsertProfile(env, s, { bio: null, likes: "" });
  assert.equal(r.profile.bio, ""); assert.equal(r.profile.likes, ""); assert.equal(r.profile.display_name, "Bob");
});

test("upsertProfile: new profile defaults", async () => {
  const env = makeEnv();
  const a = await login(env, "c@example.com", "4.4.4.4");
  const r = await ops.upsertProfile(env, { user_id: a.user_id, email: "c@example.com" }, {});
  assert.equal(r.profile.display_name, "匿名" + a.user_id.slice(-4)); assert.equal(r.profile.bio, "");
});
