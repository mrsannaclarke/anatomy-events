import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileEventShadow } from '../shared/eventShadowReconciliation.js';

test('reconciliation accepts canonical matches regardless of JSON key order', () => {
  const report = reconcileEventShadow(
    { events: [{ entryId: '1513', status: 'New', nested: { b: 2, a: 1 } }] },
    [{ entry_id: '1513', event_json: JSON.stringify({ nested: { a: 1, b: 2 }, status: 'New', entryId: '1513' }), needs_refresh: 0 }],
  );
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, { sheet: 1, shadow: 1, matched: 1 });
});

test('reconciliation reports identifiers and changed field names without exposing client values', () => {
  const report = reconcileEventShadow(
    { events: [
      { entryId: '1513', clientName: 'Private Client', status: 'New' },
      { entryId: '2000', clientName: 'Another Client' },
    ] },
    [{ entry_id: '1513', event_json: JSON.stringify({ entryId: '1513', clientName: 'Different Private Name', status: 'New' }), needs_refresh: 1 }],
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.pendingRefreshEntryIds, ['1513']);
  assert.deepEqual(report.missingFromShadow, ['2000']);
  assert.deepEqual(report.mismatched, [{ entryId: '1513', fields: ['clientName'] }]);
  assert.ok(!JSON.stringify(report).includes('Private Client'));
  assert.ok(!JSON.stringify(report).includes('Different Private Name'));
});

test('reconciliation ignores intentional D1 deletion tombstones', () => {
  const report = reconcileEventShadow(
    { events: [] },
    [{ entry_id: '1513', event_json: null, deleted_at: '2026-08-26T20:00:00.000Z', needs_refresh: 0 }],
  );
  assert.equal(report.ok, true);
  assert.equal(report.counts.shadow, 0);
});
