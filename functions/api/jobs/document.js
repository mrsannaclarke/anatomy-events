import { createDocumentJob, getDocumentJob, signDocumentJob } from '../../_documentJobs.js';
import { authenticateAppRequest } from '../../_session.js';
import { isAuditAdmin } from '../../_audit.js';

function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function authenticatedEmail(request, env) {
  return authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
}

export async function onRequest({ request, env }) {
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.AUDIT_DB || !env.DOCUMENT_JOBS) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  let email;
  try {
    email = await authenticatedEmail(request, env);
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }

  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!id) return response({ ok: false, error: 'Job ID is required.' }, 400);
    const job = await getDocumentJob(env.AUDIT_DB, id);
    if (!job) return response({ ok: false, error: 'Document job was not found.' }, 404);
    if (job.actorEmail !== email && !isAuditAdmin(email)) return response({ ok: false, error: 'Document job access is restricted.' }, 403);
    return response({ ok: true, job });
  }

  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return response({ ok: false, error: 'Invalid JSON request.' }, 400);
  }
  const entryId = String(payload?.entryId || '').trim();
  const kind = String(payload?.kind || '').trim();
  if (!entryId || !['contract', 'tfl'].includes(kind)) {
    return response({ ok: false, error: 'A valid Entry ID and document type are required.' }, 400);
  }

  const job = await createDocumentJob(env.AUDIT_DB, { actorEmail: email, entryId, kind });
  const signature = await signDocumentJob(job.id, env.APP_SYNC_TOKEN);
  try {
    await env.DOCUMENT_JOBS.send({ jobId: job.id, signature }, { contentType: 'json' });
    return response({ ok: true, job }, 202);
  } catch (error) {
    await env.AUDIT_DB.prepare(`
      UPDATE document_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?
    `).bind('The document could not be queued.', new Date().toISOString(), job.id).run();
    console.error(JSON.stringify({ event: 'document_queue_error', jobId: job.id, reason: error instanceof Error ? error.message : 'unknown' }));
    return response({ ok: false, error: 'The document could not be queued. Please try again.' }, 503);
  }
}
