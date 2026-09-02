function cleanText(value) {
  return String(value || '').trim();
}

function sheetEvents(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.events)) return input.events;
  if (Array.isArray(input?.result?.events)) return input.result.events;
  return [];
}

function shadowRows(input) {
  if (Array.isArray(input)) {
    if (input.length === 1 && Array.isArray(input[0]?.results)) return input[0].results;
    return input;
  }
  if (Array.isArray(input?.results)) return input.results;
  if (Array.isArray(input?.result?.[0]?.results)) return input.result[0].results;
  return [];
}

function parseEventJson(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function changedFields(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...keys]
    .filter((key) => JSON.stringify(canonicalize(left?.[key])) !== JSON.stringify(canonicalize(right?.[key])))
    .sort();
}

export function reconcileEventShadow(sheetInput, shadowInput) {
  const sheet = new Map();
  const duplicateSheetEntryIds = [];
  const invalidSheetRows = [];

  for (const event of sheetEvents(sheetInput)) {
    const entryId = cleanText(event?.entryId);
    if (!entryId) {
      invalidSheetRows.push({ reason: 'missing-entry-id' });
      continue;
    }
    if (sheet.has(entryId)) duplicateSheetEntryIds.push(entryId);
    sheet.set(entryId, event);
  }

  const shadow = new Map();
  const invalidShadowRows = [];
  const pendingRefreshEntryIds = [];
  for (const row of shadowRows(shadowInput)) {
    const entryId = cleanText(row?.entry_id || row?.entryId);
    if (!entryId) {
      invalidShadowRows.push({ reason: 'missing-entry-id' });
      continue;
    }
    if (Number(row?.needs_refresh || row?.needsRefresh) === 1) pendingRefreshEntryIds.push(entryId);
    if (row?.deleted_at || row?.deletedAt) continue;
    const event = parseEventJson(row?.event_json ?? row?.eventJson ?? row?.event);
    if (!event) {
      invalidShadowRows.push({ entryId, reason: 'invalid-event-json' });
      continue;
    }
    shadow.set(entryId, event);
  }

  const missingFromShadow = [...sheet.keys()].filter((entryId) => !shadow.has(entryId)).sort();
  const absentFromSheet = [...shadow.keys()].filter((entryId) => !sheet.has(entryId)).sort();
  const mismatched = [];
  for (const [entryId, event] of sheet) {
    if (!shadow.has(entryId)) continue;
    const fields = changedFields(event, shadow.get(entryId));
    if (fields.length) mismatched.push({ entryId, fields });
  }

  const report = {
    ok: duplicateSheetEntryIds.length === 0
      && invalidSheetRows.length === 0
      && invalidShadowRows.length === 0
      && pendingRefreshEntryIds.length === 0
      && missingFromShadow.length === 0
      && absentFromSheet.length === 0
      && mismatched.length === 0,
    counts: {
      sheet: sheet.size,
      shadow: shadow.size,
      matched: sheet.size - missingFromShadow.length - mismatched.length,
    },
    duplicateSheetEntryIds: [...new Set(duplicateSheetEntryIds)].sort(),
    invalidSheetRows,
    invalidShadowRows,
    pendingRefreshEntryIds: [...new Set(pendingRefreshEntryIds)].sort(),
    missingFromShadow,
    absentFromSheet,
    mismatched,
  };
  return report;
}
