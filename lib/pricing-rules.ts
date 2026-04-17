import { getPricingScheduleRow, type PricingScheduleRow } from '@/constants/pricing-schedule';

export interface AutoPricingInputs {
  year: number;
  artistCount: number;
  travelDistanceMiles: number;
  customFlash: string;
  customFlashFeeRaw: string;
  temporaryTattoos: string;
  temporaryTattooFeeRaw: string;
  tempFacilityLicenseFeeRaw: string;
  radiusFeeRaw: string;
}

function normalizeFlag(value: string): string {
  return value.trim().toUpperCase();
}

function hasInput(value: string): boolean {
  return value.trim().length > 0;
}

export function getAutoRadiusFee(_year: number, miles: number): number {
  if (!Number.isFinite(miles) || miles <= 20) return 0;
  return Math.ceil((miles - 20) / 20) * 100;
}

export interface AutoPricingResult {
  radiusFee: number;
  customFlashFee: number;
  temporaryTattooFee: number;
  tempFacilityLicenseFee: number;
  radiusFeeSource: 'manual' | 'auto';
  customFlashSource: 'manual' | 'auto' | 'none';
  temporaryTattooSource: 'manual' | 'auto' | 'none';
  tflFeeSource: 'manual' | 'auto';
}

function computeRadiusFeeFromSchedule(row: Readonly<PricingScheduleRow> | null, miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  if (!row) return getAutoRadiusFee(0, miles);

  const freeMiles = Number.isFinite(row.freeRadiusMiles) ? row.freeRadiusMiles : 0;
  const stepMiles = Number.isFinite(row.radiusStepMiles) ? row.radiusStepMiles : 0;
  const stepFee = Number.isFinite(row.radiusStepFee) ? row.radiusStepFee : 0;
  if (stepMiles <= 0 || stepFee <= 0) return 0;
  if (miles <= freeMiles) return 0;
  return Math.ceil((miles - freeMiles) / stepMiles) * stepFee;
}

export function computeAutoPricing(inputs: AutoPricingInputs, parseMoney: (value: string) => number): AutoPricingResult {
  const scheduleRow = getPricingScheduleRow(inputs.year, inputs.artistCount);
  const manualRadius = parseMoney(inputs.radiusFeeRaw);
  const radiusFee = hasInput(inputs.radiusFeeRaw)
    ? manualRadius
    : computeRadiusFeeFromSchedule(scheduleRow, inputs.travelDistanceMiles);
  const radiusFeeSource = hasInput(inputs.radiusFeeRaw) ? 'manual' : 'auto';

  const customFlashEnabled = normalizeFlag(inputs.customFlash) === 'YES';
  const customFlashDefault =
    scheduleRow && Number.isFinite(scheduleRow.customFlashFeeEvent)
      ? scheduleRow.customFlashFeeEvent
      : inputs.year >= 2026
      ? 270
      : 200;
  const customFlashManual = parseMoney(inputs.customFlashFeeRaw);
  const customFlashFee = customFlashEnabled
    ? hasInput(inputs.customFlashFeeRaw)
      ? customFlashManual
      : customFlashDefault
    : 0;
  const customFlashSource = customFlashEnabled
    ? hasInput(inputs.customFlashFeeRaw)
      ? 'manual'
      : 'auto'
    : 'none';

  const temporaryTattoosEnabled = normalizeFlag(inputs.temporaryTattoos) === 'YES';
  const temporaryTattooDefault =
    scheduleRow && Number.isFinite(scheduleRow.tempTattoosFee) ? scheduleRow.tempTattoosFee : 150;
  const temporaryTattooManual = parseMoney(inputs.temporaryTattooFeeRaw);
  const temporaryTattooFee = temporaryTattoosEnabled
    ? hasInput(inputs.temporaryTattooFeeRaw)
      ? temporaryTattooManual
      : temporaryTattooDefault
    : 0;
  const temporaryTattooSource = temporaryTattoosEnabled
    ? hasInput(inputs.temporaryTattooFeeRaw)
      ? 'manual'
      : 'auto'
    : 'none';

  const tempFacilityLicenseFee = hasInput(inputs.tempFacilityLicenseFeeRaw)
    ? parseMoney(inputs.tempFacilityLicenseFeeRaw)
    : scheduleRow
    ? Math.max(0, scheduleRow.facilityCityFee + scheduleRow.facilityAdminFee)
    : 200;
  const tflFeeSource = hasInput(inputs.tempFacilityLicenseFeeRaw) ? 'manual' : 'auto';

  return {
    radiusFee,
    customFlashFee,
    temporaryTattooFee,
    tempFacilityLicenseFee,
    radiusFeeSource,
    customFlashSource,
    temporaryTattooSource,
    tflFeeSource,
  };
}
