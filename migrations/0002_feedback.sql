-- What users ask for. Anyone can send feedback — free users have no account.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('idea', 'problem', 'other')),
  message TEXT NOT NULL,
  -- Which screen, event type and plan they were on. Never guest or event data.
  context TEXT,
  -- Hashed, only for rate limiting.
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX feedback_ip_idx ON feedback (ip_hash, created_at);
