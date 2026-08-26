import { auditRecord, writeAuditRecord } from '../../_audit.js';
import { verifyDocumentJobSignature } from '../../_documentJobs.js';
import { sheetMutationInvalidationKeys } from '../../_sheetCache.js';
import { getUploadJob } from '../../_uploadJobs.js';

function response(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function callAppsScript(env, payload, timeoutMs = 120_000) {
  const upstream = await fetch(env.SHEET_WEB_APP_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, token: env.APP_SYNC_TOKEN }), redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await upstream.text();
  let result;
  try { result = JSON.parse(text); } catch { return { ok: false, status: 502, error: 'Apps Script returned invalid JSON.', retryable: true }; }
  if (!upstream.ok || !result.ok) {
    return { ok: false, status: upstream.status >= 400 ? upstream.status : 502, error: result.error || 'Drive upload failed.', retryable: upstream.status === 429 || upstream.status >= 500 };
  }
  return { ok: true, status: upstream.status, result };
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405);
  if (!env.APP_SYNC_TOKEN || !env.SHEET_WEB_APP_URL || !env.AUDIT_DB || !env.UPLOAD_STAGING) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }
  let payload;
  try { payload = await request.json(); } catch { return response({ ok: false, error: 'Invalid JSON request.' }, 400); }
  const jobId = String(payload?.jobId || '');
  const signature = String(payload?.signature || '');
  if (!jobId || !(await verifyDocumentJobSignature(jobId, signature, env.APP_SYNC_TOKEN))) {
    return response({ ok: false, error: 'Invalid job signature.' }, 401);
  }
  const job = await getUploadJob(env.AUDIT_DB, jobId);
  if (!job) return response({ ok: false, error: 'Upload job was not found.' }, 404);
  if (job.status === 'completed') return response({ ok: true, result: job.result, alreadyCompleted: true });
  if (!['queued', 'processing', 'retrying'].includes(job.status)) return response({ ok: false, error: job.error || 'Upload cannot be processed.' }, 409);

  try {
    const object = await env.UPLOAD_STAGING.get(job.objectKey);
    if (!object) return response({ ok: false, error: 'The staged upload was not found.', retryable: false }, 404);
    const fileData = arrayBufferToBase64(await object.arrayBuffer());
    const upstreamPayload = {
      action: 'uploadEventArt', entryId: job.entryId, fileName: job.fileName,
      mimeType: job.mimeType, fileData, actorEmail: job.actorEmail,
    };
    const upload = await callAppsScript(env, upstreamPayload);
    if (!upload.ok) return response({ ok: false, error: upload.error, retryable: upload.retryable }, upload.status);
    const uploadResult = upload.result;
    const artUrl = uploadResult?.artUrl || uploadResult?.artImageUrl || '';
    if (!artUrl) return response({ ok: false, error: 'Drive upload did not return an art link.', retryable: false }, 502);
    await env.AUDIT_DB.prepare(`
      INSERT INTO art_attachments (id, entry_id, url, file_name, mime_type, actor_email, created_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(entry_id, url) DO UPDATE SET
        file_name = excluded.file_name, mime_type = excluded.mime_type,
        actor_email = excluded.actor_email, deleted_at = NULL
    `).bind(crypto.randomUUID(), job.entryId, artUrl, job.fileName, job.mimeType, job.actorEmail, new Date().toISOString()).run();
    if (env.EVENTS_CACHE) waitUntil(Promise.all(sheetMutationInvalidationKeys(upstreamPayload).map((key) => env.EVENTS_CACHE.delete(key))));
    waitUntil(writeAuditRecord(env.AUDIT_DB, auditRecord(upstreamPayload, job.actorEmail, upload.status)).catch(() => {}));
    await env.AUDIT_DB.prepare(`
      UPDATE upload_jobs SET status = 'completed', result_json = ?, error = NULL, updated_at = ? WHERE id = ?
    `).bind(JSON.stringify(uploadResult), new Date().toISOString(), jobId).run();
    waitUntil((async () => {
      const deletedAt = new Date().toISOString();
      await env.UPLOAD_STAGING.delete(job.objectKey);
      await env.AUDIT_DB.prepare(`
        UPDATE upload_jobs SET staging_deleted_at = ? WHERE id = ? AND staging_deleted_at IS NULL
      `).bind(deletedAt, jobId).run();
    })());
    return response({ ok: true, result: uploadResult });
  } catch (error) {
    console.error(JSON.stringify({ event: 'art_upload_error', jobId, reason: error instanceof Error ? error.message : 'unknown' }));
    return response({ ok: false, error: 'The Drive upload is temporarily unavailable.', retryable: true }, 503);
  }
}
