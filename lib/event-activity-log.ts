import AsyncStorage from '@react-native-async-storage/async-storage';

export type EventActivityType = 'status_update' | 'staff_note' | 'action';

export type EventActivityEntry = {
  id: string;
  eventId: string;
  timestamp: string;
  actor: string;
  type: EventActivityType;
  message: string;
  statusFrom?: string;
  statusTo?: string;
  discordChannelUrl?: string;
  discordChannelLabel?: string;
};

export type EventLatestCommunicationMap = Record<string, EventActivityEntry>;

const EVENT_ACTIVITY_STORAGE_KEY = 'anatomy_events_activity_log_v1';
const EVENT_ACTIVITY_MAX_ENTRIES = 2000;

function toEntryId(): string {
  return `event-log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAllEventActivityEntries(): Promise<EventActivityEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENT_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is EventActivityEntry => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<EventActivityEntry>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.eventId === 'string' &&
          typeof candidate.timestamp === 'string' &&
          typeof candidate.actor === 'string' &&
          typeof candidate.type === 'string' &&
          typeof candidate.message === 'string'
        );
      })
      .slice(0, EVENT_ACTIVITY_MAX_ENTRIES);
  } catch {
    return [];
  }
}

export async function readEventActivityLog(eventId: string): Promise<EventActivityEntry[]> {
  const key = String(eventId || '').trim();
  if (!key) return [];
  const all = await readAllEventActivityEntries();
  return all.filter((entry) => entry.eventId === key);
}

export async function readLatestCommunicationByEventIds(eventIds: string[]): Promise<EventLatestCommunicationMap> {
  const requested = Array.from(new Set(eventIds.map((entry) => String(entry || '').trim()).filter(Boolean)));
  if (requested.length === 0) return {};

  const requestedSet = new Set(requested);
  const all = await readAllEventActivityEntries();
  const latestByEventId: EventLatestCommunicationMap = {};

  all.forEach((entry) => {
    if (entry.type !== 'staff_note') return;
    if (!requestedSet.has(entry.eventId)) return;

    const existing = latestByEventId[entry.eventId];
    if (!existing) {
      latestByEventId[entry.eventId] = entry;
      return;
    }

    const existingTimestamp = Date.parse(existing.timestamp);
    const nextTimestamp = Date.parse(entry.timestamp);
    if (Number.isNaN(existingTimestamp) || Number.isNaN(nextTimestamp)) return;
    if (nextTimestamp > existingTimestamp) {
      latestByEventId[entry.eventId] = entry;
    }
  });

  return latestByEventId;
}

export async function appendEventActivityLog(input: {
  eventId: string;
  actor: string;
  type: EventActivityType;
  message: string;
  statusFrom?: string;
  statusTo?: string;
  discordChannelUrl?: string;
  discordChannelLabel?: string;
}): Promise<void> {
  const eventId = String(input.eventId || '').trim();
  if (!eventId) return;

  const message = String(input.message || '').trim();
  if (!message) return;

  const actor = String(input.actor || '').trim() || 'Unknown Staff';
  const discordChannelUrl = String(input.discordChannelUrl || '').trim();
  const discordChannelLabel = String(input.discordChannelLabel || '').trim();
  const all = await readAllEventActivityEntries();

  const nextEntry: EventActivityEntry = {
    id: toEntryId(),
    eventId,
    timestamp: new Date().toISOString(),
    actor,
    type: input.type,
    message,
    statusFrom: input.statusFrom,
    statusTo: input.statusTo,
    discordChannelUrl: discordChannelUrl || undefined,
    discordChannelLabel: discordChannelLabel || undefined,
  };

  const next = [nextEntry, ...all].slice(0, EVENT_ACTIVITY_MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(EVENT_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // event activity log should never block user flow.
  }
}

export function fireAndForgetEventActivityLog(input: Parameters<typeof appendEventActivityLog>[0]) {
  void appendEventActivityLog(input);
}

export async function removeEventActivityEntry(eventId: string, entryId: string): Promise<boolean> {
  const eventKey = String(eventId || '').trim();
  const entryKey = String(entryId || '').trim();
  if (!eventKey || !entryKey) return false;

  const all = await readAllEventActivityEntries();
  const next = all.filter((entry) => !(entry.eventId === eventKey && entry.id === entryKey));
  if (next.length === all.length) return false;

  try {
    await AsyncStorage.setItem(EVENT_ACTIVITY_STORAGE_KEY, JSON.stringify(next.slice(0, EVENT_ACTIVITY_MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

export async function removeEventActivityEntriesByActor(eventId: string, actor: string): Promise<number> {
  const eventKey = String(eventId || '').trim();
  const actorKey = String(actor || '').trim();
  if (!eventKey || !actorKey) return 0;

  const all = await readAllEventActivityEntries();
  const next = all.filter((entry) => !(entry.eventId === eventKey && entry.actor === actorKey));
  if (next.length === all.length) return 0;

  try {
    await AsyncStorage.setItem(EVENT_ACTIVITY_STORAGE_KEY, JSON.stringify(next.slice(0, EVENT_ACTIVITY_MAX_ENTRIES)));
    return all.length - next.length;
  } catch {
    return 0;
  }
}
