import { useState } from 'react';
import { Copy, ExternalLink, Mail, Save } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { generateEventFile, pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';

export function FilesPanel({ event, onSaved }) {
  const raw = event.raw || {};
  const [artUrl, setArtUrl] = useState(raw.artImageUrl || '');
  const [status, setStatus] = useState('');
  const [pendingLabel, setPendingLabel] = useState('');

  function mailtoLink(label, url) {
    const subjectByLabel = {
      Contract: `${event.clientName} ${raw.eventType || ''} ${raw.eventDate || ''} Contract`,
      'Temporary License': `${event.clientName} Anatomy Tattoo ${raw.eventType || ''}`,
      'Uploaded Art': `${event.clientName} ${raw.eventType || ''} ${raw.eventDate || ''} Uploaded Art`,
    };
    const to = label === 'Temporary License' ? 'hlo.applications@odhsoha.oregon.gov' : '';
    return `mailto:${to}?subject=${encodeURIComponent(subjectByLabel[label] || label)}&body=${encodeURIComponent(url || '')}`;
  }

  async function copyToClipboard(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} link copied.`);
    } catch {
      setStatus('Copy failed. Open the link and copy it manually.');
    }
  }

  async function generate(kind) {
    const label = kind === 'tfl' ? 'Generating temporary license...' : 'Generating contract...';
    setStatus(label);
    setPendingLabel(label);
    try {
      const result = await generateEventFile(event.entryId, kind);
      const saved = await upsertEventToSheet({
        ...raw,
        contractUrl: result.contractUrl || raw.contractUrl,
        tflUrl: result.tflUrl || raw.tflUrl,
      });
      const refreshed = saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved;
      onSaved(refreshed);
      setStatus('Generated file link saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to generate file.');
    } finally {
      setPendingLabel('');
    }
  }

  async function saveArtUrl() {
    setStatus('Saving uploaded art URL...');
    setPendingLabel('Saving uploaded art URL...');
    try {
      const saved = await upsertEventToSheet({
        ...raw,
        artImageUrl: artUrl,
        contractNotes: artUrl ? `${raw.contractNotes || ''}\nART_IMAGE_URL=${artUrl}`.trim() : raw.contractNotes || '',
      });
      const refreshed = saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved;
      onSaved(refreshed);
      setStatus('Uploaded art URL saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save art URL.');
    } finally {
      setPendingLabel('');
    }
  }

  const links = [
    ['Contract', raw.contractUrl],
    ['Temporary License', raw.tflUrl],
    ['Uploaded Art', raw.artImageUrl],
  ];

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={Boolean(pendingLabel)} label={pendingLabel} />
      <div className="file-actions">
        <button type="button" className="primary-button" onClick={() => generate('contract')} disabled={Boolean(raw.contractUrl) || Boolean(pendingLabel)}>
          Generate Contract
        </button>
        <button type="button" className="primary-button" onClick={() => generate('tfl')} disabled={Boolean(raw.tflUrl) || Boolean(pendingLabel)}>
          Generate TFL
        </button>
      </div>
      <div className="link-list">
        {links.map(([label, url]) => (
          <div key={label} className="link-row">
            <span>{label}</span>
            {url ? (
              <div className="link-actions">
                <a href={url} target="_blank" rel="noreferrer">
                  Open
                  <ExternalLink size={14} />
                </a>
                <button type="button" className="icon-link-button" onClick={() => copyToClipboard(url, label)}>
                  <Copy size={14} />
                  Copy
                </button>
                <a href={mailtoLink(label, url)}>
                  <Mail size={14} />
                  Email
                </a>
              </div>
            ) : (
              <strong>Not generated</strong>
            )}
          </div>
        ))}
      </div>
      <Field label="Uploaded Art URL">
        <input value={artUrl} onChange={(input) => setArtUrl(input.target.value)} />
      </Field>
      <button type="button" className="primary-button detail-save" onClick={saveArtUrl} disabled={Boolean(pendingLabel)}>
        <Save size={16} />
        Save Uploaded Art
      </button>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
  );
}
