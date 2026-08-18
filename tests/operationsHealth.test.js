import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeOperationsHealth } from '../shared/operationsHealth.js';

test('operations monitoring reports a recent successful check as healthy', () => {
  const now = new Date('2026-08-18T18:00:00.000Z');
  const health = summarizeOperationsHealth({ monitor: { last_success_at: '2026-08-18T17:17:00.000Z' } }, now);
  assert.equal(health.healthy, true);
  assert.deepEqual(health.warnings, []);
});

test('operations monitoring identifies overdue checks and background failures', () => {
  const now = new Date('2026-08-18T18:00:00.000Z');
  const health = summarizeOperationsHealth({
    monitor: { last_success_at: '2026-08-18T14:17:00.000Z' },
    staleUploadJobs: 1,
    recentDocumentFailures: 2,
    pendingUploadCleanup: 1,
  }, now);
  assert.equal(health.healthy, false);
  assert.equal(health.warnings.length, 4);
  assert.ok(health.warnings.some((warning) => warning.includes('overdue')));
  assert.ok(health.warnings.some((warning) => warning.includes('artwork upload')));
});
