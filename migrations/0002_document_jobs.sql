CREATE TABLE IF NOT EXISTS document_jobs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('contract', 'tfl')),
  action TEXT NOT NULL CHECK (action IN ('generateContract', 'generateTfl')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'retrying', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_jobs_actor_created_at ON document_jobs(actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_jobs_entry_kind_created_at ON document_jobs(entry_id, kind, created_at DESC);
