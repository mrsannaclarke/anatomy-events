import {
  isCancelledPayStatusValue,
  isCompletedPayStatusValue,
  normalizeNameKey,
  normalizeStatusKey,
} from '@/constants/pay-framework';
import {
  getHistoricalAdjustmentReasonByEntryPersonKey,
  getHistoricalArtistBreakdownOverride,
  getHistoricalPreScheduleArtistBase,
} from '@/constants/historical-payout-truth';
import { computeEventTotals, parseMoney } from '@/lib/event-math';
import type { StaffTabPayoutOverride } from '@/lib/payout-overrides';
import type { EventRecord } from '@/types/events';

// Policy decision (2026-04-15):
// If a live staff-tab payout row exists for (Entry ID + person), it is source-of-truth.
// No date cutoff is applied because post-Kynzi/Alejandro rows still diverge from framework values.
const APPLY_STAFF_TAB_OVERRIDES_WITHOUT_CUTOFF = true;

export type PricingSchedulePayoutRow = {
  basePayPerArtist: number;
  customFlashArtistBonus: number;
  radiusArtistSharePct: number;
  extraHourlyArtistSharePct: number;
};

export type PricingSchedulePayoutMap = Record<string, PricingSchedulePayoutRow>;

export function buildPricingSchedulePayoutKey(planName: string, artistCount: number): string {
  return `${planName.trim()}::${Math.max(0, Math.floor(artistCount))}`;
}

export type PersonPayRow = {
  event: EventRecord;
  role: 'artist' | 'counter' | 'artist+counter';
  isComplete: boolean;
  artistBasePayout: number;
  artistModifierPayout: number;
  artistModifierBreakdown: {
    customFlash: number;
    radius: number;
    temporaryTattoos: number;
    extraHourly: number;
  };
  artistPayout: number;
  counterPayout: number;
  totalPayout: number;
  payoutAdjustmentFromPricing: number;
  payoutAdjustmentReason: string;
  payoutPolicyStatus: 'ok' | 'historical_read_only' | 'reason_required' | 'reason_provided';
  pricingBreakdownSource: 'live_pricing_schedule' | 'fallback_framework';
  payoutSource: 'framework' | 'staff_tab_override';
  payoutSourceTab: string;
  payoutSourceRowNumber: number;
};

function isValidPersonToken(value: string): boolean {
  const key = normalizeNameKey(value);
  if (!key) return false;
  if (key === '-' || key === '—') return false;
  if (key === 'n/a' || key === 'na' || key === 'none') return false;
  return true;
}

function parseNameList(value: string): string[] {
  return value
    .split(/[,\n;/&]+/)
    .map((entry) => entry.trim())
    .filter((entry) => isValidPersonToken(entry));
}

function getTodayStartTimestamp(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isPastEventByDate(event: EventRecord): boolean {
  const eventDateTs = parseEventTimestamp(event.eventDate);
  if (eventDateTs == null) return false;
  return eventDateTs < getTodayStartTimestamp();
}

function extractPayoutAdjustmentReasonFromNotes(event: EventRecord, personName: string): string {
  const raw = `${event.privateNotes || ''}\n${event.contractNotes || ''}`;
  if (!raw.trim()) return '';

  const personEscaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const perPersonPattern = new RegExp(
    `payout\\s*adjustment\\s*reason\\s*\\[\\s*${personEscaped}\\s*\\]\\s*:\\s*(.+)`,
    'i',
  );
  const perPersonMatch = raw.match(perPersonPattern);
  if (perPersonMatch?.[1]) {
    return perPersonMatch[1].trim();
  }

  const genericMatch = raw.match(/payout\s*adjustment\s*reason\s*:\s*(.+)/i);
  if (genericMatch?.[1]) {
    return genericMatch[1].trim();
  }

  return '';
}

function listHasName(list: string[], name: string): boolean {
  const target = normalizeNameKey(name);
  if (!target) return false;
  return list.some((entry) => normalizeNameKey(entry) === target);
}

function getUnifiedStatus(event: EventRecord): string {
  const status = event.status.trim();
  if (status) return status;
  return event.payStatus.trim();
}

export function isEventCompleteForPay(event: EventRecord): boolean {
  return isCompletedPayStatusValue(getUnifiedStatus(event));
}

export function isEventCancelledForPay(event: EventRecord): boolean {
  return isCancelledPayStatusValue(getUnifiedStatus(event));
}

export function getEffectiveCompletedAt(
  event: EventRecord,
): { timestamp: number | null; assumedFromEventDate: boolean } {
  const completedAtTs = parseEventTimestamp(event.eventCompletedAt);
  if (completedAtTs != null) {
    return {
      timestamp: completedAtTs,
      assumedFromEventDate: false,
    };
  }

  if (!isEventCompleteForPay(event)) {
    return {
      timestamp: null,
      assumedFromEventDate: false,
    };
  }

  const eventDateTs = parseEventTimestamp(event.eventDate);
  if (eventDateTs == null) {
    return {
      timestamp: null,
      assumedFromEventDate: false,
    };
  }

  const now = new Date();
  const todayStartTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (eventDateTs < todayStartTs) {
    return {
      timestamp: eventDateTs,
      assumedFromEventDate: true,
    };
  }

  return {
    timestamp: null,
    assumedFromEventDate: false,
  };
}

export function getCompletedYearKey(event: EventRecord): string {
  const effectiveCompletedAt = getEffectiveCompletedAt(event);
  if (effectiveCompletedAt.timestamp != null) {
    return String(new Date(effectiveCompletedAt.timestamp).getFullYear());
  }

  if (isEventCompleteForPay(event)) {
    return 'Untracked';
  }

  return '';
}

export function getCompletedAtDisplayLabel(event: EventRecord): string {
  const effectiveCompletedAt = getEffectiveCompletedAt(event);
  if (effectiveCompletedAt.timestamp == null) return '';

  const completedDate = new Date(effectiveCompletedAt.timestamp);
  if (effectiveCompletedAt.assumedFromEventDate) {
    return completedDate.toLocaleDateString();
  }

  return completedDate.toLocaleString();
}

export function getUnifiedPayStatus(event: EventRecord): string {
  return normalizeStatusKey(getUnifiedStatus(event));
}

export function getPersonPayRow(
  event: EventRecord,
  personName: string,
  payoutOverride?: StaffTabPayoutOverride | null,
  pricingSchedule?: PricingSchedulePayoutMap,
): PersonPayRow | null {
  if (isEventCancelledForPay(event)) return null;

  const artistNames = parseNameList(event.artistNames);
  const counterNames = parseNameList(event.counterNames);

  const isArtistAssignedByEvent = listHasName(artistNames, personName);
  const isCounterAssignedByEvent = listHasName(counterNames, personName);
  const isArtistAssignedByOverride = Boolean((payoutOverride?.artistPayout || 0) > 0);
  const isCounterAssignedByOverride = Boolean((payoutOverride?.counterPayout || 0) > 0);

  const isArtistAssigned = isArtistAssignedByEvent || isArtistAssignedByOverride;
  const isCounterAssigned = isCounterAssignedByEvent || isCounterAssignedByOverride;

  if (!isArtistAssigned && !isCounterAssigned && !payoutOverride) return null;

  const totals = computeEventTotals(event);

  const artistSplitCount = artistNames.length > 0 ? artistNames.length : Math.max(1, totals.artistCount || 1);
  const scheduleKey = buildPricingSchedulePayoutKey(event.year, artistSplitCount);
  const scheduleRow = pricingSchedule?.[scheduleKey];
  const hasLivePricingSchedule = Boolean(scheduleRow);

  const customFlashEnabled = parseMoney(event.customFlashFee) > 0 || event.customFlash.trim().toUpperCase() === 'YES';
  const radiusFee = parseMoney(event.radiusFee);
  const extraHourlyCharge = parseMoney(event.extraHourlyCharge);

  const entryId = event.entryId.trim();
  const historicalBasePayPerArtist = getHistoricalPreScheduleArtistBase(entryId);
  const shouldUseHistoricalFixedArtistBase = historicalBasePayPerArtist > 0;

  const artistModifierBreakdown = hasLivePricingSchedule
    ? {
        customFlash: isArtistAssigned && customFlashEnabled ? scheduleRow!.customFlashArtistBonus : 0,
        radius:
          isArtistAssigned && artistSplitCount > 0
            ? (radiusFee * scheduleRow!.radiusArtistSharePct) / artistSplitCount
            : 0,
        temporaryTattoos: 0,
        extraHourly:
          isArtistAssigned && artistSplitCount > 0
            ? (extraHourlyCharge * scheduleRow!.extraHourlyArtistSharePct) / artistSplitCount
            : 0,
      }
    : {
        customFlash: isArtistAssigned ? totals.effectiveFees.customFlashFee / artistSplitCount : 0,
        radius: 0,
        temporaryTattoos: isArtistAssigned ? totals.effectiveFees.temporaryTattooFee / artistSplitCount : 0,
        extraHourly: isArtistAssigned ? extraHourlyCharge / artistSplitCount : 0,
      };
  let artistModifierPayout =
    artistModifierBreakdown.customFlash +
    artistModifierBreakdown.radius +
    artistModifierBreakdown.temporaryTattoos +
    artistModifierBreakdown.extraHourly;
  let artistBasePayout = isArtistAssigned ? (hasLivePricingSchedule ? scheduleRow!.basePayPerArtist : totals.basePerArtist) : 0;
  let pricingBasedArtistPayout = artistBasePayout + artistModifierPayout;
  let artistPayout = pricingBasedArtistPayout;
  const counterSplitCount = counterNames.length > 0 ? counterNames.length : 1;
  let pricingBasedCounterPayout = isCounterAssigned ? parseMoney(event.counterStaffCharge) / counterSplitCount : 0;
  let counterPayout = pricingBasedCounterPayout;
  let effectiveArtistBasePayout = artistBasePayout;
  let effectiveArtistModifierPayout = artistModifierPayout;
  let effectiveArtistModifierBreakdown = artistModifierBreakdown;
  let payoutSource: PersonPayRow['payoutSource'] = 'framework';
  let payoutSourceTab = '';
  let payoutSourceRowNumber = 0;

  if (APPLY_STAFF_TAB_OVERRIDES_WITHOUT_CUTOFF && payoutOverride && payoutOverride.totalPayout > 0) {
    const overrideArtist = Math.max(0, payoutOverride.artistPayout);
    const overrideCounter = Math.max(0, payoutOverride.counterPayout);
    const overrideTotal = Math.max(0, payoutOverride.totalPayout);

    artistPayout = overrideArtist;
    counterPayout = overrideCounter;
    if (artistPayout + counterPayout <= 0) {
      if (isCounterAssigned && !isArtistAssigned) {
        counterPayout = overrideTotal;
      } else {
        artistPayout = overrideTotal;
      }
    }
    payoutSource = 'staff_tab_override';
    payoutSourceTab = payoutOverride.sourceTab;
    payoutSourceRowNumber = payoutOverride.sourceRowNumber;
  }

  if (shouldUseHistoricalFixedArtistBase && isArtistAssigned) {
    // Early completed events pre-date structured schedule payouts.
    // Show staff-tab historical totals as flat artist base with no modifier split.
    const historicalArtistBase = historicalBasePayPerArtist;
    effectiveArtistBasePayout = historicalArtistBase;
    effectiveArtistModifierBreakdown = {
      customFlash: 0,
      radius: 0,
      temporaryTattoos: 0,
      extraHourly: 0,
    };
    effectiveArtistModifierPayout = 0;
    artistModifierPayout = 0;
    artistBasePayout = historicalArtistBase;
    pricingBasedArtistPayout = historicalArtistBase;

    if (!payoutOverride || payoutOverride.totalPayout <= 0) {
      artistPayout = historicalArtistBase;
    }
  }

  const historicalBreakdownOverride = getHistoricalArtistBreakdownOverride(entryId);
  if (historicalBreakdownOverride && isArtistAssigned) {
    effectiveArtistBasePayout = historicalBreakdownOverride.basePayPerArtist;
    effectiveArtistModifierBreakdown = {
      customFlash: historicalBreakdownOverride.customFlashBonus,
      radius: historicalBreakdownOverride.radiusShare,
      temporaryTattoos: historicalBreakdownOverride.temporaryTattooShare,
      extraHourly: historicalBreakdownOverride.extraHourlyShare,
    };
    effectiveArtistModifierPayout =
      effectiveArtistModifierBreakdown.customFlash +
      effectiveArtistModifierBreakdown.radius +
      effectiveArtistModifierBreakdown.temporaryTattoos +
      effectiveArtistModifierBreakdown.extraHourly;
    artistModifierPayout = effectiveArtistModifierPayout;
    artistBasePayout = effectiveArtistBasePayout;
    pricingBasedArtistPayout = artistBasePayout + artistModifierPayout;

    if (!payoutOverride || payoutOverride.totalPayout <= 0) {
      artistPayout = pricingBasedArtistPayout;
    }
  }

  let role: PersonPayRow['role'] = isArtistAssigned
    ? isCounterAssigned
      ? 'artist+counter'
      : 'artist'
    : 'counter';
  if (payoutOverride && !isArtistAssigned && !isCounterAssigned) {
    role = payoutOverride.counterPayout > 0 ? 'counter' : 'artist';
  }

  return {
    // Keep pricing-schedule breakdown visible as the system model; historical overrides are reflected as adjustment.
    event,
    role,
    isComplete: isEventCompleteForPay(event),
    artistBasePayout: effectiveArtistBasePayout,
    artistModifierPayout: effectiveArtistModifierPayout,
    artistModifierBreakdown: effectiveArtistModifierBreakdown,
    artistPayout,
    counterPayout,
    totalPayout: Math.max(0, artistPayout + counterPayout),
    payoutAdjustmentFromPricing:
      Math.max(0, artistPayout + counterPayout) - (pricingBasedArtistPayout + pricingBasedCounterPayout),
    payoutAdjustmentReason: (() => {
      const adjustment =
        Math.max(0, artistPayout + counterPayout) - (pricingBasedArtistPayout + pricingBasedCounterPayout);
      if (Math.abs(adjustment) <= 0.01) return '';
      const key = `${event.entryId.trim()}::${normalizeNameKey(personName)}`;
      const historicalReason = getHistoricalAdjustmentReasonByEntryPersonKey(key);
      if (historicalReason) return historicalReason;
      return extractPayoutAdjustmentReasonFromNotes(event, personName);
    })(),
    payoutPolicyStatus: (() => {
      const adjustment =
        Math.max(0, artistPayout + counterPayout) - (pricingBasedArtistPayout + pricingBasedCounterPayout);
      if (Math.abs(adjustment) <= 0.01) return 'ok';

      const key = `${event.entryId.trim()}::${normalizeNameKey(personName)}`;
      if (getHistoricalAdjustmentReasonByEntryPersonKey(key) || isPastEventByDate(event)) {
        return 'historical_read_only';
      }

      const noteReason = extractPayoutAdjustmentReasonFromNotes(event, personName);
      if (noteReason) return 'reason_provided';
      return 'reason_required';
    })(),
    pricingBreakdownSource: hasLivePricingSchedule ? 'live_pricing_schedule' : 'fallback_framework',
    payoutSource,
    payoutSourceTab,
    payoutSourceRowNumber,
  };
}

export function parseEventTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const simpleDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (simpleDate) {
    const month = Number.parseInt(simpleDate[1], 10);
    const day = Number.parseInt(simpleDate[2], 10);
    let year = Number.parseInt(simpleDate[3], 10);
    if (year < 100) year += 2000;

    const parsed = new Date(year, month - 1, day).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  const fallback = Date.parse(trimmed);
  return Number.isNaN(fallback) ? null : fallback;
}

export function sortRowsByEventDate(a: PersonPayRow, b: PersonPayRow): number {
  const aDate = parseEventTimestamp(a.event.eventDate);
  const bDate = parseEventTimestamp(b.event.eventDate);

  if (aDate == null && bDate == null) return a.event.clientName.localeCompare(b.event.clientName);
  if (aDate == null) return 1;
  if (bDate == null) return -1;
  return aDate - bDate;
}
