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
        const claimed = await claimJob(env.AUDIT_DB, jobId, message.attempts);
        if (!claimed) {
          message.ack();
          continue;
        }
        const response = await fetch(`${env.APP_ORIGIN}/api/internal/document-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, signature }),
          signal: AbortSignal.timeout(100_000),
        });
        const data = await response.json().catch(() => ({ ok: false, error: 'The app returned invalid JSON.', retryable: response.status >= 500 }));
        if (response.ok && data.ok) {
          await updateJob(env.AUDIT_DB, jobId, 'completed', message.attempts, data.result || {});
          message.ack();
          continue;
        }

        const retryable = data.retryable === true || response.status === 429 || response.status >= 500;
        if (retryable && message.attempts < MAX_ATTEMPTS) {
          await updateJob(env.AUDIT_DB, jobId, 'retrying', message.attempts, null, data.error || 'Temporary document-generation failure.');
          message.retry({ delaySeconds: Math.min(30 * (2 ** Math.max(message.attempts - 1, 0)), 600) });
        } else {
          await updateJob(env.AUDIT_DB, jobId, 'failed', message.attempts, null, data.error || 'Document generation failed.');
          message.ack();
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unexpected document worker failure.';
        if (message.attempts < MAX_ATTEMPTS) {
          await updateJob(env.AUDIT_DB, jobId, 'retrying', message.attempts, null, messageText).catch(() => {});
          message.retry({ delaySeconds: Math.min(30 * (2 ** Math.max(message.attempts - 1, 0)), 600) });
        } else {
          await updateJob(env.AUDIT_DB, jobId, 'failed', message.attempts, null, messageText).catch(() => {});
          message.ack();
        }
      }
    }
  },
};
