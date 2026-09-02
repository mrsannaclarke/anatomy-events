import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mirrorSheetMutation,
  shadowEntryId,
  shadowMutationPayload,
} from '../functions/_eventShadow.js';

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            async run() {
              calls.push({ sql, bindings });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('shadow helpers extract IDs and exclude transport-only fields', () => {
  const partial = { action: 'upsertEventPartialJson', eventJson: JSON.stringify({ entryId: '1513', status: 'Deposit Paid' }) };
  assert.equal(shadowEntryId(partial), '1513');
  assert.deepEqual(shadowMutationPayload(partial), { event: { entryId: '1513', status: 'Deposit Paid' } });
  assert.deepEqual(shadowMutationPayload({ action: 'deleteEvent', entryId: '1513', sourceRow: 42 }), {
    entryId: '1513', sourceRow: '42',
  });
});

test('full Sheet saves mirror the canonical returned event without another Sheet request', async () => {
  const db = fakeDb();
  let fetchCalls = 0;
  const result = await mirrorSheetMutation({
    db,
    payload: { action: 'upsertEvent', event: { entryId: '1513', status: 'New' } },
    upstreamBody: JSON.stringify({ ok: true, event: { entryId: '1513', status: 'Contract Signed' } }),
    actorEmail: 'admin@anatomytattoo.com',
    sheetUrl: 'https://example.test/exec',
    token: 'secret',
    fetchFn: async () => { fetchCalls += 1; },
    timestamp: '2026-08-26T20:00:00.000Z',
  });

  assert.deepEqual(result, { mirrored: true, entryId: '1513', status: 'not-needed' });
  assert.equal(fetchCalls, 0);
  assert.equal(db.calls.length, 2);
  assert.ok(db.calls[0].bindings.includes(JSON.stringify({ entryId: '1513', status: 'Contract Signed' })));
});

test('partial saves refresh the canonical Sheet event before replacing the shadow snapshot', async () => {
  const db = fakeDb();
  const result = await mirrorSheetMutation({
    db,
    payload: { action: 'upsertEventPartialJson', eventJson: JSON.stringify({ entryId: '1513', status: 'Deposit Paid' }) },
    upstreamBody: JSON.stringify({ ok: true, result: { entryId: '1513' } }),
    actorEmail: 'admin@anatomytattoo.com',
    sheetUrl: 'https://example.test/exec',
    token: 'secret',
    fetchFn: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, 'event');
      return Response.json({ ok: true, event: { entryId: '1513', status: 'Deposit Paid', clientName: 'Example' } });
    },
    timestamp: '2026-08-26T20:00:00.000Z',
  });

  assert.deepEqual(result, { mirrored: true, entryId: '1513', status: 'completed' });
  assert.equal(db.calls.length, 3);
  assert.ok(db.calls[1].bindings.includes(JSON.stringify({ entryId: '1513', status: 'Deposit Paid', clientName: 'Example' })));
});

test('deletions retain a tombstone instead of erasing migration evidence', async () => {
  const db = fakeDb();
  const result = await mirrorSheetMutation({
    db,
    payload: { action: 'deleteEvent', entryId: '1513', sourceRow: 42 },
    upstreamBody: JSON.stringify({ ok: true }),
    actorEmail: 'admin@anatomytattoo.com',
    timestamp: '2026-08-26T20:00:00.000Z',
  });

  assert.deepEqual(result, { mirrored: true, entryId: '1513', status: 'not-needed' });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /deleted_at = excluded\.deleted_at/);
});

test('missing EVENTS_DB leaves the production Sheet path unchanged', async () => {
  const result = await mirrorSheetMutation({
    db: undefined,
    payload: { action: 'upsertEvent', event: { entryId: '1513' } },
    upstreamBody: '{}',
    actorEmail: 'admin@anatomytattoo.com',
  });
  assert.deepEqual(result, { mirrored: false, reason: 'disabled' });
});
