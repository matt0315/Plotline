-- Plotline on Cloudflare D1.
-- Every read and write goes through the Worker, which checks the session and
-- the Pro flag itself — the browser never talks to the database directly.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  is_pro INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Only hashes of session and login tokens are stored.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_email_idx ON login_tokens (email, created_at);

-- The event document itself lives in R2 (events/<owner>/<id>.json):
-- photos and signatures can push it past D1's 2 MB row limit.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'private',
  date TEXT,
  share_token TEXT UNIQUE,
  updated_at TEXT NOT NULL
);
CREATE INDEX events_owner_idx ON events (owner, updated_at DESC);

-- Venue drawings. The PNG lives in R2 (plans/<owner>/<id>.png). Private unless published.
CREATE TABLE venue_plans (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('dxf', 'dwg', 'pdf', 'image')),
  nat_w INTEGER NOT NULL,
  nat_h INTEGER NOT NULL,
  meters_per_px REAL NOT NULL,
  calibrated_by TEXT NOT NULL DEFAULT 'guess',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  venue_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX venue_plans_public_idx ON venue_plans (visibility, created_at DESC);

-- Crew submissions from share links wait here until the owner's app merges them,
-- so an owner autosave can never overwrite a response that arrived meanwhile.
CREATE TABLE form_responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX form_responses_event_idx ON form_responses (event_id);
