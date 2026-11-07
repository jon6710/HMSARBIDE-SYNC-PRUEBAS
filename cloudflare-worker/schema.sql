-- MHS v46 · Cloudflare D1
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_key TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_ref ON files(service_id, kind, ref_key);
CREATE INDEX IF NOT EXISTS idx_files_service ON files(service_id);
