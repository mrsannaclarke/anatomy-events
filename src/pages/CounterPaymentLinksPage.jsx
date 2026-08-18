import { useState } from 'react';
import { Check, Copy, ExternalLink, WalletCards } from 'lucide-react';

import { AdminBackButton } from '../components/AdminBackButton.jsx';

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

export function CounterPaymentLinksPage({ onBack }) {
  const [copiedPayoutName, setCopiedPayoutName] = useState('');

  return (
    <section className="page-stack admin-subpage counter-payment-page">
      <div className="panel-heading">
        <div>
          <AdminBackButton onClick={onBack} />
          <h2>Counter Payment Links</h2>
          <p>Open a payment profile or copy the name and link to share it.</p>
        </div>
        <WalletCards size={28} aria-hidden="true" />
      </div>

      <section className="counter-payout-panel" aria-label="Counter payment directory">
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
