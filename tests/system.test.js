import assert from 'node:assert/strict';
import test from 'node:test';
import { mutationEntryId, sheetMutationInvalidationKeys, sheetReadCacheKey } from '../functions/_sheetCache.js';
import { auditRecord, isAuditAdmin } from '../functions/_audit.js';
import { documentAction, signDocumentJob, verifyDocumentJobSignature } from '../functions/_documentJobs.js';

import { sortLedgerEvents } from '../src/activity.js';
import { isExpiredStaffingOnlyEvent } from '../src/eventVisibility.js';
import { buildPricingPayoutMap, calculateEventPayout, getPersonPayRow, getStaffTypePayPreview, sortPayoutLedgerCards } from '../src/payoutMath.js';
import {
  PRICING_METHOD_CORPORATE_MODIFIERS,
  PRICING_METHOD_ZERO_WALK_UP,
  buildPricingEvent,
  buildPricingSummaryRows,
  computePricing,
  deriveEventHours,
  formFromEvent,
  getDefaultPricingPlanYear,
  timeInputValue,
} from '../src/pricingMath.js';
import { ALLOWED_USERS } from '../shared/authPolicy.js';
import { COUNTER_OPTIONS, STAFF_OPTIONS, STATUS_OPTIONS } from '../src/constants.js';
import { getStaffColor } from '../src/staffColors.js';

function pricingForm(overrides = {}) {
  return {
    year: '2026',
    pricingMethod: 'STANDARD',
    numberOfArtists: '1',
    bookedHours: '5',
    customFlash: 'NO',
    temporaryTattoos: 'NO',
    balanceAddOns: [],
    ...overrides,
  };
}

test('Sheet read cache keys isolate ledgers, pricing, and individual events', () => {
  assert.equal(sheetReadCacheKey({ action: 'events', limit: '1000' }), 'sheet-read:v1:events:1000');
  assert.equal(sheetReadCacheKey({ action: 'pricing' }), 'sheet-read:v1:pricing');
  assert.equal(sheetReadCacheKey({ action: 'event', entryId: '1513' }), 'sheet-read:v1:event:1513');
  assert.equal(sheetReadCacheKey({ action: 'deleteEvent', entryId: '1513' }), '');
});

test('Sheet mutations invalidate the ledger and affected event cache', () => {
  const partial = { action: 'upsertEventPartialJson', eventJson: JSON.stringify({ entryId: '1513', status: 'Deposit Paid' }) };
  assert.equal(mutationEntryId(partial), '1513');
  assert.deepEqual(sheetMutationInvalidationKeys(partial), [
    'sheet-read:v1:events:1000',
    'sheet-read:v1:event:1513',
  ]);
});

test('audit records capture mutation fields without storing uploaded file contents', () => {
  const record = auditRecord({
    action: 'uploadEventArt',
    entryId: '1513',
    fileName: 'flash.pdf',
    mimeType: 'application/pdf',
    fileData: 'sensitive-binary-data',
  }, 'mrs.annaclarke@gmail.com', 200);

  assert.equal(record.entryId, '1513');
  assert.equal(record.metadata.fileName, 'flash.pdf');
  assert.equal(record.metadata.encodedBytes, 21);
  assert.ok(!JSON.stringify(record).includes('sensitive-binary-data'));
  assert.equal(isAuditAdmin('MRS.ANNACLARKE@GMAIL.COM'), true);
  assert.equal(isAuditAdmin('tattoosbytomma@gmail.com'), false);
});

test('document jobs accept supported types and verify signed internal messages', async () => {
  assert.equal(documentAction('contract'), 'generateContract');
  assert.equal(documentAction('tfl'), 'generateTfl');
  assert.equal(documentAction('other'), '');
  const signature = await signDocumentJob('job-123', 'test-secret');
  assert.equal(await verifyDocumentJobSignature('job-123', signature, 'test-secret'), true);
  assert.equal(await verifyDocumentJobSignature('job-456', signature, 'test-secret'), false);
});

test('allowlist contains no duplicate email addresses', () => {
  const emails = ALLOWED_USERS.map(({ email }) => email.toLowerCase());
  assert.equal(new Set(emails).size, emails.length);
});

test('Sienna is an active green artist with both approved login emails', () => {
  assert.ok(STAFF_OPTIONS.includes('Sienna'));
  assert.equal(getStaffColor('Sienna'), '#228b22');
  const siennaEmails = ALLOWED_USERS.filter(({ name }) => name === 'Sienna').map(({ email }) => email).sort();
  assert.deepEqual(siennaEmails, ['siennarosey@gmail.com', 'thundermadetattoos@gmail.com']);
});

test('Jeremy login is allowlisted and mapped to his counter staff identity', () => {
  assert.deepEqual(ALLOWED_USERS.find(({ email }) => email === 'hellasicktattz@gmail.com'), {
    email: 'hellasicktattz@gmail.com',
    name: 'Jeremy',
  });
  assert.ok(COUNTER_OPTIONS.includes('Jeremy'));
});

test('Consult Booked/Pending is available as an event status', () => {
  assert.ok(STATUS_OPTIONS.includes('Consult Booked/Pending'));
});

test('staff choices are alphabetical and Jeremy is a counter option', () => {
  assert.deepEqual(STAFF_OPTIONS, [...STAFF_OPTIONS].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  const counterNames = COUNTER_OPTIONS.filter((name) => !['None', 'Other'].includes(name));
  assert.deepEqual(counterNames, [...counterNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  assert.ok(COUNTER_OPTIONS.includes('Jeremy'));
});

test('event times parse 12-hour, 24-hour, and overnight ranges', () => {
  assert.equal(timeInputValue('5:30 PM'), '17:30');
  assert.equal(timeInputValue('08:15'), '08:15');
  assert.equal(deriveEventHours('5:00 PM', '10:30 PM'), '5.5');
  assert.equal(deriveEventHours('22:00', '02:00'), '4');
});

test('pricing event preserves start/end time and derives booked hours on import', () => {
  const imported = formFromEvent({ raw: { year: '2026', numberOfArtists: '2', eventStartTime: '5:00 PM', eventEndTime: '10:30 PM' } });
  assert.equal(imported.eventStartTime, '17:00');
  assert.equal(imported.eventEndTime, '22:30');
  assert.equal(imported.bookedHours, '5.5');
  const totals = computePricing(imported);
  const saved = buildPricingEvent({}, imported, totals);
  assert.equal(saved.eventStartTime, '17:00');
  assert.equal(saved.eventEndTime, '22:30');
});

test('pricing overwrite preserves the selected normalized Entry ID', () => {
  const form = pricingForm();
  const totals = computePricing(form);
  const saved = buildPricingEvent({ entryId: '6135', raw: { clientName: 'Bret Herzog' } }, form, totals);
  assert.equal(saved.entryId, '6135');
  assert.equal(saved.clientName, 'Bret Herzog');
});

test('pricing cutoff defaults only newly created events to the 2027 plan', () => {
  assert.equal(getDefaultPricingPlanYear(null, new Date('2026-09-01T23:59:59-07:00')), '2026');
  assert.equal(getDefaultPricingPlanYear(null, new Date('2026-09-02T00:00:00-07:00')), '2027');
  assert.equal(formFromEvent({ raw: { createdAt: '2026-09-01T18:00:00-07:00' } }, new Date('2027-01-01')).year, '2026');
  assert.equal(formFromEvent({ raw: { createdAt: '2026-09-02T00:01:00-07:00' } }, new Date('2026-09-01')).year, '2027');
  assert.equal(formFromEvent({ raw: { year: '2026', createdAt: '2027-01-01T00:00:00-08:00' } }).year, '2026');
});

test('2027 standard payouts use a flat $1300 artist base and updated modifier shares', () => {
  const pricingPayoutMap = buildPricingPayoutMap([{
    'Plan Year': 2027,
    Artists: 2,
    'Artist Base Payout Per Artist': 1300,
    'Radius Artist %': 85,
    'Extra Hourly Artist %': 90,
    'Custom Flash Artist %': 0,
    'Temporary Tattoos Artist %': 0,
  }]);
  const event = {
    raw: {
      year: '2027', pricingMethod: 'Standard', numberOfArtists: '2', bookedHours: '6', extraHours: '1',
      artistNames: 'Agnes, Sienna', counterNames: 'Jeremy', counterStaffCharge: '300',
      customFlash: 'YES', customFlashFee: '270', temporaryTattoos: 'YES', temporaryTattooFee: '150',
      radiusFee: '100', extraHourlyCharge: '500', totalCharge: '4520',
    },
  };
  const artist = getPersonPayRow(event, 'Agnes', pricingPayoutMap);
  assert.equal(artist.artistBasePayout, 1300);
  assert.equal(artist.artistModifierBreakdown.customFlash, 0);
  assert.equal(artist.artistModifierBreakdown.temporaryTattoos, 0);
  assert.equal(artist.artistModifierBreakdown.radius, 42.5);
  assert.equal(artist.artistModifierBreakdown.extraHourly, 225);
  assert.equal(artist.totalPayout, 1567.5);
  assert.equal(getPersonPayRow(event, 'Jeremy', pricingPayoutMap).counterPayout, 300);
});

test('2027 corporate events do not receive the standard $1300 artist base', () => {
  const pricingPayoutMap = buildPricingPayoutMap([{
    'Plan Year': 2027,
    Artists: 1,
    'Artist Base Payout Per Artist': 1300,
    'Radius Artist %': 85,
    'Extra Hourly Artist %': 90,
    'Custom Flash Artist %': 0,
    'Temporary Tattoos Artist %': 0,
  }]);
  const event = {
    raw: {
      year: '2027', pricingMethod: 'Corporate / Walk-Up', numberOfArtists: '1', bookedHours: '5',
      artistNames: 'Agnes', counterNames: 'Jeremy', customFlash: 'YES', customFlashFee: '220',
      counterStaffCharge: '150', totalCharge: '870',
    },
  };
  assert.equal(getPersonPayRow(event, 'Agnes', pricingPayoutMap).totalPayout, 0);
});

test('standard pricing prorates under five hours and uses a deposit', () => {
  const totals = computePricing(pricingForm({ bookedHours: '4' }));
  assert.equal(totals.baseTotal, 1280);
  assert.equal(totals.counterStaffCharge, 120);
  assert.equal(totals.tempFacilityLicenseFee, 200);
  assert.equal(totals.totalCharge, 1600);
  assert.equal(totals.depositRequired, 480);
});

test('pricing breakdown lists artist, counter, and license charges separately', () => {
  const rows = buildPricingSummaryRows(computePricing(pricingForm()));
  assert.equal(rows.find(({ label }) => label?.startsWith('Artist Price'))?.value, '$1,600.00');
  assert.equal(rows.find(({ label }) => label?.startsWith('Counter Staff'))?.value, '$150.00');
  assert.equal(rows.find(({ label }) => label === 'Temporary Facility License')?.value, '$200.00');
});

test('corporate pricing has a five-hour minimum, $300 admin fee, and no deposit', () => {
  const totals = computePricing(pricingForm({ pricingMethod: PRICING_METHOD_CORPORATE_MODIFIERS, bookedHours: '4' }));
  assert.equal(totals.billableHours, 5);
  assert.equal(totals.baseTotal, 0);
  assert.equal(totals.counterStaffCharge, 150);
  assert.equal(totals.tempFacilityLicenseFee, 200);
  assert.equal(totals.corporateAdminFee, 300);
  assert.equal(totals.totalCharge, 650);
  assert.equal(totals.depositRequired, 0);
  assert.equal(totals.balanceDue, 650);
});

test('walk-up sales only pricing saves an explicit method and produces no event pay', () => {
  const form = pricingForm({
    pricingMethod: PRICING_METHOD_ZERO_WALK_UP,
    customFlash: 'YES',
    temporaryTattoos: 'YES',
    balanceAddOns: [{ type: 'Other', amount: '500' }],
  });
  const totals = computePricing(form);
  assert.equal(totals.totalCharge, 0);
  assert.equal(totals.counterStaffCharge, 0);
  assert.equal(totals.tempFacilityLicenseFee, 0);
  assert.equal(totals.customFlashFee, 0);
  assert.equal(totals.temporaryTattooFee, 0);
  assert.equal(totals.balanceAddOnsTotal, 0);
  assert.equal(totals.depositRequired, 0);
  assert.equal(totals.balanceDue, 0);
  const saved = buildPricingEvent({}, form, totals);
  assert.equal(saved.pricingMethod, 'Walk-Up Sales Only');
  assert.equal(saved.totalCharge, '');
  const event = {
    raw: {
      ...saved,
      status: 'Event Complete',
      artistNames: 'Agnes',
      counterNames: 'Jeremy',
      counterStaffCharge: '150',
      totalCharge: '1850',
    },
  };
  assert.equal(getPersonPayRow(event, 'Agnes'), null);
  assert.equal(getPersonPayRow(event, 'Jeremy'), null);
  const payout = calculateEventPayout(event, ['Agnes', 'Jeremy']);
  assert.equal(payout.gross, 0);
  assert.equal(payout.lines.length, 0);
});

test('walk-up sales only event remains visible on its event day and expires the following day', () => {
  const event = { raw: { eventDate: '09/13/2026', pricingMethod: '$0 Walk-Up Event' } };
  assert.equal(isExpiredStaffingOnlyEvent(event, new Date(2026, 8, 13, 23, 59, 59)), false);
  assert.equal(isExpiredStaffingOnlyEvent(event, new Date(2026, 8, 14, 0, 0, 0)), true);
  assert.equal(isExpiredStaffingOnlyEvent({ raw: { ...event.raw, pricingMethod: 'Standard' } }, new Date(2026, 8, 14)), false);
  assert.equal(isExpiredStaffingOnlyEvent({ raw: { eventDate: 'not-a-date', pricingMethod: '$0 Walk-Up Event' } }, new Date(2026, 8, 14)), false);
});

test('standard discount protects licensing and counter while reducing artist payout first', () => {
  const event = {
    raw: {
      entryId: 'discount-standard', status: 'Event Complete', year: '2026', pricingMethod: 'Standard',
      numberOfArtists: '1', bookedHours: '5', artistNames: 'Agnes', counterNames: 'Jeremy',
      staffPriceAdjustment: '-100', totalCharge: '1850',
    },
  };
  assert.equal(getPersonPayRow(event, 'Agnes').totalPayout, 1500);
  assert.equal(getPersonPayRow(event, 'Jeremy').totalPayout, 150);
  const payout = calculateEventPayout(event, ['Agnes', 'Jeremy']);
  assert.equal(payout.shopTotal, 200);
  assert.equal(payout.remainder, 0);
});

test('staffing payout preview uses the shared payout engine for artist and split counter pay', () => {
  const event = {
    raw: {
      year: '2026', pricingMethod: 'Standard', numberOfArtists: '4', bookedHours: '5',
      customFlash: 'YES', customFlashFee: '400', counterStaffCharge: '600',
      tempFacilityLicenseFee: '200', staffPriceAdjustment: '-200', totalCharge: '6200',
    },
  };
  const pricingPayoutMap = { '2026::4': { customFlashArtistSharePct: 0.5 } };
  const preview = getStaffTypePayPreview(event, 4, 2, pricingPayoutMap);
  assert.equal(preview.artistEach, 1350);
  assert.equal(preview.artistTotal, 5400);
  assert.equal(preview.counterEach, 300);
  assert.equal(preview.counterTotal, 600);

  const singleCounterPreview = getStaffTypePayPreview(event, 4, 1, pricingPayoutMap);
  assert.equal(singleCounterPreview.counterEach, 600);
  assert.equal(singleCounterPreview.counterTotal, 600);
});

test('corporate discount consumes admin, shop share, artists, then counter while preserving $200 license', () => {
  const pricingPayoutMap = { '2026::1': { customFlashArtistSharePct: 0.5 } };
  const event = {
    raw: {
      entryId: 'discount-corporate', status: 'Event Complete', year: '2026', pricingMethod: 'Corporate / Walk-Up',
      numberOfArtists: '1', bookedHours: '5', artistNames: 'Agnes', counterNames: 'Jeremy', customFlash: 'YES',
      customFlashFee: '220', staffPriceAdjustment: '-650', totalCharge: '220',
    },
  };
  assert.equal(getPersonPayRow(event, 'Agnes', pricingPayoutMap).totalPayout, 0);
  assert.equal(getPersonPayRow(event, 'Jeremy', pricingPayoutMap).totalPayout, 20);
  const payout = calculateEventPayout(event, ['Agnes', 'Jeremy'], pricingPayoutMap);
  assert.equal(payout.adjustmentWaterfall.corporateAdminReduction, 300);
  assert.equal(payout.adjustmentWaterfall.protectedLicense, 200);
  assert.equal(payout.shopTotal, 200);
  assert.equal(payout.remainder, 0);
});

test('event feed places confirmed events first and sorts each group soonest-first', () => {
  const events = [
    { clientName: 'Pending', status: 'Post Consult Decision', eventDate: '01/01/2026' },
    { clientName: 'Later', status: 'Contract Signed', eventDate: '06/01/2026' },
    { clientName: 'Sooner', status: 'New', eventDate: '05/01/2026' },
    { clientName: 'Same Day Later', status: 'New', eventDate: '05/01/2026', raw: { eventDate: '05/01/2026', eventStartTime: '8:00 PM' } },
    { clientName: 'Same Day Sooner', status: 'New', eventDate: '05/01/2026', raw: { eventDate: '05/01/2026', eventStartTime: '2:00 PM' } },
  ];
  assert.deepEqual(sortLedgerEvents(events).map(({ clientName }) => clientName), ['Sooner', 'Same Day Sooner', 'Same Day Later', 'Later', 'Pending']);
});

test('event feed sorts same-day events by start time within the same status group', () => {
  const events = [
    { clientName: 'Justine', status: 'New', eventDate: '08/29/2026', raw: { eventDate: '08/29/2026', eventStartTime: '8:00 PM' } },
    { clientName: 'Tara', status: 'New', eventDate: '08/29/2026', raw: { eventDate: '08/29/2026', eventStartTime: '5:00 PM' } },
  ];
  assert.deepEqual(sortLedgerEvents(events).map(({ clientName }) => clientName), ['Tara', 'Justine']);
});

test('payout ledger sorts newest completed event first', () => {
  const cards = [
    { event: { clientName: 'Old', eventDate: '01/01/2026' } },
    { event: { clientName: 'New', eventDate: '08/01/2026' } },
  ];
  assert.deepEqual(cards.sort(sortPayoutLedgerCards).map(({ event }) => event.clientName), ['New', 'Old']);
});

test('OPB one-time payout exception and shop remainder reconcile exactly', () => {
  const event = {
    clientName: 'OPB Events',
    raw: {
      entryId: '4181',
      status: 'Event Complete',
      totalCharge: '2170',
      artistNames: 'Agnes, Ms. Mikki, Mav Mess',
      counterNames: 'Jeremy',
    },
  };
  assert.equal(getPersonPayRow(event, 'Agnes').totalPayout, 160);
  assert.equal(getPersonPayRow(event, 'Jeremy').totalPayout, 450);
  assert.equal(getPersonPayRow(event, 'Ms. Mikki').totalPayout, 0);
  assert.equal(getPersonPayRow(event, 'Mav Mess').totalPayout, 0);
  const payout = calculateEventPayout(event, ['Agnes', 'Jeremy', 'Ms. Mikki', 'Mav Mess']);
  assert.equal(payout.staffPaid, 610);
  assert.equal(payout.shopTotal, 1560);
  assert.equal(payout.remainder, 0);
});
