CREATE TABLE IF NOT EXISTS art_attachments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS art_attachments_entry_created
  ON art_attachments (entry_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS art_attachments_entry_url
  ON art_attachments (entry_id, url);
