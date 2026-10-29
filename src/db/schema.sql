CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT,
  google_id     TEXT    UNIQUE,
  avatar_url    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_type  TEXT    NOT NULL CHECK (product_type IN ('loan', 'insurance', 'upi')),
  title         TEXT    NOT NULL,
  input_json    TEXT    NOT NULL,
  result_json   TEXT    NOT NULL,
  overall_score INTEGER NOT NULL,
  grade         TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  product_type  TEXT    NOT NULL CHECK (product_type IN ('loan', 'insurance', 'upi')),
  identifier    TEXT,
  notes         TEXT,
  last_report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name, product_type)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
