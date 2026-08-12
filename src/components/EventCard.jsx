import { MapPin } from 'lucide-react';

import { cardActions } from '../constants.js';
import { DecorativeSprig } from './DecorativeSprig.jsx';
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

  return (
    <article className="event-card">
      <DecorativeSprig placement="card" />
      <div className="event-card__title-row">
        <div className="event-type-dot" style={{ borderColor: eventColor }}>
          <EventIcon size={14} color={eventColor} />
        </div>
        {totals.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS ? (
          <span className="corporate-pricing-symbol" title="Corporate pricing" aria-label="Corporate pricing">$</span>
        ) : null}
        <h2 style={{ color: eventColor }}>{event.clientName}</h2>
        {eventDate ? <span className="event-card__date" style={{ color: eventColor }}>{eventDate}</span> : null}
      </div>
      {eventTime ? <p className="event-card__time" style={{ color: eventColor }}>Event {eventTime}</p> : null}

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
        {isUsableLocation(location) ? (
          <a className="map-compact-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" aria-label="Open map">
            <MapPin size={15} />
          </a>
        ) : null}
      </div>

    </article>
  );
}
