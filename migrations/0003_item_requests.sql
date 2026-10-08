-- Items people want in the library. Anyone can ask; photos live in R2 under requests/<id>/.
CREATE TABLE item_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  name TEXT NOT NULL,
  category TEXT,
  -- Metres: across, deep, tall.
  w REAL,
  d REAL,
  z REAL,
  notes TEXT,
  -- JSON array of R2 keys.
  photos TEXT NOT NULL DEFAULT '[]',
  context TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX item_requests_created_idx ON item_requests (created_at DESC);
CREATE INDEX item_requests_ip_idx ON item_requests (ip_hash, created_at);
