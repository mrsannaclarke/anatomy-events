export interface PricingScheduleRow {
  baseRatePerArtist5h: number;
  counterPerArtist: number;
  customFlashFeeEvent: number;
  extraHourlyPerArtist: number;
  tempTattoosFee: number;
  facilityCityFee: number;
  facilityAdminFee: number;
  depositRatePct: number;
  freeRadiusMiles: number;
  radiusStepMiles: number;
  radiusStepFee: number;
}

export const PRICING_SCHEDULE_ROWS_BY_YEAR: Readonly<
  Record<number, Readonly<Record<number, Readonly<PricingScheduleRow>>>>
> = {
  // Snapshot locked from live Google Sheet on 2026-04-15.
  2025: {
    1: {
      baseRatePerArtist5h: 1300,
      counterPerArtist: 150,
      customFlashFeeEvent: 200,
      extraHourlyPerArtist: 225,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    2: {
      baseRatePerArtist5h: 1200,
      counterPerArtist: 150,
      customFlashFeeEvent: 250,
      extraHourlyPerArtist: 225,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    3: {
      // Use exact split so 3-artist base total is $3,500.00 (avoid $0.01 float drift).
      baseRatePerArtist5h: 3500 / 3,
      counterPerArtist: 150,
      customFlashFeeEvent: 300,
      extraHourlyPerArtist: 225,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    4: {
      baseRatePerArtist5h: 1150,
      counterPerArtist: 150,
      customFlashFeeEvent: 350,
      extraHourlyPerArtist: 225,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
  },
  2026: {
    1: {
      baseRatePerArtist5h: 1600,
      counterPerArtist: 150,
      customFlashFeeEvent: 220,
      extraHourlyPerArtist: 250,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    2: {
      baseRatePerArtist5h: 1500,
      counterPerArtist: 150,
      customFlashFeeEvent: 270,
      extraHourlyPerArtist: 250,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    3: {
      baseRatePerArtist5h: 1400,
      counterPerArtist: 150,
      customFlashFeeEvent: 320,
      extraHourlyPerArtist: 250,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
    4: {
      baseRatePerArtist5h: 1300,
      counterPerArtist: 150,
      customFlashFeeEvent: 400,
      extraHourlyPerArtist: 250,
      tempTattoosFee: 150,
      facilityCityFee: 150,
      facilityAdminFee: 50,
      depositRatePct: 30,
      freeRadiusMiles: 20,
      radiusStepMiles: 20,
      radiusStepFee: 100,
    },
  },
};

export const PRICING_BASE_BY_YEAR: Readonly<Record<number, Readonly<Record<number, number>>>> =
  Object.fromEntries(
    Object.entries(PRICING_SCHEDULE_ROWS_BY_YEAR).map(([year, rowsByArtist]) => [
      Number.parseInt(year, 10),
      Object.fromEntries(
        Object.entries(rowsByArtist).map(([artistCount, row]) => [
          Number.parseInt(artistCount, 10),
          row.baseRatePerArtist5h,
        ]),
      ),
    ]),
  );

export function getPricingScheduleRow(year: number, artistCount: number): Readonly<PricingScheduleRow> | null {
  if (!Number.isFinite(year) || !Number.isFinite(artistCount) || artistCount <= 0) return null;
  return PRICING_SCHEDULE_ROWS_BY_YEAR[year]?.[artistCount] ?? null;
}

export function parsePricingPlanYear(value: string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : 0;
  }

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const direct = Number.parseInt(trimmed, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const match = trimmed.match(/\b(20\d{2})\b/);
  if (!match) return 0;
  return Number.parseInt(match[1], 10);
}

export function getCounterStaffChargeFromSchedule(year: number, artistCount: number): number {
  const row = getPricingScheduleRow(year, artistCount);
  if (!row) return 0;
  return Math.max(0, row.counterPerArtist * artistCount);
}
