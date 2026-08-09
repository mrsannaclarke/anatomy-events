import type { EventRecord } from '@/types/events';
import { computeAutoPricing } from '@/lib/pricing-rules';
import { parsePricingPlanYear, PRICING_BASE_BY_YEAR } from '@/constants/pricing-schedule';

export const PRICING_SCHEDULE_BY_YEAR: Readonly<Record<number, Readonly<Record<number, number>>>> =
  PRICING_BASE_BY_YEAR;

export function parseMoney(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const negativeParens = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/[,$\s]/g, '')
    .replace(/^\$/, '')
    .replace(/[()]/g, '');

  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return negativeParens ? -parsed : parsed;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseIntSafe(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasInput(value: string): boolean {
  return value.trim().length > 0;
}

function isTbdText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'tbd' ||
    normalized.startsWith('tbd ') ||
    normalized.includes(' tbd') ||
    normalized.includes('to be determined')
  );
}

function isLikelyValidAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isTbdText(trimmed)) return false;
  const hasStreetNumber = /\d/.test(trimmed);
  const hasSeparator = trimmed.includes(',');
  const hasStreetWord = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|hwy|highway|pkwy|parkway)\b/i.test(
    trimmed,
  );
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(trimmed);
  return hasStreetNumber && (hasSeparator || hasStreetWord || hasZip);
}

function hasValidRadiusLocation(
  event: EventRecord,
  options?: { allowTravelDistanceWithoutAddress?: boolean },
): boolean {
  if (options?.allowTravelDistanceWithoutAddress) {
    const travelDistanceMiles = Number.parseFloat(event.travelDistance);
    if (Number.isFinite(travelDistanceMiles) && travelDistanceMiles > 0) return true;
  }

  const venueName = event.venueName.trim();
  if (!venueName || isTbdText(venueName)) return false;
  return isLikelyValidAddress(event.eventAddress);
}

export interface EventComputation {
  year: number;
  artistCount: number;
  basePerArtist: number;
  baseTotal: number;
  extrasTotal: number;
  staffAdjustment: number;
  creditApplied: number;
  subtotalBeforeCredit: number;
  computedTotal: number;
  depositRequired: number;
  balanceAfterDeposit: number;
  source: 'pricing_schedule' | 'artist_fee_breakdown_fallback' | 'none';
  autoSources: {
    radiusFee: 'manual' | 'auto' | 'none';
    customFlash: 'manual' | 'auto' | 'none';
    temporaryTattoo: 'manual' | 'auto' | 'none';
    tflFee: 'manual' | 'auto' | 'none';
  };
  effectiveFees: {
    radiusFee: number;
    customFlashFee: number;
    temporaryTattooFee: number;
    tempFacilityLicenseFee: number;
  };
}

export function computeEventTotals(
  event: EventRecord,
  options?: { allowTravelDistanceWithoutAddress?: boolean },
): EventComputation {
  const year = parsePricingPlanYear(event.year);
  const artistCount = parseIntSafe(event.numberOfArtists);
  const scheduleValue = PRICING_BASE_BY_YEAR[year]?.[artistCount] ?? 0;

  const fallbackArtistFee = parseMoney(event.artistFeeBreakdown);
  const basePerArtist = scheduleValue || (artistCount > 0 ? fallbackArtistFee / artistCount : 0);
  const baseTotal = basePerArtist * artistCount;

  const autoPricing = computeAutoPricing(
    {
      year,
      artistCount,
      travelDistanceMiles: Number.parseFloat(event.travelDistance),
      customFlash: event.customFlash,
      customFlashFeeRaw: event.customFlashFee,
      temporaryTattoos: event.temporaryTattoos,
      temporaryTattooFeeRaw: event.temporaryTattooFee,
      tempFacilityLicenseFeeRaw: event.tempFacilityLicenseFee,
      radiusFeeRaw: event.radiusFee,
    },
    parseMoney,
  );

  const hasValidLocation = hasValidRadiusLocation(event, options);
  const radiusFee = hasValidLocation ? autoPricing.radiusFee : 0;
  const customFlashFee = autoPricing.customFlashFee;
  const temporaryTattooFee = autoPricing.temporaryTattooFee;
  // Business rule: do not surface/apply TFL fee until artist count is selected.
  const tempFacilityLicenseFee = artistCount > 0 ? autoPricing.tempFacilityLicenseFee : 0;

  const extras =
    parseMoney(event.counterStaffCharge) +
    customFlashFee +
    temporaryTattooFee +
    radiusFee +
    parseMoney(event.extraHourlyCharge) +
    tempFacilityLicenseFee;

  const staffAdjustment = hasInput(event.staffPriceAdjustment)
    ? parseMoney(event.staffPriceAdjustment)
    : parseMoney(event.optionalFee);
  const subtotalBeforeCredit = baseTotal + extras + staffAdjustment;

  const creditApplied = 0;

  const computedTotal = Math.max(0, subtotalBeforeCredit);
  const depositRequired = parseMoney(event.depositRequired);
  const balanceAfterDeposit = Math.max(0, computedTotal - depositRequired);

  const source = scheduleValue
    ? 'pricing_schedule'
    : fallbackArtistFee
      ? 'artist_fee_breakdown_fallback'
      : 'none';

  return {
    year,
    artistCount,
    basePerArtist,
    baseTotal,
    computedTotal,
    extrasTotal: extras,
    staffAdjustment,
    creditApplied,
    subtotalBeforeCredit,
    depositRequired,
    balanceAfterDeposit,
    source,
    autoSources: {
      radiusFee: hasValidLocation ? autoPricing.radiusFeeSource : 'none',
      customFlash: autoPricing.customFlashSource,
      temporaryTattoo: autoPricing.temporaryTattooSource,
      tflFee: artistCount > 0 ? autoPricing.tflFeeSource : 'none',
    },
    effectiveFees: {
      radiusFee,
      customFlashFee,
      temporaryTattooFee,
      tempFacilityLicenseFee,
    },
  };
}

export function formatDistanceMiles(value: string): string {
  const miles = Number.parseFloat(value);
  if (Number.isNaN(miles)) return '';
  return `${miles.toFixed(1)} mi`;
}
