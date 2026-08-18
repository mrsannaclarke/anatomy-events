import { cleanupFailedUpload, cleanupStaleUploads } from './uploadCleanup.js';
import { recordMonitorFailure, recordMonitorSuccess } from '../../../shared/operationsHealth.js';

async function updateJob(db, jobId, status, attempts, result = null, error = '') {
  await db.prepare(`
    UPDATE document_jobs
    SET status = ?, attempts = ?, result_json = ?, error = ?, updated_at = ?
    WHERE id = ?
  `).bind(status, attempts, result ? JSON.stringify(result) : null, error || null, new Date().toISOString(), jobId).run();
}

async function claimJob(db, jobId, attempts) {
  const result = await db.prepare(`
    UPDATE document_jobs
    SET status = 'processing', attempts = ?, error = NULL, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'retrying')
  `).bind(attempts, new Date().toISOString(), jobId).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function updateUploadJob(db, jobId, status, attempts, result = null, error = '') {
  await db.prepare(`
    UPDATE upload_jobs
    SET status = ?, attempts = ?, result_json = ?, error = ?, updated_at = ?
    WHERE id = ?
  `).bind(status, attempts, result ? JSON.stringify(result) : null, error || null, new Date().toISOString(), jobId).run();
}

async function claimUploadJob(db, jobId, attempts) {
  const result = await db.prepare(`
    UPDATE upload_jobs
    SET status = 'processing', attempts = ?, error = NULL, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'retrying')
  `).bind(attempts, new Date().toISOString(), jobId).run();
  return Number(result.meta?.changes || 0) === 1;
}

const MAX_ATTEMPTS = 5;

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const jobId = String(message.body?.jobId || '');
      const signature = String(message.body?.signature || '');
      if (!jobId || !signature) {
        message.ack();
        continue;
      }

      try {
        const isUpload = message.body?.type === 'art-upload';
        const claimed = isUpload
          ? await claimUploadJob(env.AUDIT_DB, jobId, message.attempts)
          : await claimJob(env.AUDIT_DB, jobId, message.attempts);
        if (!claimed) {
          message.ack();
          continue;
        }
        const endpoint = isUpload ? '/api/internal/art-upload' : '/api/internal/document-job';
        const response = await fetch(`${env.APP_ORIGIN}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, signature }),
          signal: AbortSignal.timeout(100_000),
        });
        const data = await response.json().catch(() => ({ ok: false, error: 'The app returned invalid JSON.', retryable: response.status >= 500 }));
        if (response.ok && data.ok) {
          if (isUpload) await updateUploadJob(env.AUDIT_DB, jobId, 'completed', message.attempts, data.result || {});
          else await updateJob(env.AUDIT_DB, jobId, 'completed', message.attempts, data.result || {});
          message.ack();
          continue;
        }

        const retryable = data.retryable === true || response.status === 429 || response.status >= 500;
        if (retryable && message.attempts < MAX_ATTEMPTS) {
          if (isUpload) await updateUploadJob(env.AUDIT_DB, jobId, 'retrying', message.attempts, null, data.error || 'Temporary upload failure.');
          else await updateJob(env.AUDIT_DB, jobId, 'retrying', message.attempts, null, data.error || 'Temporary document-generation failure.');
          message.retry({ delaySeconds: Math.min(30 * (2 ** Math.max(message.attempts - 1, 0)), 600) });
        } else {
          if (isUpload) await updateUploadJob(env.AUDIT_DB, jobId, 'failed', message.attempts, null, data.error || 'Upload failed.');
          else await updateJob(env.AUDIT_DB, jobId, 'failed', message.attempts, null, data.error || 'Document generation failed.');
          if (isUpload) {
            await cleanupFailedUpload(env, jobId).catch((error) => {
              console.error(JSON.stringify({ event: 'failed_upload_cleanup_error', jobId, reason: error instanceof Error ? error.message : 'unknown' }));
            });
          }
          message.ack();
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unexpected document worker failure.';
        const isUpload = message.body?.type === 'art-upload';
        if (message.attempts < MAX_ATTEMPTS) {
          const update = isUpload ? updateUploadJob : updateJob;
          await update(env.AUDIT_DB, jobId, 'retrying', message.attempts, null, messageText).catch(() => {});
          message.retry({ delaySeconds: Math.min(30 * (2 ** Math.max(message.attempts - 1, 0)), 600) });
        } else {
          const update = isUpload ? updateUploadJob : updateJob;
          await update(env.AUDIT_DB, jobId, 'failed', message.attempts, null, messageText).catch(() => {});
          if (isUpload) {
            await cleanupFailedUpload(env, jobId).catch((cleanupError) => {
              console.error(JSON.stringify({ event: 'failed_upload_cleanup_error', jobId, reason: cleanupError instanceof Error ? cleanupError.message : 'unknown' }));
            });
          }
          message.ack();
        }
      }
    }
  },

  async scheduled(_controller, env) {
    try {
      const result = await cleanupStaleUploads(env);
      await recordMonitorSuccess(env.AUDIT_DB, result);
      console.log(JSON.stringify({ event: 'stale_upload_cleanup', ...result }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      await recordMonitorFailure(env.AUDIT_DB, reason).catch((monitorError) => {
        console.error(JSON.stringify({ event: 'monitor_write_error', reason: monitorError instanceof Error ? monitorError.message : 'unknown' }));
      });
      console.error(JSON.stringify({ event: 'stale_upload_cleanup_error', reason }));
      throw error;
    }
  },
};
