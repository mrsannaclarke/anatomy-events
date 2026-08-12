import { ClipboardList, Code2, Download, ExternalLink, FileSpreadsheet, ShieldCheck, Smartphone } from 'lucide-react';

import { FULL_PAYOUT_ACCESS_EMAILS, normalizeKey } from '../auth.js';
import project from '../../project.json';

export function AdminPage({ viewer, onOpenPage, canInstall, isInstalled, onInstall }) {
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
          <Code2 size={20} />
          <strong>Open Apps Script</strong>
          <span>Production web app deployment.</span>
          <ExternalLink size={14} />
        </a>
        {canInstall ? (
          <button type="button" className="admin-action" onClick={onInstall}>
            <Download size={20} />
            <strong>Install Events App</strong>
            <span>Add the standalone app to this device.</span>
          </button>
        ) : (
          <div className="admin-action install-guidance">
            <Smartphone size={20} />
            <strong>{isInstalled ? 'Events App Installed' : 'Install on iPhone or iPad'}</strong>
            <span>{isInstalled ? 'This app is running from your home screen.' : 'In Safari, tap Share, then Add to Home Screen.'}</span>
          </div>
        )}
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
