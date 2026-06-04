const viteEnv = import.meta.env || {};

export const SHEET_WEB_APP_URL =
  viteEnv.VITE_SHEET_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbz475VzSvNesTsCuU2CdvFEX7zskQ0uyJf17CqjmYaWrMZ5vePbBpBrI-cNaYsoZQ55eA/exec';

export const SHEET_API_TOKEN = viteEnv.VITE_SHEET_API_TOKEN || '';

const DEV_SHEET_PROXY_URL = '/api/sheet';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEventDate(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoDate) {
    return `${Number(isoDate[2])}/${Number(isoDate[3])}/${isoDate[1]}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function normalizeEventTime(value) {
  const text = normalizeText(value);
  if (!text || text === '0') return '';

  const isoTime = text.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/);
  const clockTime = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  const match = isoTime || clockTime;
  if (!match) return text;

  const hour24 = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toUpperCase() || (hour24 >= 12 ? 'PM' : 'AM');
  const hour12 = match[3] ? hour24 : hour24 % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function parseEventTime(event) {
  const date = normalizeText(event.eventDate);
  if (!date) return Number.POSITIVE_INFINITY;

  const time = normalizeText(event.eventStartTime || event.setupTime);
  const parsed = new Date(time ? `${date} ${time}` : date);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;

  return parsed.getTime();
}

export function formatMoney(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const numeric = Number.parseFloat(text.replace(/[$,]/g, ''));
  if (!Number.isFinite(numeric)) return text;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function normalizeEvent(raw, index = 0) {
  const status = normalizeText(raw.status) || normalizeText(raw.payStatus) || 'No Status';
  const clientName = normalizeText(raw.clientName) || 'Untitled Client';
  const eventDate = normalizeEventDate(raw.eventDate);
  const setupTime = normalizeEventTime(raw.setupTime);
  const startTime = normalizeEventTime(raw.eventStartTime);
  const endTime = normalizeEventTime(raw.eventEndTime);
  const normalizedRaw = {
    ...raw,
    eventDate,
    setupTime,
    eventStartTime: startTime,
    eventEndTime: endTime,
  };

  return {
    id: normalizeText(raw.id) || `sheet-${normalizeText(raw.entryId) || index}`,
    entryId: normalizeText(raw.entryId),
    clientName,
    eventDate,
    status,
    appointment: [eventDate, startTime].filter(Boolean).join(' at ') || 'No appointment date',
    customFlash: normalizeText(raw.customFlash).toUpperCase() || 'NO',
    temporaryTattoos: normalizeText(raw.temporaryTattoos).toUpperCase() || 'NO',
    balanceDue: formatMoney(raw.balanceDue),
    raw: normalizedRaw,
    sortTime: parseEventTime(normalizedRaw),
  };
}

async function requestSheetJson(params) {
  const url = new URL(viteEnv.DEV ? DEV_SHEET_PROXY_URL : SHEET_WEB_APP_URL, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  url.searchParams.set('_ts', String(Date.now()));
  if (SHEET_API_TOKEN) url.searchParams.set('token', SHEET_API_TOKEN);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Apps Script: ${text.slice(0, 160)}`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Sheet request failed (HTTP ${response.status}).`);
  }

  return data;
}

export async function pullEventsFromSheet() {
  const data = await requestSheetJson({ action: 'events', limit: '1000' });

  const events = data.events || [];
  const cached = (() => {
    try {
      return JSON.parse(window.localStorage.getItem('events-app-2.0:last-sheet-events') || '[]');
    } catch {
      return [];
    }
  })();
  if (events.length === 0 && cached.length > 0) {
    throw new Error('Sheet returned 0 rows; keeping local cache to avoid wiping the ledger.');
  }

  return events
    .map((event, index) => normalizeEvent(event, index + 1))
    .sort((a, b) => a.sortTime - b.sortTime || a.clientName.localeCompare(b.clientName));
}

export async function pullEventByEntryId(entryId) {
  const cleanEntryId = normalizeText(entryId);
  if (!cleanEntryId) throw new Error('Entry ID is required.');

  const data = await requestSheetJson({ action: 'event', entryId: cleanEntryId });
  return data.event ? normalizeEvent(data.event, cleanEntryId) : null;
}

export async function upsertEventToSheet(event, computed) {
  const data = await requestSheetJson({
    action: 'upsertEvent',
    event: JSON.stringify(event),
    computed: JSON.stringify(computed || {}),
  });
  if (!data.event) throw new Error('Sheet save did not return an event.');
  return normalizeEvent(data.event, event.entryId || Date.now());
}

export async function upsertEventPartialToSheet(patch) {
  const data = await requestSheetJson({
    action: 'upsertEventPartialJson',
    eventJson: JSON.stringify(patch),
  });
  if (!data.result?.entryId) throw new Error('Sheet partial save did not return an Entry ID.');
  return data.result;
}

export async function deleteEventFromSheet(event) {
  return requestSheetJson({
    action: 'deleteEvent',
    entryId: event.entryId,
    sourceRow: event.sourceRow,
  });
}

export async function generateEventFile(entryId, kind) {
  const action = kind === 'tfl' ? 'generateTfl' : 'generateContract';
  return requestSheetJson({ action, entryId });
}

export async function pullPricingRulesFromSheet() {
  const data = await requestSheetJson({ action: 'pricing' });
  return data.pricing || [];
}

export async function pullStaffDirectoryFromSheet() {
  const data = await requestSheetJson({ action: 'staff' });
  return data.staff || [];
}

export async function pullCalendarFeed() {
  const data = await requestSheetJson({ action: 'calendarfeed' });
  return data.ics || '';
}

export async function pullSheetTabs() {
  const data = await requestSheetJson({ action: 'sheettabs' });
  return data.tabs || [];
}

export async function pullSheetTabRows(tabName) {
  const data = await requestSheetJson({ action: 'sheettabrows', tabName });
  return data.rows || [];
}

export async function appendAuditToSheet({ actionName, entryId, targetSheet = 'Events', payload = {} }) {
  return requestSheetJson({
    action: 'appendaudit',
    actionName,
    entryId: entryId || '',
    targetSheet,
    payloadJson: JSON.stringify(payload),
  });
}

export async function pullAuditRows(limit = 150) {
  const data = await requestSheetJson({ action: 'sheettabrows', tabName: 'Audit Log', startRow: '2', limit: String(limit) });
  const rows = data.rows || [];
  return rows.slice(-limit).reverse();
}
