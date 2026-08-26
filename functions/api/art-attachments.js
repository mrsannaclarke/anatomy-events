import { authenticateAppRequest } from '../_session.js';

function response(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function rowToAttachment(row) {
  return {
    id: row.id,
    entryId: row.entry_id,
    url: row.url,
    fileName: row.file_name || 'Uploaded art',
    mimeType: row.mime_type || '',
    uploadedBy: row.actor_email || '',
    createdAt: row.created_at,
  };
}

export async function onRequest({ request, env }) {
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.AUDIT_DB) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  let email;
  try {
    email = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }

  if (request.method === 'GET') {
    const entryId = String(new URL(request.url).searchParams.get('entryId') || '').trim();
    if (!entryId) return response({ ok: false, error: 'Entry ID is required.' }, 400);
    const result = await env.AUDIT_DB.prepare(`
      SELECT id, entry_id, url, file_name, mime_type, actor_email, created_at, deleted_at
      FROM art_attachments WHERE entry_id = ? ORDER BY created_at DESC
    `).bind(entryId).all();
    const rows = result.results || [];
    return response({
      ok: true,
      attachments: rows.filter((row) => !row.deleted_at).map(rowToAttachment),
      deletedUrls: rows.filter((row) => row.deleted_at).map((row) => row.url),
    });
  }

  if (request.method === 'DELETE') {
    let payload;
    try { payload = await request.json(); } catch { return response({ ok: false, error: 'Invalid JSON request.' }, 400); }
    const entryId = String(payload?.entryId || '').trim();
    const id = String(payload?.id || '').trim();
    const url = String(payload?.url || '').trim();
    if (!entryId || (!id && !url)) return response({ ok: false, error: 'Attachment ID or URL is required.' }, 400);
    const now = new Date().toISOString();
    if (id) {
      await env.AUDIT_DB.prepare(`
        UPDATE art_attachments SET deleted_at = ? WHERE id = ? AND entry_id = ?
      `).bind(now, id, entryId).run();
    } else {
      await env.AUDIT_DB.prepare(`
        INSERT INTO art_attachments (id, entry_id, url, file_name, mime_type, actor_email, created_at, deleted_at)
        VALUES (?, ?, ?, 'Uploaded art', '', ?, ?, ?)
        ON CONFLICT(entry_id, url) DO UPDATE SET deleted_at = excluded.deleted_at
      `).bind(crypto.randomUUID(), entryId, url, email, now, now).run();
    }
    return response({ ok: true });
  }

  return response({ ok: false, error: 'Method not allowed.' }, 405);
}
