import assert from 'node:assert/strict';
import test from 'node:test';

import { getSheetSyncPresentation } from '../src/sheetSyncStatus.js';

const formatSyncTime = (value) => `Updated ${value}`;

test('describes cached ledger data without implying that the app is unusable', () => {
  assert.deepEqual(
    getSheetSyncPresentation({
      syncStatus: 'connected_error',
      syncError: 'Apps Script timed out.',
      lastSyncAt: '123',
      formatSyncTime,
    }),
    {
      isBusy: false,
      isUsingSavedData: true,
      statusLabel: 'Using saved Sheet data',
    },
  );
});

test('keeps the attention state when no usable Sheet data exists', () => {
  assert.deepEqual(
    getSheetSyncPresentation({
      syncStatus: 'error',
      syncError: 'Apps Script timed out.',
      lastSyncAt: '',
      formatSyncTime,
    }),
    {
      isBusy: false,
      isUsingSavedData: false,
      statusLabel: 'Sheet needs attention',
    },
  );
});

test('shows progress and healthy timestamps in their existing states', () => {
  assert.equal(
    getSheetSyncPresentation({ syncStatus: 'refreshing', syncError: '', lastSyncAt: '123', formatSyncTime }).statusLabel,
    'Updating Sheet data…',
  );
  assert.equal(
    getSheetSyncPresentation({ syncStatus: 'connected', syncError: '', lastSyncAt: '123', formatSyncTime }).statusLabel,
    'Updated 123',
  );
});
