-- Packs: a live link for one audience (a supplier, a crew team or one person) that shows only their part of the event.
CREATE TABLE packs (
  token TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  -- JSON { kind: 'supplier' | 'team' | 'crew', id, label }
  audience TEXT NOT NULL,
  -- JSON { floor, site, run, load, dietary, contacts }
  opts TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX packs_event_idx ON packs (event_id);
