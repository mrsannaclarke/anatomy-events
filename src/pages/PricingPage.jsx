import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Route, Save } from 'lucide-react';

import { EventTypePicker } from '../components/EventTypePicker.jsx';
import { DecorativeSprig } from '../components/DecorativeSprig.jsx';
import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { lookupDrivingDistanceMiles } from '../addressDistance.js';
import { pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';
import {
  ARTIST_COUNTS,
  buildPricingClipboardText,
  buildPricingEvent,
  buildPricingSummaryRows,
  computePricing,
  DEFAULT_BASE_ADDRESS,
  formFromEvent,
  formatMoney,
  parseMoney,
  PLAN_YEARS,
  PRICING_METHOD_CORPORATE_MODIFIERS,
  PRICING_METHOD_STANDARD,
  PRICING_SCHEDULE,
} from '../pricingMath.js';

const PRICING_SHEET_PUBLIC_URL_BY_YEAR = {
  2025: 'https://drive.google.com/file/d/1iYJBvR9GSXb_mwZtE4xysuoXpWCMxsFG/view?usp=sharing',
  2026: 'https://drive.google.com/file/d/1RqB2DEuH_AFm1yirkpdhAYQBpCTunSj9/view?usp=drive_link',
};

export function PricingPage({ events, pricingSource, onSaved }) {
  const [selectedId, setSelectedId] = useState('');
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId || event.entryId === selectedId) || null,
    [events, selectedId],
  );
  const [form, setForm] = useState(() => formFromEvent(null));
  const [saveMode, setSaveMode] = useState('new');
  const [newClient, setNewClient] = useState({ clientName: '', contactPhone: '', email: '', eventDate: '', eventType: '' });
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpMileage, setIsLookingUpMileage] = useState(false);

  useEffect(() => {
    if (!selectedEvent) return;
    setForm(formFromEvent(selectedEvent));
    setSaveStatus(`Imported ${selectedEvent.clientName}.`);
  }, [selectedEvent]);

  const totals = useMemo(() => computePricing(form), [form]);
  const summaryRows = useMemo(() => buildPricingSummaryRows(totals), [totals]);
  const pricingSheetUrl = PRICING_SHEET_PUBLIC_URL_BY_YEAR[Number(form.year)] || PRICING_SHEET_PUBLIC_URL_BY_YEAR[2026];
  const planRows = Object.entries(PRICING_SCHEDULE[Number(form.year)] || {}).sort(([left], [right]) => Number(left) - Number(right));

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function lookupMileage() {
    const eventAddress = form.eventAddress.trim();
    if (!eventAddress) {
      setSaveStatus('Enter event address first.');
      return;
    }

    setIsLookingUpMileage(true);
    setSaveStatus('Looking up driving distance...');
    try {
      const miles = await lookupDrivingDistanceMiles(DEFAULT_BASE_ADDRESS, eventAddress);
      const normalized = Number.isFinite(miles) ? miles : 0;
      updateForm('travelDistance', normalized.toFixed(1));
      setSaveStatus(`Travel distance updated to ${normalized.toFixed(1)} miles.`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Unable to calculate travel distance.');
    } finally {
      setIsLookingUpMileage(false);
    }
  }

  async function savePricing() {
    if (saveMode === 'import') {
      if (!selectedEvent) setSaveStatus('Select a Sheet event to import.');
      else setSaveStatus(`Imported ${selectedEvent.clientName}. Switch to Overwrite to save changes.`);
      return;
    }

    if (saveMode === 'overwrite' && !selectedEvent) {
      setSaveStatus('Select a Sheet event before saving.');
      return;
    }

    if (Math.abs(parseMoney(form.staffPriceAdjustment)) > 0 && !form.staffPriceAdjustmentReason.trim()) {
      setSaveStatus('Staff adjustment reason is required.');
      return;
    }

    setIsSaving(true);
    setSaveStatus('Saving pricing to Sheet...');
    try {
      const baseEvent =
        saveMode === 'new'
          ? {
              raw: {
                ...newClient,
                clientName: newClient.clientName || `Hypothetical ${new Date().toLocaleDateString()}`,
                status: 'Open',
                payStatus: 'Open',
              },
            }
          : selectedEvent;
      const eventForSheet = buildPricingEvent(baseEvent, form, totals);
      const saved = await upsertEventToSheet(eventForSheet, {
        totalCharge: totals.totalCharge,
        balanceAfterDeposit: totals.balanceDue,
      });
      onSaved(saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved);
      setSaveStatus(saveMode === 'new' ? `Created ${saved.clientName} in Sheet.` : `Saved ${selectedEvent.clientName} to Sheet.`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Failed to save pricing.');
    } finally {
      setIsSaving(false);
    }
  }

  function copyPricingTable() {
    void navigator.clipboard?.writeText(buildPricingClipboardText(form, totals));
  }

  return (
    <section className="pricing-page">
      <section className="pricing-card">
      <div className="panel-heading">
        <DecorativeSprig />
          <div>
            <h2>Price Plan</h2>
            <p>Select the plan year to view base per-artist pricing.</p>
          </div>
          <div className="panel-actions">
            <span className="status-pill">{pricingSource === 'live' ? 'Pricing Rules live' : 'Offline pricing fallback'}</span>
            <button type="button" className="secondary-button" onClick={() => navigator.clipboard?.writeText(pricingSheetUrl)}>
              <Copy size={16} />
              Share
            </button>
            <a className="secondary-button link-button" href={pricingSheetUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              View
            </a>
          </div>
        </div>
        <div className="mode-tabs" role="radiogroup" aria-label="Price plan year">
          {PLAN_YEARS.map((year) => (
            <button key={year} type="button" className={String(form.year) === String(year) ? 'active' : ''} onClick={() => updateForm('year', year)}>
              {year}
            </button>
          ))}
        </div>
      </section>

      <section className="pricing-card">
        <h3>Plan {form.year}</h3>
        <div className="plan-table" role="table" aria-label={`Plan ${form.year} pricing`}>
          <div className="plan-table__row plan-table__row--head" role="row">
            <span role="columnheader">Artists</span>
            <span role="columnheader">Per Artist</span>
            <span role="columnheader">Base Total</span>
          </div>
          {planRows.map(([artistCount, row]) => (
            <div key={artistCount} className="plan-table__row" role="row">
              <span role="cell">{artistCount}</span>
              <span role="cell">{formatMoney(row.baseRatePerArtist5h)}</span>
              <span role="cell">{formatMoney(row.baseRatePerArtist5h * Number(artistCount))}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-form pricing-form--single pending-scope">
        <PendingOverlay show={isSaving} label="Saving pricing to Sheet..." />
        <div>
          <h2>Pricing Calculator</h2>
          <p className="info-line">Modifiers and radius update automatically based on your inputs.</p>
        </div>

        <Field label="Pricing Method">
          <div className="mode-tabs" role="radiogroup" aria-label="Pricing method">
            <button type="button" className={form.pricingMethod === PRICING_METHOD_STANDARD ? 'active' : ''} onClick={() => updateForm('pricingMethod', PRICING_METHOD_STANDARD)}>
              Standard Event
            </button>
            <button type="button" className={form.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS ? 'active' : ''} onClick={() => updateForm('pricingMethod', PRICING_METHOD_CORPORATE_MODIFIERS)}>
              Corporate / Walk-Up
            </button>
          </div>
          <span className="field-help">
            {form.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS
              ? 'The event client pays modifiers only. Walk-up tattoo sales are not tracked in this app.'
              : 'The event client pays the standard tattoo base plus modifiers.'}
          </span>
        </Field>

        <Field label="Number of Artists">
          <div className="mode-tabs" role="radiogroup" aria-label="Number of artists">
            {ARTIST_COUNTS.map((count) => (
              <button key={count} type="button" className={form.numberOfArtists === count ? 'active' : ''} onClick={() => updateForm('numberOfArtists', count)}>
                {count}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Booked Hours (Base Covers 5)">
          <input type="number" min="0" step="0.25" placeholder="5" value={form.bookedHours} onChange={(event) => updateForm('bookedHours', event.target.value)} />
        </Field>

        <Field label="Custom Flash?">
          <div className="mode-tabs" role="radiogroup" aria-label="Custom flash">
            {['YES', 'NO'].map((option) => (
              <button key={option} type="button" className={form.customFlash === option ? 'active' : ''} onClick={() => updateForm('customFlash', option)}>
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Temporary Tattoos?">
          <div className="mode-tabs" role="radiogroup" aria-label="Temporary tattoos">
            {['YES', 'NO'].map((option) => (
              <button key={option} type="button" className={form.temporaryTattoos === option ? 'active' : ''} onClick={() => updateForm('temporaryTattoos', option)}>
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Event Address">
          <textarea value={form.eventAddress} onChange={(event) => updateForm('eventAddress', event.target.value)} placeholder="Street, City, State ZIP" />
        </Field>

        <button type="button" className="secondary-button pricing-lookup-button" onClick={lookupMileage} disabled={isLookingUpMileage}>
          <Route size={16} />
          {isLookingUpMileage ? 'Looking Up...' : 'Lookup Radius from Address'}
        </button>

        <Field label="Travel Distance (miles)">
          <input type="number" min="0" step="0.1" placeholder="Auto-filled from lookup or enter manually" value={form.travelDistance} onChange={(event) => updateForm('travelDistance', event.target.value)} />
        </Field>

        <div className="form-grid">
          <Field label="Staff Adjustment (+/-)">
            <input inputMode="decimal" placeholder="0.00" value={form.staffPriceAdjustment} onChange={(event) => updateForm('staffPriceAdjustment', event.target.value)} />
          </Field>
          <Field label="Staff Adjustment Reason">
            <input placeholder="Required when adjustment is used" value={form.staffPriceAdjustmentReason} onChange={(event) => updateForm('staffPriceAdjustmentReason', event.target.value)} />
          </Field>
        </div>

        <aside className="pricing-summary pricing-summary--inline">
          <div className="summary-title-row">
            <h3>Calculated Total</h3>
            <button type="button" className="icon-link-button" onClick={copyPricingTable} aria-label="Copy pricing table">
              <Copy size={16} />
            </button>
          </div>
          <strong className="total-number">{formatMoney(totals.totalCharge)}</strong>
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

        <div className="mode-tabs" role="tablist" aria-label="Pricing save mode">
          {['new', 'import', 'overwrite'].map((mode) => (
            <button key={mode} type="button" className={saveMode === mode ? 'active' : ''} onClick={() => setSaveMode(mode)}>
              {mode === 'new' ? 'New Client Entry' : mode === 'import' ? 'Import' : 'Overwrite'}
            </button>
          ))}
        </div>

        {saveMode === 'new' ? (
          <div className="form-grid">
            <Field label="Client Name">
              <input value={newClient.clientName} onChange={(event) => setNewClient((current) => ({ ...current, clientName: event.target.value }))} />
            </Field>
            <Field label="Client Phone">
              <input value={newClient.contactPhone} onChange={(event) => setNewClient((current) => ({ ...current, contactPhone: event.target.value }))} />
            </Field>
            <Field label="Client Email">
              <input value={newClient.email} onChange={(event) => setNewClient((current) => ({ ...current, email: event.target.value }))} />
            </Field>
            <Field label="Date of Event">
              <input placeholder="MM/DD/YYYY" value={newClient.eventDate} onChange={(event) => setNewClient((current) => ({ ...current, eventDate: event.target.value }))} />
            </Field>
            <Field label="Type of Event">
              <EventTypePicker value={newClient.eventType} onChange={(eventType) => setNewClient((current) => ({ ...current, eventType }))} />
            </Field>
          </div>
        ) : (
          <Field label="Existing Client Entry">
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              <option value="">Select existing entry</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.clientName} {event.eventDate ? `- ${event.eventDate}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="panel-actions">
          <button type="button" className="primary-button" onClick={savePricing} disabled={isSaving || (saveMode !== 'new' && !selectedEvent)}>
            <Save size={16} />
            {isSaving ? 'Saving...' : saveMode === 'import' ? 'Import' : saveMode === 'overwrite' ? 'Overwrite' : 'Save'}
          </button>
        </div>
        {saveStatus ? <p className="save-status">{saveStatus}</p> : null}
      </section>
    </section>
  );
}
