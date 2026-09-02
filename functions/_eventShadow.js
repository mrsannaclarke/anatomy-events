const SHADOW_ACTIONS = new Set(['upsertEvent', 'upsertEventPartialJson', 'deleteEvent']);
const CANONICAL_REFRESH_TIMEOUT_MS = 20_000;

function cleanText(value) {
  return String(value || '').trim();
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function partialEvent(payload) {
  if (payload?.action !== 'upsertEventPartialJson') return null;
  const parsed = parseJson(payload.eventJson);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

export function shadowEntryId(payload, upstreamBody = '') {
  const upstream = parseJson(upstreamBody);
  return cleanText(
    payload?.entryId
      || payload?.event?.entryId
      || partialEvent(payload)?.entryId
      || upstream?.event?.entryId
      || upstream?.result?.entryId,
  );
}

export function shadowMutationPayload(payload) {
  if (payload?.action === 'upsertEvent' && payload.event && typeof payload.event === 'object') {
    return { event: payload.event, computed: payload.computed || {} };
  }
  if (payload?.action === 'upsertEventPartialJson') return { event: partialEvent(payload) || {} };
  if (payload?.action === 'deleteEvent') {
    return { entryId: cleanText(payload.entryId), sourceRow: cleanText(payload.sourceRow) };
  }
  return {};
}

function canonicalEvent(upstreamBody) {
  const upstream = parseJson(upstreamBody);
  return upstream?.event && typeof upstream.event === 'object' ? upstream.event : null;
}

async function insertMutation(db, record) {
  await db.prepare(`
    INSERT INTO event_shadow_mutations (
      id, created_at, entry_id, action, actor_email, payload_json,
      canonical_refresh_status, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.createdAt,
    record.entryId,
    record.action,
    record.actorEmail,
    JSON.stringify(record.payload),
    record.status,
    record.error || null,
  ).run();
}

async function upsertSnapshot(db, { entryId, event, action, actorEmail, timestamp }) {
  await db.prepare(`
    INSERT INTO event_shadow (
      entry_id, event_json, source_updated_at, mirrored_at, last_action,
      actor_email, needs_refresh, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
    ON CONFLICT(entry_id) DO UPDATE SET
      event_json = excluded.event_json,
      source_updated_at = excluded.source_updated_at,
      mirrored_at = excluded.mirrored_at,
      last_action = excluded.last_action,
      actor_email = excluded.actor_email,
      needs_refresh = 0,
      deleted_at = NULL
  `).bind(
    entryId,
    JSON.stringify(event),
    timestamp,
    timestamp,
    action,
    actorEmail,
  ).run();
}

async function markDeleted(db, { entryId, actorEmail, timestamp }) {
  await db.prepare(`
    INSERT INTO event_shadow (
      entry_id, event_json, source_updated_at, mirrored_at, last_action,
      actor_email, needs_refresh, deleted_at
    ) VALUES (?, NULL, ?, ?, 'deleteEvent', ?, 0, ?)
    ON CONFLICT(entry_id) DO UPDATE SET
      source_updated_at = excluded.source_updated_at,
      mirrored_at = excluded.mirrored_at,
      last_action = excluded.last_action,
      actor_email = excluded.actor_email,
      needs_refresh = 0,
      deleted_at = excluded.deleted_at
  `).bind(entryId, timestamp, timestamp, actorEmail, timestamp).run();
}

async function markNeedsRefresh(db, { entryId, action, actorEmail, timestamp }) {
  await db.prepare(`
    INSERT INTO event_shadow (
      entry_id, event_json, source_updated_at, mirrored_at, last_action,
      actor_email, needs_refresh, deleted_at
    ) VALUES (?, NULL, ?, ?, ?, ?, 1, NULL)
    ON CONFLICT(entry_id) DO UPDATE SET
      mirrored_at = excluded.mirrored_at,
      last_action = excluded.last_action,
      actor_email = excluded.actor_email,
      needs_refresh = 1
  `).bind(entryId, timestamp, timestamp, action, actorEmail).run();
}

async function fetchCanonicalEvent({ sheetUrl, token, actorEmail, entryId, fetchFn }) {
  const response = await fetchFn(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'event', entryId, token, actorEmail }),
    redirect: 'follow',
    signal: AbortSignal.timeout(CANONICAL_REFRESH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Canonical event refresh returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!data?.ok || !data.event) throw new Error(data?.error || 'Canonical event refresh returned no event.');
  return data.event;
}

export async function mirrorSheetMutation({
  db,
  payload,
  upstreamBody,
  actorEmail,
  sheetUrl,
  token,
  fetchFn = fetch,
  timestamp = new Date().toISOString(),
}) {
  const action = cleanText(payload?.action);
  if (!db || !SHADOW_ACTIONS.has(action)) return { mirrored: false, reason: 'disabled' };

  const entryId = shadowEntryId(payload, upstreamBody);
  if (!entryId) return { mirrored: false, reason: 'missing-entry-id' };

  const record = {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    entryId,
    action,
    actorEmail,
    payload: shadowMutationPayload(payload),
    status: 'not-needed',
    error: '',
  };

  if (action === 'deleteEvent') {
    await markDeleted(db, { entryId, actorEmail, timestamp });
    await insertMutation(db, record);
    return { mirrored: true, entryId, status: record.status };
  }

  let event = canonicalEvent(upstreamBody);
  if (!event) {
    record.status = 'pending';
    await markNeedsRefresh(db, { entryId, action, actorEmail, timestamp });
    try {
      event = await fetchCanonicalEvent({ sheetUrl, token, actorEmail, entryId, fetchFn });
      record.status = 'completed';
    } catch (error) {
      record.status = 'failed';
      record.error = error instanceof Error ? error.message : 'Canonical event refresh failed.';
      await insertMutation(db, record);
      return { mirrored: false, entryId, status: record.status, error: record.error };
    }
  }

  await upsertSnapshot(db, { entryId, event, action, actorEmail, timestamp });
  await insertMutation(db, record);
  return { mirrored: true, entryId, status: record.status };
}
