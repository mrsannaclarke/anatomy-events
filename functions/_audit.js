const AUDIT_ADMIN_EMAILS = new Set(['admin@anatomytattoo.com', 'mrs.annaclarke@gmail.com']);

function cleanEntryId(payload) {
  const direct = String(payload?.entryId || payload?.event?.entryId || payload?.payment?.eventId || '').trim();
  if (direct) return direct;
  if (payload?.eventJson) {
    try {
      return String(JSON.parse(payload.eventJson)?.entryId || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

function eventFields(payload) {
  if (payload?.event && typeof payload.event === 'object') return Object.keys(payload.event).sort();
  if (payload?.payment && typeof payload.payment === 'object') return Object.keys(payload.payment).sort();
  if (payload?.eventJson) {
    try {
      const parsed = JSON.parse(payload.eventJson);
      return parsed && typeof parsed === 'object' ? Object.keys(parsed).sort() : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function isAuditAdmin(email) {
  return AUDIT_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

export function auditRecord(payload, actorEmail, upstreamStatus) {
  const action = String(payload?.action || '');
  const metadata = {};
  if (action === 'generateContract') metadata.revision = Boolean(payload?.revision);
  if (action === 'uploadEventArt') {
    metadata.fileName = String(payload?.fileName || '').slice(0, 240);
    metadata.mimeType = String(payload?.mimeType || '').slice(0, 120);
    metadata.encodedBytes = String(payload?.fileData || '').length;
  }
  if (action === 'deleteEvent' && payload?.sourceRow !== undefined) metadata.sourceRow = String(payload.sourceRow);

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actorEmail,
    action,
    entryId: cleanEntryId(payload),
    changedFields: eventFields(payload),
    metadata,
    upstreamStatus,
  };
}

export async function writeAuditRecord(db, record) {
  if (!db) return;
  await db.prepare(`
    INSERT INTO audit_log (
      id, created_at, actor_email, action, entry_id, changed_fields, metadata, upstream_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.createdAt,
    record.actorEmail,
    record.action,
    record.entryId || null,
    JSON.stringify(record.changedFields),
    JSON.stringify(record.metadata),
    record.upstreamStatus,
  ).run();
}

export async function listAuditRecords(db, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const result = await db.prepare(`
    SELECT id, created_at, actor_email, action, entry_id, changed_fields, metadata, upstream_status
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(safeLimit).all();

  return result.results.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    action: row.action,
    entryId: row.entry_id || '',
    changedFields: JSON.parse(row.changed_fields || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    upstreamStatus: row.upstream_status,
  }));
}
