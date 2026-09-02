import { getGoogleCredential } from './auth.js';

const viteEnv = import.meta.env || {};

export const SHEET_WEB_APP_URL =
  viteEnv.VITE_SHEET_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbz475VzSvNesTsCuU2CdvFEX7zskQ0uyJf17CqjmYaWrMZ5vePbBpBrI-cNaYsoZQ55eA/exec';

const DEV_SHEET_PROXY_URL = '/api/sheet';

const MUTATION_ACTIONS = new Set([
  'upsertEvent',
  'upsertEventPartialJson',
  'recordEventPayment',
  'deleteEvent',
  'generateContract',
  'generateTfl',
  'uploadEventArt',
]);

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
    customFlash: normalizeText(raw.customFlash).toUpperCase() || 'NO',
    temporaryTattoos: normalizeText(raw.temporaryTattoos).toUpperCase() || 'NO',
    balanceDue: formatMoney(raw.balanceDue),
    raw: normalizedRaw,
    sortTime: parseEventTime(normalizedRaw),
  };
}

async function requestSheetJson(params) {
  const action = String(params.action || '');
  if (!MUTATION_ACTIONS.has(action) && !['events', 'event', 'pricing'].includes(action)) {
    throw new Error('Sheet action is not supported by the app proxy.');
  }
  const url = new URL(DEV_SHEET_PROXY_URL, window.location.origin);
  const credential = getGoogleCredential();
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify(params),
  });
  return parseSheetResponse(response);
}

async function parseSheetResponse(response) {
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
    event,
    computed: computed || {},
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

export async function recordEventPaymentToSheet(payment) {
  const data = await requestSheetJson({
    action: 'recordEventPayment',
    payment,
  });
  if (!data.result?.transactionId) throw new Error('Payment save did not return a Transaction ID.');
  return data.result;
}

export async function deleteEventFromSheet(event) {
  return requestSheetJson({
    action: 'deleteEvent',
    entryId: event.entryId,
    sourceRow: event.sourceRow,
  });
}

export async function generateEventFile(entryId, kind, options = {}) {
  const action = kind === 'tfl' ? 'generateTfl' : 'generateContract';
  return requestSheetJson({ action, entryId, revision: Boolean(options.revision) });
}

export async function queueEventFile(entryId, kind) {
  const response = await fetch('/api/jobs/document', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ entryId, kind }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'The document could not be queued.');
  return data.job;
}

export async function getDocumentJob(jobId) {
  const response = await fetch(`/api/jobs/document?id=${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Document status could not be checked.');
  return data.job;
}

export async function queueEventArt(entryId, file) {
  const query = new URLSearchParams({ entryId, fileName: file.name });
  const response = await fetch(`/api/jobs/art-upload?${query}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': file.type || 'application/octet-stream' },
    credentials: 'same-origin',
    body: file,
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'The artwork could not be queued.');
  return data.job;
}

export async function getArtUploadJob(jobId) {
  const response = await fetch(`/api/jobs/art-upload?id=${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Upload status could not be checked.');
  return data.job;
}

export async function getArtAttachments(entryId) {
  const response = await fetch(`/api/art-attachments?entryId=${encodeURIComponent(entryId)}`, {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Uploaded art could not be loaded.');
  return data;
}

export async function deleteArtAttachment(entryId, attachment) {
  const response = await fetch('/api/art-attachments', {
    method: 'DELETE',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ entryId, id: attachment.id || '', url: attachment.url || '' }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Uploaded art could not be removed.');
  return data;
}

export async function uploadEventArt(entryId, file) {
  if (!file) throw new Error('Choose an image or PDF first.');
  const fileData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.readAsDataURL(file);
  });
  const data = await requestSheetJson({
    action: 'uploadEventArt',
    entryId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileData,
  });
  if (!data.result?.artUrl) throw new Error('Drive upload did not return a saved art link.');
  return data.result;
}

export async function pullPricingRulesFromSheet() {
  if (!pullPricingRulesFromSheet.pending) {
    pullPricingRulesFromSheet.pending = requestSheetJson({ action: 'pricing' })
      .then((data) => data.pricing || [])
      .finally(() => {
        pullPricingRulesFromSheet.pending = null;
      });
  }
  return pullPricingRulesFromSheet.pending;
}

pullPricingRulesFromSheet.pending = null;
