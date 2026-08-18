import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { STATUS_OPTIONS } from '../constants.js';
import { pullEventByEntryId, upsertEventPartialToSheet } from '../sheetClient.js';

const COMMUNICATION_DELETE_EMAIL = 'admin@anatomytattoo.com';
const COMMUNICATION_ENTRY_PATTERN = /^COMMUNICATION ENTRY\[[^\n]*\]:[\s\S]*?(?=^COMMUNICATION ENTRY\[|(?![\s\S]))/gim;

export function getCommunicationEntries(notes) {
  return [...String(notes || '').matchAll(COMMUNICATION_ENTRY_PATTERN)].map((match) => ({
    text: match[0].trim(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function NotesPanel({ event, viewerEmail, viewerName, onSaved }) {
  const raw = event.raw || {};
  const [statusValue, setStatusValue] = useState(raw.status || raw.payStatus || '');
  const [privateNotes, setPrivateNotes] = useState(raw.privateNotes || '');
  const [communicationEntry, setCommunicationEntry] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const feedEntries = getCommunicationEntries(privateNotes);
  const canDeleteCommunication = String(viewerEmail || '').trim().toLowerCase() === COMMUNICATION_DELETE_EMAIL;

  async function deleteCommunicationEntry(entry) {
    if (!canDeleteCommunication || isSaving) return;
    if (!window.confirm('Delete this communication entry? This cannot be undone.')) return;

    setStatus('Deleting communication entry...');
    setIsSaving(true);
    try {
      const notes = `${privateNotes.slice(0, entry.start)}${privateNotes.slice(entry.end)}`
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const saved = await upsertEventPartialToSheet({
        entryId: raw.entryId,
        internalNotes: notes,
      });
      const refreshed = (await pullEventByEntryId(saved.entryId)) || event;
      onSaved(refreshed);
      setPrivateNotes(refreshed.raw?.privateNotes ?? notes);
      setStatus('Communication entry deleted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete communication entry.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveNotes() {
    setStatus('Saving notes to Sheet...');
    setIsSaving(true);
    const timestamp = new Date().toLocaleString();
    const author = String(viewerName || viewerEmail || 'Staff').trim();
    const communicationBlock = communicationEntry.trim()
      ? `\n\nCOMMUNICATION ENTRY[${author} | ${timestamp}]: ${communicationEntry.trim()}`
      : '';
    try {
      const notes = `${privateNotes || ''}${communicationBlock}`.trim();
      const saved = await upsertEventPartialToSheet({
        entryId: raw.entryId,
        status: statusValue,
        internalNotes: notes,
      });
      const refreshed = (await pullEventByEntryId(saved.entryId)) || event;
      onSaved(refreshed);
      setPrivateNotes(refreshed.raw?.privateNotes || notes);
      setStatusValue(refreshed.raw?.status || refreshed.raw?.payStatus || statusValue);
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
            <button key={option} type="button" className={statusValue === option ? 'choice-chip status-choice selected' : 'choice-chip status-choice'} onClick={() => setStatusValue(option)}>
              {option}
            </button>
          ))}
        </div>
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
            {feedEntries.map((entry, index) => (
              <div key={`${entry.start}-${index}`} className="feed-row">
                <span>{entry.text}</span>
                {canDeleteCommunication ? (
                  <button
                    type="button"
                    className="feed-delete-button"
                    aria-label="Delete communication entry"
                    title="Delete communication entry"
                    disabled={isSaving}
                    onClick={() => deleteCommunicationEntry(entry)}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}
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
