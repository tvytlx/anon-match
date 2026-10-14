ALTER TABLE profiles ADD COLUMN occupation TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN preferences TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN read_at INTEGER;
CREATE TABLE guidance (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_guidance ON guidance(match_id, user_id);
CREATE TABLE match_seen (match_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(match_id,user_id));
UPDATE matches SET state='confirmed' WHERE state='revealed';
UPDATE profiles SET state='confirmed' WHERE state='revealed';
