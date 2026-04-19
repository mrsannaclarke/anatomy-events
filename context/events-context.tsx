import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { isCompletedPayStatusValue } from '@/constants/pay-framework';
import { fireAndForgetAuditLog } from '@/lib/audit-log';
import { EMPTY_EVENT, type EventRecord } from '@/types/events';

interface EventsContextValue {
  events: EventRecord[];
  selectedEventId: string;
  setSelectedEventId: (id: string) => void;
  createEvent: () => string;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  replaceEvents: (events: EventRecord[]) => void;
  upsertEventFromRemote: (event: EventRecord) => void;
}

const EventsContext = createContext<EventsContextValue | null>(null);
export const EVENTS_STORAGE_KEY = 'anatomy_events_v2';

function hydrateRecord(partial: Partial<EventRecord>): EventRecord {
  return {
    ...EMPTY_EVENT,
    ...partial,
    id: partial.id ?? `evt-${Date.now()}`,
  };
}

export function EventsProvider({ children }: PropsWithChildren) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState(false);
  const updateAuditThrottleRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadFromStorage() {
      try {
        const raw = await AsyncStorage.getItem(EVENTS_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as {
          events?: Partial<EventRecord>[];
          selectedEventId?: string;
        };

        const loadedEvents = (parsed.events ?? []).map(hydrateRecord).filter((event) => Boolean(event.id));
        if (!isMounted || loadedEvents.length === 0) return;

        setEvents(loadedEvents);
        if (parsed.selectedEventId && loadedEvents.some((event) => event.id === parsed.selectedEventId)) {
          setSelectedEventId(parsed.selectedEventId);
        } else {
          setSelectedEventId(loadedEvents[0].id);
        }
      } catch (error) {
        console.warn('Failed to load saved events:', error);
      } finally {
        if (isMounted) setIsHydrated(true);
      }
    }

    loadFromStorage();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    AsyncStorage.setItem(
      EVENTS_STORAGE_KEY,
      JSON.stringify({
        events,
        selectedEventId,
      }),
    ).catch((error) => console.warn('Failed to save events:', error));
  }, [events, isHydrated, selectedEventId]);

  const value = useMemo<EventsContextValue>(() => {
    function createEvent(): string {
      const id = `evt-${Date.now()}`;
      const newEvent: EventRecord = {
        ...EMPTY_EVENT,
        id,
        entryId: '',
      };

      setEvents((current) => [newEvent, ...current]);
      setSelectedEventId(id);
      fireAndForgetAuditLog({
        eventType: 'event_create',
        status: 'success',
        message: 'Created a new event shell.',
        details: { id },
      });
      return id;
    }

    function updateEvent(id: string, patch: Partial<EventRecord>): void {
      const currentEvent = events.find((event) => event.id === id);
      const nextPatch: Partial<EventRecord> = { ...patch };

      const currentStatus = currentEvent?.status.trim() || currentEvent?.payStatus.trim() || '';
      const nextStatus = String(nextPatch.status ?? currentEvent?.status ?? '').trim();
      const nextPayStatus = String(nextPatch.payStatus ?? currentEvent?.payStatus ?? '').trim();
      const nextUnifiedStatus = nextStatus || nextPayStatus;

      const wasComplete = isCompletedPayStatusValue(currentStatus);
      const isComplete = isCompletedPayStatusValue(nextUnifiedStatus);
      if (!wasComplete && isComplete) {
        nextPatch.eventCompletedAt = new Date().toISOString();
      }
      if (wasComplete && !isComplete) {
        nextPatch.eventCompletedAt = '';
      }

      const changedPatch: Partial<EventRecord> = {};

      Object.entries(nextPatch).forEach(([key, value]) => {
        const typedKey = key as keyof EventRecord;
        const previousValue = currentEvent?.[typedKey];
        if (String(previousValue ?? '') === String(value ?? '')) return;
        (changedPatch as Record<string, unknown>)[key] = value;
      });

      setEvents((current) => current.map((event) => (event.id === id ? { ...event, ...nextPatch } : event)));

      const changedKeys = Object.keys(changedPatch);
      if (changedKeys.length > 0) {
        const now = Date.now();
        const throttleMs = 2000;
        const throttledKeys = changedKeys.filter((key) => {
          const throttleKey = `${id}:${key}`;
          const previous = updateAuditThrottleRef.current[throttleKey] || 0;
          if (now - previous < throttleMs) return false;
          updateAuditThrottleRef.current[throttleKey] = now;
          return true;
        });

        if (throttledKeys.length === 0) return;
        const throttledPatch = throttledKeys.reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (changedPatch as Record<string, unknown>)[key];
          return acc;
        }, {});

        fireAndForgetAuditLog({
          eventType: 'event_update',
          status: 'info',
          message: `Updated ${throttledKeys.length} field${throttledKeys.length === 1 ? '' : 's'} on event.`,
          details: {
            id,
            entryId: currentEvent?.entryId || '',
            changedKeys: throttledKeys,
            patch: throttledPatch,
          },
        });
      }
    }

    function removeEvent(id: string): void {
      const existing = events.find((event) => event.id === id);
      setEvents((current) => current.filter((event) => event.id !== id));
      setSelectedEventId((currentSelected) => (currentSelected === id ? '' : currentSelected));
      fireAndForgetAuditLog({
        eventType: 'event_remove_local',
        status: 'success',
        message: 'Removed event from local app state.',
        details: {
          id,
          entryId: existing?.entryId || '',
          sourceRow: existing?.sourceRow || '',
        },
      });
    }

    function replaceEvents(nextEvents: EventRecord[]): void {
      setEvents(nextEvents);
      if (nextEvents.length === 0) {
        setSelectedEventId('');
        return;
      }

      if (!nextEvents.some((event) => event.id === selectedEventId)) {
        setSelectedEventId(nextEvents[0].id);
      }

      fireAndForgetAuditLog({
        eventType: 'events_replace',
        status: 'success',
        message: `Replaced local events from sheet pull (${nextEvents.length} rows).`,
        details: {
          count: nextEvents.length,
          selectedEventIdAfter: nextEvents[0]?.id || '',
        },
      });
    }

    function upsertEventFromRemote(remoteEvent: EventRecord): void {
      setEvents((current) => {
        const byIdIndex = current.findIndex((event) => event.id === remoteEvent.id);
        if (byIdIndex >= 0) {
          const copy = [...current];
          copy[byIdIndex] = { ...copy[byIdIndex], ...remoteEvent };
          return copy;
        }

        const byEntryIndex = current.findIndex(
          (event) => event.entryId && event.entryId === remoteEvent.entryId,
        );
        if (byEntryIndex >= 0) {
          const copy = [...current];
          copy[byEntryIndex] = { ...copy[byEntryIndex], ...remoteEvent };
          return copy;
        }

        return [remoteEvent, ...current];
      });
      setSelectedEventId(remoteEvent.id);
      fireAndForgetAuditLog({
        eventType: 'event_upsert_remote',
        status: 'success',
        message: 'Synced event from remote.',
        details: {
          id: remoteEvent.id,
          entryId: remoteEvent.entryId,
          sourceRow: remoteEvent.sourceRow,
        },
      });
    }

    return {
      events,
      selectedEventId,
      setSelectedEventId,
      createEvent,
      removeEvent,
      updateEvent,
      replaceEvents,
      upsertEventFromRemote,
    };
  }, [events, selectedEventId]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }

  return context;
}

export async function clearPersistedEventsCache(): Promise<void> {
  await AsyncStorage.removeItem(EVENTS_STORAGE_KEY);
}
