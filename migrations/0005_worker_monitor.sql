CREATE TABLE IF NOT EXISTS worker_monitor (
  monitor_key TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  result_json TEXT,
  updated_at TEXT NOT NULL
);
