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

export function sortLedgerEvents(events, manualAppointments = {}) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  return [...events].sort((a, b) => {
    const aTs = getAppointmentTimestamp(a, manualAppointments);
    const bTs = getAppointmentTimestamp(b, manualAppointments);
    const aUpcoming = aTs !== Number.POSITIVE_INFINITY && aTs >= todayTs;
    const bUpcoming = bTs !== Number.POSITIVE_INFINITY && bTs >= todayTs;

    if (aUpcoming && bUpcoming) return aTs - bTs || a.clientName.localeCompare(b.clientName);
    if (aUpcoming) return -1;
    if (bUpcoming) return 1;
    if (aTs !== Number.POSITIVE_INFINITY && bTs !== Number.POSITIVE_INFINITY) return bTs - aTs || a.clientName.localeCompare(b.clientName);
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

function eventMatchTokens(event) {
  const raw = event.raw || event;
  const clientTokens = normalizeMatchText(event.clientName || raw.clientName).split(' ').filter((token) => token.length >= 3);
  const eventTypeTokens = normalizeMatchText(raw.eventType).split(' ').filter((token) => token.length >= 5);
  return [...clientTokens, ...eventTypeTokens];
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
    const tokens = eventMatchTokens(event);
    if (!tokens.length) return acc;
    const matches = calendarEntries.filter((entry) => tokens.some((token) => entry.searchText.includes(token)));
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
