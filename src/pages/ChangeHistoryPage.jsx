import { useEffect, useState } from 'react';
import { ArrowLeft, History, RefreshCw } from 'lucide-react';

const AUDIT_ACTION_LABELS = {
  upsertEvent: 'Saved event',
  upsertEventPartialJson: 'Updated event fields',
  deleteEvent: 'Deleted event',
  generateContract: 'Generated contract',
  generateTfl: 'Generated temporary license',
  uploadEventArt: 'Uploaded event art',
};

export function ChangeHistoryPage({ onBack }) {
  const [records, setRecords] = useState([]);
  const [documentJobs, setDocumentJobs] = useState(null);
  const [uploadJobs, setUploadJobs] = useState(null);
  const [operationsHealth, setOperationsHealth] = useState(null);
  const [status, setStatus] = useState('loading');

  async function loadAudit() {
    setStatus('loading');
    try {
      const response = await fetch('/api/audit?limit=50', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Audit history could not be loaded.');
      setRecords(data.records || []);
      setDocumentJobs(data.documentJobs || null);
      setUploadJobs(data.uploadJobs || null);
      setOperationsHealth(data.operationsHealth || null);
      setStatus('ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Audit history could not be loaded.');
    }
  }

  useEffect(() => {
    void loadAudit();
  }, []);

  return (
    <section className="page-stack change-history-page">
      <div className="panel-heading">
        <div>
          <button type="button" className="secondary-button" onClick={onBack}>
            <ArrowLeft size={16} />
            Admin Tools
          </button>
          <h2>Change History</h2>
          <p>App changes, background jobs, and Cloudflare monitoring.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadAudit} disabled={status === 'loading'}>
          <RefreshCw size={16} className={status === 'loading' ? 'is-spinning' : ''} />
          Refresh
        </button>
      </div>

      <section className="audit-panel" aria-label="Change history">
        {operationsHealth ? (
          <div className={operationsHealth.healthy ? 'job-health' : 'job-health has-warning'}>
            <div>
              <strong>{operationsHealth.healthy ? 'Cloudflare monitoring healthy' : 'Cloudflare monitoring needs attention'}</strong>
              <span>{operationsHealth.lastSuccessAt ? `Last hourly check ${new Date(operationsHealth.lastSuccessAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Waiting for the first hourly check'}</span>
            </div>
            {operationsHealth.warnings.length > 0 ? <ul>{operationsHealth.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          </div>
        ) : null}
        {documentJobs ? (
          <div className={documentJobs.counts.failed || documentJobs.counts.retrying ? 'job-health has-warning' : 'job-health'}>
            <div>
              <strong>{documentJobs.counts.failed || documentJobs.counts.retrying ? 'Background jobs need attention' : 'Background jobs healthy'}</strong>
              <span>
                {documentJobs.counts.queued} queued · {documentJobs.counts.processing} processing · {documentJobs.counts.completed} completed
                {documentJobs.counts.retrying ? ` · ${documentJobs.counts.retrying} retrying` : ''}
                {documentJobs.counts.failed ? ` · ${documentJobs.counts.failed} failed` : ''}
              </span>
            </div>
            {documentJobs.needsAttention.length > 0 ? (
              <ul>
                {documentJobs.needsAttention.map((job) => (
                  <li key={job.id}>Entry {job.entryId} {job.kind === 'tfl' ? 'temporary license' : 'contract'}: {job.error || job.status}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {uploadJobs ? (
          <div className={uploadJobs.failed || uploadJobs.retrying ? 'job-health has-warning' : 'job-health'}>
            <div>
              <strong>{uploadJobs.failed || uploadJobs.retrying ? 'Artwork uploads need attention' : 'Artwork uploads healthy'}</strong>
              <span>{uploadJobs.queued} queued · {uploadJobs.processing} processing · {uploadJobs.completed} completed{uploadJobs.retrying ? ` · ${uploadJobs.retrying} retrying` : ''}{uploadJobs.failed ? ` · ${uploadJobs.failed} failed` : ''}</span>
            </div>
          </div>
        ) : null}
        {status === 'loading' ? <p className="audit-empty">Loading change history…</p> : null}
        {status !== 'loading' && status !== 'ready' ? <p className="audit-empty">{status}</p> : null}
        {status === 'ready' && records.length === 0 ? <p className="audit-empty">No changes have been recorded yet.</p> : null}
        {status === 'ready' && records.length > 0 ? (
          <div className="audit-list">
            {records.map((record) => (
              <article className="audit-entry" key={record.id}>
                <History size={18} aria-hidden="true" />
                <div>
                  <strong>{AUDIT_ACTION_LABELS[record.action] || record.action}</strong>
                  <span>{record.actorEmail}{record.entryId ? ` · Entry ${record.entryId}` : ''}</span>
                  {record.changedFields?.length ? <small>Fields: {record.changedFields.join(', ')}</small> : null}
                </div>
                <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
