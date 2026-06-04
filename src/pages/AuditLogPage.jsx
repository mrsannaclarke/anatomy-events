import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { pullAuditRows } from '../sheetClient.js';

function formatPayload(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const viewer = [parsed.viewerName, parsed.viewerEmail].filter(Boolean).join(' · ');
    const client = parsed.clientName ? `Client: ${parsed.clientName}` : '';
    return [viewer, client].filter(Boolean).join(' | ') || value;
  } catch {
    return value || '';
  }
}

export function AuditLogPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  async function loadAuditRows() {
    setStatus('loading');
    try {
      const nextRows = await pullAuditRows(150);
      setRows(nextRows);
      setStatus('ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load audit log.');
    }
  }

  useEffect(() => {
    void loadAuditRows();
  }, []);

  return (
    <section className="page-stack">
      <div className="panel-heading">
        <div>
          <h2>Audit Log</h2>
          <p>Latest Sheet-backed app writes and admin actions.</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back to Admin
          </button>
          <button type="button" className="secondary-button" onClick={loadAuditRows}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <section className="ledger-list">
        {status === 'loading' ? <p className="info-line">Loading audit log...</p> : null}
        {status !== 'loading' && status !== 'ready' ? <p className="save-status">{status}</p> : null}
        {status === 'ready' && rows.length === 0 ? (
          <section className="empty-state">
            <strong>No audit entries yet.</strong>
            <span>App saves will appear here after the next successful write.</span>
          </section>
        ) : null}
        {rows.map((row) => {
          const [at, actorEmail, action, entryId, targetSheet, payloadJson] = row.cells || [];
          return (
            <article key={row.rowNumber} className="ledger-card">
              <div>
                <h3>{action || 'Audit Entry'}</h3>
                <p>{at || 'No timestamp'}</p>
              </div>
              <dl>
                <div><dt>Entry ID</dt><dd>{entryId || '-'}</dd></div>
                <div><dt>Sheet</dt><dd>{targetSheet || '-'}</dd></div>
                <div><dt>Actor</dt><dd>{actorEmail || '-'}</dd></div>
              </dl>
              <div className="staff-lines">
                <span>{formatPayload(payloadJson)}</span>
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
