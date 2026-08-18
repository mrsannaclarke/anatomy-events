ALTER TABLE upload_jobs ADD COLUMN staging_deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_upload_jobs_staging_cleanup
  ON upload_jobs(staging_deleted_at, updated_at);
