function cleanText(value) {
  return String(value || '').trim();
}

export function prepareEventShadowBackfill(events) {
  if (!Array.isArray(events)) {
    return { ok: false, events: [], duplicateEntryIds: [], invalidRows: [{ reason: 'events-not-array' }] };
  }

  const prepared = [];
  const seen = new Set();
  const duplicates = new Set();
  const invalidRows = [];

  events.forEach((event, index) => {
    const entryId = cleanText(event?.entryId);
    if (!entryId) {
      invalidRows.push({ index, reason: 'missing-entry-id' });
      return;
    }
    if (seen.has(entryId)) {
      duplicates.add(entryId);
      return;
    }
    seen.add(entryId);
    prepared.push({ entryId, event });
  });

  return {
    ok: invalidRows.length === 0 && duplicates.size === 0,
    events: prepared,
    duplicateEntryIds: [...duplicates].sort(),
    invalidRows,
  };
}
