import { appendAuditToSheet } from './sheetClient.js';

export function buildAuditPayload(viewer, details = {}) {
  return {
    app: 'events-app-2.0',
    viewerEmail: viewer?.email || '',
    viewerName: viewer?.name || '',
    at: new Date().toISOString(),
    ...details,
  };
}

export function fireAudit(viewer, { actionName, entryId, targetSheet = 'Events', details = {} }) {
  void appendAuditToSheet({
    actionName,
    entryId,
    targetSheet,
    payload: buildAuditPayload(viewer, details),
  }).catch(() => {
    // Audit logging must never block a successful Sheet mutation.
  });
}
