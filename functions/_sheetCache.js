const CACHE_PREFIX = 'sheet-read:v1';

export function sheetReadCacheKey(payload) {
  const action = String(payload?.action || '');
  if (action === 'events') return `${CACHE_PREFIX}:events:${String(payload?.limit || '1000')}`;
  if (action === 'pricing') return `${CACHE_PREFIX}:pricing`;
  if (action === 'event') {
    const entryId = String(payload?.entryId || '').trim();
    return entryId ? `${CACHE_PREFIX}:event:${entryId}` : '';
  }
  return '';
}

export function mutationEntryId(payload) {
  const directEntryId = String(payload?.entryId || payload?.event?.entryId || '').trim();
  if (directEntryId) return directEntryId;

  if (payload?.action === 'upsertEventPartialJson' && payload?.eventJson) {
    try {
      return String(JSON.parse(payload.eventJson)?.entryId || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

export function sheetMutationInvalidationKeys(payload) {
  const keys = [`${CACHE_PREFIX}:events:1000`];
  const entryId = mutationEntryId(payload);
  if (entryId) keys.push(`${CACHE_PREFIX}:event:${entryId}`);
  return keys;
}
