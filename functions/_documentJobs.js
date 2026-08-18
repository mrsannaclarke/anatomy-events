const encoder = new TextEncoder();

export function documentAction(kind) {
  if (kind === 'contract') return 'generateContract';
  if (kind === 'tfl') return 'generateTfl';
  return '';
}

export async function createDocumentJob(db, { actorEmail, entryId, kind }) {
  const action = documentAction(kind);
  if (!action) throw new Error('Unsupported document kind.');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO document_jobs (
      id, actor_email, entry_id, kind, action, status, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)
  `).bind(id, actorEmail, entryId, kind, action, now, now).run();
  return { id, actorEmail, entryId, kind, action, status: 'queued', attempts: 0, createdAt: now, updatedAt: now };
}

export async function getDocumentJob(db, id) {
  const row = await db.prepare(`
    SELECT id, actor_email, entry_id, kind, action, status, attempts, result_json, error, created_at, updated_at
    FROM document_jobs
    WHERE id = ?
  `).bind(id).first();
  if (!row) return null;
  return {
    id: row.id,
    actorEmail: row.actor_email,
    entryId: row.entry_id,
    kind: row.kind,
    action: row.action,
    status: row.status,
    attempts: row.attempts,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function signDocumentJob(jobId, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(jobId));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyDocumentJobSignature(jobId, signature, secret) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bytes = new Uint8Array(signature.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(jobId));
}
