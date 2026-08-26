export function getLatestCommunication(raw) {
  const text = String(raw?.privateNotes || '');
  const matches = [...text.matchAll(/COMMUNICATION ENTRY\[(.*?)\]:\s*([^\n]+)/gi)];
  const latest = matches.at(-1);
  if (!latest) return '';
  return `${latest[1].trim()}: ${latest[2].trim()}`;
}

const CONFIRMED_STATUSES = new Set([
  'new',
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

const PENDING_STATUSES = new Set([
  'consult booked/pending',
  'post consult decision',
  'deposit late',
]);

function getFeedGroup(event) {
  const raw = event.raw || event;
  const status = String(event.status || raw.payStatus || '').trim().toLowerCase();
  if (CONFIRMED_STATUSES.has(status)) return 0;
  if (PENDING_STATUSES.has(status)) return 1;
  return 1;
}

function getEventDateTimestamp(event) {
  const raw = event.raw || event;
  const dateValue = String(raw.eventDate || event.eventDate || '').trim();
  const dateMatch = dateValue.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))/);
  if (!dateMatch) return Number.POSITIVE_INFINITY;

  const yearText = dateMatch[1] || dateMatch[6];
  const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
  const month = Number(dateMatch[2] || dateMatch[4]);
  const day = Number(dateMatch[3] || dateMatch[5]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return Number.POSITIVE_INFINITY;

  const timeValue = String(raw.eventStartTime || event.eventStartTime || '').trim();
  const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!timeMatch) return new Date(year, month - 1, day, 23, 59, 59).getTime();

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const suffix = timeMatch[3]?.toUpperCase();
  if (suffix === 'AM' && hour === 12) hour = 0;
  if (suffix === 'PM' && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return new Date(year, month - 1, day, 23, 59, 59).getTime();
  return new Date(year, month - 1, day, hour, minute).getTime();
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
