import { BriefcaseBusiness, CalendarPlus, Heart, MapPin, PartyPopper, ScrollText, Users } from 'lucide-react';

import { cardActions } from '../constants.js';
import { formatAppointment, getLatestCommunication } from '../activity.js';
import { getStaffColor } from '../staffColors.js';

const STAFF_NAME_ALIASES = {
  Lindsey: 'Lindsay',
  'Lady Shy': 'Shy',
  'Tomma Mueller': 'Tomma',
};

export function isHiddenLedgerStatus(event) {
  const status = String(event.status || event.raw?.payStatus || '').trim().toLowerCase();
  return status === 'complete' || status === 'event complete' || status === 'event complete balance late';
}

function isUsableLocation(value) {
  const text = String(value || '').trim();
  return text && !/^tbd\b|to be determined/i.test(text);
}

function getEventTypeVisual(eventType) {
  const key = String(eventType || '').toLowerCase();
  if (key.includes('private')) return { icon: PartyPopper, color: '#b58bff' };
  if (key.includes('corporate')) return { icon: BriefcaseBusiness, color: '#6ab7ff' };
  if (key.includes('wedding')) return { icon: Heart, color: '#ff7fb8' };
  if (key.includes('fundraiser')) return { icon: Users, color: '#7fd29a' };
  return { icon: ScrollText, color: '#f1b56f' };
}

function normalizeDisplayName(name) {
  const clean = String(name || '').trim();
  return STAFF_NAME_ALIASES[clean] || clean;
}

function splitNames(value) {
  return String(value || '')
    .split(/[,;\n/&]+/)
    .map((name) => normalizeDisplayName(name))
    .filter(Boolean);
}

function formatDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) return `${Number(slash[1])}/${Number(slash[2])}/${slash[3].length === 2 ? `20${slash[3]}` : slash[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
}

function formatTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const clock = text.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i);
  const simple = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  const match = clock || simple;
  if (!match) return '';
  const hour24 = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toUpperCase() || (hour24 >= 12 ? 'PM' : 'AM');
  const hour12 = match[3] ? hour24 : hour24 % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function getAddressLines(raw) {
  const venue = String(raw.venueName || '').trim();
  const addressParts = String(raw.eventAddress || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^united states$/i.test(part));
  return [venue, ...addressParts].filter(Boolean);
}

function buildCalendarUrl(event) {
  const raw = event.raw || {};
  const parsed = new Date(raw.eventDate || event.eventDate);
  const dates = Number.isNaN(parsed.getTime())
    ? ''
    : `${parsed.toISOString().slice(0, 10).replaceAll('-', '')}/${parsed.toISOString().slice(0, 10).replaceAll('-', '')}`;
  const title = [event.clientName, raw.eventType].filter(Boolean).join(' ');
  const details = [`Phone: ${raw.contactPhone || '-'}`, `Email: ${raw.email || '-'}`].join('\n');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title || 'Anatomy Event');
  if (dates) url.searchParams.set('dates', dates);
  if (raw.eventAddress) url.searchParams.set('location', raw.eventAddress);
  url.searchParams.set('details', details);
  return url.toString();
}

export function EventCard({ event, manualAppointment, onAction }) {
  const raw = event.raw || {};
  const location = raw.eventAddress || raw.venueName || '';
  const latestCommunication = getLatestCommunication(raw);
  const eventVisual = getEventTypeVisual(raw.eventType);
  const EventIcon = eventVisual.icon;
  const eventColor = eventVisual.color;
  const eventDate = formatDate(raw.eventDate || event.eventDate);
  const eventTime = formatTime(raw.eventStartTime);
  const dateLine = [eventDate, eventTime ? `Event ${eventTime}` : ''].filter(Boolean).join(' • ');
  const addressLines = getAddressLines(raw);
  const artistNames = splitNames(raw.artistNames);
  const manualNextAppointment = manualAppointment || raw.manualUpcomingAppointment || '';
  const nextAppointment = manualNextAppointment
    ? new Date(manualNextAppointment).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : formatAppointment(event.calendarAppointment?.next);
  const lastAppointment = formatAppointment(event.calendarAppointment?.last);

  return (
    <article className="event-card">
      <div className="event-card__title-row">
        <div className="event-type-dot" style={{ borderColor: eventColor }}>
          <EventIcon size={14} color={eventColor} />
        </div>
        <h2 style={{ color: eventColor }}>{event.clientName}</h2>
      </div>
      {dateLine ? <p className="event-card__date" style={{ color: eventColor }}>{dateLine}</p> : null}

      <div className="event-card__venue-row">
        <div className="event-card__venue">
          {addressLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <span className="status-pill">{event.status}</span>
      </div>

      <div className="event-card__artists">
        <span>Artists:</span>
        {artistNames.length ? (
          <span className="artist-name-list">
            {artistNames.map((name) => (
              <span key={name} className="artist-name-chip" style={{ color: getStaffColor(name) }}>
                {name}
              </span>
            ))}
          </span>
        ) : (
          <strong>{raw.numberOfArtists || '0'}</strong>
        )}
      </div>

      {latestCommunication ? <div className="communication-preview">{latestCommunication}</div> : null}

      <div className="event-card__bottom-row">
        <div className="event-card__actions" aria-label="Event ledger client card actions">
          {cardActions.map((action) => (
            <button key={action.label} type="button" title={action.label} aria-label={action.label} onClick={() => onAction(action.id, event)}>
              <action.icon size={16} />
            </button>
          ))}
        </div>
        <a className="calendar-compact-button" href={buildCalendarUrl(event)} target="_blank" rel="noreferrer">
          <CalendarPlus size={14} />
          Add to Google Calendar
        </a>
        {isUsableLocation(location) ? (
          <a className="map-compact-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" aria-label="Open map">
            <MapPin size={15} />
          </a>
        ) : null}
      </div>

      <div className="appointment-footer">
        <span>Next Appt: {nextAppointment || 'No upcoming appointment found'}</span>
        <span>Last Appt: {lastAppointment || 'No previous appointment found'}</span>
      </div>
    </article>
  );
}
