import { computeEventTotals, formatCurrency, parseMoney } from '@/lib/event-math';
import type { EventRecord } from '@/types/events';

function splitArtists(artistNames: string): string[] {
  return artistNames
    .split(',')
    .map((name) => name.trim())
    .filter((name) => Boolean(name));
}

export function buildContractPlaceholders(event: EventRecord): Record<string, string> {
  const totals = computeEventTotals(event);
  const money = (value: string) => formatCurrency(parseMoney(value));

  return {
    '{{Client Name}}': event.clientName,
    '{{Phone}}': event.contactPhone,
    '{{Email}}': event.email,
    '{{Type of Event}}': event.eventType,
    '{{Venue Name}}': event.venueName,
    '{{Date of Event}}': event.eventDate,
    '{{Event Address}}': event.eventAddress,
    '{{Estimated Guests}}': event.estGuestCount,
    '{{Number of Artists}}': event.numberOfArtists,
    '{{Artist Names}}': event.artistNames,
    '{{Counter Staff Charge}}': money(event.counterStaffCharge),
    '{{Counter Names}}': event.counterNames,
    '{{Temporary Facility License Fee}}':
      totals.artistCount > 0 ? formatCurrency(totals.effectiveFees.tempFacilityLicenseFee) : '',
    '{{Custom Flash}}': event.customFlash,
    '{{Custom Flash Fee}}': formatCurrency(totals.effectiveFees.customFlashFee),
    '{{Temporary Tattoos}}': event.temporaryTattoos,
    '{{Temporary Tattoos Fee}}': formatCurrency(totals.effectiveFees.temporaryTattooFee),
    '{{Travel Distance (mi)}}': event.travelDistance,
    '{{Radius Fee}}': formatCurrency(totals.effectiveFees.radiusFee),
    '{{Setup Time}}': event.setupTime,
    '{{Start Time}}': event.eventStartTime,
    '{{End Time}}': event.eventEndTime,
    '{{Extra Hours}}': event.extraHours,
    '{{Extra Hourly Charge}}': money(event.extraHourlyCharge),
    '{{Optional Fee}}': money(event.optionalFee),
    '{{Total Charge}}': formatCurrency(totals.computedTotal),
    '{{Deposit Required}}': formatCurrency(totals.depositRequired),
    '{{Balance After Deposit}}': formatCurrency(totals.balanceAfterDeposit),
    '{{Deposit Due Date}}': event.depositDueDate,
    '{{Balance Due Date}}': event.balanceDueDate,
    '{{Pay Status}}': event.payStatus,
    '{{Contract Notes}}': event.contractNotes,
    '{{Staff Price Adjustment}}': money(event.staffPriceAdjustment),
    '{{Credit Applied}}': money(event.creditApplied),
    '{{Staff Adjustment Reason}}': event.staffPriceAdjustmentReason,
    '{{ED_M}}': event.counterStaffCharge,
    '{{ED_Y}}': event.extraHours,
    '{{ED_Z}}': event.extraHourlyCharge,
  };
}

export function buildTflPlaceholders(event: EventRecord): Record<string, string> {
  const artists = splitArtists(event.artistNames);
  const generated = new Date().toLocaleDateString('en-US');

  const placeholders: Record<string, string> = {
    '{{Client Name}}': event.clientName,
    '{{Physical Address}}': event.eventAddress,
    '{{Date of Event}}': event.eventDate,
    '{{Venue Name}}': event.venueName,
    '{{Type of Event}}': event.eventType,
    '{{Generated Date}}': generated,
    '{{generated date}}': generated,
  };

  for (let i = 1; i <= 19; i += 1) {
    placeholders[`{{a${i}}}`] = artists[i - 1] ?? '';
    placeholders[`{{a${i}l}}`] = '';
  }

  return placeholders;
}
