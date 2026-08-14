import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ALLOWED_EMAILS } from '../../shared/authPolicy.js';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const MUTATION_ACTIONS = new Set([
  'upsertEvent',
  'upsertEventPartialJson',
  'deleteEvent',
  'generateContract',
  'generateTfl',
  'importUploadedArt',
  'uploadEventArt',
]);

function jsonResponse(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function authenticate(request, clientId) {
  const authorization = request.headers.get('Authorization') || '';
  const credential = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!credential) throw new Error('Missing Google credential.');

  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  const email = String(payload.email || '').trim().toLowerCase();
  if (payload.email_verified !== true || !ALLOWED_EMAILS.has(email)) {
    throw new Error('This Google account is not authorized.');
  }
  return email;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.SHEET_WEB_APP_URL) {
    return jsonResponse({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 12582912) return jsonResponse({ ok: false, error: 'Upload is too large. Choose a file under 8 MB.' }, 413);

  let email;
  try {
    email = await authenticate(request, env.GOOGLE_WEB_CLIENT_ID);
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
  if (!MUTATION_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: 'Action is not allowed through this endpoint.' }, 403);
  }

  if (payload?.revision && email !== 'admin@anatomytattoo.com') {
    return jsonResponse({ ok: false, error: 'Only the super admin can generate revised contracts.' }, 403);
  }

  if (email !== 'admin@anatomytattoo.com' && action === 'upsertEvent' && payload?.event) {
    delete payload.event.balanceAddOnAmount;
    delete payload.event.balanceAddOnHistory;
    delete payload.event.lockedDepositAmount;
  }

  const upstreamResponse = await fetch(env.SHEET_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, token: env.APP_SYNC_TOKEN, actorEmail: email }),
    redirect: 'follow',
  });

  console.log(JSON.stringify({ event: 'sheet_mutation', action, email, status: upstreamResponse.status }));
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
