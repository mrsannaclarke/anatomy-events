import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CALENDAR_SYNC_CONFIG } from '@/constants/calendar-sync';
import { getStaffColor } from '@/constants/staff-colors';
import { useEvents } from '@/context/events-context';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useAuthFramework } from '@/lib/auth-framework';
import { fireAndForgetAuditLog } from '@/lib/audit-log';
import {
  buildCalendarMatchMap,
  formatCalendarMatchDate,
  loadCalendarEvents,
  type CalendarMatch,
} from '@/lib/calendar-sync';
import { computeEventTotals, formatCurrency } from '@/lib/event-math';
import { pullEventsFromSheet } from '@/lib/sheets-sync';
import type { EventRecord } from '@/types/events';

const CLOSED_AO_STATUSES = new Set(['cancelled', 'canceled', 'event complete', 'event complete balance late']);
const PRIORITY_AO_STATUSES = new Set(['deposit paid', 'deposit complete', 'deposit completed']);
const DEPOSIT_PAID_OR_LATER_STATUSES = new Set([
  'deposit paid',
  'deposit complete',
  'deposit completed',
  'temporary license submitted',
  'awaiting follow up',
  'needing changes',
  'balance invoice sent',
  'event complete',
  'event complete balance late',
]);
const DEFAULT_DEPOSIT_RATE = 0.3;

function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getUnifiedStatus(event: EventRecord): string {
  const normalizedStatus = event.status.trim();
  if (normalizedStatus) return normalizedStatus;
  return event.payStatus.trim();
}

function isDepositCompleted(event: EventRecord): boolean {
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return false;
  return PRIORITY_AO_STATUSES.has(normalized);
}

function isClosedProject(event: EventRecord): boolean {
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return false;
  return CLOSED_AO_STATUSES.has(normalized);
}

function getStatusChipLabel(event: EventRecord): string {
  return getUnifiedStatus(event) || 'Open';
}

function shouldShowRosterTotals(event: EventRecord): boolean {
  const status = normalizeStatus(getUnifiedStatus(event));
  return status.length > 0 && status !== 'open';
}

function isDepositPaidOrLater(event: EventRecord): boolean {
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return false;
  if (normalized === 'cancelled' || normalized === 'canceled') return false;
  return DEPOSIT_PAID_OR_LATER_STATUSES.has(normalized);
}

function computePostDepositAdditions(computedTotal: number, depositAmount: number): number {
  if (!Number.isFinite(computedTotal) || !Number.isFinite(depositAmount) || depositAmount <= 0) return 0;
  const estimatedTotalAtDepositPaid = depositAmount / DEFAULT_DEPOSIT_RATE;
  if (!Number.isFinite(estimatedTotalAtDepositPaid) || estimatedTotalAtDepositPaid <= 0) return 0;
  return Math.max(0, computedTotal - estimatedTotalAtDepositPaid);
}

type EventTypeVisual = {
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  emoji?: string;
  color: string;
};

function getEventTypeVisual(eventType: string): EventTypeVisual {
  const normalized = eventType.trim().toLowerCase();

  if (normalized.includes('private')) {
    return { icon: 'celebration', color: '#b58bff' };
  }
  if (normalized.includes('corporate')) {
    return { icon: 'business-center', color: '#6ab7ff' };
  }
  if (normalized.includes('wedding')) {
    return { icon: 'favorite', color: '#ff7fb8' };
  }
  if (normalized.includes('fundraiser')) {
    return { icon: 'volunteer-activism', color: '#7fd29a' };
  }
  return { icon: 'event-note', color: '#f1b56f' };
}

function parseEventDate(value: string): Date | null {
  const timestamp = parseEventDateTimestamp(value);
  if (timestamp == null) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function formatGoogleAllDayDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function buildGoogleCalendarUrlForEvent(event: EventRecord): string | null {
  const startDate = parseEventDate(event.eventDate);
  if (!startDate) return null;

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const titlePieces = [event.clientName.trim(), event.eventType.trim()].filter(Boolean);
  const title = titlePieces.length > 0 ? titlePieces.join(' - ') : 'Anatomy Event';
  const details = [
    event.venueName ? `Venue: ${event.venueName}` : '',
    event.contactPhone ? `Phone: ${event.contactPhone}` : '',
    event.email ? `Email: ${event.email}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${formatGoogleAllDayDate(startDate)}/${formatGoogleAllDayDate(endDate)}`);
  if (details) url.searchParams.set('details', details);
  if (event.eventAddress) url.searchParams.set('location', event.eventAddress);
  else if (event.venueName) url.searchParams.set('location', event.venueName);

  return url.toString();
}

function getArtistRosterLabel(event: EventRecord): string {
  const artistNames = event.artistNames
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (artistNames.length > 0) {
    return artistNames.join(', ');
  }

  return event.numberOfArtists.trim() || '0';
}

function getArtistRosterNames(event: EventRecord): string[] {
  return event.artistNames
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseArtistCount(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const direct = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(direct)) return direct;

  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const extracted = Number(match[0]);
  return Number.isFinite(extracted) ? extracted : null;
}

function shouldShowArtistWarning(event: EventRecord, artistNames: string[]): boolean {
  const artistCount = parseArtistCount(event.numberOfArtists);
  if (artistCount == null) {
    return artistNames.length === 0 && getArtistRosterLabel(event) === '0';
  }
  if (artistCount === 0) return true;
  return artistCount > 0 && artistNames.length === 0;
}

function buildMapUrlForEvent(event: EventRecord): string | null {
  if (isTbdText(event.eventAddress) || isTbdText(event.venueName)) return null;

  const query = event.eventAddress.trim() || event.venueName.trim();
  if (!query) return null;

  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

function parseEventDateTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const simpleDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (simpleDate) {
    const month = Number.parseInt(simpleDate[1], 10);
    const day = Number.parseInt(simpleDate[2], 10);
    let year = Number.parseInt(simpleDate[3], 10);
    if (year < 100) year += 2000;

    const parsed = new Date(year, month - 1, day).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  const fallback = Date.parse(trimmed);
  return Number.isNaN(fallback) ? null : fallback;
}

function isLikelyValidAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const hasStreetNumber = /\d/.test(trimmed);
  const hasSeparator = trimmed.includes(',');
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|hwy|highway|pkwy|parkway)\b/i.test(trimmed);
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(trimmed);
  return hasStreetNumber && (hasSeparator || hasStreetWord || hasZip);
}

function isTbdText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'tbd' ||
    normalized.startsWith('tbd ') ||
    normalized.includes(' tbd') ||
    normalized.includes('to be determined')
  );
}

function stripCountrySuffix(value: string): string {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const normalized = part.toLowerCase();
      return normalized !== 'united states' && normalized !== 'usa' && normalized !== 'u.s.a.';
    })
    .join(', ');
}

function isTbdLocation(venueName: string, address: string): boolean {
  return isTbdText(venueName) || isTbdText(address);
}

function getVenueDisplayLabel(venueName: string, address: string): string {
  if (isTbdLocation(venueName, address)) return 'TBD';
  const trimmed = venueName.trim();
  return trimmed || 'No venue';
}

function formatAddressForRoster(value: string): string {
  const trimmed = stripCountrySuffix(value).trim();
  if (!trimmed) return '';
  if (isTbdText(trimmed)) return 'TBD';
  if (!isLikelyValidAddress(trimmed)) return trimmed;

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 2) return parts.join('\n');

  const zipLike = /\b\d{5}(?:-\d{4})?\b/.test(parts[parts.length - 1] || '');
  if (parts.length >= 4 && zipLike) {
    const city = parts[parts.length - 3];
    const state = parts[parts.length - 2];
    const zip = parts[parts.length - 1];
    const line1 = parts.slice(0, parts.length - 3).join(', ');
    const line2 = `${city}, ${state} ${zip}`.trim();
    return [line1, line2].filter(Boolean).join('\n');
  }

  const line1 = parts.slice(0, parts.length - 2).join(', ');
  const line2 = `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`.trim();
  return [line1, line2].filter(Boolean).join('\n');
}

function normalizeTimeForLedger(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return trimmed;

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = (match[3] || '').toUpperCase();
  if (!Number.isFinite(hour) || hour <= 0) return trimmed;
  return `${hour}:${minute}${meridiem ? ` ${meridiem}` : ''}`;
}

function buildLedgerDateLine(event: EventRecord): string {
  const parts: string[] = [];
  if (event.eventDate.trim()) parts.push(event.eventDate.trim());

  const setup = normalizeTimeForLedger(event.setupTime);
  if (setup) parts.push(`Setup ${setup}`);

  const start = normalizeTimeForLedger(event.eventStartTime);
  if (start) parts.push(`Event ${start}`);

  return parts.join(' • ');
}

export default function EventsScreen() {
  const router = useRouter();
  const { events, createEvent, setSelectedEventId, replaceEvents } = useEvents();
  const { viewerName, canAccessAdminTools, resolvePermissionsForName } = useAuthFramework();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState('Loading events from sheet...');
  const [sheetSyncError, setSheetSyncError] = useState('');
  const [calendarMatches, setCalendarMatches] = useState<Record<string, CalendarMatch>>({});
  const [actionFeedbackKey, setActionFeedbackKey] = useState<string | null>(null);
  const hasAttemptedAutoPull = useRef(false);
  const actionFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerPermission = viewerName ? resolvePermissionsForName(viewerName) : null;
  const canViewAdminMoney =
    canAccessAdminTools ||
    Boolean(viewerPermission?.roles.includes('admin'));
  const sortByEventDate = (a: EventRecord, b: EventRecord) => {
      const aDate = parseEventDateTimestamp(a.eventDate);
      const bDate = parseEventDateTimestamp(b.eventDate);

      if (aDate == null && bDate == null) return a.clientName.localeCompare(b.clientName);
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      return aDate - bDate;
    };

  const openEvents = events.filter((event) => !isClosedProject(event));
  const depositCompletedEvents = openEvents.filter(isDepositCompleted).sort(sortByEventDate);
  const otherOpenEvents = openEvents.filter((event) => !isDepositCompleted(event)).sort(sortByEventDate);
  const visibleEvents = [...depositCompletedEvents, ...otherOpenEvents];
  const hiddenClosedCount = Math.max(events.length - visibleEvents.length, 0);

  function openEvent(
    id: string,
    page?: 'client' | 'notes' | 'generators_files',
  ) {
    setSelectedEventId(id);
    if (page === 'client') return router.push(`/event/${id}/client-details`);
    if (page === 'notes') return router.push(`/event/${id}/notes`);
    if (page === 'generators_files') return router.push(`/event/${id}/generators-files`);
    router.push(`/event/${id}`);
  }

  function showActionFeedback(eventId: string, action: 'client' | 'staff' | 'notes' | 'files') {
    const nextKey = `${eventId}:${action}`;
    setActionFeedbackKey(nextKey);
    if (actionFeedbackTimeoutRef.current) {
      clearTimeout(actionFeedbackTimeoutRef.current);
    }
    actionFeedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedbackKey((current) => (current === nextKey ? null : current));
      actionFeedbackTimeoutRef.current = null;
    }, 260);
  }

  function handleCreateEvent() {
    const id = createEvent();
    router.push(`/event/${id}`);
  }

  const refreshFromSheet = useCallback(async () => {
    setSheetSyncError('');
    setSheetSyncStatus('Syncing with Event Details...');
    try {
      const pulledEvents = await pullEventsFromSheet(SHEET_SYNC_CONFIG);
      replaceEvents(pulledEvents);
      const hiddenCount = pulledEvents.filter((event) => isClosedProject(event)).length;
      setSheetSyncStatus(
        `Synced ${pulledEvents.length} events. Showing ${pulledEvents.length - hiddenCount} open event${pulledEvents.length - hiddenCount === 1 ? '' : 's'}.`,
      );
      fireAndForgetAuditLog({
        eventType: 'sheet_pull',
        status: 'success',
        message: `Pulled ${pulledEvents.length} event(s) from sheet.`,
        details: {
          count: pulledEvents.length,
        },
      });
    } catch (error) {
      console.warn('Unable to pull events from sheet.', error);
      const message = error instanceof Error ? error.message : 'Unable to pull events from sheet.';
      setSheetSyncError(message);
      setSheetSyncStatus('Showing currently cached events.');
      fireAndForgetAuditLog({
        eventType: 'sheet_pull',
        status: 'error',
        message,
      });
    }
  }, [replaceEvents]);

  async function handlePullToRefresh() {
    setIsRefreshing(true);
    await refreshFromSheet();
    setIsRefreshing(false);
  }

  useEffect(() => {
    if (hasAttemptedAutoPull.current) return;
    hasAttemptedAutoPull.current = true;

    async function runInitialPull() {
      await refreshFromSheet();
    }

    void runInitialPull();
  }, [refreshFromSheet]);

  useEffect(() => {
    let isMounted = true;

    async function runCalendarMatch() {
      try {
        const calendarEvents = await loadCalendarEvents(CALENDAR_SYNC_CONFIG, SHEET_SYNC_CONFIG);
        if (!isMounted) return;

        const matchMap = buildCalendarMatchMap(events, calendarEvents);
        setCalendarMatches(matchMap);
      } catch (error) {
        if (!isMounted) return;
        setCalendarMatches({});
        console.warn('Unable to check calendar feed.', error);
      }
    }

    void runCalendarMatch();
    return () => {
      isMounted = false;
    };
  }, [events]);

  useEffect(
    () => () => {
      if (actionFeedbackTimeoutRef.current) {
        clearTimeout(actionFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void handlePullToRefresh();
          }}
          tintColor="#8cbfff"
        />
      }>
      <View style={styles.toolbar}>
        <Pressable onPress={handleCreateEvent} style={styles.createButton}>
          <ThemedText style={styles.createButtonText}>+ New Event</ThemedText>
        </Pressable>
      </View>
      <View style={styles.syncCard}>
        <View style={styles.syncHeaderRow}>
          <ThemedText style={styles.syncLabel}>Sheet Sync</ThemedText>
          <Pressable
            style={styles.syncRefreshButton}
            onPress={() => {
              void handlePullToRefresh();
            }}>
            <MaterialIcons name="sync" size={13} color="#cfe2ff" />
            <ThemedText style={styles.syncRefreshButtonText}>Refresh</ThemedText>
          </Pressable>
        </View>
        <ThemedText style={styles.syncText}>{sheetSyncStatus}</ThemedText>
        <ThemedText style={styles.syncHint}>
          {events.length} loaded from sheet/local cache • {visibleEvents.length} visible • {hiddenClosedCount} hidden
          (completed/cancelled)
        </ThemedText>
        {sheetSyncError ? <ThemedText style={styles.syncErrorText}>{sheetSyncError}</ThemedText> : null}
      </View>

      {visibleEvents.map((event) => {
        const totals = computeEventTotals(event);
        const depositRaw = event.depositRequired.trim();
        const hasNumericDepositValue = /[0-9]/.test(depositRaw) && !depositRaw.includes('#VALUE');
        const depositAmount = hasNumericDepositValue ? totals.depositRequired : 0;
        const depositPaidOrLater = isDepositPaidOrLater(event);
        const postDepositAdditions =
          depositPaidOrLater && hasNumericDepositValue
            ? computePostDepositAdditions(totals.computedTotal, depositAmount)
            : 0;
        const balanceAmount =
          depositPaidOrLater && hasNumericDepositValue ? Math.max(0, totals.computedTotal - depositAmount) : totals.computedTotal;
        const calendarMatch = calendarMatches[event.id];
        const typeVisual = getEventTypeVisual(event.eventType);
        const upcomingAppointment = calendarMatch?.upcomingEvent ?? null;
        const lastAppointment = calendarMatch?.lastPastEvent ?? null;
        const addToGoogleCalendarUrl = buildGoogleCalendarUrlForEvent(event);
        const mapUrl = buildMapUrlForEvent(event);
        const artistRosterLabel = getArtistRosterLabel(event);
        const artistRosterNames = getArtistRosterNames(event);
        const isZeroArtistDisplay = artistRosterNames.length === 0 && artistRosterLabel === '0';
        const showArtistWarning = shouldShowArtistWarning(event, artistRosterNames);
        const dateLine = buildLedgerDateLine(event);
        const locationIsTbd = isTbdLocation(event.venueName, event.eventAddress);
        const venueDisplayLabel = getVenueDisplayLabel(event.venueName, event.eventAddress);
        const formattedAddress = locationIsTbd ? '' : formatAddressForRoster(event.eventAddress);
        const venueLinkLabel = event.venueName.trim() || 'Map Link';
        return (
          <View key={event.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={styles.clientWrap}>
                <View style={[styles.eventTypeIconWrap, { borderColor: typeVisual.color }]}>
                  {typeVisual.emoji ? (
                    <ThemedText style={styles.eventTypeEmoji}>{typeVisual.emoji}</ThemedText>
                  ) : (
                    <MaterialIcons name={typeVisual.icon || 'event-note'} size={15} color={typeVisual.color} />
                  )}
                </View>
                <ThemedText style={[styles.client, { color: typeVisual.color }]}>
                  {event.clientName || 'Untitled Event'}
                </ThemedText>
              </View>
            </View>
            {dateLine ? (
              <ThemedText style={[styles.clientDate, { color: typeVisual.color }]}>
                {dateLine}
              </ThemedText>
            ) : null}
            <View style={styles.venueRow}>
              <View style={styles.venueTextWrap}>
                {mapUrl ? (
                  <Pressable style={styles.venueMapLink} onPress={() => void Linking.openURL(mapUrl)}>
                    <MaterialIcons name="map" size={13} color="#58a6ff" />
                    <ThemedText style={styles.venueMapLinkText}>{venueLinkLabel}</ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText style={styles.venueNameRight}>
                    {venueDisplayLabel}
                  </ThemedText>
                )}
                {formattedAddress ? <ThemedText style={styles.venueAddressRight}>{formattedAddress}</ThemedText> : null}
              </View>
              <View style={styles.statusInlineWrap}>
                <View style={styles.statusChip}>
                  <ThemedText style={styles.statusChipText}>{getStatusChipLabel(event)}</ThemedText>
                </View>
              </View>
            </View>
            <View style={styles.artistRow}>
              {showArtistWarning ? (
                <MaterialIcons name="warning-amber" size={16} color="#f59e0b" />
              ) : null}
              {artistRosterNames.length > 0 ? (
                <ThemedText style={styles.detailLine}>
                  Artists:{' '}
                  {artistRosterNames.map((name, index) => (
                    <ThemedText key={`${name}-${index}`} style={[styles.artistNameToken, { color: getStaffColor(name) }]}>
                      {name}
                      {index < artistRosterNames.length - 1 ? ', ' : ''}
                    </ThemedText>
                  ))}
                </ThemedText>
              ) : (
                <ThemedText style={styles.detailLine}>
                  {isZeroArtistDisplay ? 'Artists' : `Artists: ${artistRosterLabel}`}
                </ThemedText>
              )}
            </View>
            {upcomingAppointment ? (
              <View style={styles.calendarRow}>
                <ThemedText style={styles.calendarLine}>
                  Upcoming Appt: {formatCalendarMatchDate(upcomingAppointment.start)}
                </ThemedText>
              </View>
            ) : null}

            {canViewAdminMoney && shouldShowRosterTotals(event) ? (
              <View style={styles.amountRow}>
                <View>
                  <ThemedText style={styles.amountLabel}>Computed Total</ThemedText>
                  <ThemedText style={styles.amountValue}>{formatCurrency(totals.computedTotal)}</ThemedText>
                </View>
                <View>
                  <ThemedText style={styles.amountLabel}>Balance</ThemedText>
                  <ThemedText style={styles.amountValue}>{formatCurrency(balanceAmount)}</ThemedText>
                </View>
              </View>
            ) : null}
            {canViewAdminMoney && postDepositAdditions > 0 ? (
              <View style={styles.postDepositRow}>
                <ThemedText style={styles.postDepositLabel}>Added After Deposit Paid</ThemedText>
                <ThemedText style={styles.postDepositValue}>+{formatCurrency(postDepositAdditions)}</ThemedText>
              </View>
            ) : null}
            {lastAppointment ? (
              <ThemedText style={styles.editHint}>
                Last Appt: {formatCalendarMatchDate(lastAppointment.start)}
              </ThemedText>
            ) : null}
            <View style={styles.cardBottomActionRow}>
              <View style={styles.actionIconRow}>
                {canViewAdminMoney ? (
                  <Pressable
                    style={[
                      styles.actionIconButton,
                      actionFeedbackKey === `${event.id}:client` ? styles.actionIconButtonActive : null,
                    ]}
                    onPress={() => {
                      showActionFeedback(event.id, 'client');
                      openEvent(event.id, 'client');
                    }}
                    accessibilityLabel="Client Details">
                    <MaterialIcons name="badge" size={16} color="#dceafe" />
                  </Pressable>
                ) : null}
                <Pressable
                  style={[
                    styles.actionIconButton,
                    actionFeedbackKey === `${event.id}:staff` ? styles.actionIconButtonActive : null,
                  ]}
                  onPress={() => {
                    showActionFeedback(event.id, 'staff');
                    openEvent(event.id);
                  }}
                  accessibilityLabel="Staff Assignements">
                  <MaterialIcons name="groups" size={16} color="#dceafe" />
                </Pressable>
                <Pressable
                  style={[
                    styles.actionIconButton,
                    actionFeedbackKey === `${event.id}:notes` ? styles.actionIconButtonActive : null,
                  ]}
                  onPress={() => {
                    showActionFeedback(event.id, 'notes');
                    openEvent(event.id, 'notes');
                  }}
                  accessibilityLabel="Notes">
                  <MaterialIcons name="notes" size={16} color="#dceafe" />
                </Pressable>
                <Pressable
                  style={[
                    styles.actionIconButton,
                    actionFeedbackKey === `${event.id}:files` ? styles.actionIconButtonActive : null,
                  ]}
                  onPress={() => {
                    showActionFeedback(event.id, 'files');
                    openEvent(event.id, 'generators_files');
                  }}
                  accessibilityLabel="Generators & Files">
                  <MaterialIcons name="description" size={16} color="#dceafe" />
                </Pressable>
              </View>
              {addToGoogleCalendarUrl ? (
                <Pressable
                  style={styles.calendarCompactButton}
                  onPress={() => void Linking.openURL(addToGoogleCalendarUrl)}>
                  <View style={styles.calendarButtonInner}>
                    <MaterialIcons name="calendar-month" size={14} color="#d9e9ff" />
                    <ThemedText style={styles.calendarButtonText}>Add to Google Calendar</ThemedText>
                  </View>
                </Pressable>
              ) : (
                <View />
              )}
            </View>
          </View>
        );
      })}

      {visibleEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>
            No open projects right now. AO statuses marked cancelled or fully completed are hidden.
          </ThemedText>
        </View>
      ) : null}
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
    paddingBottom: 36,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  syncCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#26415f',
    backgroundColor: '#0f1721',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  syncHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncLabel: {
    color: '#cbe0f8',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  syncText: {
    color: '#c8dbf0',
    fontSize: 13,
  },
  syncHint: {
    color: '#8da5bf',
    fontSize: 12,
  },
  syncErrorText: {
    color: '#ffb2bf',
    fontSize: 12,
  },
  syncRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#395d84',
    backgroundColor: '#1a2d43',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncRefreshButtonText: {
    color: '#cfe2ff',
    fontSize: 12,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#2b74d9',
    borderRadius: 12,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#111a24',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#223244',
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2b3c4f',
    backgroundColor: '#111a24',
    padding: 12,
  },
  emptyStateText: {
    color: '#9fb4cc',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  eventTypeIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#132234',
  },
  eventTypeEmoji: {
    fontSize: 14,
    lineHeight: 16,
  },
  client: {
    fontWeight: '700',
    fontSize: 18,
    flex: 1,
  },
  clientDate: {
    marginTop: 1,
    fontWeight: '600',
    fontSize: 13,
  },
  statusChip: {
    backgroundColor: '#1a2837',
    borderColor: '#365273',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 12,
    color: '#b9d5f6',
    fontWeight: '600',
  },
  detailLine: {
    color: '#aebfd1',
    lineHeight: 21,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  artistNameToken: {
    fontWeight: '700',
  },
  venueRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  venueTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  venueNameRight: {
    color: '#aebfd1',
    lineHeight: 18,
    textAlign: 'left',
    fontWeight: '700',
    fontSize: 13,
  },
  venueAddressRight: {
    color: '#95abbe',
    lineHeight: 18,
    textAlign: 'left',
    fontSize: 13,
  },
  venueMapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  venueMapLinkText: {
    color: '#58a6ff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  statusInlineWrap: {
    alignSelf: 'flex-end',
    paddingBottom: 1,
  },
  cardBottomActionRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionIconButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 8,
    width: 34,
    height: 34,
    backgroundColor: '#172230',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconButtonActive: {
    borderColor: '#6db6ff',
    backgroundColor: '#24588c',
    shadowColor: '#78bbff',
    shadowOpacity: 0.55,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  calendarLine: {
    color: '#b9d5f6',
    lineHeight: 21,
    fontWeight: '600',
  },
  calendarRow: {
    marginTop: 2,
    gap: 8,
    alignItems: 'flex-start',
  },
  calendarCompactButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3c8dff',
    backgroundColor: '#1f5fbc',
    alignSelf: 'flex-start',
    marginLeft: 'auto',
  },
  calendarButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  calendarButtonText: {
    color: '#d9e9ff',
    fontSize: 11,
    fontWeight: '700',
  },
  amountRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amountLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: '#7f95ad',
  },
  amountValue: {
    fontWeight: '700',
    fontSize: 16,
    color: '#e3ecf8',
  },
  postDepositRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  postDepositLabel: {
    fontSize: 12,
    color: '#f1c84b',
    fontWeight: '700',
  },
  postDepositValue: {
    fontSize: 14,
    color: '#f1c84b',
    fontWeight: '800',
  },
  editHint: {
    marginTop: 6,
    color: '#7f93ab',
    fontSize: 13,
  },
});
