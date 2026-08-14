import { useState } from 'react';
import { ClipboardList, Code2, Download, ExternalLink, FileSpreadsheet, Share, ShieldCheck, Smartphone, X } from 'lucide-react';

import { FULL_PAYOUT_ACCESS_EMAILS, normalizeKey } from '../auth.js';
import project from '../../project.json';

export function AdminPage({ viewer, onOpenPage, canInstall, isInstalled, onInstall }) {
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const canOpenPayoutLedger = FULL_PAYOUT_ACCESS_EMAILS.has(normalizeKey(viewer.email));
  const sheetUrl = project?.source_links?.sheet_url || '';
  const scriptUrl = project?.source_links?.script_url || '';

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
        {canInstall ? (
          <button type="button" className="admin-action admin-action--install" onClick={onInstall}>
            <Download size={20} />
            <strong>Install Events App</strong>
            <span>Add the standalone app to this device.</span>
          </button>
        ) : isInstalled ? (
          <div className="admin-action admin-action--install install-guidance">
            <Smartphone size={20} />
            <strong>Events App Installed</strong>
            <span>This app is running from your home screen.</span>
          </div>
        ) : (
          <button type="button" className="admin-action admin-action--install" onClick={() => setShowInstallHelp(true)}>
            <Smartphone size={20} />
            <strong>Install on iPhone or iPad</strong>
            <span>Show the Safari installation steps.</span>
          </button>
        )}
        {canOpenPayoutLedger ? (
          <button type="button" className="admin-action admin-action--ledger" onClick={() => onOpenPage('payoutLedger')}>
            <ClipboardList size={20} />
            <strong>Open Payout Ledger</strong>
            <span>Completed-event shop totals and waterfall.</span>
          </button>
        ) : null}
      </section>
      {showInstallHelp ? (
        <div className="install-help-overlay" role="presentation" onClick={() => setShowInstallHelp(false)}>
          <section className="install-help-dialog" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="install-help-close" onClick={() => setShowInstallHelp(false)} aria-label="Close installation instructions">
              <X size={20} />
            </button>
            <Smartphone size={34} />
            <h3 id="install-help-title">Add Events App to your iPhone</h3>
            <ol>
              <li>Open this page in <strong>Safari</strong>.</li>
              <li>Tap the <Share size={18} aria-hidden="true" /> <strong>Share</strong> button.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>.</li>
            </ol>
            <button type="button" className="primary-button" onClick={() => setShowInstallHelp(false)}>Got It</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}
