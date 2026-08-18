import { STAFF_OPTIONS } from './constants.js';
import { computePricing, formFromEvent, formatMoney, isZeroWalkUpPricing, parseMoney } from './pricingMath.js';

const COMPLETED_STATUSES = new Set(['event complete', 'event complete balance late']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const NAME_SPLIT = /[,;\n/&]+/;
const HISTORICAL_PAYOUT_TRUTH = {
  1: { basePayPerArtist: 600, clearModifiers: true },
  2: { basePayPerArtist: 1000, clearModifiers: true, forceShopCustomFlashToFullFee: true },
  1513: { basePayPerArtist: 1000, customFlashBonus: 50, licensingSplitPerArtist: 300 },
};
const ONE_TIME_PAYOUT_TRUTH = {
  4181: {
    reason: 'OPB one-time payout exception: Agnes created three flash designs.',
    people: {
      agnes: { customFlash: 160 },
      'ms. mikki': {},
      'mav mess': {},
      jeremy: { counter: 450 },
    },
  },
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
      return key && key !== '-' && key !== 'n/a' && key !== 'na' && key !== 'none' && key !== 'other';
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

function getPayoutLedgerTimestamp(card) {
  const event = card.event || {};
  const raw = event.raw || event;
  const value = raw.eventCompletedAt || raw.eventDate || event.eventDate || '';
  const slashDate = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDate) {
    const year = Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3]);
    return Date.UTC(year, Number(slashDate[1]) - 1, Number(slashDate[2]));
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function sortPayoutLedgerCards(left, right) {
  return getPayoutLedgerTimestamp(right) - getPayoutLedgerTimestamp(left)
    || left.event.clientName.localeCompare(right.event.clientName);
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

function getBasePersonPayRow(event, personName, pricingPayoutMap = {}) {
  if (isCancelledForPay(event) || isZeroWalkUpPricing(event)) return null;

  const raw = event.raw || event;
  const artistNames = parseNames(raw.artistNames);
  const counterNames = parseNames(raw.counterNames);
  const personKey = normalizeNameKey(personName);
  const isArtist = artistNames.some((name) => normalizeNameKey(name) === personKey);
  const isCounter = counterNames.some((name) => normalizeNameKey(name) === personKey);
  if (!isArtist && !isCounter) return null;

  const oneTimeException = ONE_TIME_PAYOUT_TRUTH[String(raw.entryId || '').trim()];
  const oneTimePerson = oneTimeException?.people?.[personKey];
  if (oneTimePerson) {
    const artistModifierBreakdown = {
      customFlash: Number(oneTimePerson.customFlash) || 0,
      radius: 0,
      temporaryTattoos: 0,
      extraHourly: 0,
      licensingSplit: 0,
    };
    const artistBasePayout = Number(oneTimePerson.artistBase) || 0;
    const artistModifierPayout = Object.values(artistModifierBreakdown).reduce((sum, amount) => sum + amount, 0);
    const counterPayout = Number(oneTimePerson.counter) || 0;
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
      payoutSource: 'one_time_exception',
      payoutReason: oneTimeException.reason,
    };
  }

  const totals = computePricing(formFromEvent(event));
  const artistCount = artistNames.length || Math.max(1, Number(raw.numberOfArtists) || totals.artistCount || 1);
  const counterCount = counterNames.length || 1;
  const payoutRule = pricingPayoutMap[`${raw.year || totals.year}::${artistCount}`] || {};
  const customFlashShare = payoutRule.customFlashArtistSharePct ?? 0.5;
  const radiusShare = payoutRule.radiusArtistSharePct ?? 0.85;
  const extraHourlyShare = payoutRule.extraHourlyArtistSharePct ?? 0.8;
  const temporaryTattooShare = payoutRule.temporaryTattooArtistSharePct ?? 0.5;
  const addOnAmount = (type) => totals.balanceAddOns
    .filter((item) => normalizeNameKey(item.type) === normalizeNameKey(type))
    .reduce((sum, item) => sum + parseMoney(item.amount), 0);

  const historical = HISTORICAL_PAYOUT_TRUTH[String(raw.entryId || '').trim()];
  let artistBasePayout = isArtist ? totals.baseTotal / artistCount : 0;
  let artistModifierBreakdown = {
    customFlash: isArtist ? ((totals.customFlashFee + addOnAmount('Custom Flash')) * customFlashShare) / artistCount : 0,
    radius: isArtist ? ((totals.radiusFee + addOnAmount('Radius / Travel')) * radiusShare) / artistCount : 0,
    temporaryTattoos: isArtist ? ((totals.temporaryTattooFee + addOnAmount('Temporary Tattoos')) * temporaryTattooShare) / artistCount : 0,
    extraHourly: isArtist ? ((totals.extraHourlyCharge + addOnAmount('Extra Hours')) * extraHourlyShare) / artistCount : 0,
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
  const counterPayout = isCounter ? (parseMoney(raw.counterStaffCharge) || totals.counterStaffCharge) / counterCount + addOnAmount('Counter Staff') / counterCount : 0;
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

function normalizeCurrency(value) {
  const amount = Number(value) || 0;
  return Math.abs(amount) < 0.005 ? 0 : Number(amount.toFixed(2));
}

function consumeFromPool(remaining, pool) {
  return Math.max(0, remaining - Math.max(0, pool));
}

function buildAdjustmentPlan(event, pricingPayoutMap) {
  const raw = event.raw || event;
  const totals = computePricing(formFromEvent(event));
  const discount = Math.max(0, -parseMoney(raw.staffPriceAdjustment || raw.staffAdjustmentAmount || totals.staffAdjustment));
  const entryId = String(raw.entryId || '').trim();
  if (discount <= 0 || ONE_TIME_PAYOUT_TRUTH[entryId]) return { discount: 0, reductions: new Map() };

  const assignedPeople = [...new Set([...parseNames(raw.artistNames), ...parseNames(raw.counterNames)])];
  const baseRows = assignedPeople
    .map((person) => ({ person, key: normalizeNameKey(person), row: getBasePersonPayRow(event, person, pricingPayoutMap) }))
    .filter(({ row }) => row);
  const allStaffAllocations = baseRows.reduce((sum, { row }) => sum + row.totalPayout, 0);
  const baselineGross = Math.max(0, totals.totalCharge - totals.staffAdjustment);
  const baselineShopOwn = Math.max(0, baselineGross - allStaffAllocations);
  const protectedLicense = Math.max(0, totals.tempFacilityLicenseFee);
  const corporateAdmin = Math.max(0, totals.corporateAdminFee);
  const otherShopEarnings = Math.max(0, baselineShopOwn - protectedLicense - corporateAdmin);
  const reductions = new Map(baseRows.map(({ key }) => [key, { artist: 0, counter: 0 }]));

  let remaining = consumeFromPool(discount, corporateAdmin);
  remaining = consumeFromPool(remaining, otherShopEarnings);

  const reduceRows = (eligible, field, amountField) => {
    const pool = eligible.reduce((sum, item) => sum + item.row[amountField], 0);
    const applied = normalizeCurrency(Math.min(remaining, pool));
    if (applied <= 0 || pool <= 0) return;
    let assigned = 0;
    eligible.forEach(({ key, row }, index) => {
      const share = index === eligible.length - 1
        ? normalizeCurrency(applied - assigned)
        : normalizeCurrency(applied * (row[amountField] / pool));
      reductions.get(key)[field] = share;
      assigned = normalizeCurrency(assigned + share);
    });
    remaining = normalizeCurrency(Math.max(0, remaining - assigned));
  };

  // Tomma's artist allocation is shop-captured because she is salaried, so it
  // is exhausted with shop earnings before non-salaried artist payouts.
  reduceRows(baseRows.filter(({ key, row }) => key === 'tomma' && row.artistPayout > 0), 'artist', 'artistPayout');
  reduceRows(baseRows.filter(({ key, row }) => key !== 'tomma' && row.artistPayout > 0), 'artist', 'artistPayout');
  reduceRows(baseRows.filter(({ row }) => row.counterPayout > 0), 'counter', 'counterPayout');

  return {
    discount,
    reductions,
    corporateAdminReduction: Math.min(discount, corporateAdmin),
    protectedLicense,
    unallocatedReduction: normalizeCurrency(remaining),
  };
}

function applyArtistReduction(row, reduction) {
  if (reduction <= 0 || row.artistPayout <= 0) return row;
  const targetPayout = normalizeCurrency(Math.max(0, row.artistPayout - reduction));
  const components = [['base', row.artistBasePayout], ...Object.entries(row.artistModifierBreakdown)].filter(([, amount]) => amount > 0);
  const adjustedComponents = {};
  let assigned = 0;
  components.forEach(([key, amount], index) => {
    const adjusted = index === components.length - 1
      ? normalizeCurrency(targetPayout - assigned)
      : normalizeCurrency(targetPayout * (amount / row.artistPayout));
    adjustedComponents[key] = Math.max(0, adjusted);
    assigned = normalizeCurrency(assigned + adjustedComponents[key]);
  });
  const artistModifierBreakdown = Object.fromEntries(
    Object.keys(row.artistModifierBreakdown).map((key) => [key, adjustedComponents[key] || 0]),
  );
  const artistBasePayout = adjustedComponents.base || 0;
  const artistModifierPayout = normalizeCurrency(Object.values(artistModifierBreakdown).reduce((sum, amount) => sum + amount, 0));
  return { ...row, artistBasePayout, artistModifierBreakdown, artistModifierPayout, artistPayout: targetPayout };
}

export function getPersonPayRow(event, personName, pricingPayoutMap = {}) {
  const baseRow = getBasePersonPayRow(event, personName, pricingPayoutMap);
  if (!baseRow || baseRow.payoutSource === 'one_time_exception') return baseRow;
  const plan = buildAdjustmentPlan(event, pricingPayoutMap);
  const reduction = plan.reductions.get(normalizeNameKey(personName)) || { artist: 0, counter: 0 };
  const artistAdjusted = applyArtistReduction(baseRow, reduction.artist);
  const counterPayout = normalizeCurrency(Math.max(0, artistAdjusted.counterPayout - reduction.counter));
  const priceAdjustmentReduction = normalizeCurrency(reduction.artist + reduction.counter);
  return {
    ...artistAdjusted,
    counterPayout,
    totalPayout: normalizeCurrency(artistAdjusted.artistPayout + counterPayout),
    priceAdjustmentReduction,
    adjustmentWaterfall: plan,
  };
}

export function calculateEventPayout(event, people, pricingPayoutMap = {}) {
  const raw = event?.raw || event || {};
  const computed = computePricing(formFromEvent(event));
  const savedGross = parseMoney(raw.totalCharge || raw.computedTotal);
  const gross = isZeroWalkUpPricing(event) ? 0 : normalizeCurrency(savedGross > 0 ? savedGross : computed.totalCharge);
  const lines = people
    .map((person) => ({ person, row: getPersonPayRow(event, person, pricingPayoutMap) }))
    .filter((line) => line.row && (line.row.totalPayout > 0 || line.row.payoutSource === 'one_time_exception'));

  const capturedLines = lines.filter((line) => normalizeNameKey(line.person) === 'tomma');
  const paidLines = lines.filter((line) => normalizeNameKey(line.person) !== 'tomma');
  const staffPaid = normalizeCurrency(paidLines.reduce((sum, line) => sum + line.row.totalPayout, 0));
  const shopCaptured = normalizeCurrency(capturedLines.reduce((sum, line) => sum + line.row.totalPayout, 0));
  const allStaffAllocations = normalizeCurrency(staffPaid + shopCaptured);

  // Everything not allocated to a staff payout belongs to the shop: facility
  // fees, shop modifier percentages, and price adjustments. Tomma's tracked
  // payout is then added because her salaried allocation is also shop income.
  const shopOwnEarnings = normalizeCurrency(Math.max(0, gross - allStaffAllocations));
  const shopTotal = normalizeCurrency(shopOwnEarnings + shopCaptured);
  const remainder = normalizeCurrency(gross - staffPaid - shopTotal);

  return {
    event,
    lines,
    gross,
    staffPaid,
    shopCaptured,
    shopOwnEarnings,
    shopTotal,
    remainder,
    adjustmentWaterfall: buildAdjustmentPlan(event, pricingPayoutMap),
    grossSource: savedGross > 0 ? 'saved' : 'calculated',
  };
}

export function formatPayout(value) {
  return formatMoney(Number(value) || 0);
}
