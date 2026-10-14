CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, type TEXT NOT NULL, match_id TEXT, payload TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, id);
UPDATE matches SET state='agent_chat' WHERE state='pending_confirm';
UPDATE profiles SET state='agent_chat' WHERE state='pending_confirm';
