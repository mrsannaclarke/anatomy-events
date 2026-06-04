import { useState } from 'react';
import { Save } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { fireAudit } from '../auditLog.js';
import { STATUS_OPTIONS } from '../constants.js';
import { saveManualAppointment } from '../activity.js';
import { pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';

export function NotesPanel({ event, viewer, onSaved, onManualAppointmentsChanged }) {
  const raw = event.raw || {};
  const [statusValue, setStatusValue] = useState(raw.status || raw.payStatus || '');
  const [privateNotes, setPrivateNotes] = useState(raw.privateNotes || '');
  const [manualAppointment, setManualAppointment] = useState(raw.manualUpcomingAppointment || '');
  const [communicationEntry, setCommunicationEntry] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const feedEntries = String(privateNotes || '')
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter((entry) => /^COMMUNICATION ENTRY\[/i.test(entry));

  async function saveNotes() {
    setStatus('Saving notes to Sheet...');
    setIsSaving(true);
    const timestamp = new Date().toLocaleString();
    const communicationBlock = communicationEntry.trim()
      ? `\n\nCOMMUNICATION ENTRY[Anna | ${timestamp}]: ${communicationEntry.trim()}`
      : '';
    try {
      const saved = await upsertEventToSheet({
        ...raw,
        status: statusValue,
        payStatus: statusValue,
        privateNotes: `${privateNotes || ''}${communicationBlock}`.trim(),
        contractNotes: raw.contractNotes || '',
        manualUpcomingAppointment: manualAppointment,
      });
      const entryId = raw.entryId || event.entryId;
      const nextAppointments = saveManualAppointment(entryId, manualAppointment);
      onManualAppointmentsChanged?.(nextAppointments);
      const refreshed = saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved;
      onSaved(refreshed);
      fireAudit(viewer, {
        actionName: 'notes_status_save',
        entryId: saved.entryId || entryId,
        details: {
          clientName: event.clientName,
          status: statusValue,
          manualAppointment: manualAppointment || '',
          communicationEntryAdded: Boolean(communicationEntry.trim()),
        },
      });
      setPrivateNotes(saved.raw.privateNotes || `${privateNotes || ''}${communicationBlock}`.trim());
      setCommunicationEntry('');
      setStatus('Saved notes.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save notes.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={isSaving} label="Saving notes to Sheet..." />
      <section className="picker-section">
        <h3>Status</h3>
        <p className="info-line">Current Status: {statusValue || 'Open'}</p>
        <div className="chip-grid">
          {STATUS_OPTIONS.map((option) => (
            <button key={option} type="button" className={statusValue === option ? 'choice-chip selected' : 'choice-chip'} onClick={() => setStatusValue(option)}>
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="picker-section">
        <h3>Appointments</h3>
        <Field label="Manual Upcoming Appointment">
          <input type="datetime-local" value={manualAppointment} onChange={(input) => setManualAppointment(input.target.value)} />
        </Field>
      </section>

      <section className="picker-section">
        <h3>Client Notes</h3>
        <div className="readonly-block">{raw.contractNotes || raw.privateNotes || 'No client notes recorded.'}</div>
      </section>

      <section className="picker-section">
        <h3>Communication Entry</h3>
        <Field label="New Communication Entry">
          <textarea value={communicationEntry} onChange={(input) => setCommunicationEntry(input.target.value)} />
        </Field>
      </section>

      <section className="picker-section">
        <h3>Feed</h3>
        {feedEntries.length ? (
          <div className="feed-list">
            {feedEntries.map((entry, index) => <div key={`${entry}-${index}`} className="feed-row">{entry}</div>)}
          </div>
        ) : (
          <p className="info-line">No communication entries yet.</p>
        )}
      </section>

      <button type="button" className="primary-button detail-save" onClick={saveNotes} disabled={isSaving}>
        <Save size={16} />
        Save Notes
      </button>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
  );
}
