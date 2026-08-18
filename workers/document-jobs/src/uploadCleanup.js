const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

async function markStagingDeleted(db, jobId, deletedAt) {
  await db.prepare(`
    UPDATE upload_jobs SET staging_deleted_at = ? WHERE id = ? AND staging_deleted_at IS NULL
  `).bind(deletedAt, jobId).run();
}

export async function cleanupUploadObject(env, jobId, objectKey, deletedAt = new Date().toISOString()) {
  await env.UPLOAD_STAGING.delete(objectKey);
  await markStagingDeleted(env.AUDIT_DB, jobId, deletedAt);
}

export async function cleanupFailedUpload(env, jobId) {
  const job = await env.AUDIT_DB.prepare(`
    SELECT object_key FROM upload_jobs WHERE id = ? AND staging_deleted_at IS NULL
  `).bind(jobId).first();
  if (!job?.object_key) return false;
  await cleanupUploadObject(env, jobId, job.object_key);
  return true;
}

export async function cleanupStaleUploads(env, now = new Date()) {
  const deletedAt = now.toISOString();
  const cutoff = new Date(now.getTime() - STALE_UPLOAD_AGE_MS).toISOString();
  const result = await env.AUDIT_DB.prepare(`
    SELECT id, object_key, status, updated_at
    FROM upload_jobs
    WHERE staging_deleted_at IS NULL AND updated_at < ?
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(cutoff, CLEANUP_BATCH_SIZE).all();

  let deleted = 0;
  let expired = 0;
  for (const job of result.results || []) {
    if (['queued', 'processing', 'retrying'].includes(job.status)) {
      const claim = await env.AUDIT_DB.prepare(`
        UPDATE upload_jobs
        SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ? AND staging_deleted_at IS NULL AND updated_at < ?
          AND status IN ('queued', 'processing', 'retrying')
      `).bind('The staged upload expired before it could be completed.', deletedAt, job.id, cutoff).run();
      if (Number(claim.meta?.changes || 0) !== 1) continue;
      expired += 1;
    }

    await cleanupUploadObject(env, job.id, job.object_key, deletedAt);
    deleted += 1;
  }

  return { scanned: (result.results || []).length, deleted, expired, cutoff };
}
