import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  getContrastTextForHex,
  getStaffColor,
  hexToRgba,
} from '@/constants/staff-colors';
import {
  getCounterStaffChargeFromSchedule,
  parsePricingPlanYear,
} from '@/constants/pricing-schedule';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { fireAndForgetAuditLog } from '@/lib/audit-log';
import { parseMoney } from '@/lib/event-math';
import {
  pullActiveArtistsFromSheet,
  pullEventByEntryId,
  upsertEventToSheet,
} from '@/lib/sheets-sync';
import type { EventRecord } from '@/types/events';

type FieldConfig = {
  key: keyof EventRecord;
  label: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
};

type SectionConfig = {
  title: string;
  fields: FieldConfig[];
};

const EDITABLE_SECTIONS: SectionConfig[] = [
  {
    title: 'Staff Assignements',
    fields: [
      { key: 'numberOfArtists', label: 'Number of Artists', keyboardType: 'number-pad' },
      { key: 'artistNames', label: 'Artist Names', placeholder: 'Tomma, Shy' },
      { key: 'counterNames', label: 'Counter Name(s)' },
    ],
  },
];

const ARTIST_COUNT_MIN = 1;
const ARTIST_COUNT_MAX = 4;
const ARTIST_COUNT_OPTIONS = ['1', '2', '3', '4'];
const COUNTER_STAFF_MAX = 2;
const COUNTER_NONE_OPTION = 'None';
const COUNTER_OTHER_OPTION = 'Other';
const COUNTER_STAFF_OPTIONS = [
  'Tomma',
  'Shy',
  'Megan',
  'Sisi',
  'Drew',
  'Agnes',
  'Lindsay',
  'Jayden',
  'Summer',
  'Anna',
  'Jake',
  'Lucky',
  'Anne',
  'Jazz',
  'Jacob',
  'Jason',
  'Kevin',
  'Veda',
];

const ARTIST_ALIAS_TO_CANONICAL: Record<string, string> = {
  tomma: 'Tomma',
  'tomma mueller': 'Tomma',
  lucky: 'Lucky',
  jessie: 'Lucky',
  jesse: 'Lucky',
  'jessie smith': 'Lucky',
  'jesse smith': 'Lucky',
  'jesse malony': 'Lucky',
  jake: 'Jake',
  'jacob tong': 'Jake',
  anna: 'Anna',
  'anna clarke': 'Anna',
  shy: 'Shy',
  'lady shy': 'Shy',
  'tylr cheyenne barnes': 'Shy',
  agnes: 'Agnes',
  agnus: 'Agnes',
  aggie: 'Agnes',
  'aggie q': 'Agnes',
  angie: 'Agnes',
  'agnes lauer': 'Agnes',
  drew: 'Drew',
  'drew linden': 'Drew',
  megan: 'Megan',
  meg: 'Megan',
  'megan echevarria': 'Megan',
  sisi: 'Sisi',
  sissy: 'Sisi',
  sis: 'Sisi',
  sisilia: 'Sisi',
  'sisilia husing': 'Sisi',
  lindsay: 'Lindsay',
  lindsey: 'Lindsay',
  linds: 'Lindsay',
  honeyandsass: 'Lindsay',
  'lindsay swing': 'Lindsay',
  summer: 'Summer',
  sumer: 'Summer',
  'summer ketchum': 'Summer',
  anne: 'Anne',
  'anne morando': 'Anne',
  jayden: 'Jayden',
  jaydan: 'Jayden',
  jay: 'Jayden',
  'baby j': 'Jayden',
  j: 'Jayden',
  'jayden mueller': 'Jayden',
  jazz: 'Jazz',
  jazzy: 'Jazz',
  'jazz stahr': 'Jazz',
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

function parseArtistLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(ARTIST_COUNT_MIN, Math.min(ARTIST_COUNT_MAX, parsed));
}

function parseArtistSelection(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeAliasKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNormalizedArtistSelection(value: string): string[] {
  const normalized = parseArtistSelection(value).map((name) => {
    const key = normalizeAliasKey(name);
    return ARTIST_ALIAS_TO_CANONICAL[key] || name;
  });

  const deduped: string[] = [];
  const seen = new Set<string>();
  normalized.forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(name);
  });

  return deduped;
}

function serializeArtistSelection(names: string[]): string {
  return names.join(', ');
}

function mergeUniqueNames(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  [...existing, ...incoming].forEach((rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(name);
  });

  return merged;
}

export default function EventDetailScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const router = useRouter();
  const { events, updateEvent, setSelectedEventId, upsertEventFromRemote } = useEvents();
  const scrollRef = useRef<ScrollView>(null);

  const event = events.find((item) => item.id === id);
  const [sheetSyncStatus, setSheetSyncStatus] = useState('');
  const [sheetSyncError, setSheetSyncError] = useState('');
  const [availableArtistNames, setAvailableArtistNames] = useState<string[]>([]);
  const [artistLoadError, setArtistLoadError] = useState('');
  const [artistSelectionNote, setArtistSelectionNote] = useState('');
  const [counterSelectionNote, setCounterSelectionNote] = useState('');
  const [counterCustomInput, setCounterCustomInput] = useState('');
  const [counterCustomOptions, setCounterCustomOptions] = useState<string[]>([]);
  const [counterOtherEnabled, setCounterOtherEnabled] = useState(false);
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [isUndoingFromSheet, setIsUndoingFromSheet] = useState(false);
  const depositRefreshAttemptedRef = useRef<Set<string>>(new Set());
  const artistLimit = parseArtistLimit(event?.numberOfArtists || '');
  const selectedArtistNames = parseNormalizedArtistSelection(event?.artistNames || '');
  const selectedCounterNames = parseArtistSelection(event?.counterNames || '');
  const selectedCounterNonNoneNames = selectedCounterNames.filter(
    (name) => name.trim().toLowerCase() !== COUNTER_NONE_OPTION.toLowerCase(),
  );
  const isCounterNoneSelected = selectedCounterNames.some(
    (name) => name.trim().toLowerCase() === COUNTER_NONE_OPTION.toLowerCase(),
  );
  const selectedCounterCustomNames = selectedCounterNonNoneNames.filter(
    (name) => !COUNTER_STAFF_OPTIONS.some((option) => option.toLowerCase() === name.toLowerCase()),
  );
  const visibleCounterCustomOptions = mergeUniqueNames(counterCustomOptions, selectedCounterCustomNames);
  const eventId = event?.id || '';
  const planName = event?.year || '';
  const artistCountRaw = event?.numberOfArtists || '';
  const counterStaffChargeRaw = event?.counterStaffCharge || '';

  function updateField<K extends keyof EventRecord>(key: K, value: EventRecord[K]) {
    if (!event) return;
    setSelectedEventId(event.id);
    updateEvent(event.id, { [key]: value } as Partial<EventRecord>);
  }

  function toggleArtistSelection(name: string) {
    if (!event) return;
    setArtistSelectionNote('');
    const selected = parseNormalizedArtistSelection(event.artistNames);
    const alreadySelected = selected.includes(name);

    if (alreadySelected) {
      const next = selected.filter((item) => item !== name);
      updateField('artistNames', serializeArtistSelection(next));
      return;
    }

    if (artistLimit <= 0) {
      setArtistSelectionNote('Set Number of Artists first.');
      return;
    }

    if (selected.length >= artistLimit) {
      setArtistSelectionNote(`You can select up to ${artistLimit} artist${artistLimit === 1 ? '' : 's'}.`);
      return;
    }

    const next = [...selected, name];
    updateField('artistNames', serializeArtistSelection(next));
  }

  function toggleCounterSelection(name: string) {
    if (!event) return;
    setCounterSelectionNote('');
    const selected = parseArtistSelection(event.counterNames).filter(
      (item) => item.trim().toLowerCase() !== COUNTER_NONE_OPTION.toLowerCase(),
    );
    const targetKey = name.trim().toLowerCase();
    const alreadySelected = selected.some((item) => item.toLowerCase() === targetKey);

    if (alreadySelected) {
      const next = selected.filter((item) => item.toLowerCase() !== targetKey);
      updateField('counterNames', serializeArtistSelection(next));
      return;
    }

    if (selected.length >= COUNTER_STAFF_MAX) {
      setCounterSelectionNote(`You can select up to ${COUNTER_STAFF_MAX} counter staff.`);
      return;
    }

    const next = [...selected, name];
    updateField('counterNames', serializeArtistSelection(next));
  }

  function toggleCounterNoneSelection() {
    if (!event) return;
    setCounterSelectionNote('');
    if (isCounterNoneSelected) {
      updateField('counterNames', '');
      return;
    }
    updateField('counterNames', COUNTER_NONE_OPTION);
  }

  function toggleCounterOtherOption() {
    setCounterOtherEnabled((previous) => !previous);
    if (counterSelectionNote) setCounterSelectionNote('');
  }

  function addCustomCounterOption() {
    if (!event) return;
    const nextName = counterCustomInput.trim().replace(/\s+/g, ' ');
    if (!nextName) {
      setCounterSelectionNote('Enter a counter name before adding.');
      return;
    }

    const normalizedKey = nextName.toLowerCase();
    if (
      normalizedKey === COUNTER_NONE_OPTION.toLowerCase() ||
      normalizedKey === COUNTER_OTHER_OPTION.toLowerCase()
    ) {
      setCounterSelectionNote('Choose a different name.');
      return;
    }

    const fixedMatch = COUNTER_STAFF_OPTIONS.find((option) => option.toLowerCase() === normalizedKey);
    const label = fixedMatch || nextName;
    if (!fixedMatch) {
      setCounterCustomOptions((previous) => mergeUniqueNames(previous, [label]));
    }
    setCounterCustomInput('');
    setCounterOtherEnabled(true);
    toggleCounterSelection(label);
  }

  async function pushCurrentEventToSheet() {
    if (!event || isSavingToSheet || isUndoingFromSheet) return;
    try {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setIsSavingToSheet(true);
      setSheetSyncError('');
      setSheetSyncStatus('Saving this event to sheet...');
      const latestEvent = events.find((item) => item.id === event.id) || event;
      const saved = await upsertEventToSheet(SHEET_SYNC_CONFIG, latestEvent);
      let latest = saved;
      const savedEntryId = saved.entryId.trim();
      if (savedEntryId) {
        try {
          const pulled = await pullEventByEntryId(SHEET_SYNC_CONFIG, savedEntryId);
          if (pulled) latest = pulled;
        } catch {
          // Keep optimistic save result if follow-up pull fails.
        }
      }
      upsertEventFromRemote(latest);
      setSheetSyncStatus(`Saved to sheet row ${latest.sourceRow || saved.sourceRow || '?'}.`);
      fireAndForgetAuditLog({
        eventType: 'sheet_save',
        status: 'success',
        message: `Saved event to sheet row ${latest.sourceRow || saved.sourceRow || '?'}.`,
        details: {
          id: latest.id,
          entryId: latest.entryId,
          sourceRow: latest.sourceRow || saved.sourceRow || '',
        },
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      setSheetSyncStatus('');
      setSheetSyncError(error instanceof Error ? error.message : 'Failed to save event to sheet.');
      fireAndForgetAuditLog({
        eventType: 'sheet_save',
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save event to sheet.',
        details: {
          id: event.id,
          entryId: event.entryId,
        },
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setIsSavingToSheet(false);
    }
  }

  async function undoChangesFromSheet() {
    if (!event || isSavingToSheet || isUndoingFromSheet) return;
    const entryId = event.entryId.trim();
    if (!entryId) {
      setSheetSyncError('Cannot undo yet: this event has not been saved to sheet.');
      setSheetSyncStatus('');
      return;
    }

    try {
      setIsUndoingFromSheet(true);
      setSheetSyncError('');
      setSheetSyncStatus('Undoing unsaved changes...');
      const pulled = await pullEventByEntryId(SHEET_SYNC_CONFIG, entryId);
      if (!pulled) {
        throw new Error(`No event found in sheet for entry ID ${entryId}.`);
      }
      upsertEventFromRemote(pulled);
      setSelectedEventId(pulled.id);
      setSheetSyncStatus('Unsaved changes were reverted from the sheet.');
      fireAndForgetAuditLog({
        eventType: 'sheet_pull',
        status: 'success',
        message: `Reverted event to sheet values for entry ${entryId}.`,
        details: {
          id: pulled.id,
          entryId: pulled.entryId,
          sourceRow: pulled.sourceRow || '',
          action: 'undo_changes',
        },
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      setSheetSyncStatus('');
      setSheetSyncError(error instanceof Error ? error.message : 'Failed to undo changes from sheet.');
      fireAndForgetAuditLog({
        eventType: 'sheet_pull',
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to undo changes from sheet.',
        details: {
          id: event.id,
          entryId,
          action: 'undo_changes',
        },
      });
    } finally {
      setIsUndoingFromSheet(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadArtists() {
      try {
        setArtistLoadError('');
        const names = await pullActiveArtistsFromSheet(SHEET_SYNC_CONFIG);
        if (!isMounted) return;
        setAvailableArtistNames(names);
      } catch (error) {
        if (!isMounted) return;
        setAvailableArtistNames([]);
        setArtistLoadError(error instanceof Error ? error.message : 'Unable to load available artists.');
      }
    }

    void loadArtists();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;

    const artistCount = parseArtistLimit(artistCountRaw);
    const planYear = parsePricingPlanYear(planName);
    if (!planYear || artistCount <= 0) {
      if (counterStaffChargeRaw.trim()) {
        setSelectedEventId(eventId);
        updateEvent(eventId, { counterStaffCharge: '' });
      }
      return;
    }

    const nextCharge = getCounterStaffChargeFromSchedule(planYear, artistCount);
    if (!nextCharge) return;

    const nextChargeRaw = nextCharge.toFixed(2);
    const current = parseMoney(counterStaffChargeRaw);
    const next = parseMoney(nextChargeRaw);
    if (Math.abs(current - next) > 0.0001) {
      setSelectedEventId(eventId);
      updateEvent(eventId, { counterStaffCharge: nextChargeRaw });
    }
  }, [artistCountRaw, counterStaffChargeRaw, eventId, planName, setSelectedEventId, updateEvent]);

  useEffect(() => {
    if (!event) return;
    const entryId = event.entryId.trim();
    if (!entryId) return;

    const status = (event.status.trim() || event.payStatus.trim()).toLowerCase();
    const depositRaw = event.depositRequired.trim();
    const looksInvalid = depositRaw.includes('#VALUE');
    const looksMissing = depositRaw.length === 0 || depositRaw === '-' || (status === 'deposit paid' && parseMoney(depositRaw) <= 0);
    if (!looksInvalid && !looksMissing) return;

    const key = `${event.id}:${entryId}`;
    if (depositRefreshAttemptedRef.current.has(key)) return;
    depositRefreshAttemptedRef.current.add(key);

    let isMounted = true;
    async function refreshFromSheet() {
      try {
        const pulled = await pullEventByEntryId(SHEET_SYNC_CONFIG, entryId);
        if (!isMounted || !pulled) return;
        upsertEventFromRemote(pulled);
      } catch {
        // Leave current data in place if retry pull fails.
      }
    }
    void refreshFromSheet();
    return () => {
      isMounted = false;
    };
  }, [event, upsertEventFromRemote]);

  useEffect(() => {
    if (!event) return;
    const normalized = serializeArtistSelection(parseNormalizedArtistSelection(event.artistNames));
    if (normalized === event.artistNames) return;
    setSelectedEventId(event.id);
    updateEvent(event.id, { artistNames: normalized });
  }, [event, setSelectedEventId, updateEvent]);

  useEffect(() => {
    if (!event) return;
    if (artistLimit <= 0) return;
    if (selectedArtistNames.length <= artistLimit) return;
    setSelectedEventId(event.id);
    updateEvent(event.id, {
      artistNames: serializeArtistSelection(selectedArtistNames.slice(0, artistLimit)),
    });
    setArtistSelectionNote(`Trimmed to ${artistLimit} selected artist${artistLimit === 1 ? '' : 's'}.`);
  }, [artistLimit, event, selectedArtistNames, setSelectedEventId, updateEvent]);

  useEffect(() => {
    if (!event) return;
    if (isCounterNoneSelected && selectedCounterNonNoneNames.length > 0) {
      setSelectedEventId(event.id);
      updateEvent(event.id, { counterNames: COUNTER_NONE_OPTION });
      setCounterSelectionNote('Counter set to None.');
      return;
    }

    if (selectedCounterNonNoneNames.length <= COUNTER_STAFF_MAX) return;
    setSelectedEventId(event.id);
    updateEvent(event.id, {
      counterNames: serializeArtistSelection(selectedCounterNonNoneNames.slice(0, COUNTER_STAFF_MAX)),
    });
    setCounterSelectionNote(`Trimmed to ${COUNTER_STAFF_MAX} selected counter staff.`);
  }, [
    event,
    isCounterNoneSelected,
    selectedCounterNonNoneNames,
    setSelectedEventId,
    updateEvent,
  ]);

  useEffect(() => {
    setCounterCustomInput('');
    setCounterOtherEnabled(false);
  }, [event?.id]);

  useEffect(() => {
    if (selectedCounterCustomNames.length > 0) setCounterOtherEnabled(true);
  }, [selectedCounterCustomNames.length]);

  if (!event) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">Event not found</ThemedText>
      </View>
    );
  }

  const currentEvent = event;
  const typeVisual = getEventTypeVisual(currentEvent.eventType);
  const requestedReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  function handleBackPress() {
    if (requestedReturnTo === '/shop-profit') {
      router.replace('/shop-profit');
      return;
    }
    router.back();
  }

  return (
    <ScrollView ref={scrollRef} style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topMenuRow}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <MaterialIcons name="arrow-back" size={14} color="#cde0f5" />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <ThemedText style={styles.heroKicker}>Staff Assignements</ThemedText>
        <View style={styles.heroTitleRow}>
          <View style={[styles.eventTypeIconWrap, { borderColor: typeVisual.color }]}>
            <MaterialIcons name={typeVisual.icon} size={15} color={typeVisual.color} />
          </View>
          <ThemedText type="title" style={[styles.heroTitle, { color: typeVisual.color }]}>
            {currentEvent.clientName || 'Untitled Event'}
          </ThemedText>
        </View>
      </View>

      {EDITABLE_SECTIONS.map((section) => (
        <View key={section.title} style={styles.sectionGroup}>
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>

          {section.fields.map((field) => {
            const value = currentEvent[field.key] ?? '';

            if (field.key === 'artistNames') {
              const selectedCount = selectedArtistNames.length;
              const limitLabel = artistLimit > 0 ? String(artistLimit) : 'set Number of Artists';

              return (
                <View key={String(field.key)} style={styles.fieldBlock}>
                  <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                  <ThemedText style={styles.artistPickerMeta}>
                    Selected {selectedCount} / {limitLabel}
                  </ThemedText>

                  <View style={styles.artistGrid}>
                    {availableArtistNames.map((artistName) => {
                      const selected = selectedArtistNames.includes(artistName);
                      const disabled = !selected && (artistLimit <= 0 || selectedCount >= artistLimit);
                      const staffColor = getStaffColor(artistName);
                      const selectedTextColor = getContrastTextForHex(staffColor);

                      return (
                        <Pressable
                          key={artistName}
                          onPress={() => toggleArtistSelection(artistName)}
                          style={[
                            styles.choiceChip,
                            {
                              borderColor: selected ? staffColor : hexToRgba(staffColor, 0.55),
                              backgroundColor: selected ? staffColor : hexToRgba(staffColor, 0.14),
                            },
                            disabled ? styles.artistChipDisabled : null,
                          ]}>
                          <ThemedText
                            style={[
                              styles.choiceChipText,
                              { color: selected ? selectedTextColor : staffColor },
                              disabled ? styles.artistChipTextDisabled : null,
                            ]}>
                            {artistName}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  {artistSelectionNote ? <ThemedText style={styles.helperText}>{artistSelectionNote}</ThemedText> : null}
                  {artistLoadError ? <ThemedText style={styles.errorText}>{artistLoadError}</ThemedText> : null}
                </View>
              );
            }

            if (field.key === 'numberOfArtists') {
              return (
                <View key={String(field.key)} style={styles.fieldBlock}>
                  <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                  <View style={styles.choiceRow}>
                    {ARTIST_COUNT_OPTIONS.map((option) => {
                      const selected = value.trim() === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => updateField('numberOfArtists', option)}
                          style={[styles.choiceChip, selected ? styles.choiceChipActive : null]}>
                          <ThemedText style={[styles.choiceChipText, selected ? styles.choiceChipTextActive : null]}>
                            {option}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            }

            if (field.key === 'counterNames') {
              const selectedCount = selectedCounterNonNoneNames.length;
              const limitLabel = String(COUNTER_STAFF_MAX);

              return (
                <View key={String(field.key)} style={styles.fieldBlock}>
                  <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                  <ThemedText style={styles.artistPickerMeta}>
                    {isCounterNoneSelected ? 'Selected None' : `Selected ${selectedCount} / ${limitLabel}`}
                  </ThemedText>

                  <View style={styles.artistGrid}>
                    {COUNTER_STAFF_OPTIONS.map((staffName) => {
                      const selected = selectedCounterNonNoneNames.some(
                        (name) => name.toLowerCase() === staffName.toLowerCase(),
                      );
                      const disabled = !selected && selectedCount >= COUNTER_STAFF_MAX;
                      const staffColor = getStaffColor(staffName);
                      const selectedTextColor = getContrastTextForHex(staffColor);

                      return (
                        <Pressable
                          key={staffName}
                          onPress={() => toggleCounterSelection(staffName)}
                          style={[
                            styles.choiceChip,
                            {
                              borderColor: selected ? staffColor : hexToRgba(staffColor, 0.55),
                              backgroundColor: selected ? staffColor : hexToRgba(staffColor, 0.14),
                            },
                            disabled ? styles.artistChipDisabled : null,
                          ]}>
                          <ThemedText
                            style={[
                              styles.choiceChipText,
                              { color: selected ? selectedTextColor : staffColor },
                              disabled ? styles.artistChipTextDisabled : null,
                            ]}>
                            {staffName}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={toggleCounterNoneSelection}
                      style={[
                        styles.choiceChip,
                        styles.noneChip,
                        isCounterNoneSelected ? styles.noneChipActive : null,
                      ]}>
                      <ThemedText
                        style={[
                          styles.choiceChipText,
                          styles.noneChipText,
                          isCounterNoneSelected ? styles.noneChipTextActive : null,
                        ]}>
                        {COUNTER_NONE_OPTION}
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={toggleCounterOtherOption}
                      style={[
                        styles.choiceChip,
                        styles.otherChip,
                        counterOtherEnabled ? styles.otherChipActive : null,
                      ]}>
                      <ThemedText
                        style={[
                          styles.choiceChipText,
                          styles.otherChipText,
                          counterOtherEnabled ? styles.otherChipTextActive : null,
                        ]}>
                        {COUNTER_OTHER_OPTION}
                      </ThemedText>
                    </Pressable>
                  </View>

                  {visibleCounterCustomOptions.length > 0 ? (
                    <View style={styles.artistGrid}>
                      {visibleCounterCustomOptions.map((staffName) => {
                        const selected = selectedCounterNonNoneNames.some(
                          (name) => name.toLowerCase() === staffName.toLowerCase(),
                        );
                        const disabled = !selected && selectedCount >= COUNTER_STAFF_MAX;
                        const staffColor = getStaffColor(staffName);
                        const selectedTextColor = getContrastTextForHex(staffColor);

                        return (
                          <Pressable
                            key={`counter-custom-${staffName}`}
                            onPress={() => toggleCounterSelection(staffName)}
                            style={[
                              styles.choiceChip,
                              {
                                borderColor: selected ? staffColor : hexToRgba(staffColor, 0.55),
                                backgroundColor: selected ? staffColor : hexToRgba(staffColor, 0.14),
                              },
                              disabled ? styles.artistChipDisabled : null,
                            ]}>
                            <ThemedText
                              style={[
                                styles.choiceChipText,
                                { color: selected ? selectedTextColor : staffColor },
                                disabled ? styles.artistChipTextDisabled : null,
                              ]}>
                              {staffName}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {counterOtherEnabled ? (
                    <View style={styles.customCounterRow}>
                      <TextInput
                        style={styles.customCounterInput}
                        placeholder="Write in counter name"
                        value={counterCustomInput}
                        onChangeText={setCounterCustomInput}
                        placeholderTextColor="#7f93a9"
                        autoCapitalize="words"
                        autoCorrect={false}
                      />
                      <Pressable
                        style={[styles.customCounterAddButton, !counterCustomInput.trim() ? styles.choiceChipDisabled : null]}
                        onPress={addCustomCounterOption}
                        disabled={!counterCustomInput.trim()}>
                        <MaterialIcons name="add" size={14} color="#d7e8fb" />
                        <ThemedText style={styles.customCounterAddButtonText}>Add</ThemedText>
                      </Pressable>
                    </View>
                  ) : null}

                  {counterOtherEnabled ? (
                    <ThemedText style={styles.helperText}>
                      Custom names added here become tap options for this event.
                    </ThemedText>
                  ) : null}

                  {counterSelectionNote ? <ThemedText style={styles.helperText}>{counterSelectionNote}</ThemedText> : null}
                </View>
              );
            }

            return (
              <View key={String(field.key)} style={styles.fieldBlock}>
                <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                <TextInput
                  style={[styles.input, field.multiline ? styles.inputMultiline : null]}
                  value={value}
                  placeholder={field.placeholder}
                  keyboardType={field.keyboardType}
                  multiline={field.multiline}
                  onChangeText={(text) => updateField(field.key, text)}
                  placeholderTextColor="#6f849a"
                />
              </View>
            );
            })}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <View style={styles.bottomActionRow}>
          <Pressable
            style={[styles.primaryButton, styles.bottomActionButton, isSavingToSheet ? styles.buttonDisabled : null]}
            onPress={() => {
              void pushCurrentEventToSheet();
            }}
            disabled={isSavingToSheet || isUndoingFromSheet}>
            <ThemedText style={styles.primaryButtonText}>
              {isSavingToSheet ? 'Saving Changes...' : 'Save Changes'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, styles.bottomActionButton, isUndoingFromSheet ? styles.buttonDisabled : null]}
            onPress={() => {
              void undoChangesFromSheet();
            }}
            disabled={isSavingToSheet || isUndoingFromSheet || !currentEvent.entryId.trim()}>
            <ThemedText style={styles.secondaryButtonText}>
              {isUndoingFromSheet ? 'Undoing...' : 'Undo Changes'}
            </ThemedText>
          </Pressable>
        </View>
        {sheetSyncStatus ? <ThemedText style={styles.helperText}>{sheetSyncStatus}</ThemedText> : null}
        {sheetSyncError ? <ThemedText style={styles.errorText}>{sheetSyncError}</ThemedText> : null}
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
    gap: 14,
    paddingBottom: 40,
  },
  topMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1117',
  },
  hero: {
    backgroundColor: '#111a24',
    borderColor: '#223244',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  heroKicker: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#8cbfff',
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
    padding: 12,
    gap: 10,
  },
  sectionGroup: {
    gap: 14,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 17,
  },
  fieldBlock: {
    gap: 5,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  fieldLabel: {
    color: '#9bb0c7',
    fontSize: 13,
    fontWeight: '600',
  },
  inlineEditButton: {
    borderWidth: 1,
    borderColor: '#2a4463',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#122235',
  },
  inlineEditButtonActive: {
    borderColor: '#3f7dd8',
    backgroundColor: '#1f4f95',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#0f1620',
    color: '#e7eef9',
  },
  inputMultiline: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  artistPickerMeta: {
    color: '#8aa4bf',
    fontSize: 12,
  },
  artistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  artistChipDisabled: {
    opacity: 0.4,
  },
  artistChipTextDisabled: {
    color: '#7f93a9',
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
  noneChip: {
    borderColor: '#58697b',
    backgroundColor: '#1d2732',
  },
  noneChipActive: {
    borderColor: '#8ea3b7',
    backgroundColor: '#3b4e62',
  },
  noneChipText: {
    color: '#becddc',
  },
  noneChipTextActive: {
    color: '#f4f8fc',
  },
  otherChip: {
    borderColor: '#59606c',
    backgroundColor: '#232934',
  },
  otherChipActive: {
    borderColor: '#8d95a3',
    backgroundColor: '#464e5c',
  },
  otherChipText: {
    color: '#c7ceda',
  },
  otherChipTextActive: {
    color: '#f4f8fc',
  },
  choiceChipDisabled: {
    opacity: 0.5,
  },
  customCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  customCounterInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2d4259',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#d8e7f8',
    backgroundColor: '#0f1620',
    minWidth: 140,
  },
  customCounterAddButton: {
    borderWidth: 1,
    borderColor: '#3d5672',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#1a2b3d',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customCounterAddButtonText: {
    color: '#d7e8fb',
    fontWeight: '700',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: '#2b74d9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  bottomActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bottomActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#172230',
  },
  secondaryButtonText: {
    color: '#c7d8eb',
    fontWeight: '700',
  },
  helperText: {
    color: '#9ab0c7',
    fontSize: 12,
  },
  errorText: {
    color: '#ff8f8f',
    fontWeight: '600',
  },
});
