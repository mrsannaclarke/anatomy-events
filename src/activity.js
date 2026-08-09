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
