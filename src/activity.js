export const MANUAL_APPOINTMENTS_KEY = 'events-app-2.0:manual-appointments';

export function loadManualAppointments() {
  try {
    return JSON.parse(window.localStorage.getItem(MANUAL_APPOINTMENTS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveManualAppointment(entryId, value) {
  const cleanEntryId = String(entryId || '').trim();
  if (!cleanEntryId) return {};
  const appointments = loadManualAppointments();
  if (value) appointments[cleanEntryId] = value;
  else delete appointments[cleanEntryId];
  window.localStorage.setItem(MANUAL_APPOINTMENTS_KEY, JSON.stringify(appointments));
  return appointments;
}

export function getLatestCommunication(raw) {
  const text = String(raw?.privateNotes || '');
  const matches = [...text.matchAll(/COMMUNICATION ENTRY\[(.*?)\]:\s*([^\n]+)/gi)];
  const latest = matches.at(-1);
  if (!latest) return '';
  return `${latest[1].trim()}: ${latest[2].trim()}`;
}

export function getAppointmentTimestamp(event, manualAppointments = {}) {
  const raw = event.raw || event;
  const calendarMatch = event.calendarAppointment || raw.calendarAppointment;
  if (calendarMatch?.next?.timestamp) return calendarMatch.next.timestamp;
  const manual = manualAppointments[raw.entryId] || raw.manualUpcomingAppointment || '';
  const date = manual || raw.eventDate || event.eventDate || '';
  const time = manual ? '' : raw.eventStartTime || raw.setupTime || '';
  const parsed = new Date(time ? `${date} ${time}` : date);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function parseDateParts(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) return { year: Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]), month: Number(slash[1]) - 1, day: Number(slash[2]) };
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() };
}

function parseTimeParts(value) {
  const text = String(value || '').trim();
  if (!text) return { hour: 0, minute: 0 };
  const match = text.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i);
  if (!match) return { hour: 0, minute: 0 };
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === 'PM' && hour < 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

function getDateTimeTimestamp(dateValue, timeValue) {
  const date = parseDateParts(dateValue);
  if (!date) return Number.POSITIVE_INFINITY;
  const time = parseTimeParts(timeValue);
  return new Date(date.year, date.month, date.day, time.hour, time.minute).getTime();
}

export function getEventDateTimestamp(event) {
  const raw = event.raw || event;
  const date = raw.eventDate || event.eventDate || '';
  const time = raw.eventStartTime || raw.setupTime || '';
  return getDateTimeTimestamp(date, time);
}

function getLedgerStatusRank(event) {
  const raw = event.raw || event;
  const status = String(raw.status || raw.payStatus || event.status || '').trim().toLowerCase();
  return status === 'no consult scheduled' ? 1 : 0;
}

export function sortLedgerEvents(events) {
  return [...events].sort((a, b) => {
    const statusRank = getLedgerStatusRank(a) - getLedgerStatusRank(b);
    if (statusRank) return statusRank;
    const aTs = getEventDateTimestamp(a);
    const bTs = getEventDateTimestamp(b);
    if (aTs !== Number.POSITIVE_INFINITY && bTs !== Number.POSITIVE_INFINITY) return aTs - bTs || a.clientName.localeCompare(b.clientName);
    if (aTs !== Number.POSITIVE_INFINITY) return -1;
    if (bTs !== Number.POSITIVE_INFINITY) return 1;
    return a.clientName.localeCompare(b.clientName);
  });
}

function unfoldIcs(value) {
  return String(value || '').replace(/\r?\n[ \t]/g, '');
}

function unescapeIcsText(value) {
  return String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function getIcsField(block, fieldName) {
  const pattern = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, 'im');
  const match = block.match(pattern);
  return match ? unescapeIcsText(match[1]) : '';
}

function parseIcsDate(value) {
  const text = String(value || '').trim();
  const dateTime = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (dateTime) {
    const [, year, month, day, hour, minute, second, zulu] = dateTime;
    const args = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second || 0)];
    return zulu ? new Date(Date.UTC(...args)) : new Date(...args);
  }
  const dateOnly = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clientNameTokens(event) {
  const raw = event.raw || event;
  return normalizeMatchText(event.clientName || raw.clientName)
    .split(' ')
    .filter((token) => token.length >= 3);
}

function calendarEntryMatchesEvent(entry, event) {
  const tokens = clientNameTokens(event);
  if (!tokens.length) return false;

  const clientPhrase = tokens.join(' ');
  if (clientPhrase.length >= 6 && entry.searchText.includes(clientPhrase)) return true;

  if (tokens.length === 1) {
    const [onlyToken] = tokens;
    return onlyToken.length >= 6 && entry.searchText.split(' ').includes(onlyToken);
  }

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return first.length >= 3 && last.length >= 3 && entry.searchText.includes(first) && entry.searchText.includes(last);
}

export function parseCalendarFeed(ics) {
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks
    .map((block) => {
      const start = parseIcsDate(getIcsField(block, 'DTSTART'));
      if (!start) return null;
      const summary = getIcsField(block, 'SUMMARY');
      const description = getIcsField(block, 'DESCRIPTION');
      const location = getIcsField(block, 'LOCATION');
      return {
        id: getIcsField(block, 'UID') || `${summary}-${start.toISOString()}`,
        summary,
        description,
        location,
        start,
        timestamp: start.getTime(),
        searchText: normalizeMatchText([summary, description, location].join(' ')),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function buildCalendarAppointmentMap(events, calendarEntries) {
  const now = Date.now();
  return events.reduce((acc, event) => {
    const matches = calendarEntries.filter((entry) => calendarEntryMatchesEvent(entry, event));
    if (!matches.length) return acc;
    const next = matches.find((entry) => entry.timestamp >= now) || null;
    const last = [...matches].reverse().find((entry) => entry.timestamp < now) || null;
    if (next || last) {
      acc[event.entryId || event.id] = { next, last };
    }
    return acc;
  }, {});
}

export function formatAppointment(entry) {
  if (!entry?.start) return '';
  return entry.start.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
