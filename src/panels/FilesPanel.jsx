import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Mail, Save } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { generateEventFile, importUploadedArt, pullEventByEntryId } from '../sheetClient.js';

export function FilesPanel({ event, onSaved }) {
  const raw = event.raw || {};
  const [artUrl, setArtUrl] = useState(raw.artImageUrl || '');
  const [fileUrls, setFileUrls] = useState(null);
  const [status, setStatus] = useState('');
  const [pendingLabel, setPendingLabel] = useState('');

  function urlsFromEvent(sourceEvent) {
    const source = sourceEvent?.raw || {};
    return {
      contractUrl: source.contractUrl || '',
      tflUrl: source.tflUrl || '',
      artImageUrl: source.artImageUrl || '',
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function refreshFileLinks() {
      setFileUrls(null);
      setStatus('Checking the latest file links in the Sheet...');
      try {
        const refreshed = await pullEventByEntryId(event.entryId);
        if (cancelled) return;
        if (!refreshed) throw new Error('The latest event record was not returned.');
        setFileUrls(urlsFromEvent(refreshed));
        setArtUrl(refreshed.raw?.artImageUrl || '');
        setStatus('File links are current with the Sheet.');
      } catch (error) {
        if (cancelled) return;
        setFileUrls(urlsFromEvent(event));
        setStatus(error instanceof Error ? `Could not refresh file links: ${error.message}` : 'Could not refresh file links.');
      }
    }

    void refreshFileLinks();
    return () => {
      cancelled = true;
    };
  }, [event.entryId]);

  function mailtoLink(label, url) {
    const subjectByLabel = {
      Contract: `${event.clientName} ${raw.eventType || ''} ${raw.eventDate || ''} Contract`,
      'Temporary License': `${event.clientName} Anatomy Tattoo ${raw.eventType || ''}`,
      'Uploaded Art': `${event.clientName} ${raw.eventType || ''} ${raw.eventDate || ''} Uploaded Art`,
    };
    const to = label === 'Temporary License' ? 'hlo.applications@odhsoha.oregon.gov' : '';
    return `mailto:${to}?subject=${encodeURIComponent(subjectByLabel[label] || label)}&body=${encodeURIComponent(url || '')}`;
  }

  function drivePreviewUrl(url) {
    const match = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    return match ? `https://drive.google.com/file/d/${match[1]}/preview` : '';
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
      const refreshed = await pullEventByEntryId(result.entryId || event.entryId);
      if (!refreshed) throw new Error('File generated, but the refreshed event record was not returned.');
      setFileUrls(urlsFromEvent(refreshed));
      onSaved(refreshed);
      setStatus('Generated file link saved.');
    } catch (error) {
      try {
        const refreshed = await pullEventByEntryId(event.entryId);
        const generatedUrl = kind === 'tfl' ? refreshed?.raw?.tflUrl : refreshed?.raw?.contractUrl;
        if (refreshed && generatedUrl) {
          setFileUrls(urlsFromEvent(refreshed));
          onSaved(refreshed);
          setStatus('Generated file link saved.');
          return;
        }
      } catch {
        // Preserve the original generation error when the recovery lookup also fails.
      }
      setStatus(error instanceof Error ? error.message : 'Failed to generate file.');
    } finally {
      setPendingLabel('');
    }
  }

  async function saveArtUrl() {
    if (!artUrl.trim()) {
      setStatus('Paste an image or PDF URL first.');
      return;
    }
    setStatus('Copying uploaded art into Drive...');
    setPendingLabel('Copying uploaded art into Drive...');
    try {
      const result = await importUploadedArt(event.entryId, artUrl.trim());
      const refreshed = await pullEventByEntryId(result.entryId || event.entryId);
      if (!refreshed) throw new Error('Art saved to Drive, but the refreshed event was not returned.');
      setFileUrls(urlsFromEvent(refreshed));
      setArtUrl(result.artUrl);
      onSaved(refreshed);
      setStatus('Uploaded art copied to Drive and connected to this client.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save art URL.');
    } finally {
      setPendingLabel('');
    }
  }

  const links = [
    ['Contract', fileUrls?.contractUrl],
    ['Temporary License', fileUrls?.tflUrl],
    ['Uploaded Art', fileUrls?.artImageUrl],
  ];

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={Boolean(pendingLabel)} label={pendingLabel} />
      <div className="file-actions">
        <button type="button" className="primary-button" onClick={() => generate('contract')} disabled={!fileUrls || Boolean(fileUrls.contractUrl) || Boolean(pendingLabel)}>
          Generate Contract
        </button>
        <button type="button" className="primary-button" onClick={() => generate('tfl')} disabled={!fileUrls || Boolean(fileUrls.tflUrl) || Boolean(pendingLabel)}>
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
            ) : fileUrls ? (
              <strong>Not generated</strong>
            ) : (
              <strong>Checking Sheet...</strong>
            )}
          </div>
        ))}
      </div>
      <Field label="Uploaded Art URL">
        <input placeholder="Paste an image, PDF, or Google Drive file URL" value={artUrl} onChange={(input) => setArtUrl(input.target.value)} />
      </Field>
      <button type="button" className="primary-button detail-save" onClick={saveArtUrl} disabled={Boolean(pendingLabel) || !artUrl.trim() || artUrl.trim() === fileUrls?.artImageUrl}>
        <Save size={16} />
        Save Uploaded Art
      </button>
      {fileUrls?.artImageUrl ? (
        <section className="saved-art-preview">
          <h3>Saved Uploaded Art</h3>
          {drivePreviewUrl(fileUrls.artImageUrl) ? (
            <iframe title={`${event.clientName} uploaded art`} src={drivePreviewUrl(fileUrls.artImageUrl)} allow="autoplay" />
          ) : (
            <img src={fileUrls.artImageUrl} alt={`${event.clientName} uploaded art`} />
          )}
        </section>
      ) : null}
      {status ? <p className="save-status">{status}</p> : null}
    </section>
  );
}
