import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuditStatus = 'info' | 'success' | 'error';

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  eventType: string;
  status: AuditStatus;
  message: string;
  details?: string;
};

const AUDIT_LOG_STORAGE_KEY = 'anatomy_events_audit_log_v1';
const AUDIT_LOG_MAX_ENTRIES = 150;
const AUDIT_LOG_PAUSED = false;

function toEntryId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAuditLogMaxEntries(): number {
  return AUDIT_LOG_MAX_ENTRIES;
}

export function isAuditLogPaused(): boolean {
  return AUDIT_LOG_PAUSED;
}

export async function readAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is AuditLogEntry => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<AuditLogEntry>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.timestamp === 'string' &&
          typeof candidate.eventType === 'string' &&
          typeof candidate.status === 'string' &&
          typeof candidate.message === 'string'
        );
      })
      .slice(0, AUDIT_LOG_MAX_ENTRIES);
  } catch {
    return [];
  }
}

export async function appendAuditLog(input: {
  eventType: string;
  status?: AuditStatus;
  message: string;
  details?: Record<string, unknown> | string;
}): Promise<void> {
  if (AUDIT_LOG_PAUSED) return;

  const current = await readAuditLogs();
  const details =
    typeof input.details === 'string'
      ? input.details
      : input.details
        ? JSON.stringify(input.details)
        : undefined;

  const nextEntry: AuditLogEntry = {
    id: toEntryId(),
    timestamp: new Date().toISOString(),
    eventType: input.eventType.trim() || 'unknown_event',
    status: input.status ?? 'info',
    message: input.message.trim() || 'No message provided.',
    details,
  };

  const next = [nextEntry, ...current].slice(0, AUDIT_LOG_MAX_ENTRIES);

  try {
    await AsyncStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Audit logging should never block user workflows.
  }
}

export function fireAndForgetAuditLog(input: Parameters<typeof appendAuditLog>[0]) {
  void appendAuditLog(input);
}
