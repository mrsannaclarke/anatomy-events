import { ClipboardList, Code2, ExternalLink, FileSpreadsheet, History, LogOut, ShieldCheck, WalletCards } from 'lucide-react';

import { APPS_SCRIPT_PROJECT_URL, EVENT_SHEET_URL } from '../appConfig.js';
import { FULL_PAYOUT_ACCESS_EMAILS, normalizeKey } from '../auth.js';
import { EVENT_VISUAL_LEGEND } from '../components/EventTypePicker.jsx';

export function AdminPage({ viewer, onOpenPage, onSignOut }) {
  const canOpenPayoutLedger = FULL_PAYOUT_ACCESS_EMAILS.has(normalizeKey(viewer.email));
  const sheetUrl = EVENT_SHEET_URL;
  const scriptUrl = APPS_SCRIPT_PROJECT_URL;
  const canViewAudit = new Set(['admin@anatomytattoo.com', 'mrs.annaclarke@gmail.com']).has(normalizeKey(viewer.email));

  return (
    <section className="page-stack admin-page">
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
        <a className="admin-action admin-action--sheet" href={sheetUrl} target="_blank" rel="noreferrer">
          <FileSpreadsheet size={20} />
          <strong>Open Event Details gSheet</strong>
          <span>Production Sheet source of truth.</span>
          <ExternalLink size={14} />
        </a>
        <a className="admin-action admin-action--script" href={scriptUrl} target="_blank" rel="noreferrer">
          <Code2 size={20} />
          <strong>Open Apps Script</strong>
          <span>Production web app deployment.</span>
          <ExternalLink size={14} />
        </a>
        {canViewAudit ? (
          <button type="button" className="admin-action admin-action--history" onClick={() => onOpenPage('history')}>
            <History size={20} />
            <strong>Change History</strong>
            <span>Review app changes and background job health.</span>
          </button>
        ) : null}
        {canOpenPayoutLedger ? (
          <button type="button" className="admin-action admin-action--ledger" onClick={() => onOpenPage('payoutLedger')}>
            <ClipboardList size={20} />
            <strong>Open Payout Ledger</strong>
            <span>Completed-event shop totals and waterfall.</span>
          </button>
        ) : null}
        <button type="button" className="admin-action admin-action--payments" onClick={() => onOpenPage('counterPayments')}>
          <WalletCards size={20} />
          <strong>Counter Payment Links</strong>
          <span>Open or copy counter payment profiles.</span>
        </button>
        <button type="button" className="admin-action admin-action--signout" onClick={onSignOut}>
          <LogOut size={20} />
          <strong>Sign Out</strong>
          <span>End this session on this device.</span>
        </button>
      </section>
    </section>
  );
}
