import { useEffect, useMemo, useState } from 'react';

import { AdminBackButton } from '../components/AdminBackButton.jsx';
import { buildPricingPayoutMap, calculateEventPayout, formatPayout, getCompletedYear, getPeopleFromEvents, isCompletedForPay, isCancelledForPay, sortPayoutLedgerCards } from '../payoutMath.js';
import { isZeroWalkUpPricing } from '../pricingMath.js';
import { pullPricingRulesFromSheet } from '../sheetClient.js';

export function PayoutLedgerPage({ events, onBack }) {
  const [selectedYear, setSelectedYear] = useState('All');
  const [pricingPayoutMap, setPricingPayoutMap] = useState({});
  const people = useMemo(() => getPeopleFromEvents(events), [events]);
  useEffect(() => {
    let active = true;
    pullPricingRulesFromSheet()
      .then((rows) => {
        if (active) setPricingPayoutMap(buildPricingPayoutMap(rows));
      })
      .catch(() => {
        // The payout framework's recorded defaults remain available offline.
      });
    return () => {
      active = false;
    };
  }, []);
  const cards = useMemo(
    () =>
      events
        .filter((event) => isCompletedForPay(event) && !isCancelledForPay(event) && !isZeroWalkUpPricing(event))
        .map((event) => calculateEventPayout(event, people, pricingPayoutMap))
        .sort(sortPayoutLedgerCards),
    [events, people, pricingPayoutMap],
  );
  const yearOptions = useMemo(() => {
    const years = [...new Set(cards.map((card) => getCompletedYear(card.event)).filter(Boolean))].sort((a, b) => {
      if (a === 'Untracked') return 1;
      if (b === 'Untracked') return -1;
      return Number(b) - Number(a);
    });
    return ['All', ...years];
  }, [cards]);
  const visibleCards = selectedYear === 'All' ? cards : cards.filter((card) => getCompletedYear(card.event) === selectedYear);

  return (
    <section className="page-stack admin-subpage">
      <div className="panel-heading">
        <div>
          <AdminBackButton onClick={onBack} />
          <h2>Payout Ledger</h2>
          <p>Completed events are priced, allocated, and reconciled automatically.</p>
        </div>
      </div>
      <section className="tool-panel">
        <label className="field">
          <span>Year</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
            {yearOptions.map((year) => <option key={year}>{year}</option>)}
          </select>
        </label>
      </section>
      <section className="ledger-list">
        {visibleCards.map((card) => (
          <article key={card.event.id} className="ledger-card">
            <div>
              <h3>{card.event.clientName}</h3>
              <p>{card.event.eventDate || 'No date'}</p>
            </div>
            <dl>
              <div><dt>Gross</dt><dd>{formatPayout(card.gross)}</dd></div>
              <div><dt>Staff Paid</dt><dd>{formatPayout(card.staffPaid)}</dd></div>
              <div><dt>Tomma Captured to Shop</dt><dd>{formatPayout(card.shopCaptured)}</dd></div>
              <div><dt>Additional Shop Earnings</dt><dd>{formatPayout(card.shopOwnEarnings)}</dd></div>
              <div><dt>Shop Total</dt><dd>{formatPayout(card.shopTotal)}</dd></div>
              <div><dt>Remainder</dt><dd>{formatPayout(card.remainder)}</dd></div>
            </dl>
            {card.lines.length ? (
              <div className="staff-lines">
                {card.lines.map((line) => (
                  <span key={`${card.event.id}-${line.person}`}>{line.person}: {formatPayout(line.row.totalPayout)}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
