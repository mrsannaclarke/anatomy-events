import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Mail, Trash2, Upload } from 'lucide-react';

import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { ActionStatus } from '../components/ActionStatus.jsx';
import { deleteArtAttachment, generateEventFile, getArtAttachments, getArtUploadJob, getDocumentJob, pullEventByEntryId, queueEventArt, queueEventFile } from '../sheetClient.js';

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

const REVISED_CONTRACT_ADMIN = 'admin@anatomytattoo.com';

function artUploadStorageKey(entryId) {
  return `anatomy-events:art-upload-jobs:${entryId}`;
}

function storedArtUploadJobs(entryId) {
  const stored = window.localStorage.getItem(artUploadStorageKey(entryId));
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [stored];
  }
}

function legacyArtAttachments(url, deletedUrls = []) {
  const deleted = new Set(deletedUrls);
  return String(url || '').split(/\n+/).map((value) => value.trim()).filter((value) => value && !deleted.has(value)).map((value) => ({
    id: '', url: value, fileName: 'Uploaded art', mimeType: '', legacy: true,
  }));
}

function mergeArtAttachments(saved, legacy) {
  const seen = new Set();
  return [...saved, ...legacy].filter((attachment) => {
    if (!attachment.url || seen.has(attachment.url)) return false;
    seen.add(attachment.url);
    return true;
  });
}

export function FilesPanel({ event, viewerEmail, onSaved }) {
  const raw = event.raw || {};
  const [fileUrls, setFileUrls] = useState(null);
  const [status, setStatus] = useState('');
  const [pendingLabel, setPendingLabel] = useState('');
  const [documentJobs, setDocumentJobs] = useState(() => storedDocumentJobs(event.entryId));
  const [artUploadJobs, setArtUploadJobs] = useState(() => storedArtUploadJobs(event.entryId));
  const [localArtPreviews, setLocalArtPreviews] = useState([]);
  const [artAttachments, setArtAttachments] = useState([]);

  function urlsFromEvent(sourceEvent) {
    const source = sourceEvent?.raw || {};
    return {
      contractUrl: source.contractUrl || '',
      tflUrl: source.tflUrl || '',
      artImageUrl: source.artImageUrl || '',
    };
  }

  function findResultUrl(value, keys) {
    if (!value || typeof value !== 'object') return '';
    for (const key of keys) {
      if (typeof value[key] === 'string' && value[key]) return value[key];
    }
    for (const nested of Object.values(value)) {
      const match = findResultUrl(nested, keys);
      if (match) return match;
    }
    return '';
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
        const refreshedUrls = urlsFromEvent(refreshed);
        setFileUrls(refreshedUrls);
        try {
          const savedArt = await getArtAttachments(event.entryId);
          if (cancelled) return;
          setArtAttachments(mergeArtAttachments(savedArt.attachments || [], legacyArtAttachments(refreshedUrls.artImageUrl, savedArt.deletedUrls)));
        } catch {
          setArtAttachments(legacyArtAttachments(refreshedUrls.artImageUrl));
        }
        setStatus('');
      } catch (error) {
        if (cancelled) return;
        const fallbackUrls = urlsFromEvent(event);
        setFileUrls(fallbackUrls);
        setArtAttachments(legacyArtAttachments(fallbackUrls.artImageUrl));
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
    setArtUploadJobs(storedArtUploadJobs(event.entryId));
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
          const completedUrls = {};
          for (const kind of completedKinds) {
            const job = await getDocumentJob(documentJobs[kind]);
            const key = kind === 'tfl' ? 'tflUrl' : 'contractUrl';
            completedUrls[key] = findResultUrl(job.result, [key, 'existingUrl', 'url']);
          }
          const refreshed = await pullEventByEntryId(event.entryId);
          if (!cancelled && refreshed) {
            const refreshedUrls = urlsFromEvent(refreshed);
            setFileUrls((current) => ({
              ...current,
              ...refreshedUrls,
              contractUrl: refreshedUrls.contractUrl || completedUrls.contractUrl || current?.contractUrl || '',
              tflUrl: refreshedUrls.tflUrl || completedUrls.tflUrl || current?.tflUrl || '',
            }));
            onSaved(refreshed);
            setStatus(`${completedKinds.map((kind) => kind === 'tfl' ? 'Temporary license' : 'Contract').join(' and ')} generated. Open it below.`);
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
    if (artUploadJobs.length === 0) return undefined;
    let cancelled = false;
    let timer;

    async function checkUploads() {
      const completed = [];
      const failed = [];
      let stillProcessing = false;
      for (const jobId of artUploadJobs) {
        try {
          const job = await getArtUploadJob(jobId);
          if (job.status === 'completed') completed.push(job);
          else if (job.status === 'failed') failed.push(job);
          else stillProcessing = true;
        } catch {
          stillProcessing = true;
        }
      }
      if (cancelled) return;

      const finishedIds = [...completed, ...failed].map((job) => job.id);
      const remaining = artUploadJobs.filter((jobId) => !finishedIds.includes(jobId));
      if (finishedIds.length) {
        setArtUploadJobs(remaining);
        if (remaining.length) window.localStorage.setItem(artUploadStorageKey(event.entryId), JSON.stringify(remaining));
        else window.localStorage.removeItem(artUploadStorageKey(event.entryId));
        setLocalArtPreviews((current) => {
          const next = current.filter((preview) => !finishedIds.includes(preview.jobId));
          current.filter((preview) => finishedIds.includes(preview.jobId)).forEach((preview) => URL.revokeObjectURL(preview.url));
          return next;
        });
      }

      if (completed.length) {
        try {
          const [refreshed, savedArt] = await Promise.all([
            pullEventByEntryId(event.entryId),
            getArtAttachments(event.entryId),
          ]);
          if (!cancelled && refreshed) {
            const refreshedUrls = urlsFromEvent(refreshed);
            setFileUrls((current) => ({ ...current, ...refreshedUrls }));
            setArtAttachments(mergeArtAttachments(savedArt.attachments || [], legacyArtAttachments(refreshedUrls.artImageUrl, savedArt.deletedUrls)));
            onSaved(refreshed);
          }
          setStatus(`${completed.length} art ${completed.length === 1 ? 'file' : 'files'} uploaded.`);
        } catch (error) {
          if (!cancelled) setStatus(error instanceof Error ? error.message : 'Uploaded art is ready; reopen this panel to refresh it.');
        }
      } else if (failed.length) {
        setStatus(failed.map((job) => `${job.fileName || 'Artwork'} failed: ${job.error || 'Please try again.'}`).join(' '));
      } else if (stillProcessing) {
        setStatus(`${artUploadJobs.length} art ${artUploadJobs.length === 1 ? 'file is' : 'files are'} copying to Drive in the background.`);
      }
      if (!cancelled && stillProcessing) timer = window.setTimeout(checkUploads, 2500);
    }

    void checkUploads();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artUploadJobs, event.entryId, onSaved]);

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

  async function generate(kind, options = {}) {
    const isRevision = kind === 'contract' && Boolean(options.revision);
    if (
      isRevision &&
      !window.confirm(
        'Generate a new contract from the event’s currently saved details? The previous contract will remain in Drive, and this new contract will become the active link for this event.',
      )
    ) {
      return;
    }

    if (isRevision) {
      const previousContractUrl = fileUrls?.contractUrl || '';
      const label = 'Generating revised contract...';
      setStatus(label);
      setPendingLabel(label);
      try {
        const result = await generateEventFile(event.entryId, kind, { revision: true });
        const refreshed = await pullEventByEntryId(result.entryId || event.entryId);
        if (!refreshed) throw new Error('File generated, but the refreshed event record was not returned.');
        setFileUrls(urlsFromEvent(refreshed));
        onSaved(refreshed);
        setStatus('Contract regenerated and linked.');
      } catch (error) {
        try {
          const refreshed = await pullEventByEntryId(event.entryId);
          const generatedUrl = refreshed?.raw?.contractUrl;
          if (refreshed && generatedUrl && generatedUrl !== previousContractUrl) {
            setFileUrls(urlsFromEvent(refreshed));
            onSaved(refreshed);
            setStatus('Contract regenerated and linked.');
            return;
          }
        } catch {
          // Preserve the original generation error when the recovery lookup also fails.
        }
        setStatus(error instanceof Error ? error.message : 'Failed to generate file.');
      } finally {
        setPendingLabel('');
      }
      return;
    }

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
    const files = [...(input.target.files || [])];
    input.target.value = '';
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setStatus(`${oversized.name} is larger than 8 MB. Choose smaller files.`);
      return;
    }
    setStatus(`Uploading ${files.length} art ${files.length === 1 ? 'file' : 'files'} securely...`);
    setPendingLabel('Uploading artwork securely...');
    try {
      const queued = [];
      for (const file of files) {
        const job = await queueEventArt(event.entryId, file);
        queued.push({ job, file });
      }
      const nextJobIds = [...artUploadJobs, ...queued.map(({ job }) => job.id)];
      window.localStorage.setItem(artUploadStorageKey(event.entryId), JSON.stringify(nextJobIds));
      setArtUploadJobs(nextJobIds);
      setLocalArtPreviews((current) => [
        ...current,
        ...queued.map(({ job, file }) => ({ jobId: job.id, name: file.name, type: file.type, url: URL.createObjectURL(file) })),
      ]);
      setStatus(`${queued.length} art ${queued.length === 1 ? 'file is' : 'files are'} copying to Drive in the background.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to upload art.');
    } finally {
      setPendingLabel('');
    }
  }

  async function removeArt(attachment) {
    if (!window.confirm(`Remove ${attachment.fileName || 'this uploaded art'} from this event?`)) return;
    setStatus('Removing uploaded art...');
    try {
      await deleteArtAttachment(event.entryId, attachment);
      setArtAttachments((current) => current.filter((item) => item.url !== attachment.url));
      setStatus('Uploaded art removed from this event.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Uploaded art could not be removed.');
    }
  }

  const links = [
    ['Contract', fileUrls?.contractUrl],
    ['Temporary License', fileUrls?.tflUrl],
  ];
  const canGenerateRevisedContract =
    String(viewerEmail || '').trim().toLowerCase() === REVISED_CONTRACT_ADMIN && Boolean(fileUrls?.contractUrl);

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={Boolean(pendingLabel)} label={pendingLabel} />
      <div className="file-actions">
        {!fileUrls?.contractUrl ? (
          <button type="button" className="primary-button" onClick={() => generate('contract')} disabled={!fileUrls || Boolean(pendingLabel) || Boolean(documentJobs.contract)}>
            {documentJobs.contract ? 'Generating Contract…' : 'Generate Contract'}
          </button>
        ) : canGenerateRevisedContract ? (
          <button type="button" className="primary-button" onClick={() => generate('contract', { revision: true })} disabled={Boolean(pendingLabel)}>
            Regenerate Contract
          </button>
        ) : null}
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
        <label className="primary-button art-upload-button" aria-label="Add art sheets or files">
          <Upload size={16} />
          Add Art Sheets or Files
          <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={uploadArtFile} disabled={Boolean(pendingLabel)} />
        </label>
      </div>
      {localArtPreviews.length || artAttachments.length ? (
        <section className="saved-art-collection">
          <h3>Uploaded Art</h3>
          <div className="saved-art-grid">
            {localArtPreviews.map((preview) => (
              <article className="saved-art-item saved-art-item--processing" key={preview.jobId}>
                {preview.type === 'application/pdf' ? (
                  <iframe title={`${preview.name} preview`} src={preview.url} />
                ) : (
                  <img src={preview.url} alt={`${preview.name} preview`} />
                )}
                <strong>{preview.name}</strong>
                <span>Processing…</span>
              </article>
            ))}
            {artAttachments.map((attachment) => (
              <article className="saved-art-item" key={attachment.id || attachment.url}>
                {drivePreviewUrl(attachment.url) ? (
                  <iframe title={`${attachment.fileName} preview`} src={drivePreviewUrl(attachment.url)} allow="autoplay" />
                ) : attachment.mimeType === 'application/pdf' ? (
                  <div className="saved-art-file-placeholder">PDF</div>
                ) : (
                  <img src={attachment.url} alt={`${attachment.fileName} uploaded art`} />
                )}
                <strong>{attachment.fileName || 'Uploaded art'}</strong>
                <div className="saved-art-item__actions">
                  <a href={attachment.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
                  <button type="button" className="icon-link-button" onClick={() => removeArt(attachment)}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <ActionStatus>{status}</ActionStatus>
    </section>
  );
}
