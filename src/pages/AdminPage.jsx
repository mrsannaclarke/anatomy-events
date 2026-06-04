import { ClipboardList, ExternalLink, FileSpreadsheet, RefreshCw, ShieldCheck } from 'lucide-react';

import { FULL_PAYOUT_ACCESS_EMAILS, normalizeKey } from '../auth.js';
import project from '../../project.json';

export function AdminPage({ viewer, onOpenPage, onRefresh }) {
  const canOpenPayoutLedger = FULL_PAYOUT_ACCESS_EMAILS.has(normalizeKey(viewer.email));
  const sheetUrl = project?.source_links?.sheet_url || '';
  const scriptUrl = project?.source_links?.script_url || '';

  return (
    <section className="page-stack">
      <div className="panel-heading">
        <div>
          <h2>Admin Tools</h2>
          <p>Action hub for Sheet-backed event operations.</p>
        </div>
        <span className="status-pill">
          <ShieldCheck size={14} />
          {viewer.email}
        </span>
      </div>

      <section className="admin-action-grid">
        <a className="admin-action" href={sheetUrl} target="_blank" rel="noreferrer">
          <FileSpreadsheet size={20} />
          <strong>Open Event Details gSheet</strong>
          <span>Production Sheet source of truth.</span>
          <ExternalLink size={14} />
        </a>
        <a className="admin-action" href={scriptUrl} target="_blank" rel="noreferrer">
          <ClipboardList size={20} />
          <strong>Open Apps Script</strong>
          <span>Production web app deployment.</span>
          <ExternalLink size={14} />
        </a>
        <button type="button" className="admin-action" onClick={onRefresh}>
          <RefreshCw size={20} />
          <strong>Refresh Sheet Data</strong>
          <span>Pull current Event rows into the app cache.</span>
        </button>
        <button type="button" className="admin-action" onClick={() => onOpenPage('auditLog')}>
          <ClipboardList size={20} />
          <strong>Open Audit Log</strong>
          <span>Review recent Sheet-backed app writes.</span>
        </button>
        {canOpenPayoutLedger ? (
          <button type="button" className="admin-action" onClick={() => onOpenPage('payoutLedger')}>
            <ClipboardList size={20} />
            <strong>Open Payout Ledger</strong>
            <span>Completed-event shop totals and waterfall.</span>
          </button>
        ) : null}
      </section>
    </section>
  );
}
