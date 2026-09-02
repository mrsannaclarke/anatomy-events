CREATE TABLE IF NOT EXISTS event_shadow (
  entry_id TEXT PRIMARY KEY,
  event_json TEXT,
  source_updated_at TEXT NOT NULL,
  mirrored_at TEXT NOT NULL,
  last_action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  needs_refresh INTEGER NOT NULL DEFAULT 0 CHECK (needs_refresh IN (0, 1)),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_shadow_mirrored_at
  ON event_shadow(mirrored_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_shadow_needs_refresh
  ON event_shadow(needs_refresh, mirrored_at DESC);

CREATE TABLE IF NOT EXISTS event_shadow_mutations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  canonical_refresh_status TEXT NOT NULL
    CHECK (canonical_refresh_status IN ('not-needed', 'completed', 'pending', 'failed')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_shadow_mutations_entry_created
  ON event_shadow_mutations(entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_shadow_mutations_status_created
  ON event_shadow_mutations(canonical_refresh_status, created_at DESC);
