import { CalendarPlus, MapPin, TriangleAlert } from 'lucide-react';

import { cardActions } from '../constants.js';
import { computePricing, formFromEvent } from '../pricingMath.js';
import { getLatestCommunication } from '../activity.js';
import { getStaffColor } from '../staffColors.js';
import { getEventVisual } from './EventTypePicker.jsx';

const STAFF_NAME_ALIASES = {
  Lindsey: 'Lindsay',
  'Lady Shy': 'Shy',
  'Tomma Mueller': 'Tomma',
};

export function isHiddenLedgerStatus(event) {
  const status = String(event.status || event.raw?.payStatus || '').trim().toLowerCase();
  return [
    'complete',
    'event complete',
    'cancelled',
    'canceled',
    'not likely to continue',
  ].includes(status);
}

function isUsableLocation(value) {
  const text = String(value || '').trim();
  return text && !/^tbd\b|to be determined/i.test(text);
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
  const explicitClock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (explicitClock) {
    return `${Number(explicitClock[1]) || 12}:${explicitClock[2]} ${explicitClock[3].toUpperCase()}`;
  }

  const match = text.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/) || text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hour24 = Number(match[1]);
  return `${hour24 % 12 || 12}:${match[2]} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function parseCalendarDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] };
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  return {
    year: slash[3].length === 2 ? `20${slash[3]}` : slash[3],
    month: slash[1].padStart(2, '0'),
    day: slash[2].padStart(2, '0'),
  };
}

function parseCalendarTime(value) {
  const text = String(value || '').trim();
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const suffix = clock[3]?.toUpperCase();
  if (suffix === 'AM' && hour === 12) hour = 0;
  if (suffix === 'PM' && hour < 12) hour += 12;
  return { hour, minute: Number(clock[2]) };
}

function calendarStamp(date, time) {
  return `${date.year}${date.month}${date.day}T${String(time.hour).padStart(2, '0')}${String(time.minute).padStart(2, '0')}00`;
}

function addMinutes(time, minutesToAdd) {
  const total = time.hour * 60 + time.minute + minutesToAdd;
  return { hour: Math.floor((total % 1440) / 60), minute: total % 60 };
}

function nextCalendarDate(date) {
  const next = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function buildGoogleCalendarUrl(event, artistNames, counterNames) {
  const raw = event.raw || {};
  const date = parseCalendarDate(raw.eventDate || event.eventDate);
  if (!date) return '';
  const start = parseCalendarTime(raw.eventStartTime);
  const end = parseCalendarTime(raw.eventEndTime) || (start ? addMinutes(start, 60) : null);
  const compactDate = `${date.year}${date.month}${date.day}`;
  const dates = start && end ? `${calendarStamp(date, start)}/${calendarStamp(date, end)}` : `${compactDate}/${nextCalendarDate(date)}`;
  const details = [
    raw.eventType ? `Event type: ${raw.eventType}` : '',
    artistNames.length ? `Artists: ${artistNames.join(', ')}` : '',
    counterNames.length ? `Counter: ${counterNames.join(', ')}` : '',
    event.status ? `Status: ${event.status}` : '',
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${event.clientName} — Anatomy Events`,
    dates,
    location: [raw.venueName, raw.eventAddress].filter(Boolean).join(', '),
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getAddressLines(raw) {
  const venue = String(raw.venueName || '').trim();
  const addressParts = String(raw.eventAddress || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^united states$/i.test(part));
  return [venue, addressParts.join(', ')].filter(Boolean);
}

export function EventCard({ event, onAction }) {
  const totals = computePricing(formFromEvent(event));
  const isStaffingOnly = totals.isZeroWalkUp;
  const raw = event.raw || {};
  const location = raw.eventAddress || raw.venueName || '';
  const latestCommunication = getLatestCommunication(raw);
  const eventVisual = getEventVisual(raw.eventType, raw.pricingMethod);
  const EventIcon = eventVisual.icon;
  const eventColor = eventVisual.color;
  const eventDate = formatDate(raw.eventDate || event.eventDate);
  const eventTime = formatTime(raw.eventStartTime);
  const addressLines = getAddressLines(raw);
  const artistNames = splitNames(raw.artistNames);
  const counterNames = splitNames(raw.counterNames);
  const googleCalendarUrl = buildGoogleCalendarUrl(event, artistNames, counterNames);
  const createdDate = formatDate(raw.createdAt || raw.gravityImportedAt);

  const staffList = (names, fallback) => (
    <span className="event-card__staff-list">
      {names.length ? names.map((name) => (
        <span key={name} className="event-card__staff-person">
          <span className="event-card__staff-dot" style={{ background: getStaffColor(name) }} />
          {name}
        </span>
      )) : <span>{fallback}</span>}
    </span>
  );

  function openClientDetails(inputEvent) {
    if (inputEvent.target.closest('button, a, input, select, textarea')) return;
    onAction(isStaffingOnly ? 'staff' : 'client', event);
  }

  return (
    <article
      className={`event-card event-card--clickable${isStaffingOnly ? ' event-card--walk-up-sales-only' : ''}`}
      style={{ '--event-color': eventColor }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${event.clientName} ${isStaffingOnly ? 'staff assignments' : 'client details'}`}
      onClick={openClientDetails}
      onKeyDown={(inputEvent) => {
        if (inputEvent.target !== inputEvent.currentTarget) return;
        if (inputEvent.key !== 'Enter' && inputEvent.key !== ' ') return;
        inputEvent.preventDefault();
        onAction(isStaffingOnly ? 'staff' : 'client', event);
      }}
    >
      <div className="event-card__main">
        <div className="event-type-dot event-card__medallion" style={{ borderColor: eventColor }}>
          <EventIcon size={44} color="#fff3e4" strokeWidth={1.9} />
        </div>
        <div className="event-card__body">
          <div className="event-card__title-row">
            <h2>{event.clientName}</h2>
            {eventDate ? (
              <span className="event-card__date-group">
                {googleCalendarUrl ? (
                  <a className="event-card__calendar-link" href={googleCalendarUrl} target="_blank" rel="noreferrer" title="Add to Google Calendar" aria-label={`Add ${event.clientName} to Google Calendar`}>
                    <CalendarPlus size={18} strokeWidth={1.8} />
                  </a>
                ) : null}
                <span className="event-card__date">{eventDate}</span>
              </span>
            ) : null}
          </div>
          <p className="event-card__time">
            Event {eventTime || <TriangleAlert size={16} strokeWidth={2.2} aria-label="Missing event start time" />}
          </p>
          {addressLines.length ? (
            <a
              className={isUsableLocation(location) ? 'event-card__venue event-card__venue--link' : 'event-card__venue'}
              href={isUsableLocation(location) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : undefined}
              target={isUsableLocation(location) ? '_blank' : undefined}
              rel={isUsableLocation(location) ? 'noreferrer' : undefined}
            >
              <MapPin size={20} />
              <span>
                {addressLines.map((line) => <span key={line}>{line}</span>)}
              </span>
            </a>
          ) : null}
        </div>
        <div className="event-card__actions" aria-label="Event ledger client card actions">
          {cardActions.filter((action) => !isStaffingOnly || action.id === 'staff').map((action) => (
            <button className={`event-card__action event-card__action--${action.id}`} key={action.label} type="button" title={action.label} aria-label={action.label} onClick={() => onAction(action.id, event)}>
              <action.icon size={22} strokeWidth={1.7} />
            </button>
          ))}
        </div>
      </div>

      <div className="event-card__meta-row">
        <span className="event-card__staff-group">{staffList(artistNames, raw.numberOfArtists || '0')}</span>
        <span className="event-card__staff-group"><strong>Counter:</strong>{staffList(counterNames, 'Unassigned')}</span>
        {!isStaffingOnly ? <span className="event-card__status"><span style={{ background: eventColor }} />{event.status}</span> : null}
      </div>

      {!isStaffingOnly && latestCommunication ? <div className="communication-preview">{latestCommunication}</div> : null}
      {createdDate ? <small className="event-card__created">Created: {createdDate}</small> : null}
    </article>
  );
}
