import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Mail, Upload } from 'lucide-react';

import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { getArtUploadJob, getDocumentJob, pullEventByEntryId, queueEventArt, queueEventFile } from '../sheetClient.js';

function documentJobStorageKey(entryId, kind) {
  return `anatomy-events:document-job:${entryId}:${kind}`;
}

function storedDocumentJobs(entryId) {
  return ['contract', 'tfl'].reduce((jobs, kind) => {
    const jobId = window.localStorage.getItem(documentJobStorageKey(entryId, kind));
    if (jobId) jobs[kind] = jobId;
    return jobs;
  }, {});
}

function artUploadStorageKey(entryId) {
  return `anatomy-events:art-upload-job:${entryId}`;
}

export function FilesPanel({ event, onSaved }) {
  const raw = event.raw || {};
  const [fileUrls, setFileUrls] = useState(null);
  const [status, setStatus] = useState('');
  const [pendingLabel, setPendingLabel] = useState('');
  const [documentJobs, setDocumentJobs] = useState(() => storedDocumentJobs(event.entryId));
  const [artUploadJob, setArtUploadJob] = useState(() => window.localStorage.getItem(artUploadStorageKey(event.entryId)) || '');

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

  useEffect(() => {
    setDocumentJobs(storedDocumentJobs(event.entryId));
    setArtUploadJob(window.localStorage.getItem(artUploadStorageKey(event.entryId)) || '');
  }, [event.entryId]);

  useEffect(() => {
    const activeEntries = Object.entries(documentJobs);
    if (activeEntries.length === 0) return undefined;
    let cancelled = false;
    let timer;

    async function checkDocumentJobs() {
      const completedKinds = [];
      const failed = [];
      let stillProcessing = false;
      for (const [kind, jobId] of activeEntries) {
        try {
          const job = await getDocumentJob(jobId);
          if (job.status === 'completed') completedKinds.push(kind);
          else if (job.status === 'failed') failed.push([kind, job.error || 'Document generation failed.']);
          else stillProcessing = true;
        } catch {
          stillProcessing = true;
        }
      }
      if (cancelled) return;

      const finishedKinds = [...completedKinds, ...failed.map(([kind]) => kind)];
      if (finishedKinds.length > 0) {
        finishedKinds.forEach((kind) => window.localStorage.removeItem(documentJobStorageKey(event.entryId, kind)));
        setDocumentJobs((current) => Object.fromEntries(Object.entries(current).filter(([kind]) => !finishedKinds.includes(kind))));
      }
      if (completedKinds.length > 0) {
        try {
          const refreshed = await pullEventByEntryId(event.entryId);
          if (!cancelled && refreshed) {
            setFileUrls(urlsFromEvent(refreshed));
            onSaved(refreshed);
            setStatus(`${completedKinds.map((kind) => kind === 'tfl' ? 'Temporary license' : 'Contract').join(' and ')} generated and linked.`);
          }
        } catch (error) {
          if (!cancelled) setStatus(error instanceof Error ? error.message : 'Document generated; refresh the Sheet to see its link.');
        }
      } else if (failed.length > 0) {
        setStatus(failed.map(([kind, error]) => `${kind === 'tfl' ? 'Temporary license' : 'Contract'} failed: ${error}`).join(' '));
      } else if (stillProcessing) {
        setStatus('Document generation is running in the background. You can continue using the app.');
      }
      if (!cancelled && stillProcessing) timer = window.setTimeout(checkDocumentJobs, 2500);
    }

    void checkDocumentJobs();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [documentJobs, event.entryId, onSaved]);

  useEffect(() => {
    if (!artUploadJob) return undefined;
    let cancelled = false;
    let timer;

    async function checkUpload() {
      try {
        const job = await getArtUploadJob(artUploadJob);
        if (cancelled) return;
        if (job.status === 'completed') {
          window.localStorage.removeItem(artUploadStorageKey(event.entryId));
          setArtUploadJob('');
          const refreshed = await pullEventByEntryId(event.entryId);
          if (!cancelled && refreshed) {
            setFileUrls(urlsFromEvent(refreshed));
            onSaved(refreshed);
            setStatus('Uploaded art saved to Drive and connected to this client.');
          }
          return;
        }
        if (job.status === 'failed') {
          window.localStorage.removeItem(artUploadStorageKey(event.entryId));
          setArtUploadJob('');
          setStatus(`Artwork upload failed: ${job.error || 'Please try again.'}`);
          return;
        }
        setStatus('Artwork is copying to Drive in the background. You can continue using the app.');
      } catch {
        if (!cancelled) setStatus('Artwork is queued; its status will be checked again automatically.');
      }
      if (!cancelled) timer = window.setTimeout(checkUpload, 2500);
    }

    void checkUpload();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artUploadJob, event.entryId, onSaved]);

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
    const label = kind === 'tfl' ? 'Temporary license' : 'Contract';
    setStatus(`Queueing ${label.toLowerCase()}...`);
    try {
      const job = await queueEventFile(event.entryId, kind);
      window.localStorage.setItem(documentJobStorageKey(event.entryId, kind), job.id);
      setDocumentJobs((current) => ({ ...current, [kind]: job.id }));
      setStatus(`${label} queued. You can continue using the app while it generates.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label} could not be queued.`);
    }
  }

  async function uploadArtFile(input) {
    const file = input.target.files?.[0];
    input.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStatus('Choose an image or PDF smaller than 8 MB.');
      return;
    }
    setStatus('Uploading artwork securely to Cloudflare...');
    setPendingLabel('Uploading artwork securely...');
    try {
      const job = await queueEventArt(event.entryId, file);
      window.localStorage.setItem(artUploadStorageKey(event.entryId), job.id);
      setArtUploadJob(job.id);
      setStatus('Artwork received. It is copying to Drive in the background.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to upload art.');
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
        <button type="button" className="primary-button" onClick={() => generate('contract')} disabled={!fileUrls || Boolean(fileUrls.contractUrl) || Boolean(pendingLabel) || Boolean(documentJobs.contract)}>
          {documentJobs.contract ? 'Generating Contract…' : 'Generate Contract'}
        </button>
        <button type="button" className="primary-button" onClick={() => generate('tfl')} disabled={!fileUrls || Boolean(fileUrls.tflUrl) || Boolean(pendingLabel) || Boolean(documentJobs.tfl)}>
          {documentJobs.tfl ? 'Generating TFL…' : 'Generate TFL'}
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
      <div className="art-upload-actions">
        <label className="primary-button art-upload-button" aria-label="Upload image or PDF">
          <Upload size={16} />
          {artUploadJob ? 'Artwork Processing…' : 'Choose Photo or File'}
          <input type="file" accept="image/*,.pdf,application/pdf" onChange={uploadArtFile} disabled={Boolean(pendingLabel) || Boolean(artUploadJob)} />
        </label>
      </div>
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
