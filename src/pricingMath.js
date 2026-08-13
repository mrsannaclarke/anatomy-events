export const BASE_INCLUDED_HOURS = 5;
export const DEFAULT_BASE_ADDRESS = 'Anatomy Tattoo, Portland, OR';
export const PRICING_METHOD_STANDARD = 'STANDARD';
export const PRICING_METHOD_CORPORATE_MODIFIERS = 'CORPORATE_MODIFIERS';

export function normalizePricingMethod(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === PRICING_METHOD_CORPORATE_MODIFIERS || normalized === 'CORPORATE / WALK-UP'
    ? PRICING_METHOD_CORPORATE_MODIFIERS
    : PRICING_METHOD_STANDARD;
}

export function pricingMethodToSheetValue(value) {
  return normalizePricingMethod(value) === PRICING_METHOD_CORPORATE_MODIFIERS ? 'Corporate / Walk-Up' : 'Standard';
}

export const PRICING_SCHEDULE = {
  2025: {
    1: { baseRatePerArtist5h: 1300, counterPerArtist: 150, customFlashFeeEvent: 200, extraHourlyPerArtist: 225, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    2: { baseRatePerArtist5h: 1200, counterPerArtist: 150, customFlashFeeEvent: 250, extraHourlyPerArtist: 225, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    3: { baseRatePerArtist5h: 3500 / 3, counterPerArtist: 150, customFlashFeeEvent: 300, extraHourlyPerArtist: 225, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    4: { baseRatePerArtist5h: 1150, counterPerArtist: 150, customFlashFeeEvent: 350, extraHourlyPerArtist: 225, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
  },
  2026: {
    1: { baseRatePerArtist5h: 1600, counterPerArtist: 150, customFlashFeeEvent: 220, extraHourlyPerArtist: 250, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    2: { baseRatePerArtist5h: 1500, counterPerArtist: 150, customFlashFeeEvent: 270, extraHourlyPerArtist: 250, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    3: { baseRatePerArtist5h: 1400, counterPerArtist: 150, customFlashFeeEvent: 320, extraHourlyPerArtist: 250, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
    4: { baseRatePerArtist5h: 1300, counterPerArtist: 150, customFlashFeeEvent: 400, extraHourlyPerArtist: 250, tempTattoosFee: 150, facilityCityFee: 150, facilityAdminFee: 50, depositRatePct: 30, freeRadiusMiles: 20, radiusStepMiles: 20, radiusStepFee: 100 },
  },
};

export function configurePricingSchedule(pricingRows) {
  if (!Array.isArray(pricingRows) || pricingRows.length === 0) return false;
  const nextSchedule = {};
  pricingRows.forEach((source) => {
    const year = Number(source['Plan Year']);
    const artists = Number(source.Artists);
    if (!Number.isFinite(year) || !Number.isFinite(artists) || artists < 1) return;
    if (!nextSchedule[year]) nextSchedule[year] = {};
    nextSchedule[year][artists] = {
      baseRatePerArtist5h: Number(source['Base Rate Per Artist (5h)']) || 0,
      counterPerArtist: Number(source['Counter Per Artist (5h)']) || 0,
      customFlashFeeEvent: Number(source['Custom Flash Fee (Event)']) || 0,
      extraHourlyPerArtist: Number(source['Extra Hourly Per Artist']) || 0,
      tempTattoosFee: Number(source['Temporary Tattoos Fee (Event)']) || 0,
      facilityCityFee: Number(source['Facility City Fee']) || 0,
      facilityAdminFee: Number(source['Facility Admin Fee']) || 0,
      depositRatePct: Number(source['Deposit Rate %']) || 0,
      freeRadiusMiles: Number(source['Radius Included Miles']) || 0,
      radiusStepMiles: Number(source['Radius Step Miles']) || 0,
      radiusStepFee: Number(source['Radius Step Fee']) || 0,
    };
  });
  if (Object.keys(nextSchedule).length === 0) return false;
  Object.keys(PRICING_SCHEDULE).forEach((year) => delete PRICING_SCHEDULE[year]);
  Object.assign(PRICING_SCHEDULE, nextSchedule);
  PLAN_YEARS.splice(0, PLAN_YEARS.length, ...Object.keys(nextSchedule).sort((a, b) => Number(b) - Number(a)));
  const artistCounts = [...new Set(Object.values(nextSchedule).flatMap((schedule) => Object.keys(schedule)))].sort(
    (a, b) => Number(a) - Number(b),
  );
  ARTIST_COUNTS.splice(0, ARTIST_COUNTS.length, ...artistCounts);
  return true;
}

export const PLAN_YEARS = Object.keys(PRICING_SCHEDULE).sort((a, b) => Number(b) - Number(a));
export const ARTIST_COUNTS = ['1', '2', '3', '4'];

export function parseMoney(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number.parseFloat(text.replace(/[,$\s()]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDecimal(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001) return '';
  return `${Number(value.toFixed(2))}`;
}

function normalizeFlag(value) {
  const flag = String(value || '').trim().toUpperCase();
  return flag === 'YES' ? 'YES' : 'NO';
}

function deriveBookedHoursFromReason(reason) {
  const match = String(reason || '').match(/from\s*5h\s*to\s*([0-9]+(?:\.[0-9]+)?)h/i);
  if (!match) return '';
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

function parseClockMinutes(value) {
  const text = String(value || '').trim();
  if (!text || text === '0') return null;

  const iso = text.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/);
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  const match = iso || clock;
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function deriveEventHours(startTime, endTime) {
  const startMinutes = parseClockMinutes(startTime);
  const endMinutes = parseClockMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return '';

  const adjustedEnd = endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
  const hours = (adjustedEnd - startMinutes) / 60;
  return hours > 0 && Number.isFinite(hours) ? formatDecimal(hours) || String(hours) : '';
}

export function getScheduleRow(year, artistCount) {
  return PRICING_SCHEDULE[Number(year)]?.[Number(artistCount)] || null;
}

export function computePricing(form) {
  const year = Number(form.year);
  const artistCount = Number(form.numberOfArtists);
  const row = getScheduleRow(year, artistCount);
  const rawBookedHours = String(form.bookedHours ?? '').trim();
  const bookedHours = Math.max(0, rawBookedHours ? Number(rawBookedHours) || 0 : BASE_INCLUDED_HOURS);
  const extraHours = Math.max(0, bookedHours - BASE_INCLUDED_HOURS);
  const travelDistance = Math.max(0, Number(form.travelDistance) || 0);

  const pricingMethod = normalizePricingMethod(form.pricingMethod);
  const isCorporateModifiers = pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS;
  const hasBaseInputs = Boolean(row && artistCount > 0 && bookedHours > 0);
  const standardBaseForFiveHours = hasBaseInputs ? row.baseRatePerArtist5h * artistCount : 0;
  const baseForFiveHours = isCorporateModifiers ? 0 : standardBaseForFiveHours;
  const counterBaseCharge = hasBaseInputs ? row.counterPerArtist * artistCount : 0;
  const shouldProrateBase = !isCorporateModifiers && hasBaseInputs && bookedHours < BASE_INCLUDED_HOURS;
  const shouldScaleCounterWithHours = !isCorporateModifiers && hasBaseInputs && bookedHours !== BASE_INCLUDED_HOURS;
  const baseTotal = shouldProrateBase ? (baseForFiveHours / BASE_INCLUDED_HOURS) * bookedHours : baseForFiveHours;
  const counterStaffCharge = shouldScaleCounterWithHours ? (counterBaseCharge / BASE_INCLUDED_HOURS) * bookedHours : counterBaseCharge;
  const extraHourlyCharge = row ? row.extraHourlyPerArtist * artistCount * extraHours : 0;
  const customFlashFee = normalizeFlag(form.customFlash) === 'YES' ? parseMoney(form.customFlashFee) || row?.customFlashFeeEvent || 0 : 0;
  const temporaryTattooFee = normalizeFlag(form.temporaryTattoos) === 'YES' ? parseMoney(form.temporaryTattooFee) || row?.tempTattoosFee || 0 : 0;
  const tempFacilityLicenseFee = artistCount > 0 ? parseMoney(form.tempFacilityLicenseFee) || Math.max(0, (row?.facilityCityFee || 0) + (row?.facilityAdminFee || 0)) : 0;
  const radiusFee =
    parseMoney(form.radiusFee) ||
    (row && travelDistance > row.freeRadiusMiles
      ? Math.ceil((travelDistance - row.freeRadiusMiles) / row.radiusStepMiles) * row.radiusStepFee
      : 0);
  const staffAdjustment = parseMoney(form.staffPriceAdjustment);
  const extrasTotal = counterStaffCharge + extraHourlyCharge + customFlashFee + temporaryTattooFee + tempFacilityLicenseFee + radiusFee;
  const totalCharge = Math.max(0, baseTotal + extrasTotal + staffAdjustment);
  const depositRatePct = isCorporateModifiers ? 0 : row?.depositRatePct || 30;
  const depositRequired = totalCharge * (depositRatePct / 100);
  const balanceDue = Math.max(0, totalCharge - depositRequired);
  const freeRadiusMiles = row?.freeRadiusMiles ?? 20;
  const travelDistanceLabel = travelDistance > 0 ? `${travelDistance.toFixed(1)} mi` : 'Not entered';
  const staffAdjustmentLabel = String(form.staffPriceAdjustmentReason || '').trim() || 'Staff Adjustment';

  return {
    year,
    pricingMethod,
    isCorporateModifiers,
    artistCount,
    bookedHours,
    extraHours,
    hasBaseInputs,
    baseForFiveHours,
    counterBaseCharge,
    shouldProrateBase,
    shouldScaleCounterWithHours,
    baseTotal,
    counterStaffCharge,
    extraHourlyCharge,
    customFlashFee,
    temporaryTattooFee,
    tempFacilityLicenseFee,
    radiusFee,
    staffAdjustment,
    extrasTotal,
    effectiveModifiersTotal: extrasTotal + staffAdjustment,
    totalCharge,
    depositRatePct,
    depositRequired,
    balanceDue,
    freeRadiusMiles,
    travelDistance,
    travelDistanceLabel,
    travelDistanceDisplayLabel: `Travel Distance (first ${freeRadiusMiles} mi included)`,
    staffAdjustmentLabel,
    customFlashSelection: normalizeFlag(form.customFlash),
    temporaryTattoosSelection: normalizeFlag(form.temporaryTattoos),
  };
}

export function buildPricingSummaryRows(totals) {
  const rows = [
    {
      label: totals.isCorporateModifiers ? 'Tattoo Pricing (paid by walk-up clients)' : 'Base Price (5 hours)',
      value: formatMoney(totals.baseForFiveHours),
      lead: true,
    },
    { label: 'Counter Staff (5 hours)', value: formatMoney(totals.counterBaseCharge), lead: true },
    { divider: true },
  ];

  if (totals.shouldProrateBase) {
    rows.push(
      { label: `Prorated Base Price (${totals.bookedHours.toFixed(2)} hours)`, value: formatMoney(totals.baseTotal) },
      { label: `Prorated Counter Staff (${totals.bookedHours.toFixed(2)} hours)`, value: formatMoney(totals.counterStaffCharge) },
      { divider: true },
    );
  }

  rows.push(
    { label: 'Temp Facility License', value: formatMoney(totals.tempFacilityLicenseFee), modifier: true },
    { label: `Custom Flash (${totals.customFlashSelection})`, value: formatMoney(totals.customFlashFee), modifier: true },
    { label: `Temporary Tattoos (${totals.temporaryTattoosSelection})`, value: formatMoney(totals.temporaryTattooFee), modifier: true },
    { label: totals.travelDistanceDisplayLabel, value: totals.travelDistanceLabel, modifier: true },
    { label: 'Radius Fee', value: formatMoney(totals.radiusFee), modifier: true },
    { label: 'Extra Hourly Charge', value: formatMoney(totals.extraHourlyCharge), modifier: true },
  );

  if (Math.abs(totals.staffAdjustment) > 0.0001) {
    rows.push({ label: totals.staffAdjustmentLabel, value: formatMoney(totals.staffAdjustment), modifier: true });
  }

  rows.push(
    { label: 'Modifiers Total', value: formatMoney(totals.effectiveModifiersTotal), modifier: true },
    { divider: true },
    { label: 'Total', value: formatMoney(totals.totalCharge), total: true },
  );

  if (totals.isCorporateModifiers) {
    rows.push({ label: 'Due in Full', value: formatMoney(totals.balanceDue) });
  } else {
    rows.push(
      { label: `Deposit (${totals.depositRatePct.toFixed(0)}%)`, value: formatMoney(totals.depositRequired) },
      { label: 'Balance', value: formatMoney(totals.balanceDue) },
    );
  }

  return rows;
}

export function buildPricingClipboardText(form, totals) {
  const lines = [
    `Number of Artists: ${totals.artistCount > 0 ? totals.artistCount : 'Not selected'}`,
    `Booked Hours: ${totals.bookedHours > 0 ? totals.bookedHours.toFixed(2) : 'Not entered'}`,
    `${totals.travelDistanceDisplayLabel}: ${totals.travelDistanceLabel}`,
    '',
  ];

  buildPricingSummaryRows(totals).forEach((row) => {
    if (row.divider) {
      if (lines[lines.length - 1] !== '') lines.push('');
      return;
    }
    lines.push(`${row.label}: ${row.value}`);
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function formFromEvent(event) {
  const raw = event?.raw || event || {};
  const extraHours = Math.max(0, Number(raw.extraHours) || 0);
  const hasEvent = Boolean(event);
  const bookedHoursFromReason = deriveBookedHoursFromReason(raw.staffPriceAdjustmentReason);
  const bookedHoursFromTimes = deriveEventHours(raw.eventStartTime, raw.eventEndTime);
  return {
    year: String(raw.year || '2026'),
    pricingMethod: normalizePricingMethod(raw.pricingMethod),
    numberOfArtists: String(raw.numberOfArtists || ''),
    bookedHours: hasEvent ? bookedHoursFromTimes || bookedHoursFromReason || String(BASE_INCLUDED_HOURS + extraHours) : '',
    customFlash: normalizeFlag(raw.customFlash),
    customFlashFee: raw.customFlashFee || '',
    temporaryTattoos: normalizeFlag(raw.temporaryTattoos),
    temporaryTattooFee: raw.temporaryTattooFee || '',
    tempFacilityLicenseFee: raw.tempFacilityLicenseFee || '',
    radiusFee: raw.radiusFee || '',
    travelDistance: raw.travelDistance || '',
    eventAddress: raw.eventAddress || '',
    consultationNotes: raw.privateNotes || raw.contractNotes || '',
    staffPriceAdjustment: raw.staffPriceAdjustment || '',
    staffPriceAdjustmentReason: raw.staffPriceAdjustmentReason || '',
  };
}

export function buildPricingEvent(baseEvent, form, totals) {
  const raw = baseEvent?.raw || baseEvent || {};
  const event = {
    ...raw,
    year: form.year,
    pricingMethod: pricingMethodToSheetValue(form.pricingMethod),
    numberOfArtists: form.numberOfArtists,
    customFlash: normalizeFlag(form.customFlash),
    customFlashFee: formatDecimal(totals.customFlashFee),
    temporaryTattoos: normalizeFlag(form.temporaryTattoos),
    temporaryTattooFee: formatDecimal(totals.temporaryTattooFee),
    tempFacilityLicenseFee: formatDecimal(totals.tempFacilityLicenseFee),
    radiusFee: formatDecimal(totals.radiusFee),
    travelDistance: form.travelDistance,
    eventAddress: form.eventAddress,
    internalNotes: form.consultationNotes,
    counterStaffCharge: formatDecimal(totals.counterStaffCharge),
    extraHours: totals.extraHours > 0 ? formatDecimal(totals.extraHours) : '0',
    extraHourlyCharge: formatDecimal(totals.extraHourlyCharge),
    staffPriceAdjustment: formatDecimal(parseMoney(form.staffPriceAdjustment)),
    optionalFee: formatDecimal(parseMoney(form.staffPriceAdjustment)),
    staffPriceAdjustmentReason: form.staffPriceAdjustmentReason,
    depositRequired: formatDecimal(totals.depositRequired),
    totalCharge: formatDecimal(totals.totalCharge),
    balanceDue: formatDecimal(totals.balanceDue),
  };

  return event;
}
