import { auditRecord, writeAuditRecord } from '../../_audit.js';
import { getDocumentJob, verifyDocumentJobSignature } from '../../_documentJobs.js';
import { sheetMutationInvalidationKeys } from '../../_sheetCache.js';

function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function callAppsScript(env, payload, timeoutMs = 90_000) {
  const upstream = await fetch(env.SHEET_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, token: env.APP_SYNC_TOKEN }),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await upstream.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, error: 'Apps Script returned invalid JSON.', retryable: upstream.status >= 500 };
  }
  if (!upstream.ok || !result.ok) {
    return {
      ok: false,
      status: upstream.status >= 400 ? upstream.status : 502,
      error: result.error || `Apps Script request failed (HTTP ${upstream.status}).`,
      retryable: upstream.status === 429 || upstream.status >= 500,
    };
  }
  return { ok: true, status: upstream.status, result };
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405);
  if (!env.APP_SYNC_TOKEN || !env.SHEET_WEB_APP_URL || !env.AUDIT_DB) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return response({ ok: false, error: 'Invalid JSON request.' }, 400);
  }
  const jobId = String(payload?.jobId || '');
  const signature = String(payload?.signature || '');
  if (!jobId || !(await verifyDocumentJobSignature(jobId, signature, env.APP_SYNC_TOKEN))) {
    return response({ ok: false, error: 'Invalid job signature.' }, 401);
  }

  const job = await getDocumentJob(env.AUDIT_DB, jobId);
  if (!job) return response({ ok: false, error: 'Document job was not found.' }, 404);
  if (job.status === 'completed') return response({ ok: true, result: job.result, alreadyCompleted: true });
  if (!['queued', 'processing', 'retrying'].includes(job.status)) {
    return response({ ok: false, error: job.error || 'Document job cannot be processed.' }, 409);
  }

  const upstreamPayload = { action: job.action, entryId: job.entryId, actorEmail: job.actorEmail };
  try {
    const currentEvent = await callAppsScript(env, { action: 'event', entryId: job.entryId, actorEmail: job.actorEmail }, 30_000);
    if (!currentEvent.ok) {
      return response({ ok: false, error: currentEvent.error, retryable: currentEvent.retryable }, currentEvent.status);
    }
    const existingUrl = job.kind === 'tfl' ? currentEvent.result.event?.tflUrl : currentEvent.result.event?.contractUrl;
    const generation = existingUrl
      ? { ok: true, status: 200, result: { ok: true, result: { entryId: job.entryId, existingUrl } } }
      : await callAppsScript(env, upstreamPayload);
    if (!generation.ok) return response({ ok: false, error: generation.error, retryable: generation.retryable }, generation.status);

    if (env.EVENTS_CACHE) {
      waitUntil(Promise.all(sheetMutationInvalidationKeys(upstreamPayload).map((key) => env.EVENTS_CACHE.delete(key))));
    }
    await env.AUDIT_DB.prepare(`
      UPDATE document_jobs
      SET status = 'completed', result_json = ?, error = NULL, updated_at = ?
      WHERE id = ?
    `).bind(JSON.stringify(generation.result), new Date().toISOString(), jobId).run();
    if (!existingUrl) {
      waitUntil(writeAuditRecord(env.AUDIT_DB, auditRecord(upstreamPayload, job.actorEmail, generation.status)).catch((error) => {
        console.error(JSON.stringify({ event: 'audit_write_error', action: job.action, email: job.actorEmail, reason: error instanceof Error ? error.message : 'unknown' }));
      }));
    }
    return response({ ok: true, result: generation.result });
  } catch (error) {
    console.error(JSON.stringify({ event: 'document_upstream_error', jobId, reason: error instanceof Error ? error.name : 'unknown' }));
    return response({ ok: false, error: 'Apps Script is temporarily unavailable.', retryable: true }, 503);
  }
}
