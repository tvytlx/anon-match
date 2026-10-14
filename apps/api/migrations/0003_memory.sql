CREATE TABLE memories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, source_match_id TEXT, updated_at INTEGER NOT NULL, UNIQUE(user_id, kind, key));
CREATE INDEX idx_memories_user ON memories(user_id, kind);
CREATE TABLE memory_summaries (match_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(match_id, user_id));
