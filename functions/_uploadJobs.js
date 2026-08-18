function rowToUploadJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorEmail: row.actor_email,
    entryId: row.entry_id,
    objectKey: row.object_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    attempts: row.attempts,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUploadJob(db, details) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO upload_jobs (
      id, actor_email, entry_id, object_key, file_name, mime_type, size_bytes,
      status, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)
  `).bind(
    id, details.actorEmail, details.entryId, details.objectKey, details.fileName,
    details.mimeType, details.sizeBytes, now, now,
  ).run();
  return { id, ...details, status: 'queued', attempts: 0, createdAt: now, updatedAt: now };
}

export async function getUploadJob(db, id) {
  return rowToUploadJob(await db.prepare(`
    SELECT id, actor_email, entry_id, object_key, file_name, mime_type, size_bytes,
           status, attempts, result_json, error, created_at, updated_at
    FROM upload_jobs WHERE id = ?
  `).bind(id).first());
}

export async function getUploadJobHealth(db) {
  const result = await db.prepare(`
    SELECT status, COUNT(*) AS count FROM upload_jobs GROUP BY status
  `).all();
  const counts = { queued: 0, processing: 0, retrying: 0, completed: 0, failed: 0 };
  for (const row of result.results) counts[row.status] = Number(row.count || 0);
  return counts;
}
