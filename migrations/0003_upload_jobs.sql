CREATE TABLE IF NOT EXISTS upload_jobs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'retrying', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_actor_created_at ON upload_jobs(actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_entry_created_at ON upload_jobs(entry_id, created_at DESC);
