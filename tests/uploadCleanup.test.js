import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupFailedUpload, cleanupStaleUploads } from '../workers/document-jobs/src/uploadCleanup.js';

function createEnvironment(jobs) {
  const deletedKeys = [];
  const db = {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...values) {
          return {
            async all() {
              const [cutoff, limit] = values;
              return {
                results: jobs
                  .filter((job) => !job.staging_deleted_at && job.updated_at < cutoff)
                  .sort((left, right) => left.updated_at.localeCompare(right.updated_at))
                  .slice(0, limit),
              };
            },
            async first() {
              const [jobId] = values;
              const job = jobs.find((candidate) => candidate.id === jobId && !candidate.staging_deleted_at);
              return job ? { object_key: job.object_key } : null;
            },
            async run() {
              if (normalized.startsWith('UPDATE upload_jobs SET staging_deleted_at')) {
                const [deletedAt, jobId] = values;
                const job = jobs.find((candidate) => candidate.id === jobId && !candidate.staging_deleted_at);
                if (job) job.staging_deleted_at = deletedAt;
                return { meta: { changes: job ? 1 : 0 } };
              }
              if (normalized.includes("SET status = 'failed'")) {
                const [error, updatedAt, jobId, cutoff] = values;
                const job = jobs.find(({ id }) => id === jobId);
                const active = job && ['queued', 'processing', 'retrying'].includes(job.status);
                if (!active || job.staging_deleted_at || job.updated_at >= cutoff) return { meta: { changes: 0 } };
                job.status = 'failed';
                job.error = error;
                job.updated_at = updatedAt;
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected SQL: ${normalized}`);
            },
          };
        },
      };
    },
  };
  return {
    env: {
      AUDIT_DB: db,
      UPLOAD_STAGING: { async delete(key) { deletedKeys.push(key); } },
    },
    deletedKeys,
  };
}

test('scheduled cleanup expires stale active uploads and removes old terminal objects', async () => {
  const jobs = [
    { id: 'active-old', object_key: 'event-art/active-old', status: 'retrying', updated_at: '2026-08-16T00:00:00.000Z' },
    { id: 'complete-old', object_key: 'event-art/complete-old', status: 'completed', updated_at: '2026-08-16T01:00:00.000Z' },
    { id: 'active-new', object_key: 'event-art/active-new', status: 'queued', updated_at: '2026-08-18T11:30:00.000Z' },
  ];
  const { env, deletedKeys } = createEnvironment(jobs);

  const result = await cleanupStaleUploads(env, new Date('2026-08-18T12:00:00.000Z'));

  assert.deepEqual(result, {
    scanned: 2,
    deleted: 2,
    expired: 1,
    cutoff: '2026-08-17T12:00:00.000Z',
  });
  assert.deepEqual(deletedKeys, ['event-art/active-old', 'event-art/complete-old']);
  assert.equal(jobs[0].status, 'failed');
  assert.match(jobs[0].error, /expired/);
  assert.equal(jobs[2].staging_deleted_at, undefined);
});

test('terminal upload failures are cleaned immediately and only once', async () => {
  const jobs = [{ id: 'failed', object_key: 'event-art/failed', status: 'failed', updated_at: '2026-08-18T12:00:00.000Z' }];
  const { env, deletedKeys } = createEnvironment(jobs);

  assert.equal(await cleanupFailedUpload(env, 'failed'), true);
  assert.equal(await cleanupFailedUpload(env, 'failed'), false);
  assert.deepEqual(deletedKeys, ['event-art/failed']);
  assert.ok(jobs[0].staging_deleted_at);
});
