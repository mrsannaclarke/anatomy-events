import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { CALENDAR_SYNC_CONFIG } from '@/constants/calendar-sync';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import {
  buildCalendarMatchMap,
  formatCalendarMatchDate,
  formatFallbackAppointmentPoint,
  loadCalendarEvents,
  lookupFallbackAppointments,
} from '@/lib/calendar-sync';
import {
  appendEventActivityLog,
  removeEventActivityEntry,
  removeEventActivityEntriesByActor,
  readEventActivityLog,
  type EventActivityEntry,
} from '@/lib/event-activity-log';
import { postDiscordWebhookMessage } from '@/lib/discord-sync';
import { readManualUpcomingAppointment, setManualUpcomingAppointment } from '@/lib/manual-appointments';

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
  'Temporary license recieved',
  'Awaiting Follow Up',
  'Needing Changes',
  'Balance Invoice Sent',
  'Cancelled',
  'Event Complete',
  'Event Complete Balance Late',
];

const DISCORD_EVENT_CHANNEL_MAP: Record<
  string,
  {
    webhookUrl: string;
    channelUrl: string;
    channelLabel: string;
  }
> = {
  '3545': {
    webhookUrl:
      'https://discord.com/api/webhooks/1495421300972327165/0cjK9p1RSQFu3q1ih9kD3VeV5HW3SF4WG6pcy0N_PXftnRb2zaQ-8zXybig_F4XJIjaY',
    channelUrl: 'https://discord.com/channels/690967847303643146/1481742663253360670',
    channelLabel: '💍shandra-knapstad-sept-8',
  },
  '3463': {
    webhookUrl:
      'https://discord.com/api/webhooks/1495422445580976290/0FE__S43X5ZLlHEft64G054a92JxI-ou8gSlPzcI5aoyIR5BemvpCNVw1Ff2jSGEJajU',
    channelUrl: 'https://discord.com/channels/690967847303643146/1474491753557000333',
    channelLabel: '💍rachel-milstein-wedding-sept-12',
  },
};

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

function parseManualAppointmentInput(value: string): number | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function formatManualAppointmentInput(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const [deletingEntryId, setDeletingEntryId] = useState('');
  const [manualUpcomingInput, setManualUpcomingInput] = useState('');
  const [manualUpcomingSavedTs, setManualUpcomingSavedTs] = useState<number | null>(null);
  const [manualApptStatus, setManualApptStatus] = useState('');
  const [manualApptError, setManualApptError] = useState('');
  const [isSavingManualAppt, setIsSavingManualAppt] = useState(false);

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
      if (entries.some((entry) => entry.actor === 'Discord')) {
        await removeEventActivityEntriesByActor(eventId, 'Discord');
      }
      const refreshedEntries = await readEventActivityLog(eventId);
      if (!isMounted) return;
      setActivityEntries(refreshedEntries.filter((entry) => entry.actor !== 'Discord'));
      setIsLoadingActivity(false);
    }

    void loadEntries();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let isMounted = true;

    async function loadManualUpcoming() {
      const manualTs = await readManualUpcomingAppointment(eventId);
      if (!isMounted) return;
      setManualUpcomingSavedTs(manualTs);
      setManualUpcomingInput(manualTs != null ? formatManualAppointmentInput(manualTs) : '');
      setManualApptError('');
      setManualApptStatus('');
    }

    void loadManualUpcoming();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    const targetEvent = event;
    if (!targetEvent) return;
    const currentEvent = targetEvent;
    let isMounted = true;

    async function loadAppointments() {
      setIsLoadingAppointments(true);
      setUpcomingAppointmentText('Loading...');
      setLastAppointmentText('Loading...');

      const fallback = lookupFallbackAppointments(events, currentEvent);

      try {
        let calendarEvents: Awaited<ReturnType<typeof loadCalendarEvents>> = [];
        const attemptLimit = 3;
        let loaded = false;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
          try {
            calendarEvents = await loadCalendarEvents(CALENDAR_SYNC_CONFIG, SHEET_SYNC_CONFIG);
            loaded = true;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < attemptLimit - 1) {
              await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
            }
          }
        }
        if (!loaded && lastError) throw lastError;

        if (!isMounted) return;

        const matchMap = buildCalendarMatchMap([currentEvent], calendarEvents);
        const match = matchMap[currentEvent.id];

        if (match?.upcomingEvent) {
          setUpcomingAppointmentText(formatCalendarMatchDate(match.upcomingEvent.start));
        } else if (manualUpcomingSavedTs != null) {
          setUpcomingAppointmentText(formatCalendarMatchDate(new Date(manualUpcomingSavedTs)));
        } else {
          setUpcomingAppointmentText(
            fallback.upcoming ? formatFallbackAppointmentPoint(fallback.upcoming) : 'No upcoming appointment found',
          );
        }

        if (match?.lastPastEvent) {
          setLastAppointmentText(formatCalendarMatchDate(match.lastPastEvent.start));
        } else {
          setLastAppointmentText(
            fallback.last ? formatFallbackAppointmentPoint(fallback.last) : 'No previous appointment found',
          );
        }
      } catch {
        if (!isMounted) return;
        if (manualUpcomingSavedTs != null) {
          setUpcomingAppointmentText(formatCalendarMatchDate(new Date(manualUpcomingSavedTs)));
        } else {
          setUpcomingAppointmentText(
            fallback.upcoming ? formatFallbackAppointmentPoint(fallback.upcoming) : 'No upcoming appointment found',
          );
        }
        setLastAppointmentText(
          fallback.last ? formatFallbackAppointmentPoint(fallback.last) : 'No previous appointment found',
        );
      } finally {
        if (isMounted) setIsLoadingAppointments(false);
      }
    }

    void loadAppointments();
    return () => {
      isMounted = false;
    };
  }, [event, events, manualUpcomingSavedTs]);

  if (!event) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">Event not found</ThemedText>
      </View>
    );
  }

  if (isLoadingAppointments) {
    return <AppLoadingScreen />;
  }

  const currentEvent = event;
  const typeVisual = getEventTypeVisual(currentEvent.eventType);
  const unifiedStatus = currentEvent.status.trim() || currentEvent.payStatus.trim() || 'Open';
  const discordTarget =
    DISCORD_EVENT_CHANNEL_MAP[(currentEvent.entryId || '').trim()] ||
    DISCORD_EVENT_CHANNEL_MAP[(currentEvent.id || '').trim()] ||
    null;

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
      let discordSyncInfo:
        | {
            channelUrl: string;
            channelLabel: string;
          }
        | null = null;
      let discordStatusSuffix = '';

      if (discordTarget) {
        const discordMessage = `${actorName}: ${note}`;
        try {
          await postDiscordWebhookMessage({
            webhookUrl: discordTarget.webhookUrl,
            content: discordMessage,
            username: 'Anatomy Event Log',
          });
          discordSyncInfo = {
            channelUrl: discordTarget.channelUrl,
            channelLabel: discordTarget.channelLabel,
          };
          discordStatusSuffix = ' Discord synced.';
        } catch {
          discordStatusSuffix = ' Discord sync failed.';
        }
      }

      await appendEventActivityLog({
        eventId: currentEvent.id,
        actor: actorName,
        type: 'staff_note',
        message: note,
        discordChannelUrl: discordSyncInfo?.channelUrl,
        discordChannelLabel: discordSyncInfo?.channelLabel,
      });

      const nextEntries = await readEventActivityLog(currentEvent.id);
      setActivityEntries(nextEntries.filter((entry) => entry.actor !== 'Discord'));
      setNewNote('');
      setEntryStatus(`Communication entry posted.${discordStatusSuffix}`);
    } catch {
      setEntryStatus('');
      setEntryError('Unable to post communication entry.');
    } finally {
      setIsSubmittingEntry(false);
    }
  }

  async function deleteLogEntry(entryId: string) {
    if (!entryId) return;
    setDeletingEntryId(entryId);
    setEntryError('');
    setEntryStatus('');
    try {
      const removed = await removeEventActivityEntry(currentEvent.id, entryId);
      if (!removed) {
        setEntryError('Unable to delete log entry.');
        return;
      }
      const nextEntries = await readEventActivityLog(currentEvent.id);
      setActivityEntries(nextEntries.filter((entry) => entry.actor !== 'Discord'));
      setEntryStatus('Log entry deleted.');
    } catch {
      setEntryError('Unable to delete log entry.');
    } finally {
      setDeletingEntryId('');
    }
  }

  function confirmDeleteLogEntry(entryId: string) {
    if (!entryId || deletingEntryId) return;

    if (Platform.OS === 'web') {
      const browserApi = globalThis as unknown as { confirm?: (message?: string) => boolean };
      const confirmed = browserApi.confirm ? browserApi.confirm('Delete this log entry?') : true;
      if (confirmed) {
        void deleteLogEntry(entryId);
      }
      return;
    }

    Alert.alert(
      'Delete Log Entry?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteLogEntry(entryId);
          },
        },
      ],
      { cancelable: true },
    );
  }

  async function saveManualUpcomingEntry() {
    if (isSavingManualAppt) return;
    const parsedTs = parseManualAppointmentInput(manualUpcomingInput);
    if (parsedTs == null) {
      setManualApptError('Enter a valid date/time (example: 9/12/2026 2:00 PM).');
      setManualApptStatus('');
      return;
    }

    setIsSavingManualAppt(true);
    setManualApptError('');
    setManualApptStatus('Saving manual upcoming appointment...');
    try {
      await setManualUpcomingAppointment(currentEvent.id, parsedTs);
      setManualUpcomingSavedTs(parsedTs);
      setManualUpcomingInput(formatManualAppointmentInput(parsedTs));
      setManualApptStatus('Manual upcoming appointment saved.');
    } catch {
      setManualApptStatus('');
      setManualApptError('Unable to save manual upcoming appointment.');
    } finally {
      setIsSavingManualAppt(false);
    }
  }

  async function clearManualUpcomingEntry() {
    if (isSavingManualAppt) return;
    setIsSavingManualAppt(true);
    setManualApptError('');
    setManualApptStatus('Removing manual upcoming appointment...');
    try {
      await setManualUpcomingAppointment(currentEvent.id, null);
      setManualUpcomingSavedTs(null);
      setManualUpcomingInput('');
      setManualApptStatus('Manual upcoming appointment removed.');
    } catch {
      setManualApptStatus('');
      setManualApptError('Unable to remove manual upcoming appointment.');
    } finally {
      setIsSavingManualAppt(false);
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
        <TextInput
          style={styles.input}
          value={manualUpcomingInput}
          onChangeText={(text) => {
            setManualUpcomingInput(text);
            if (manualApptError) setManualApptError('');
            if (manualApptStatus) setManualApptStatus('');
          }}
          placeholder="Manual upcoming appt (example: 9/12/2026 2:00 PM)"
          placeholderTextColor="#6f849a"
        />
        <View style={styles.manualApptButtonRow}>
          <Pressable
            style={[styles.inlineButton, isSavingManualAppt ? styles.buttonDisabled : null]}
            onPress={() => {
              void saveManualUpcomingEntry();
            }}
            disabled={isSavingManualAppt}>
            <MaterialIcons name="save" size={13} color="#dceafe" />
            <ThemedText style={styles.inlineButtonText}>
              {isSavingManualAppt ? 'Saving...' : 'Save Manual Upcoming'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.inlineButton,
              styles.inlineDangerButton,
              isSavingManualAppt || manualUpcomingSavedTs == null ? styles.buttonDisabled : null,
            ]}
            onPress={() => {
              void clearManualUpcomingEntry();
            }}
            disabled={isSavingManualAppt || manualUpcomingSavedTs == null}>
            <MaterialIcons name="delete-outline" size={13} color="#ffb8c0" />
            <ThemedText style={styles.inlineDangerButtonText}>Delete Manual Entry</ThemedText>
          </Pressable>
        </View>
        {manualApptStatus ? <ThemedText style={styles.helperText}>{manualApptStatus}</ThemedText> : null}
        {manualApptError ? <ThemedText style={styles.errorText}>{manualApptError}</ThemedText> : null}
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
        <ThemedText style={styles.sectionTitle}>Communication Entry</ThemedText>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={newNote}
          onChangeText={(text) => {
            setNewNote(text);
            if (entryError) setEntryError('');
          }}
          multiline
          placeholder="Add a post to notify team"
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
            {isSubmittingEntry ? 'Posting...' : 'Post'}
          </ThemedText>
        </Pressable>
        {entryStatus ? <ThemedText style={styles.helperText}>{entryStatus}</ThemedText> : null}
        {entryError ? <ThemedText style={styles.errorText}>{entryError}</ThemedText> : null}
      </View>

      <View style={[styles.section, styles.logSection]}>
        <ThemedText style={styles.sectionTitle}>Feed</ThemedText>
        {isLoadingActivity ? <ThemedText style={styles.infoLine}>Loading feed...</ThemedText> : null}
        {!isLoadingActivity && activityEntries.length === 0 ? (
          <ThemedText style={styles.infoLine}>No communication entries yet.</ThemedText>
        ) : null}
        {!isLoadingActivity
          ? activityEntries.map((entry) => (
              <View key={entry.id} style={styles.feedRow}>
                <View style={styles.feedHeaderRow}>
                  <ThemedText style={styles.feedMeta}>
                    Communication Entry • {formatTimestamp(entry.timestamp)} • {entry.actor}
                  </ThemedText>
                  {canEditStatus ? (
                    <Pressable
                      style={[
                        styles.logDeleteButton,
                        deletingEntryId === entry.id ? styles.buttonDisabled : null,
                      ]}
                      onPress={() => {
                        confirmDeleteLogEntry(entry.id);
                      }}
                      disabled={Boolean(deletingEntryId)}>
                      <MaterialIcons name="delete-outline" size={12} color="#ffb8c0" />
                      <ThemedText style={styles.logDeleteText}>
                        {deletingEntryId === entry.id ? 'Deleting...' : 'Delete'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                {entry.type === 'status_update' && entry.statusFrom && entry.statusTo ? (
                  <ThemedText style={styles.feedMessage}>
                    Status Update: {entry.statusFrom}
                    {' -> '}
                    {entry.statusTo}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.feedMessage}>{entry.message}</ThemedText>
                )}
                {entry.discordChannelUrl ? (
                  <Pressable
                    style={styles.logLinkButton}
                    onPress={() => {
                      void Linking.openURL(entry.discordChannelUrl || '');
                    }}>
                    <MaterialIcons name="open-in-new" size={12} color="#bfe1ff" />
                    <ThemedText style={styles.logLinkText}>
                      Posted to {entry.discordChannelLabel || 'Discord Channel'}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ))
          : null}
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
  manualApptButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#172230',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineButtonText: {
    color: '#dceafe',
    fontWeight: '700',
    fontSize: 12,
  },
  inlineDangerButton: {
    borderColor: '#6a2d3a',
    backgroundColor: '#2a1620',
  },
  inlineDangerButtonText: {
    color: '#ffb8c0',
    fontWeight: '700',
    fontSize: 12,
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
  logSection: {
    marginTop: 8,
  },
  feedRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#223244',
    paddingVertical: 8,
    gap: 4,
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedMeta: {
    color: '#98aec6',
    fontSize: 11,
    flex: 1,
  },
  feedMessage: {
    color: '#d9e6f5',
    lineHeight: 18,
    fontSize: 13,
  },
  logDeleteButton: {
    borderWidth: 1,
    borderColor: '#6a2d3a',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2a1620',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  logDeleteText: {
    color: '#ffb8c0',
    fontWeight: '700',
    fontSize: 11,
  },
  logLinkButton: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#3f78b4',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#18395a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  logLinkText: {
    color: '#bfe1ff',
    fontWeight: '700',
    fontSize: 11,
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
