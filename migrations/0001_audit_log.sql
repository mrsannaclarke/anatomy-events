CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entry_id TEXT,
  changed_fields TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  upstream_status INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entry_id_created_at ON audit_log(entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created_at ON audit_log(actor_email, created_at DESC);
