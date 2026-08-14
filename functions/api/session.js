import { authenticateAppRequest, authenticateGoogleCredential, createSessionToken, expiredSessionCookie, sessionCookie } from '../_session.js';

function response(payload, status = 200, cookie = '') {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(payload), { status, headers });
}

export async function onRequest({ request, env }) {
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  if (request.method === 'DELETE') {
    return response({ ok: true }, 200, expiredSessionCookie());
  }

  if (request.method === 'GET') {
    try {
      const email = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
      return response({ ok: true, email });
    } catch {
      return response({ ok: false, error: 'App session is not active.' }, 401);
    }
  }

  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  const credential = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  try {
    const email = await authenticateGoogleCredential(credential, env.GOOGLE_WEB_CLIENT_ID);
    const token = await createSessionToken(email, env.APP_SYNC_TOKEN);
    const persistent = request.headers.get('X-Stay-Signed-In') !== 'false';
    return response({ ok: true, email }, 200, sessionCookie(token, persistent));
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }
}
