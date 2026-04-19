import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { CALENDAR_SYNC_CONFIG } from '@/constants/calendar-sync';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import { buildCalendarMatchMap, formatCalendarMatchDate, loadCalendarEvents } from '@/lib/calendar-sync';
import {
  appendEventActivityLog,
  readEventActivityLog,
  type EventActivityEntry,
} from '@/lib/event-activity-log';

const EVENT_STATUS_OPTIONS = [
  'Inquiry Recieved',
  'Consult Link Sent',
  'Consult Booked',
  'Post Consult Decision',
  'Need To Send Contract/Deposit Invoice',
  'Contract Signed',
  'Deposit Sent',
  'Deposit Late',
  'Deposit Paid',
  'Temporary License Submitted',
  'Awaiting Follow Up',
  'Needing Changes',
  'Balance Invoice Sent',
  'Cancelled',
  'Event Complete',
  'Event Complete Balance Late',
];

type EventTypeVisual = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
};

function getEventTypeVisual(eventType: string): EventTypeVisual {
  const normalized = eventType.trim().toLowerCase();
  if (normalized.includes('private')) return { icon: 'celebration', color: '#b58bff' };
  if (normalized.includes('corporate')) return { icon: 'business-center', color: '#6ab7ff' };
  if (normalized.includes('wedding')) return { icon: 'favorite', color: '#ff7fb8' };
  if (normalized.includes('fundraiser')) return { icon: 'volunteer-activism', color: '#7fd29a' };
  return { icon: 'event-note', color: '#f1b56f' };
}

function resolveActorName(input: {
  status: 'bypass' | 'signed_out' | 'signed_in';
  user: { displayName?: string; matchNames?: string[] } | null;
}): string {
  if (input.status === 'bypass') return 'Anna';
  const matchName = input.user?.matchNames?.[0]?.trim();
  if (matchName) return matchName;
  const displayName = input.user?.displayName?.trim() || '';
  if (!displayName) return 'Unknown Staff';
  return displayName.split(' ')[0] || displayName;
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function normalizeStatusValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function typeLabel(entry: EventActivityEntry): string {
  if (
    entry.type === 'status_update' &&
    normalizeStatusValue(entry.statusTo || '').includes('event complete')
  ) {
    return 'Client Payment Completed';
  }
  if (entry.type === 'status_update') return 'Status Update';
  if (entry.type === 'staff_note') return 'Communication Entry';
  return 'Action';
}

export default function EventNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { events, setSelectedEventId, updateEvent } = useEvents();
  const { status: authStatus, user, effectiveAuthType } = useAuthFramework();

  const [activityEntries, setActivityEntries] = useState<EventActivityEntry[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [upcomingAppointmentText, setUpcomingAppointmentText] = useState('Loading...');
  const [lastAppointmentText, setLastAppointmentText] = useState('Loading...');
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [entryError, setEntryError] = useState('');
  const [entryStatus, setEntryStatus] = useState('');
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);

  const event = events.find((item) => item.id === id);
  const eventId = event?.id || '';
  const actorName = useMemo(() => resolveActorName({ status: authStatus, user }), [authStatus, user]);
  const canEditStatus = effectiveAuthType === 'super_admin' || effectiveAuthType === 'admin';

  useEffect(() => {
    if (!eventId) return;
    let isMounted = true;

    async function loadEntries() {
      setIsLoadingActivity(true);
      const entries = await readEventActivityLog(eventId);
      if (!isMounted) return;
      setActivityEntries(entries);
      setIsLoadingActivity(false);
    }

    void loadEntries();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    const targetEvent = event;
    if (!targetEvent) return;
    let isMounted = true;

    async function loadAppointments() {
      setIsLoadingAppointments(true);
      setUpcomingAppointmentText('Loading...');
      setLastAppointmentText('Loading...');

      try {
        const calendarEvents = await loadCalendarEvents(CALENDAR_SYNC_CONFIG, SHEET_SYNC_CONFIG);
        if (!isMounted) return;

        const matchMap = buildCalendarMatchMap([targetEvent!], calendarEvents);
        const match = matchMap[targetEvent!.id];

        if (match?.upcomingEvent) {
          setUpcomingAppointmentText(formatCalendarMatchDate(match.upcomingEvent.start));
        } else {
          setUpcomingAppointmentText('No upcoming appointment found');
        }

        if (match?.lastPastEvent) {
          setLastAppointmentText(formatCalendarMatchDate(match.lastPastEvent.start));
        } else {
          setLastAppointmentText('No previous appointment found');
        }
      } catch {
        if (!isMounted) return;
        setUpcomingAppointmentText('Unable to load appointments');
        setLastAppointmentText('Unable to load appointments');
      } finally {
        if (isMounted) setIsLoadingAppointments(false);
      }
    }

    void loadAppointments();
    return () => {
      isMounted = false;
    };
  }, [event]);

  if (!event) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">Event not found</ThemedText>
      </View>
    );
  }

  const currentEvent = event;
  const typeVisual = getEventTypeVisual(currentEvent.eventType);
  const unifiedStatus = currentEvent.status.trim() || currentEvent.payStatus.trim() || 'Open';

  async function updateUnifiedStatus(value: string) {
    const previousStatus = currentEvent.status.trim() || currentEvent.payStatus.trim() || '';
    const nextStatus = value.trim();
    if (normalizeStatusValue(previousStatus) === normalizeStatusValue(nextStatus)) return;

    setSelectedEventId(currentEvent.id);
    updateEvent(currentEvent.id, { status: nextStatus, payStatus: nextStatus });

    await appendEventActivityLog({
      eventId: currentEvent.id,
      actor: actorName,
      type: 'status_update',
      message: nextStatus || 'Status updated',
      statusFrom: previousStatus || 'Open',
      statusTo: nextStatus || 'Open',
    });
    const nextEntries = await readEventActivityLog(currentEvent.id);
    setActivityEntries(nextEntries);
  }

  async function addCommunicationEntry() {
    const note = newNote.trim();
    if (!note || isSubmittingEntry) {
      if (!note) setEntryError('Enter a communication entry first.');
      return;
    }

    setIsSubmittingEntry(true);
    setEntryError('');
    setEntryStatus('Posting entry...');

    try {
      await appendEventActivityLog({
        eventId: currentEvent.id,
        actor: actorName,
        type: 'staff_note',
        message: note,
      });

      const nextEntries = await readEventActivityLog(currentEvent.id);
      setActivityEntries(nextEntries);
      setNewNote('');
      setEntryStatus('Communication entry posted.');
    } catch {
      setEntryStatus('');
      setEntryError('Unable to post communication entry.');
    } finally {
      setIsSubmittingEntry(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={14} color="#cde0f5" />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          <View style={[styles.eventTypeIconWrap, { borderColor: typeVisual.color }]}>
            <MaterialIcons name={typeVisual.icon} size={15} color={typeVisual.color} />
          </View>
          <ThemedText type="title" style={[styles.heroTitle, { color: typeVisual.color }]}>
            {currentEvent.clientName || 'Untitled Event'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Status</ThemedText>
        <ThemedText style={styles.infoLine}>Current Status: {unifiedStatus}</ThemedText>
        {canEditStatus ? (
          <View style={styles.choiceRow}>
            {EVENT_STATUS_OPTIONS.map((option) => {
              const selected = normalizeStatusValue(unifiedStatus) === normalizeStatusValue(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    void updateUnifiedStatus(option);
                  }}
                  style={[styles.choiceChip, selected ? styles.choiceChipActive : null]}>
                  <ThemedText style={[styles.choiceChipText, selected ? styles.choiceChipTextActive : null]}>
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <ThemedText style={styles.helperText}>Only admin and super admin can change status.</ThemedText>
        )}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Appointments</ThemedText>
        <ThemedText style={styles.infoLine}>
          Upcoming Appointment: {isLoadingAppointments ? 'Loading...' : upcomingAppointmentText}
        </ThemedText>
        <ThemedText style={styles.infoLine}>
          Last Appointment: {isLoadingAppointments ? 'Loading...' : lastAppointmentText}
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Client Notes</ThemedText>
        <View style={styles.readOnlyBlock}>
          <ThemedText style={styles.readOnlyText}>
            {currentEvent.privateNotes.trim() || 'No client notes recorded.'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Log</ThemedText>
        {isLoadingActivity ? <ThemedText style={styles.infoLine}>Loading log...</ThemedText> : null}
        {!isLoadingActivity && activityEntries.length === 0 ? (
          <ThemedText style={styles.infoLine}>No activity entries yet for this event.</ThemedText>
        ) : null}
        {!isLoadingActivity
          ? activityEntries.map((entry) => (
              <View key={entry.id} style={styles.logCard}>
                <View style={styles.logTopRow}>
                  <ThemedText style={styles.logType}>{typeLabel(entry)}</ThemedText>
                  <ThemedText style={styles.logTime}>{formatTimestamp(entry.timestamp)}</ThemedText>
                </View>
                <ThemedText style={styles.logActor}>{entry.actor}</ThemedText>
                {entry.type === 'status_update' && entry.statusFrom && entry.statusTo ? (
                  <ThemedText style={styles.logMessage}>
                    {entry.statusFrom}
                    {' -> '}
                    {entry.statusTo}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.logMessage}>{entry.message}</ThemedText>
                )}
              </View>
            ))
          : null}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Communication Entry</ThemedText>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={newNote}
          onChangeText={(text) => {
            setNewNote(text);
            if (entryError) setEntryError('');
          }}
          multiline
          placeholder="Add communication update for this client..."
          placeholderTextColor="#6f849a"
        />
      </View>

      <View style={styles.section}>
        <Pressable
          style={[styles.primaryButton, isSubmittingEntry ? styles.buttonDisabled : null]}
          onPress={() => {
            void addCommunicationEntry();
          }}
          disabled={isSubmittingEntry}>
          <ThemedText style={styles.primaryButtonText}>
            {isSubmittingEntry ? 'Posting...' : 'Post Communication Entry'}
          </ThemedText>
        </Pressable>
        {entryStatus ? <ThemedText style={styles.helperText}>{entryStatus}</ThemedText> : null}
        {entryError ? <ThemedText style={styles.errorText}>{entryError}</ThemedText> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0b1117',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1117',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a3f56',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#101922',
  },
  backButtonText: {
    color: '#cde0f5',
    fontWeight: '700',
    fontSize: 12,
  },
  hero: {
    backgroundColor: '#111a24',
    borderColor: '#223244',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventTypeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#0f1620',
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#e8f1fb',
    fontWeight: '700',
    fontSize: 17,
  },
  infoLine: {
    color: '#c7d6e7',
    lineHeight: 19,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#2d4259',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: '#0f1620',
  },
  choiceChipActive: {
    backgroundColor: '#2b74d9',
    borderColor: '#2b74d9',
  },
  choiceChipText: {
    fontWeight: '600',
    color: '#9fb3c8',
    fontSize: 12,
  },
  choiceChipTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2b3f55',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    color: '#e5eef8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  readOnlyBlock: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    padding: 10,
  },
  readOnlyText: {
    color: '#d9e6f5',
    lineHeight: 19,
  },
  logCard: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    padding: 10,
    gap: 3,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logType: {
    color: '#f1f6fd',
    fontWeight: '700',
  },
  logTime: {
    color: '#98aec6',
    fontSize: 12,
  },
  logActor: {
    color: '#b4cae2',
    fontSize: 12,
    fontWeight: '700',
  },
  logMessage: {
    color: '#d9e6f5',
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#2b74d9',
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  helperText: {
    color: '#9ab0c7',
    fontSize: 12,
  },
  errorText: {
    color: '#ff9aa7',
    lineHeight: 18,
  },
});
