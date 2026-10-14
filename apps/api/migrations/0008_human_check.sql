-- One-time human-check challenges (Turnstile) gating activation emails
CREATE TABLE IF NOT EXISTS human_checks (id TEXT PRIMARY KEY, email TEXT NOT NULL, ip TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_human_checks_exp ON human_checks(expires_at);
