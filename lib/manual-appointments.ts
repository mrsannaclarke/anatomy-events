import AsyncStorage from '@react-native-async-storage/async-storage';

type ManualAppointmentStore = {
  upcomingByEventId: Record<string, number>;
};

const MANUAL_APPOINTMENTS_STORAGE_KEY = 'anatomy_events_manual_appointments_v1';

function normalizeEventId(value: string): string {
  return String(value || '').trim();
}

async function readManualAppointmentStore(): Promise<ManualAppointmentStore> {
  try {
    const raw = await AsyncStorage.getItem(MANUAL_APPOINTMENTS_STORAGE_KEY);
    if (!raw) {
      return { upcomingByEventId: {} };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { upcomingByEventId: {} };
    }

    const candidate = parsed as Partial<ManualAppointmentStore>;
    const upcomingByEventId = candidate.upcomingByEventId;
    if (!upcomingByEventId || typeof upcomingByEventId !== 'object') {
      return { upcomingByEventId: {} };
    }

    const normalizedEntries = Object.entries(upcomingByEventId)
      .map(([eventId, ts]) => [normalizeEventId(eventId), Number(ts)] as const)
      .filter(([eventId, ts]) => Boolean(eventId) && Number.isFinite(ts) && ts > 0);
    return {
      upcomingByEventId: Object.fromEntries(normalizedEntries),
    };
  } catch {
    return { upcomingByEventId: {} };
  }
}

async function writeManualAppointmentStore(store: ManualAppointmentStore): Promise<void> {
  try {
    await AsyncStorage.setItem(MANUAL_APPOINTMENTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Manual appointment persistence should never block user flow.
  }
}

export async function readManualUpcomingAppointment(eventId: string): Promise<number | null> {
  const key = normalizeEventId(eventId);
  if (!key) return null;
  const store = await readManualAppointmentStore();
  const ts = Number(store.upcomingByEventId[key]);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export async function readManualUpcomingAppointments(eventIds: string[]): Promise<Record<string, number>> {
  const keys = Array.from(new Set(eventIds.map((entry) => normalizeEventId(entry)).filter(Boolean)));
  if (keys.length === 0) return {};

  const store = await readManualAppointmentStore();
  const map: Record<string, number> = {};
  keys.forEach((key) => {
    const ts = Number(store.upcomingByEventId[key]);
    if (Number.isFinite(ts) && ts > 0) {
      map[key] = ts;
    }
  });
  return map;
}

export async function setManualUpcomingAppointment(eventId: string, ts: number | null): Promise<void> {
  const key = normalizeEventId(eventId);
  if (!key) return;

  const store = await readManualAppointmentStore();
  const next = {
    upcomingByEventId: {
      ...store.upcomingByEventId,
    },
  };

  if (ts == null || !Number.isFinite(ts) || ts <= 0) {
    delete next.upcomingByEventId[key];
  } else {
    next.upcomingByEventId[key] = ts;
  }

  await writeManualAppointmentStore(next);
}
