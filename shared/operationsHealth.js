const MONITOR_KEY = 'document-worker';
const MONITOR_STALE_MS = 2.5 * 60 * 60 * 1000;
const JOB_STALE_MS = 15 * 60 * 1000;
const RECENT_FAILURE_MS = 24 * 60 * 60 * 1000;

export function summarizeOperationsHealth({ monitor, staleDocumentJobs = 0, staleUploadJobs = 0, recentDocumentFailures = 0, recentUploadFailures = 0, pendingUploadCleanup = 0 }, now = new Date()) {
  const lastSuccessAt = monitor?.last_success_at || '';
  const monitorStale = !lastSuccessAt || now.getTime() - new Date(lastSuccessAt).getTime() > MONITOR_STALE_MS;
  const warnings = [];
  if (monitorStale) warnings.push(lastSuccessAt ? 'The hourly monitor is overdue.' : 'The hourly monitor has not reported yet.');
  if (monitor?.last_error_at && (!lastSuccessAt || monitor.last_error_at > lastSuccessAt)) warnings.push(monitor.last_error || 'The hourly monitor last reported an error.');
  if (staleDocumentJobs) warnings.push(`${staleDocumentJobs} document job${staleDocumentJobs === 1 ? ' is' : 's are'} taking too long.`);
  if (staleUploadJobs) warnings.push(`${staleUploadJobs} artwork upload${staleUploadJobs === 1 ? ' is' : 's are'} taking too long.`);
  if (recentDocumentFailures) warnings.push(`${recentDocumentFailures} document job${recentDocumentFailures === 1 ? '' : 's'} failed in the last 24 hours.`);
  if (recentUploadFailures) warnings.push(`${recentUploadFailures} artwork upload${recentUploadFailures === 1 ? '' : 's'} failed in the last 24 hours.`);
  if (pendingUploadCleanup) warnings.push(`${pendingUploadCleanup} expired staging object${pendingUploadCleanup === 1 ? '' : 's'} still need cleanup.`);
  return { healthy: warnings.length === 0, checkedAt: now.toISOString(), lastSuccessAt, warnings };
}

export async function recordMonitorSuccess(db, result, at = new Date()) {
  const timestamp = at.toISOString();
  await db.prepare(`
    INSERT INTO worker_monitor (monitor_key, last_success_at, last_error_at, last_error, result_json, updated_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(monitor_key) DO UPDATE SET
      last_success_at = excluded.last_success_at,
      last_error_at = NULL,
      last_error = NULL,
      result_json = excluded.result_json,
      updated_at = excluded.updated_at
  `).bind(MONITOR_KEY, timestamp, JSON.stringify(result), timestamp).run();
}

export async function recordMonitorFailure(db, error, at = new Date()) {
  const timestamp = at.toISOString();
  await db.prepare(`
    INSERT INTO worker_monitor (monitor_key, last_error_at, last_error, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(monitor_key) DO UPDATE SET
      last_error_at = excluded.last_error_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).bind(MONITOR_KEY, timestamp, error, timestamp).run();
}

export async function getOperationsHealth(db, now = new Date()) {
  const jobCutoff = new Date(now.getTime() - JOB_STALE_MS).toISOString();
  const failureCutoff = new Date(now.getTime() - RECENT_FAILURE_MS).toISOString();
  const cleanupCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [monitor, documentHealth, uploadHealth] = await db.batch([
    db.prepare(`SELECT last_success_at, last_error_at, last_error FROM worker_monitor WHERE monitor_key = ?`).bind(MONITOR_KEY),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('queued', 'processing', 'retrying') AND updated_at < ? THEN 1 ELSE 0 END) AS stale_jobs,
        SUM(CASE WHEN status = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) AS recent_failures
      FROM document_jobs
    `).bind(jobCutoff, failureCutoff),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('queued', 'processing', 'retrying') AND updated_at < ? THEN 1 ELSE 0 END) AS stale_jobs,
        SUM(CASE WHEN status = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) AS recent_failures,
        SUM(CASE WHEN staging_deleted_at IS NULL AND updated_at < ? THEN 1 ELSE 0 END) AS pending_cleanup
      FROM upload_jobs
    `).bind(jobCutoff, failureCutoff, cleanupCutoff),
  ]);
  const monitorRow = monitor.results?.[0] || null;
  const documentRow = documentHealth.results?.[0] || {};
  const uploadRow = uploadHealth.results?.[0] || {};
  return summarizeOperationsHealth({
    monitor: monitorRow,
    staleDocumentJobs: Number(documentRow.stale_jobs || 0),
    staleUploadJobs: Number(uploadRow.stale_jobs || 0),
    recentDocumentFailures: Number(documentRow.recent_failures || 0),
    recentUploadFailures: Number(uploadRow.recent_failures || 0),
    pendingUploadCleanup: Number(uploadRow.pending_cleanup || 0),
  }, now);
}
