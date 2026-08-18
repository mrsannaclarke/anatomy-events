import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus, Route, Save, Trash2 } from 'lucide-react';

import { EventTypePicker } from '../components/EventTypePicker.jsx';
import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { lookupDrivingDistanceMiles } from '../addressDistance.js';
import { generateEventFile, pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';
import {
  ARTIST_COUNTS,
  buildPricingClipboardText,
  buildPricingEvent,
  buildPricingSummaryRows,
  computePricing,
  DEFAULT_BASE_ADDRESS,
  deriveEventHours,
  formFromEvent,
  formatMoney,
  parseMoney,
  PRICING_METHOD_CORPORATE_MODIFIERS,
  PRICING_METHOD_STANDARD,
  PRICING_METHOD_ZERO_WALK_UP,
  PRICING_SCHEDULE,
} from '../pricingMath.js';

const PRICING_SHEET_PUBLIC_URL_BY_YEAR = {
  2025: 'https://drive.google.com/file/d/1iYJBvR9GSXb_mwZtE4xysuoXpWCMxsFG/view?usp=sharing',
  2026: 'https://drive.google.com/file/d/1RqB2DEuH_AFm1yirkpdhAYQBpCTunSj9/view?usp=drive_link',
};

const BALANCE_ADD_ON_TYPES = ['Custom Flash', 'Temporary Tattoos', 'Extra Hours', 'Radius / Travel', 'Counter Staff', 'Licensing', 'Other'];
const DEPOSIT_PAID_STATUSES = new Set(['deposit paid', 'temporary license submitted', 'temporary license received', 'awaiting follow up', 'needing changes', 'balance invoice sent', 'invoice paid in full', 'event complete', 'event complete balance late']);

function normalizedEventStatus(event) {
  return String(event?.status || event?.raw?.status || event?.raw?.payStatus || '').trim().toLowerCase();
}

function eventDateTimestamp(event) {
  const value = String(event?.raw?.eventDate || event?.eventDate || '').trim();
  const dateParts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateParts) return new Date(Number(dateParts[3]), Number(dateParts[1]) - 1, Number(dateParts[2])).getTime();

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sortNewestEventFirst(left, right) {
  return eventDateTimestamp(right) - eventDateTimestamp(left)
    || left.clientName.localeCompare(right.clientName, undefined, { sensitivity: 'base' });
}

export function PricingPage({ events, viewer, onSaved }) {
  const [selectedId, setSelectedId] = useState('');
  const [saveMode, setSaveMode] = useState('new');
  const importableEvents = useMemo(
    () => events.filter((event) => normalizedEventStatus(event) !== 'event complete').sort(sortNewestEventFirst),
    [events],
  );
  const selectableEvents = saveMode === 'import' ? importableEvents : events;
  const selectedEvent = useMemo(
    () => selectableEvents.find((event) => event.id === selectedId || event.entryId === selectedId) || null,
    [selectableEvents, selectedId],
  );
  const [form, setForm] = useState(() => formFromEvent(null));
  const [newClient, setNewClient] = useState({ clientName: '', contactPhone: '', email: '', eventDate: '', eventType: '', venueName: '' });
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpMileage, setIsLookingUpMileage] = useState(false);
  const [addOnDraft, setAddOnDraft] = useState({ type: 'Custom Flash', amount: '', reason: '' });

  useEffect(() => {
    if (!selectedEvent) return;
    setForm(formFromEvent(selectedEvent));
    setSaveStatus(`Imported ${selectedEvent.clientName}.`);
  }, [selectedEvent]);

  const totals = useMemo(() => computePricing(form), [form]);
  const summaryRows = useMemo(() => buildPricingSummaryRows(totals), [totals]);
  const pricingSheetUrl = PRICING_SHEET_PUBLIC_URL_BY_YEAR[2026];
  const planRows = Object.entries(PRICING_SCHEDULE[2026] || {}).sort(([left], [right]) => Number(left) - Number(right));
  const canAddToPaidBalance = viewer?.email?.toLowerCase() === 'admin@anatomytattoo.com'
    && saveMode === 'overwrite'
    && selectedEvent
    && DEPOSIT_PAID_STATUSES.has(String(selectedEvent.raw?.status || selectedEvent.status || '').trim().toLowerCase());
  const hasBalanceAddOnChanges = Boolean(canAddToPaidBalance)
    && JSON.stringify(form.balanceAddOns) !== JSON.stringify(formFromEvent(selectedEvent).balanceAddOns);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateEventTime(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      return { ...next, bookedHours: deriveEventHours(next.eventStartTime, next.eventEndTime) };
    });
  }

  function addBalanceAddOn() {
    const amount = parseMoney(addOnDraft.amount);
    if (amount <= 0 || !addOnDraft.reason.trim()) {
      setSaveStatus('Enter an add-on amount and reason.');
      return;
    }
    const lockedDepositAmount = String(form.lockedDepositAmount || selectedEvent?.raw?.depositRequired || '').trim();
    setForm((current) => ({
      ...current,
      lockedDepositAmount,
      balanceAddOns: [...current.balanceAddOns, { id: crypto.randomUUID(), type: addOnDraft.type, amount: amount.toFixed(2), reason: addOnDraft.reason.trim() }],
    }));
    setAddOnDraft({ type: 'Custom Flash', amount: '', reason: '' });
    setSaveStatus('Add-on added. Click Overwrite to save it to the Sheet.');
  }

  function removeBalanceAddOn(id) {
    setForm((current) => ({ ...current, balanceAddOns: current.balanceAddOns.filter((item) => item.id !== id) }));
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
                clientName: newClient.clientName || `Hypothetical ${new Date().toLocaleDateString()}`,
                contactPhone: newClient.contactPhone,
                email: newClient.email,
                eventDate: newClient.eventDate,
                eventType: newClient.eventType,
                venueName: newClient.venueName,
                estGuestCount: '',
                estimatedGuests: '',
                createdAt: new Date().toISOString(),
                status: 'New',
                payStatus: 'New',
              },
            }
          : selectedEvent;
      const eventForSheet = buildPricingEvent(baseEvent, form, totals);
      const saved = await upsertEventToSheet(eventForSheet, {
        totalCharge: totals.totalCharge,
        balanceAfterDeposit: totals.balanceDue,
      });
      let refreshed = saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved;
      if (hasBalanceAddOnChanges && refreshed.entryId) {
        setSaveStatus('Pricing saved. Generating revised contract...');
        try {
          await generateEventFile(refreshed.entryId, 'contract', { revision: true });
          refreshed = (await pullEventByEntryId(refreshed.entryId)) || refreshed;
          setSaveStatus(`Saved ${selectedEvent.clientName} and linked the revised contract.`);
        } catch (generationError) {
          onSaved(refreshed);
          setSaveStatus(`Pricing was saved, but the revised contract failed: ${generationError instanceof Error ? generationError.message : 'Unknown generation error.'}`);
          return;
        }
      } else {
        setSaveStatus(saveMode === 'new' ? `Created ${saved.clientName} in Sheet.` : `Saved ${selectedEvent.clientName} to Sheet.`);
      }
      onSaved(refreshed);
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
          <div>
            <h2>Pricing</h2>
            <p>Five-hour event pricing with required counter staff and licensing included.</p>
          </div>
          <div className="panel-actions pricing-card__actions">
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
        <div className="plan-table" role="table" aria-label="Current pricing">
          <div className="plan-table__row plan-table__row--head" role="row">
            <span role="columnheader">Artists</span>
            <span role="columnheader">5-Hour Event Price</span>
          </div>
          {planRows.map(([artistCount, row]) => (
            <div key={artistCount} className="plan-table__row" role="row">
              <span role="cell">{artistCount}</span>
              <span role="cell">{formatMoney(
                (row.baseRatePerArtist5h + row.counterPerArtist) * Number(artistCount)
                  + row.facilityCityFee
                  + row.facilityAdminFee,
              )}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-form pending-scope">
        <PendingOverlay show={isSaving} label="Saving pricing to Sheet..." />
        <div>
          <h2>Pricing Calculator</h2>
          <p className="info-line">Modifiers and radius update automatically based on your inputs.</p>
        </div>

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
            <Field label="Event Start Time">
              <input type="time" value={form.eventStartTime} onChange={(event) => updateEventTime('eventStartTime', event.target.value)} />
            </Field>
            <Field label="Event End Time">
              <input type="time" value={form.eventEndTime} onChange={(event) => updateEventTime('eventEndTime', event.target.value)} />
            </Field>
            <Field label="Venue Name">
              <input value={newClient.venueName} onChange={(event) => setNewClient((current) => ({ ...current, venueName: event.target.value }))} />
            </Field>
            <Field label="Type of Event">
              <EventTypePicker value={newClient.eventType} onChange={(eventType) => setNewClient((current) => ({ ...current, eventType }))} />
            </Field>
          </div>
        ) : (
          <div className="form-grid">
            <Field label="Existing Client Entry">
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                <option value="">Select existing entry</option>
                {selectableEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.clientName} {event.eventDate ? `- ${event.eventDate}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Event Start Time">
              <input type="time" value={form.eventStartTime} onChange={(event) => updateEventTime('eventStartTime', event.target.value)} />
            </Field>
            <Field label="Event End Time">
              <input type="time" value={form.eventEndTime} onChange={(event) => updateEventTime('eventEndTime', event.target.value)} />
            </Field>
          </div>
        )}

        <Field label="Client / Consultation Notes">
          <textarea
            value={form.consultationNotes}
            onChange={(event) => updateForm('consultationNotes', event.target.value)}
            placeholder="Consultation details, client requests, preferences, or follow-up notes"
          />
          <span className="field-help">Saved to Client Notes on the Status &amp; Communication page.</span>
        </Field>

        <Field label="Pricing Method">
          <div className="mode-tabs" role="radiogroup" aria-label="Pricing method">
            <button type="button" className={form.pricingMethod === PRICING_METHOD_STANDARD ? 'active' : ''} onClick={() => updateForm('pricingMethod', PRICING_METHOD_STANDARD)}>
              Standard Event
            </button>
            <button type="button" className={form.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS ? 'active' : ''} onClick={() => updateForm('pricingMethod', PRICING_METHOD_CORPORATE_MODIFIERS)}>
              Corporate / Walk-Up
            </button>
            <button type="button" className={form.pricingMethod === PRICING_METHOD_ZERO_WALK_UP ? 'active' : ''} onClick={() => updateForm('pricingMethod', PRICING_METHOD_ZERO_WALK_UP)}>
              $0 Walk-Up Event
            </button>
          </div>
          <span className="field-help">
            {form.pricingMethod === PRICING_METHOD_ZERO_WALK_UP
              ? 'No client charges, deposits, invoices, or staff payouts are tracked. Any walk-up payments happen outside this app.'
              : form.pricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS
              ? 'The event client pays required counter, licensing, and admin charges plus selected modifiers. Walk-up tattoo sales are not tracked in this app.'
              : 'The event client pays the standard tattoo base plus modifiers.'}
          </span>
        </Field>

        {canAddToPaidBalance ? (
          <section className="picker-section balance-add-on-section">
            <div>
              <h3>Balance Add-Ons</h3>
              <p className="info-line">The paid deposit stays fixed. Add-ons increase only the remaining balance.</p>
            </div>
            <div className="form-grid">
              <Field label="Add-On Type">
                <select value={addOnDraft.type} onChange={(event) => setAddOnDraft((current) => ({ ...current, type: event.target.value }))}>
                  {BALANCE_ADD_ON_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Amount">
                <input inputMode="decimal" placeholder="0.00" value={addOnDraft.amount} onChange={(event) => setAddOnDraft((current) => ({ ...current, amount: event.target.value }))} />
              </Field>
            </div>
            <Field label="Reason">
              <input placeholder="What changed?" value={addOnDraft.reason} onChange={(event) => setAddOnDraft((current) => ({ ...current, reason: event.target.value }))} />
            </Field>
            <button type="button" className="secondary-button" onClick={addBalanceAddOn}>
              <Plus size={16} /> Add to Balance
            </button>
            {form.balanceAddOns.length ? (
              <div className="feed-list">
                {form.balanceAddOns.map((item) => (
                  <div className="feed-row balance-add-on-row" key={item.id}>
                    <span><strong>{item.type}</strong> — {item.reason}</span>
                    <strong>{formatMoney(parseMoney(item.amount))}</strong>
                    <button type="button" className="feed-delete-button" onClick={() => removeBalanceAddOn(item.id)} aria-label={`Remove ${item.type} add-on`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

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

        <div className="panel-actions">
          <button type="button" className="primary-button" onClick={savePricing} disabled={isSaving || (saveMode !== 'new' && !selectedEvent)}>
            <Save size={16} />
            {isSaving ? 'Saving...' : hasBalanceAddOnChanges ? 'Save Add-On & Generate Revised Contract' : saveMode === 'import' ? 'Import' : saveMode === 'overwrite' ? 'Overwrite' : 'Save'}
          </button>
        </div>
        {saveStatus ? <p className="save-status">{saveStatus}</p> : null}
      </section>
    </section>
  );
}
