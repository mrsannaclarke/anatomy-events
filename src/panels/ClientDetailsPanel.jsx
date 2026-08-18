import { useMemo, useState } from 'react';
import { Copy, Pencil, Route, Save, Trash2 } from 'lucide-react';

import { EventTypePicker } from '../components/EventTypePicker.jsx';
import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { lookupDrivingDistanceMiles } from '../addressDistance.js';
import { CLIENT_FIELD_CONFIG } from '../constants.js';
import { deleteEventFromSheet, pullEventByEntryId, upsertEventPartialToSheet } from '../sheetClient.js';
import { ARTIST_COUNTS, buildPricingSummaryRows, computePricing, DEFAULT_BASE_ADDRESS, deriveEventHours, formFromEvent, formatDecimal, normalizePricingMethod, parseMoney, pricingMethodToSheetValue, PRICING_METHOD_CORPORATE_MODIFIERS, PRICING_METHOD_STANDARD, PRICING_METHOD_ZERO_WALK_UP } from '../pricingMath.js';

export function ClientDetailsPanel({ event, onSaved, onDeleted }) {
  const [isEditable, setIsEditable] = useState(true);
  const [form, setForm] = useState(() => {
    const raw = event.raw || {};
    return {
      ...Object.fromEntries(CLIENT_FIELD_CONFIG.map(([key]) => [key, raw[key] || ''])),
      setupTime: raw.setupTime || '',
      eventStartTime: raw.eventStartTime || '',
      eventEndTime: raw.eventEndTime || '',
      extraHours: raw.extraHours || '',
      customFlash: raw.customFlash || 'NO',
      temporaryTattoos: raw.temporaryTattoos || 'NO',
      numberOfArtists: String(raw.numberOfArtists || ''),
      pricingMethod: normalizePricingMethod(raw.pricingMethod),
      staffPriceAdjustment: raw.staffPriceAdjustment || '',
      staffPriceAdjustmentReason: raw.staffPriceAdjustmentReason || '',
    };
  });
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpMileage, setIsLookingUpMileage] = useState(false);
  const totals = useMemo(() => computePricing(formFromEvent({ raw: { ...event.raw, ...form } })), [event.raw, form]);
  const summaryRows = useMemo(() => buildPricingSummaryRows(totals), [totals]);
  const totalEventHours = useMemo(() => deriveEventHours(form.eventStartTime, form.eventEndTime), [form.eventStartTime, form.eventEndTime]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function copyClientEmail() {
    const email = String(form.email || '').trim();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setStatus('Client email copied.');
    } catch {
      setStatus('Could not copy the email. Select it and copy it manually.');
    }
  }

  async function lookupMileage() {
    const eventAddress = String(form.eventAddress || '').trim();
    if (!eventAddress) {
      setStatus('Enter event address first.');
      return;
    }

    setIsLookingUpMileage(true);
    setStatus('Looking up driving distance...');
    try {
      const miles = await lookupDrivingDistanceMiles(DEFAULT_BASE_ADDRESS, eventAddress);
      const normalized = Number.isFinite(miles) ? miles : 0;
      updateField('travelDistance', normalized.toFixed(1));
      setStatus(`Travel distance updated to ${normalized.toFixed(1)} miles.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to calculate travel distance.');
    } finally {
      setIsLookingUpMileage(false);
    }
  }

  async function saveClientDetails() {
    setStatus('Saving client details to Sheet...');
    setIsSaving(true);
    try {
      const entryId = event.entryId || event.raw?.entryId;
      if (!entryId) throw new Error('Entry ID is required to save client details.');
      await upsertEventPartialToSheet({
        entryId,
        pricePlan: form.year,
        pricingMethod: pricingMethodToSheetValue(form.pricingMethod),
        clientName: form.clientName,
        eventDate: form.eventDate,
        venueName: form.venueName,
        eventType: form.eventType,
        contactPhone: form.contactPhone,
        contactEmail: form.email,
        eventAddress: form.eventAddress,
        estimatedGuests: form.estGuestCount,
        numberOfArtists: form.numberOfArtists,
        setupTime: form.setupTime,
        eventStartTime: form.eventStartTime,
        eventEndTime: form.eventEndTime,
        bookedHours: formatDecimal(totals.bookedHours),
        travelDistanceMi: form.travelDistance,
        basePrice: formatDecimal(totals.baseTotal),
        counterStaffCharge: formatDecimal(totals.counterStaffCharge),
        tempFacilityLicenseFee: formatDecimal(totals.tempFacilityLicenseFee),
        customFlashFee: formatDecimal(totals.customFlashFee),
        temporaryTattoosFee: formatDecimal(totals.temporaryTattooFee),
        radiusFee: formatDecimal(totals.radiusFee),
        extraHours: formatDecimal(totals.extraHours) || '0',
        extraHourlyCharge: formatDecimal(totals.extraHourlyCharge),
        staffAdjustmentAmount: formatDecimal(parseMoney(form.staffPriceAdjustment)),
        staffAdjustmentReason: form.staffPriceAdjustmentReason,
        totalCharge: formatDecimal(totals.totalCharge),
        depositRequired: formatDecimal(totals.depositRequired),
        balanceDue: formatDecimal(totals.balanceDue),
      });
      const refreshed = entryId ? await pullEventByEntryId(entryId) : null;
      if (refreshed) onSaved(refreshed);
      setStatus('Saved to Sheet.');
      setIsEditable(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save client details.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCurrentEvent() {
    if (!window.confirm(`Delete ${event.clientName} from the Sheet? This cannot be undone.`)) return;
    setStatus('Deleting event from Sheet...');
    try {
      await deleteEventFromSheet(event.raw);
      onDeleted(event);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete event.');
    }
  }

  function renderClientField([key, label]) {
    return (
      <Field key={key} label={label}>
        {key === 'eventType' ? (
          <EventTypePicker value={form[key]} onChange={(value) => updateField(key, value)} disabled={!isEditable} />
        ) : key === 'email' ? (
          <div className="email-copy-control">
            <input disabled={!isEditable} type="email" value={form[key]} onChange={(input) => updateField(key, input.target.value)} />
            <button type="button" className="icon-link-button" onClick={copyClientEmail} disabled={!String(form[key] || '').trim()} aria-label="Copy client email" title="Copy client email">
              <Copy size={17} />
            </button>
          </div>
        ) : (
          <input
            disabled={!isEditable}
            type={key === 'travelDistance' ? 'number' : 'text'}
            min={key === 'travelDistance' ? '0' : undefined}
            step={key === 'travelDistance' ? '0.1' : undefined}
            value={form[key]}
            onChange={(input) => updateField(key, input.target.value)}
          />
        )}
      </Field>
    );
  }

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={isSaving} label="Saving client details to Sheet..." />
      <section className="picker-section">
        <h3>Event Timing & Hours</h3>
        <div className="form-grid">
          {[
            ['setupTime', 'Set-Up Time'],
            ['eventStartTime', 'Event Start Time'],
            ['eventEndTime', 'Event End Time'],
            ['extraHours', 'Extra Hours'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input disabled={!isEditable} value={form[key]} onChange={(input) => updateField(key, input.target.value)} />
            </Field>
          ))}
          <Field label="Total Event Hours">
            <input disabled value={totalEventHours || 'Enter start and end times'} />
          </Field>
        </div>
      </section>

      <section className="picker-section">
        <h3>Client Information</h3>
        <div className="detail-grid editable-grid">
          {CLIENT_FIELD_CONFIG.filter(([key]) => key !== 'eventAddress' && key !== 'eventType' && key !== 'year').map(renderClientField)}
        </div>
        <div className="field-with-action">
          {renderClientField(['eventAddress', 'Event Address'])}
          <button type="button" className="secondary-button" onClick={lookupMileage} disabled={!isEditable || isLookingUpMileage}>
            <Route size={16} />
            {isLookingUpMileage ? 'Looking Up...' : 'Calculate Mileage'}
          </button>
        </div>
      </section>

      <section className="picker-section event-classification-section">
        <h3>Event Classification</h3>
        <div className="form-grid">
          <Field label="Pricing Method">
            <select disabled={!isEditable} value={form.pricingMethod} onChange={(input) => updateField('pricingMethod', input.target.value)}>
              <option value={PRICING_METHOD_STANDARD}>Standard Event</option>
              <option value={PRICING_METHOD_CORPORATE_MODIFIERS}>Corporate / Walk-Up — Client Pays Modifiers Only</option>
              <option value={PRICING_METHOD_ZERO_WALK_UP}>Walk-Up Sales Only — No Artist or Counter Event Pay</option>
            </select>
          </Field>
          {form.pricingMethod === PRICING_METHOD_STANDARD ? (
            <Field label="Type of Event">
              <EventTypePicker value={form.eventType} onChange={(value) => updateField('eventType', value)} disabled={!isEditable} />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="picker-section">
        <h3>Options</h3>
        <div className="form-grid">
          <Field label="Number of Artists">
            <div className="mode-tabs" role="radiogroup" aria-label="Number of artists">
              {ARTIST_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={form.numberOfArtists === count ? 'active' : ''}
                  disabled={!isEditable}
                  onClick={() => updateField('numberOfArtists', count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </Field>
          {[
            ['customFlash', 'Custom Flash?'],
            ['temporaryTattoos', 'Temporary Tattoos?'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <select disabled={!isEditable} value={form[key]} onChange={(input) => updateField(key, input.target.value)}>
                <option>YES</option>
                <option>NO</option>
                <option>TBD</option>
              </select>
            </Field>
          ))}
        </div>
      </section>

      <aside className="pricing-summary full-width">
        <h3>Event Pricing</h3>
        <dl>
          {summaryRows.map((row, index) =>
            row.divider ? (
              <div key={`divider-${index}`} className="summary-divider" />
            ) : (
              <div key={`${row.label}-${index}`} className={row.lead ? 'summary-row-lead' : row.modifier ? 'summary-row-modifier' : row.total ? 'summary-row-total' : ''}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ),
          )}
        </dl>
      </aside>

      <section className="picker-section">
        <h3>Staff Price Adjustment</h3>
        <div className="form-grid">
          <Field label="Staff Price Adjustment (+/-)">
            <input disabled={!isEditable} value={form.staffPriceAdjustment} onChange={(input) => updateField('staffPriceAdjustment', input.target.value)} />
          </Field>
          <Field label="Adjustment Reason">
            <input disabled={!isEditable} value={form.staffPriceAdjustmentReason} onChange={(input) => updateField('staffPriceAdjustmentReason', input.target.value)} />
          </Field>
        </div>
      </section>

      {status ? <p className="save-status">{status}</p> : null}

      <div className="panel-actions panel-actions--bottom">
        <button type="button" className="secondary-button" onClick={() => setIsEditable((value) => !value)}>
          <Pencil size={16} />
          {isEditable ? 'Lock' : 'Edit'}
        </button>
        <button type="button" className="primary-button" onClick={saveClientDetails} disabled={!isEditable || isSaving}>
          <Save size={16} />
          Save
        </button>
        <button type="button" className="danger-button" onClick={deleteCurrentEvent}>
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </section>
  );
}
