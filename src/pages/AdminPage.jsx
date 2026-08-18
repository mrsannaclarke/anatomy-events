import { useState } from 'react';
import { Check, ClipboardList, Code2, Copy, ExternalLink, FileSpreadsheet, History, LogOut, ShieldCheck, WalletCards } from 'lucide-react';

import { APPS_SCRIPT_PROJECT_URL, EVENT_SHEET_URL } from '../appConfig.js';
import { FULL_PAYOUT_ACCESS_EMAILS, normalizeKey } from '../auth.js';
import { EVENT_VISUAL_LEGEND } from '../components/EventTypePicker.jsx';

const COUNTER_PAYOUT_LINKS = [
  { name: 'Bree', service: 'Venmo', url: 'https://account.venmo.com/u/breezantines' },
  { name: 'Jacob', service: 'Cash App', url: 'https://cash.app/$GingaNJ' },
  { name: 'Jason', service: 'Venmo', url: 'https://account.venmo.com/u/sirjasonbarnes' },
  { name: 'Jayden', service: 'Venmo', url: 'https://account.venmo.com/u/mr_jededed' },
  { name: 'Jazz', service: 'Venmo', url: 'https://account.venmo.com/u/Jazz-Stahr' },
  { name: 'Jeremy', service: 'Venmo', url: 'https://www.venmo.com/u/hellasicktattz666' },
  { name: 'Marissa', service: 'Venmo', url: 'https://account.venmo.com/u/Marissa-Berlin-1' },
  { name: 'Veda', service: 'Venmo', url: 'https://venmo.com/u/Veda-mueller-2' },
];

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
}

export function AdminPage({ viewer, onOpenPage, onSignOut }) {
  const [copiedPayoutName, setCopiedPayoutName] = useState('');
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
        <button type="button" className="admin-action admin-action--signout" onClick={onSignOut}>
          <LogOut size={20} />
          <strong>Sign Out</strong>
          <span>End this session on this device.</span>
        </button>
      </section>

      <section className="counter-payout-panel" aria-labelledby="counter-payout-title">
        <div className="counter-payout-heading">
          <div>
            <span>Payment Directory</span>
            <h3 id="counter-payout-title">Counter Payout Links</h3>
            <p>Open a payment profile or copy the name and link to share it.</p>
          </div>
          <WalletCards size={24} aria-hidden="true" />
        </div>
        <div className="counter-payout-grid">
          {COUNTER_PAYOUT_LINKS.map((entry) => {
            const isCopied = copiedPayoutName === entry.name;
            return (
              <article className="counter-payout-entry" key={entry.name}>
                <a href={entry.url} target="_blank" rel="noreferrer" aria-label={`Open ${entry.name}'s ${entry.service}`}>
                  <span className="counter-payout-avatar" aria-hidden="true">{entry.name.slice(0, 1)}</span>
                  <span className="counter-payout-copy">
                    <strong>{entry.name}</strong>
                    <small>{entry.service}</small>
                  </span>
                  <ExternalLink size={17} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className={isCopied ? 'counter-payout-share is-copied' : 'counter-payout-share'}
                  onClick={async () => {
                    await copyText(`${entry.name} ${entry.url}`);
                    setCopiedPayoutName(entry.name);
                    window.setTimeout(() => setCopiedPayoutName(''), 1800);
                  }}
                  aria-label={`Copy ${entry.name}'s payment link`}
                >
                  {isCopied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </article>
            );
          })}
        </div>
      </section>

    </section>
  );
}
