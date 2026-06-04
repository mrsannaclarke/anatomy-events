import { STAFF_OPTIONS } from './constants.js';
import { computePricing, formFromEvent, formatMoney, parseMoney } from './pricingMath.js';

const COMPLETED_STATUSES = new Set(['event complete', 'event complete balance late']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const NAME_SPLIT = /[,;\n/&]+/;
const HISTORICAL_PAYOUT_TRUTH = {
  1: { basePayPerArtist: 600, clearModifiers: true },
  2: { basePayPerArtist: 1000, clearModifiers: true, forceShopCustomFlashToFullFee: true },
  1513: { basePayPerArtist: 1000, customFlashBonus: 50, licensingSplitPerArtist: 300 },
};

export function normalizeNameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseNames(value) {
  return String(value || '')
    .split(NAME_SPLIT)
    .map((name) => name.trim())
    .filter((name) => {
      const key = normalizeNameKey(name);
      return key && key !== '-' && key !== 'n/a' && key !== 'na' && key !== 'none';
    });
}

export function getUnifiedStatus(event) {
  return String(event.raw?.status || event.raw?.payStatus || event.status || '').trim();
}

export function isCompletedForPay(event) {
  return COMPLETED_STATUSES.has(normalizeNameKey(getUnifiedStatus(event)));
}

export function isCancelledForPay(event) {
  return CANCELLED_STATUSES.has(normalizeNameKey(getUnifiedStatus(event)));
}

export function getCompletedYear(event) {
  const raw = event.raw || event;
  const value = raw.eventCompletedAt || raw.eventDate || event.eventDate || '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return isCompletedForPay(event) ? 'Untracked' : '';
  return String(parsed.getFullYear());
}

export function getPeopleFromEvents(events) {
  const people = [...STAFF_OPTIONS];
  events.forEach((event) => {
    people.push(...parseNames(event.raw?.artistNames));
    people.push(...parseNames(event.raw?.counterNames));
  });
  const seen = new Set();
  return people.filter((name) => {
    const key = normalizeNameKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildPricingPayoutMap(pricingRows) {
  return Object.fromEntries(
    pricingRows.map((row) => {
      const year = String(row['Plan Year'] || row.year || '').trim();
      const artists = String(row.Artists || row.artists || '').trim();
      return [
        `${year}::${artists}`,
        {
          radiusArtistSharePct: (Number(row['Radius Artist %']) || 0) / 100,
          extraHourlyArtistSharePct: (Number(row['Extra Hourly Artist %']) || 0) / 100,
          customFlashArtistSharePct: (Number(row['Custom Flash Artist %']) || 0) / 100,
          temporaryTattooArtistSharePct: (Number(row['Temporary Tattoos Artist %']) || 0) / 100,
        },
      ];
    }),
  );
}

export function getPersonPayRow(event, personName, pricingPayoutMap = {}) {
  if (isCancelledForPay(event)) return null;

  const raw = event.raw || event;
  const artistNames = parseNames(raw.artistNames);
  const counterNames = parseNames(raw.counterNames);
  const personKey = normalizeNameKey(personName);
  const isArtist = artistNames.some((name) => normalizeNameKey(name) === personKey);
  const isCounter = counterNames.some((name) => normalizeNameKey(name) === personKey);
  if (!isArtist && !isCounter) return null;

  const totals = computePricing(formFromEvent(event));
  const artistCount = artistNames.length || Math.max(1, Number(raw.numberOfArtists) || totals.artistCount || 1);
  const counterCount = counterNames.length || 1;
  const payoutRule = pricingPayoutMap[`${raw.year || totals.year}::${artistCount}`] || {};
  const customFlashShare = payoutRule.customFlashArtistSharePct ?? 0.5;
  const radiusShare = payoutRule.radiusArtistSharePct ?? 0.85;
  const extraHourlyShare = payoutRule.extraHourlyArtistSharePct ?? 0.8;

  const historical = HISTORICAL_PAYOUT_TRUTH[String(raw.entryId || '').trim()];
  let artistBasePayout = isArtist ? totals.baseTotal / artistCount : 0;
  let artistModifierBreakdown = {
    customFlash: isArtist ? (totals.customFlashFee * customFlashShare) / artistCount : 0,
    radius: isArtist ? (totals.radiusFee * radiusShare) / artistCount : 0,
    temporaryTattoos: 0,
    extraHourly: isArtist ? (totals.extraHourlyCharge * extraHourlyShare) / artistCount : 0,
    licensingSplit: 0,
  };
  if (historical && isArtist) {
    artistBasePayout = historical.basePayPerArtist;
    artistModifierBreakdown = historical.clearModifiers
      ? { customFlash: 0, radius: 0, temporaryTattoos: 0, extraHourly: 0, licensingSplit: 0 }
      : {
          customFlash: historical.customFlashBonus || 0,
          radius: 0,
          temporaryTattoos: 0,
          extraHourly: 0,
          licensingSplit: historical.licensingSplitPerArtist || 0,
        };
  }
  const artistModifierPayout = Object.values(artistModifierBreakdown).reduce((sum, amount) => sum + amount, 0);
  const counterPayout = isCounter ? parseMoney(raw.counterStaffCharge) / counterCount || totals.counterStaffCharge / counterCount : 0;
  const artistPayout = artistBasePayout + artistModifierPayout;

  return {
    event,
    role: isArtist && isCounter ? 'artist+counter' : isArtist ? 'artist' : 'counter',
    isComplete: isCompletedForPay(event),
    artistBasePayout,
    artistModifierPayout,
    artistModifierBreakdown,
    artistPayout,
    counterPayout,
    totalPayout: artistPayout + counterPayout,
    payoutSource: 'schedule_fallback',
  };
}

export function formatPayout(value) {
  return formatMoney(Number(value) || 0);
}
