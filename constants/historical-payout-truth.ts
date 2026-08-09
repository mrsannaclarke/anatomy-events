export type HistoricalArtistBreakdownOverride = {
  basePayPerArtist: number;
  customFlashBonus: number;
  radiusShare: number;
  temporaryTattooShare: number;
  extraHourlyShare: number;
  licensingSplitPerArtist?: number;
};

export type HistoricalPayoutTruthRecord = {
  entryId: string;
  clientName: string;
  notes: string[];
  preScheduleFlatArtistBasePayPerArtist?: number;
  artistBreakdownOverride?: HistoricalArtistBreakdownOverride;
  forceShopCustomFlashToFullFee?: boolean;
  adjustmentReasonByPersonKey?: Record<string, string>;
};

export const HISTORICAL_PAYOUT_TRUTH_VERSION = '2026-04-15';

// Canonical historical payout truth used by app payout rendering and audit comparison workflows.
export const HISTORICAL_PAYOUT_TRUTH_BY_ENTRY_ID: Record<string, HistoricalPayoutTruthRecord> = {
  '1': {
    entryId: '1',
    clientName: 'Jessie Smith',
    notes: [
      'Pre-structured schedule historical event.',
      'Artist flat base payout is $600 each.',
    ],
    preScheduleFlatArtistBasePayPerArtist: 600,
  },
  '2': {
    entryId: '2',
    clientName: 'Justin and Amelia',
    notes: [
      'Pre-structured schedule historical event.',
      'Artist flat base payout is $1,000 each.',
      'Full custom flash fee is treated as shop-side for completed payout shop breakdown.',
    ],
    preScheduleFlatArtistBasePayPerArtist: 1000,
    forceShopCustomFlashToFullFee: true,
  },
  '1513': {
    entryId: '1513',
    clientName: 'Amelia Bambam',
    notes: [
      'Historical one-off licensing split.',
      'Per-artist breakdown: $1,000 base + $50 custom flash + $300 licensing split.',
    ],
    artistBreakdownOverride: {
      basePayPerArtist: 1000,
      customFlashBonus: 50,
      radiusShare: 0,
      temporaryTattooShare: 0,
      extraHourlyShare: 0,
      licensingSplitPerArtist: 300,
    },
    adjustmentReasonByPersonKey: {
      tomma: 'Licensing optional fee split (historical exception).',
      shy: 'Licensing optional fee split (historical exception).',
    },
  },
};

export function getHistoricalPayoutTruth(entryIdRaw: string): HistoricalPayoutTruthRecord | undefined {
  const entryId = String(entryIdRaw || '').trim();
  if (!entryId) return undefined;
  return HISTORICAL_PAYOUT_TRUTH_BY_ENTRY_ID[entryId];
}

export function getHistoricalPreScheduleArtistBase(entryIdRaw: string): number {
  return getHistoricalPayoutTruth(entryIdRaw)?.preScheduleFlatArtistBasePayPerArtist || 0;
}

export function getHistoricalArtistBreakdownOverride(
  entryIdRaw: string,
): HistoricalArtistBreakdownOverride | undefined {
  return getHistoricalPayoutTruth(entryIdRaw)?.artistBreakdownOverride;
}

export function getHistoricalAdjustmentReasonByEntryPersonKey(entryPersonKeyRaw: string): string {
  const entryPersonKey = String(entryPersonKeyRaw || '').trim().toLowerCase();
  if (!entryPersonKey) return '';
  const [entryId, personKey] = entryPersonKey.split('::');
  if (!entryId || !personKey) return '';
  const reasonMap = getHistoricalPayoutTruth(entryId)?.adjustmentReasonByPersonKey;
  return reasonMap?.[personKey] || '';
}

export function isHistoricalForceShopCustomFlashToFullFee(entryIdRaw: string): boolean {
  return Boolean(getHistoricalPayoutTruth(entryIdRaw)?.forceShopCustomFlashToFullFee);
}

