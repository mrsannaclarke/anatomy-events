import { authenticateAppRequest } from '../_session.js';
import { sheetMutationInvalidationKeys, sheetReadCacheKey } from '../_sheetCache.js';
import { auditRecord, writeAuditRecord } from '../_audit.js';
import { mirrorSheetMutation } from '../_eventShadow.js';

const MUTATION_ACTIONS = new Set([
  'upsertEvent',
  'upsertEventPartialJson',
  'recordEventPayment',
  'deleteEvent',
  'generateContract',
  'generateTfl',
  'uploadEventArt',
]);
const READ_ACTIONS = new Set(['events', 'event', 'pricing']);
const ALLOWED_ACTIONS = new Set([...READ_ACTIONS, ...MUTATION_ACTIONS]);
const UPSTREAM_TIMEOUT_MS = 20_000;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const PAYMENT_ADMIN_EMAILS = new Set(['admin@anatomytattoo.com', 'mrs.annaclarke@gmail.com']);

function jsonResponse(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function upstreamJsonResponse(body, status, contentType, source = 'apps-script') {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': contentType || 'application/json; charset=utf-8',
      'X-Anatomy-Data-Source': source,
      'X-Content-Type-Options': 'nosniff',
      ...(source === 'cloudflare-kv-fallback' ? { Warning: '110 - "Apps Script unavailable; serving last known good data"' } : {}),
    },
  });
}

async function cachedReadResponse(env, cacheKey) {
  if (!env.EVENTS_CACHE || !cacheKey) return null;
  const cached = await env.EVENTS_CACHE.get(cacheKey, { type: 'json' });
  if (!cached?.body) return null;
  return upstreamJsonResponse(cached.body, 200, cached.contentType, 'cloudflare-kv-fallback');
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.SHEET_WEB_APP_URL) {
    return jsonResponse({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 12582912) return jsonResponse({ ok: false, error: 'Upload is too large. Choose a file under 8 MB.' }, 413);

  let email;
  try {
    email = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
  } catch {
    return jsonResponse({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON request.' }, 400);
  }

  const action = String(payload?.action || '');
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: 'Action is not allowed through this endpoint.' }, 403);
  }
  if (action === 'recordEventPayment' && !PAYMENT_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase())) {
    return jsonResponse({ ok: false, error: 'Only an accounting administrator can record event payments.' }, 403);
  }

  if (payload?.revision && email !== 'admin@anatomytattoo.com') {
    return jsonResponse({ ok: false, error: 'Only the super admin can generate revised contracts.' }, 403);
  }

  if (email !== 'admin@anatomytattoo.com' && action === 'upsertEvent' && payload?.event) {
    delete payload.event.balanceAddOnAmount;
    delete payload.event.balanceAddOnHistory;
    delete payload.event.lockedDepositAmount;
  }
  if (email !== 'admin@anatomytattoo.com' && action === 'upsertEventPartialJson' && payload?.eventJson) {
    try {
      const eventPatch = JSON.parse(payload.eventJson);
      delete eventPatch.balanceAddOnAmount;
      delete eventPatch.balanceAddOnHistory;
      delete eventPatch.lockedDepositAmount;
      payload.eventJson = JSON.stringify(eventPatch);
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid partial event payload.' }, 400);
    }
  }

  const cacheKey = sheetReadCacheKey(payload);
  try {
    const upstreamResponse = await fetch(env.SHEET_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: env.APP_SYNC_TOKEN, actorEmail: email }),
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const responseBody = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('Content-Type') || 'application/json; charset=utf-8';

    if (READ_ACTIONS.has(action) && upstreamResponse.ok && env.EVENTS_CACHE && cacheKey) {
      waitUntil(env.EVENTS_CACHE.put(cacheKey, JSON.stringify({ body: responseBody, contentType }), {
        expirationTtl: CACHE_TTL_SECONDS,
      }));
    }
    if (MUTATION_ACTIONS.has(action) && upstreamResponse.ok && env.EVENTS_CACHE) {
      waitUntil(Promise.all(sheetMutationInvalidationKeys(payload).map((key) => env.EVENTS_CACHE.delete(key))));
    }
    if (MUTATION_ACTIONS.has(action) && upstreamResponse.ok && env.AUDIT_DB) {
      const record = auditRecord(payload, email, upstreamResponse.status);
      waitUntil(writeAuditRecord(env.AUDIT_DB, record).catch((error) => {
        console.error(JSON.stringify({ event: 'audit_write_error', action, email, reason: error instanceof Error ? error.message : 'unknown' }));
      }));
    }
    if (MUTATION_ACTIONS.has(action) && upstreamResponse.ok && env.EVENTS_DB) {
      waitUntil(mirrorSheetMutation({
        db: env.EVENTS_DB,
        payload,
        upstreamBody: responseBody,
        actorEmail: email,
        sheetUrl: env.SHEET_WEB_APP_URL,
        token: env.APP_SYNC_TOKEN,
      }).then((result) => {
        console.log(JSON.stringify({ event: 'event_shadow_mirror', action, email, ...result }));
      }).catch((error) => {
        console.error(JSON.stringify({
          event: 'event_shadow_error',
          action,
          email,
          reason: error instanceof Error ? error.message : 'unknown',
        }));
      }));
    }

    console.log(JSON.stringify({ event: MUTATION_ACTIONS.has(action) ? 'sheet_mutation' : 'sheet_read', action, email, status: upstreamResponse.status, source: 'apps-script' }));
    if (!upstreamResponse.ok && READ_ACTIONS.has(action)) {
      const fallback = await cachedReadResponse(env, cacheKey);
      if (fallback) {
        console.warn(JSON.stringify({ event: 'sheet_read_fallback', action, email, upstreamStatus: upstreamResponse.status }));
        return fallback;
      }
    }
    return upstreamJsonResponse(responseBody, upstreamResponse.status, contentType);
  } catch (error) {
    if (READ_ACTIONS.has(action)) {
      const fallback = await cachedReadResponse(env, cacheKey);
      if (fallback) {
        console.warn(JSON.stringify({ event: 'sheet_read_fallback', action, email, reason: error instanceof Error ? error.name : 'fetch_error' }));
        return fallback;
      }
    }
    console.error(JSON.stringify({ event: 'sheet_upstream_error', action, email, reason: error instanceof Error ? error.name : 'fetch_error' }));
    return jsonResponse({ ok: false, error: 'The Sheet service is temporarily unavailable. Please try again.' }, 503);
  }
}
