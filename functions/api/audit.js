import { isAuditAdmin, listAuditRecords } from '../_audit.js';
import { authenticateAppRequest } from '../_session.js';

function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return response({ ok: false, error: 'Method not allowed.' }, 405);
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.AUDIT_DB) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  let email;
  try {
    email = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }
  if (!isAuditAdmin(email)) return response({ ok: false, error: 'Audit access is restricted.' }, 403);

  try {
    const url = new URL(request.url);
    const records = await listAuditRecords(env.AUDIT_DB, url.searchParams.get('limit'));
    return response({ ok: true, records });
  } catch (error) {
    console.error(JSON.stringify({ event: 'audit_read_error', email, reason: error instanceof Error ? error.message : 'unknown' }));
    return response({ ok: false, error: 'Audit history is temporarily unavailable.' }, 503);
  }
}
