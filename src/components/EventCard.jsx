import { MapPin } from 'lucide-react';

import { cardActions } from '../constants.js';
import { computePricing, formFromEvent, PRICING_METHOD_CORPORATE_MODIFIERS } from '../pricingMath.js';
import { getLatestCommunication } from '../activity.js';
import { getStaffColor } from '../staffColors.js';
import { getEventTypeVisual } from './EventTypePicker.jsx';

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
  const match = text.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/) || text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour24 = Number(match[1]);
  return `${hour24 % 12 || 12}:${match[2]} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function getAddressLines(raw) {
  const venue = String(raw.venueName || '').trim();
  const addressParts = String(raw.eventAddress || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^united states$/i.test(part));
  return [venue, ...addressParts].filter(Boolean);
}

export function EventCard({ event, onAction }) {
  const totals = computePricing(formFromEvent(event));
  const raw = event.raw || {};
  const location = raw.eventAddress || raw.venueName || '';
  const latestCommunication = getLatestCommunication(raw);
  const eventVisual = getEventTypeVisual(raw.eventType);
  const EventIcon = eventVisual.icon;
  const eventColor = eventVisual.color;
  const eventDate = formatDate(raw.eventDate || event.eventDate);
  const eventTime = formatTime(raw.eventStartTime);
  const addressLines = getAddressLines(raw);
  const artistNames = splitNames(raw.artistNames);
  const counterNames = splitNames(raw.counterNames);

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

  return (
    <article className="event-card" style={{ '--event-color': eventColor }}>
      <div className="event-card__main">
        <div className="event-type-dot event-card__medallion" style={{ borderColor: eventColor }}>
          <EventIcon size={28} color="#fff3e4" strokeWidth={1.7} />
        </div>
        <div className="event-card__body">
          <div className="event-card__title-row">
            {totals.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS ? (
              <span className="corporate-pricing-symbol" title="Corporate pricing" aria-label="Corporate pricing">$</span>
            ) : null}
            <h2>{event.clientName}</h2>
            {eventDate ? <span className="event-card__date">{eventDate}</span> : null}
          </div>
          {eventTime ? <p className="event-card__time">Event {eventTime}</p> : null}
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
          {cardActions.map((action) => (
            <button key={action.label} type="button" title={action.label} aria-label={action.label} onClick={() => onAction(action.id, event)}>
              <action.icon size={22} strokeWidth={1.7} />
            </button>
          ))}
        </div>
      </div>

      <div className="event-card__meta-row">
        <span className="event-card__status"><span style={{ background: eventColor }} />{event.status}</span>
        <span className="event-card__staff-group"><strong>Artists:</strong>{staffList(artistNames, raw.numberOfArtists || '0')}</span>
        <span className="event-card__staff-group"><strong>Counter:</strong>{staffList(counterNames, 'Unassigned')}</span>
      </div>

      {latestCommunication ? <div className="communication-preview">{latestCommunication}</div> : null}
    </article>
  );
}
