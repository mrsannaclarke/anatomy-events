import type { CalendarSyncConfig } from '@/constants/calendar-sync';
import type { SheetSyncConfig } from '@/constants/sheets-sync';
import type { EventRecord } from '@/types/events';

export interface CalendarEvent {
  uid: string;
  start: Date;
  end: Date | null;
  summary: string;
  description: string;
  location: string;
}

export interface CalendarMatch {
  eventId: string;
  matchedBy: 'email' | 'phone' | 'name' | 'appointment_type';
  upcomingEvent: CalendarEvent | null;
  lastPastEvent: CalendarEvent | null;
}

function unfoldIcsLines(ics: string): string[] {
  return ics
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .map((line) => line.trimEnd());
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function valueAfterColon(line: string): string {
  const index = line.indexOf(':');
  if (index < 0) return '';
  return line.slice(index + 1);
}

function parseIcsDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const y = Number.parseInt(dateOnly[1], 10);
    const m = Number.parseInt(dateOnly[2], 10) - 1;
    const d = Number.parseInt(dateOnly[3], 10);
    const dt = new Date(y, m, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const utcDateTime = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcDateTime) {
    const y = Number.parseInt(utcDateTime[1], 10);
    const m = Number.parseInt(utcDateTime[2], 10) - 1;
    const d = Number.parseInt(utcDateTime[3], 10);
    const hh = Number.parseInt(utcDateTime[4], 10);
    const mm = Number.parseInt(utcDateTime[5], 10);
    const ss = Number.parseInt(utcDateTime[6], 10);
    const dt = new Date(Date.UTC(y, m, d, hh, mm, ss, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const localDateTime = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localDateTime) {
    const y = Number.parseInt(localDateTime[1], 10);
    const m = Number.parseInt(localDateTime[2], 10) - 1;
    const d = Number.parseInt(localDateTime[3], 10);
    const hh = Number.parseInt(localDateTime[4], 10);
    const mm = Number.parseInt(localDateTime[5], 10);
    const ss = Number.parseInt(localDateTime[6], 10);
    const dt = new Date(y, m, d, hh, mm, ss, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

export function parseCalendarIcs(ics: string): CalendarEvent[] {
  const lines = unfoldIcsLines(ics);
  const events: CalendarEvent[] = [];

  let inEvent = false;
  let uid = '';
  let dtStart = '';
  let dtEnd = '';
  let summary = '';
  let description = '';
  let location = '';

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      dtStart = '';
      dtEnd = '';
      summary = '';
      description = '';
      location = '';
      continue;
    }

    if (line === 'END:VEVENT') {
      inEvent = false;
      const start = parseIcsDate(dtStart);
      if (start) {
        events.push({
          uid: uid || `${start.getTime()}-${summary}`,
          start,
          end: parseIcsDate(dtEnd),
          summary: decodeIcsText(summary),
          description: decodeIcsText(description),
          location: decodeIcsText(location),
        });
      }
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith('UID')) uid = valueAfterColon(line);
    else if (line.startsWith('DTSTART')) dtStart = valueAfterColon(line);
    else if (line.startsWith('DTEND')) dtEnd = valueAfterColon(line);
    else if (line.startsWith('SUMMARY')) summary = valueAfterColon(line);
    else if (line.startsWith('DESCRIPTION')) description = valueAfterColon(line);
    else if (line.startsWith('LOCATION')) location = valueAfterColon(line);
  }

  return events;
}

function getRangeStart(monthsBack: number, now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  start.setMonth(start.getMonth() - monthsBack);
  return start;
}

function getRangeEnd(monthsAhead: number, now = new Date()): Date {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  end.setMonth(end.getMonth() + monthsAhead);
  return end;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@._+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNameText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

function getCalendarSearchText(entry: CalendarEvent): string {
  return normalizeText(`${entry.summary} ${entry.description} ${entry.location}`);
}

function getCalendarSearchTextRaw(entry: CalendarEvent): string {
  return `${entry.summary} ${entry.description} ${entry.location}`.toLowerCase();
}

function splitClientNameCandidates(rawClientName: string): string[] {
  const raw = rawClientName.trim();
  if (!raw) return [];

  const candidates = new Set<string>();
  const full = normalizeNameText(raw);
  if (full) candidates.add(full);

  const splitParts = raw
    .split(/\s*(?:&|\/|\+|,|\band\b)\s*/i)
    .map((value) => normalizeNameText(value))
    .filter(Boolean);
  for (const part of splitParts) {
    candidates.add(part);
  }

  return [...candidates];
}

function isNameCandidateMatch(candidate: string, haystack: string): boolean {
  if (!candidate) return false;
  if (candidate.length >= 4 && haystack.includes(candidate)) {
    return true;
  }

  const candidateParts = candidate.split(' ').filter((part) => part.length >= 2);
  if (candidateParts.length >= 2) {
    const first = candidateParts[0];
    const last = candidateParts[candidateParts.length - 1];
    if (haystack.includes(first) && haystack.includes(last)) {
      return true;
    }
  }

  const haystackTokens = new Set(haystack.split(' ').filter((part) => part.length >= 3));
  const significantParts = candidateParts.filter((part) => part.length >= 4);
  if (significantParts.length >= 2) {
    const overlapCount = significantParts.filter((part) => haystackTokens.has(part)).length;
    if (overlapCount >= 2) {
      return true;
    }
  }

  if (candidateParts.length === 1 && candidateParts[0].length >= 5) {
    return haystackTokens.has(candidateParts[0]);
  }

  return false;
}

export function filterCalendarEventsByRange(
  entries: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  return entries
    .filter((entry) => entry.start >= rangeStart && entry.start <= rangeEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function getMatchTypeForCalendarEvent(
  ledgerEvent: EventRecord,
  calendarEvent: CalendarEvent,
): 'email' | 'phone' | 'name' | 'appointment_type' | null {
  const email = ledgerEvent.email.trim().toLowerCase();
  const phoneDigits = normalizePhoneDigits(ledgerEvent.contactPhone);
  const nameCandidates = splitClientNameCandidates(ledgerEvent.clientName);
  const appointmentTypeCandidates = [
    normalizeNameText(ledgerEvent.eventType),
    normalizeNameText(ledgerEvent.privateNotes),
    normalizeNameText(ledgerEvent.contractNotes),
  ]
    .filter(Boolean)
    .flatMap((candidate) => {
      if (candidate.includes('consult') || candidate.includes('zoom')) {
        return [candidate, 'event zoom consultation'];
      }
      return [candidate];
    })
    .filter((candidate, index, all) => all.indexOf(candidate) === index);

  const haystack = getCalendarSearchText(calendarEvent);
  const haystackRaw = getCalendarSearchTextRaw(calendarEvent);
  const haystackDigits = normalizePhoneDigits(
    `${calendarEvent.summary} ${calendarEvent.description} ${calendarEvent.location}`,
  );

  if (email && haystackRaw.includes(email)) {
    return 'email';
  }

  if (phoneDigits.length >= 7) {
    const phoneToMatch = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    if (haystackDigits.includes(phoneToMatch)) {
      return 'phone';
    }
  }

  if (nameCandidates.length > 0) {
    const hasNameMatch = nameCandidates.some((candidate) => isNameCandidateMatch(candidate, haystack));
    if (hasNameMatch) {
      return 'name';
    }
  }

  const hasAppointmentTypeMatch = appointmentTypeCandidates.some(
    (candidate) => candidate.length >= 4 && haystack.includes(candidate),
  );
  if (hasAppointmentTypeMatch) {
    return 'appointment_type';
  }

  return null;
}

function pickBestMatchForLedgerEvent(
  ledgerEvent: EventRecord,
  calendarEvents: CalendarEvent[],
  now = new Date(),
): CalendarMatch | null {
  const matchedEvents: {
    calendarEvent: CalendarEvent;
    matchedBy: 'email' | 'phone' | 'name' | 'appointment_type';
  }[] = [];

  for (const calendarEvent of calendarEvents) {
    const matchedBy = getMatchTypeForCalendarEvent(ledgerEvent, calendarEvent);
    if (matchedBy) {
      matchedEvents.push({ calendarEvent, matchedBy });
    }
  }

  if (matchedEvents.length === 0) {
    return null;
  }

  const nowTs = now.getTime();
  const upcoming = matchedEvents.find((item) => item.calendarEvent.start.getTime() >= nowTs) || null;
  const lastPast = [...matchedEvents].reverse().find((item) => item.calendarEvent.start.getTime() <= nowTs) || null;
  const chosen = upcoming || lastPast;
  if (!chosen) return null;

  return {
    eventId: ledgerEvent.id,
    matchedBy: chosen.matchedBy,
    upcomingEvent: upcoming ? upcoming.calendarEvent : null,
    lastPastEvent: lastPast ? lastPast.calendarEvent : null,
  };
}

export function buildCalendarMatchMap(
  ledgerEvents: EventRecord[],
  calendarEvents: CalendarEvent[],
  now = new Date(),
): Record<string, CalendarMatch> {
  const map: Record<string, CalendarMatch> = {};

  for (const ledgerEvent of ledgerEvents) {
    const match = pickBestMatchForLedgerEvent(ledgerEvent, calendarEvents, now);
    if (match) {
      map[ledgerEvent.id] = match;
    }
  }

  return map;
}

async function fetchIcsDirect(icsUrl: string): Promise<string> {
  const response = await fetch(icsUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/calendar,*/*;q=0.8',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Calendar fetch failed (HTTP ${response.status}).`);
  }

  return text;
}

function combineIcsPayloads(payloads: string[]): string {
  return payloads
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n');
}

async function fetchIcsDirectMany(icsUrls: string[]): Promise<string> {
  const settled = await Promise.allSettled(icsUrls.map((icsUrl) => fetchIcsDirect(icsUrl)));
  const successfulPayloads = settled
    .filter((entry): entry is PromiseFulfilledResult<string> => entry.status === 'fulfilled')
    .map((entry) => entry.value);

  if (successfulPayloads.length === 0) {
    const firstFailure = settled.find(
      (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
    );
    if (firstFailure) {
      throw new Error(String(firstFailure.reason || 'Calendar fetch failed.'));
    }
    throw new Error('Calendar fetch failed.');
  }

  return combineIcsPayloads(successfulPayloads);
}

function normalizeCalendarUrlList(value: string[] | null): string[] {
  if (!value || value.length === 0) return [];
  return value
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

async function fetchIcsViaProxy(icsUrls: string[] | null, sheetSyncConfig: SheetSyncConfig): Promise<string> {
  const url = new URL(sheetSyncConfig.webAppUrl);
  url.searchParams.set('action', 'calendarfeed');
  const normalizedIcsUrls = normalizeCalendarUrlList(icsUrls);
  if (normalizedIcsUrls.length > 0) {
    url.searchParams.set('calendarIcsUrls', normalizedIcsUrls.join('\n'));
    url.searchParams.set('calendarIcsUrl', normalizedIcsUrls[0]);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    ics?: string;
  };

  if (!response.ok || !payload.ok || !payload.ics) {
    const baseMessage = payload.error || `Calendar proxy fetch failed (HTTP ${response.status}).`;
    throw new Error(
      `${baseMessage} Set CALENDAR_ICS_URLS/CALENDAR_ICS_URL in Apps Script properties or provide calendarIcsUrls/calendarIcsUrl in app config.`,
    );
  }

  return payload.ics;
}

function dedupeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const deduped: CalendarEvent[] = [];

  for (const event of events) {
    const key = `${event.uid}::${event.start.getTime()}::${normalizeText(event.summary)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}

export async function loadCalendarEvents(
  calendarConfig: CalendarSyncConfig,
  sheetSyncConfig: SheetSyncConfig,
): Promise<CalendarEvent[]> {
  const directIcsUrls = normalizeCalendarUrlList(calendarConfig.icsUrls);
  let rawIcs = '';

  if (directIcsUrls.length > 0) {
    try {
      rawIcs = await fetchIcsDirectMany(directIcsUrls);
    } catch {
      try {
        rawIcs = await fetchIcsViaProxy(directIcsUrls, sheetSyncConfig);
      } catch {
        rawIcs = await fetchIcsViaProxy(null, sheetSyncConfig);
      }
    }
  } else {
    rawIcs = await fetchIcsViaProxy(null, sheetSyncConfig);
  }

  const parsed = parseCalendarIcs(rawIcs);
  const now = new Date();
  const rangeStart = getRangeStart(calendarConfig.monthsBack, now);
  const rangeEnd = getRangeEnd(calendarConfig.monthsAhead, now);
  return filterCalendarEventsByRange(dedupeCalendarEvents(parsed), rangeStart, rangeEnd);
}

export function formatCalendarMatchDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatGoogleUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildCalendarDatesParam(start: Date, end: Date | null): string {
  const safeEnd = end && end.getTime() > start.getTime() ? end : new Date(start.getTime() + 60 * 60 * 1000);
  return `${formatGoogleUtcStamp(start)}/${formatGoogleUtcStamp(safeEnd)}`;
}

export function buildAddToCalendarUrl(event: CalendarEvent): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.summary || 'Appointment');
  url.searchParams.set('dates', buildCalendarDatesParam(event.start, event.end));
  if (event.description) url.searchParams.set('details', event.description);
  if (event.location) url.searchParams.set('location', event.location);
  return url.toString();
}
