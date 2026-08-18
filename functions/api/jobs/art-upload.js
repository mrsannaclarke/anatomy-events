import { isAuditAdmin } from '../../_audit.js';
import { signDocumentJob } from '../../_documentJobs.js';
import { authenticateAppRequest } from '../../_session.js';
import { createUploadJob, getUploadJob } from '../../_uploadJobs.js';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function response(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function safeFileName(value) {
  return String(value || 'upload').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'upload';
}

export async function onRequest({ request, env }) {
  if (!env.APP_SYNC_TOKEN || !env.GOOGLE_WEB_CLIENT_ID || !env.AUDIT_DB || !env.UPLOAD_JOBS || !env.UPLOAD_STAGING) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }
  let email;
  try {
    email = await authenticateAppRequest(request, env.GOOGLE_WEB_CLIENT_ID, env.APP_SYNC_TOKEN);
  } catch {
    return response({ ok: false, error: 'Authentication failed. Sign in again.' }, 401);
  }

  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id') || '';
    const job = id ? await getUploadJob(env.AUDIT_DB, id) : null;
    if (!job) return response({ ok: false, error: 'Upload job was not found.' }, 404);
    if (job.actorEmail !== email && !isAuditAdmin(email)) return response({ ok: false, error: 'Upload job access is restricted.' }, 403);
    return response({ ok: true, job });
  }
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405);

  const url = new URL(request.url);
  const entryId = String(url.searchParams.get('entryId') || '').trim();
  const fileName = safeFileName(url.searchParams.get('fileName'));
  const mimeType = String(request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (!entryId) return response({ ok: false, error: 'Entry ID is required.' }, 400);
  if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
    return response({ ok: false, error: 'Choose an image or PDF.' }, 415);
  }
  if (contentLength > MAX_UPLOAD_BYTES) return response({ ok: false, error: 'Choose a file smaller than 8 MB.' }, 413);

  const body = await request.arrayBuffer();
  if (!body.byteLength) return response({ ok: false, error: 'The uploaded file is empty.' }, 400);
  if (body.byteLength > MAX_UPLOAD_BYTES) return response({ ok: false, error: 'Choose a file smaller than 8 MB.' }, 413);

  const objectKey = `event-art/${entryId}/${crypto.randomUUID()}-${fileName}`;
  await env.UPLOAD_STAGING.put(objectKey, body, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { entryId, uploadedBy: email, originalName: fileName },
  });
  const job = await createUploadJob(env.AUDIT_DB, {
    actorEmail: email, entryId, objectKey, fileName, mimeType, sizeBytes: body.byteLength,
  });
  const signature = await signDocumentJob(job.id, env.APP_SYNC_TOKEN);
  try {
    await env.UPLOAD_JOBS.send({ type: 'art-upload', jobId: job.id, signature }, { contentType: 'json' });
    return response({ ok: true, job }, 202);
  } catch (error) {
    await env.UPLOAD_STAGING.delete(objectKey);
    await env.AUDIT_DB.prepare(`UPDATE upload_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`)
      .bind('The upload could not be queued.', new Date().toISOString(), job.id).run();
    console.error(JSON.stringify({ event: 'upload_queue_error', jobId: job.id, reason: error instanceof Error ? error.message : 'unknown' }));
    return response({ ok: false, error: 'The upload could not be queued. Please try again.' }, 503);
  }
}
