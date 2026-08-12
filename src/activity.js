export function getLatestCommunication(raw) {
  const text = String(raw?.privateNotes || '');
  const matches = [...text.matchAll(/COMMUNICATION ENTRY\[(.*?)\]:\s*([^\n]+)/gi)];
  const latest = matches.at(-1);
  if (!latest) return '';
  return `${latest[1].trim()}: ${latest[2].trim()}`;
}

const CONFIRMED_STATUSES = new Set([
  'need to send contract/deposit invoice',
  'contract signed',
  'deposit sent',
  'deposit paid',
  'temporary license submitted',
  'temporary license received',
  'temporary license recieved',
  'awaiting follow up',
  'needing changes',
  'balance invoice sent',
  'invoice paid in full',
  'event complete balance late',
]);

function getFeedGroup(event) {
  const raw = event.raw || event;
  const status = String(event.status || raw.payStatus || '').trim().toLowerCase();
  return CONFIRMED_STATUSES.has(status) ? 0 : 1;
}

function getEventDateTimestamp(event) {
  const raw = event.raw || event;
  const value = raw.eventDate || event.eventDate || '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

export function sortLedgerEvents(events) {

  return [...events].sort((a, b) => {
    const groupDifference = getFeedGroup(a) - getFeedGroup(b);
    if (groupDifference) return groupDifference;

    const aTs = getEventDateTimestamp(a);
    const bTs = getEventDateTimestamp(b);
    if (aTs !== Number.POSITIVE_INFINITY && bTs !== Number.POSITIVE_INFINITY) return aTs - bTs || a.clientName.localeCompare(b.clientName);
    if (aTs !== Number.POSITIVE_INFINITY) return -1;
    if (bTs !== Number.POSITIVE_INFINITY) return 1;
    return a.clientName.localeCompare(b.clientName);
  });
}
