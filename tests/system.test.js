import assert from 'node:assert/strict';
import test from 'node:test';

import { sortLedgerEvents } from '../src/activity.js';
import { calculateEventPayout, getPersonPayRow, sortPayoutLedgerCards } from '../src/payoutMath.js';
import {
  PRICING_METHOD_CORPORATE_MODIFIERS,
  buildPricingEvent,
  buildPricingSummaryRows,
  computePricing,
  deriveEventHours,
  formFromEvent,
  timeInputValue,
} from '../src/pricingMath.js';
import { ALLOWED_USERS } from '../shared/authPolicy.js';
import { STAFF_OPTIONS, STATUS_OPTIONS } from '../src/constants.js';
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

test('Consult Booked/Pending is available as an event status', () => {
  assert.ok(STATUS_OPTIONS.includes('Consult Booked/Pending'));
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

test('event feed places confirmed events first and sorts each group soonest-first', () => {
  const events = [
    { clientName: 'Pending', status: 'Post Consult Decision', eventDate: '01/01/2026' },
    { clientName: 'Later', status: 'Contract Signed', eventDate: '06/01/2026' },
    { clientName: 'Sooner', status: 'New', eventDate: '05/01/2026' },
  ];
  assert.deepEqual(sortLedgerEvents(events).map(({ clientName }) => clientName), ['Sooner', 'Later', 'Pending']);
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
