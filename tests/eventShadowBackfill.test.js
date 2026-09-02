import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEventShadowBackfill } from '../shared/eventShadowBackfill.js';

test('backfill preparation preserves canonical events and trims Entry IDs', () => {
  const source = [{ entryId: ' 1513 ', clientName: 'Private Client', nested: { value: 1 } }];
  const result = prepareEventShadowBackfill(source);
  assert.equal(result.ok, true);
  assert.equal(result.events[0].entryId, '1513');
  assert.equal(result.events[0].event, source[0]);
});

test('backfill preparation stops on missing or duplicate Entry IDs without exposing field values', () => {
  const result = prepareEventShadowBackfill([
    { entryId: '1513', clientName: 'Private Client' },
    { entryId: '1513', clientName: 'Another Private Client' },
    { clientName: 'Missing ID Client' },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateEntryIds, ['1513']);
  assert.deepEqual(result.invalidRows, [{ index: 2, reason: 'missing-entry-id' }]);
  assert.ok(!JSON.stringify({ duplicateEntryIds: result.duplicateEntryIds, invalidRows: result.invalidRows }).includes('Private Client'));
});
