import { authenticateAppRequest } from '../../_session.js';
import { prepareEventShadowBackfill } from '../../../shared/eventShadowBackfill.js';
import { reconcileEventShadow } from '../../../shared/eventShadowReconciliation.js';

const ADMIN_EMAIL = 'admin@anatomytattoo.com';
const UPSTREAM_TIMEOUT_MS = 20_000;

function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function fetchSheetEvents(env, actorEmail) {
  const upstream = await fetch(env.SHEET_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'events', token: env.APP_SYNC_TOKEN, actorEmail }),
    redirect: 'follow',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!upstream.ok) throw new Error(`Sheet events request returned HTTP ${upstream.status}.`);
  const data = await upstream.json();
  if (!data?.ok || !Array.isArray(data.events)) throw new Error(data?.error || 'Sheet events response was invalid.');
  return data.events;
}

export async function onRequestPost({ request, env }) {
  if (env.EVENT_SHADOW_BACKFILL_ENABLED !== 'true' || !env.EVENTS_DB) {
    return response({ ok: false, error: 'Not found.' }, 404);
  }
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.SHEET_WEB_APP_URL) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  let actorEmail;
  try {
    actorEmail = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }
  if (actorEmail !== ADMIN_EMAIL) return response({ ok: false, error: 'Administrator access is required.' }, 403);

  try {
    const sourceEvents = await fetchSheetEvents(env, actorEmail);
    const prepared = prepareEventShadowBackfill(sourceEvents);
    if (!prepared.ok) {
      return response({
        ok: false,
        error: 'Backfill stopped because the Sheet contains invalid or duplicate Entry IDs.',
        duplicateEntryIds: prepared.duplicateEntryIds,
        invalidRows: prepared.invalidRows,
      }, 409);
    }

    const timestamp = new Date().toISOString();
    const statements = prepared.events.map(({ entryId, event }) => env.EVENTS_DB.prepare(`
      INSERT INTO event_shadow (
        entry_id, event_json, source_updated_at, mirrored_at, last_action,
        actor_email, needs_refresh, deleted_at
      ) VALUES (?, ?, ?, ?, 'backfill', ?, 0, NULL)
      ON CONFLICT(entry_id) DO UPDATE SET
        event_json = excluded.event_json,
        source_updated_at = excluded.source_updated_at,
        mirrored_at = excluded.mirrored_at,
        last_action = excluded.last_action,
        actor_email = excluded.actor_email,
        needs_refresh = 0,
        deleted_at = NULL
    `).bind(entryId, JSON.stringify(event), timestamp, timestamp, actorEmail));

    if (statements.length) await env.EVENTS_DB.batch(statements);
    const shadowQuery = await env.EVENTS_DB.prepare(`
      SELECT entry_id, event_json, needs_refresh, deleted_at
      FROM event_shadow
    `).all();
    const reconciliation = reconcileEventShadow({ events: sourceEvents }, shadowQuery.results || []);
    console.log(JSON.stringify({
      event: 'event_shadow_backfill',
      actorEmail,
      sourceCount: sourceEvents.length,
      writtenCount: statements.length,
      reconciliationOk: reconciliation.ok,
    }));
    return response({
      ok: reconciliation.ok,
      sourceCount: sourceEvents.length,
      writtenCount: statements.length,
      reconciliation,
      ...(reconciliation.ok ? {} : { error: 'Backfill completed, but reconciliation found differences.' }),
    }, reconciliation.ok ? 200 : 409);
  } catch (error) {
    console.error(JSON.stringify({ event: 'event_shadow_backfill_error', actorEmail, reason: error instanceof Error ? error.message : 'unknown' }));
    return response({ ok: false, error: 'The event shadow backfill failed.' }, 502);
  }
}
