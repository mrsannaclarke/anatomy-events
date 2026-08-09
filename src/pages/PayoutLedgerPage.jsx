import { useMemo, useState } from 'react';

import { formatPayout, getCompletedYear, getPeopleFromEvents, getPersonPayRow, isCompletedForPay, isCancelledForPay } from '../payoutMath.js';
import { parseMoney } from '../pricingMath.js';

export function PayoutLedgerPage({ events, onBack }) {
  const [selectedYear, setSelectedYear] = useState('All');
  const people = useMemo(() => getPeopleFromEvents(events), [events]);
  const cards = useMemo(
    () =>
      events
        .filter((event) => isCompletedForPay(event) && !isCancelledForPay(event))
        .map((event) => {
          const lines = people.map((person) => ({ person, row: getPersonPayRow(event, person) })).filter((line) => line.row?.totalPayout > 0);
          const staffPaid = lines.filter((line) => line.person !== 'Tomma').reduce((sum, line) => sum + line.row.totalPayout, 0);
          const shopCaptured = lines.filter((line) => line.person === 'Tomma').reduce((sum, line) => sum + line.row.totalPayout, 0);
          const gross = parseMoney(event.raw?.totalCharge || event.raw?.computedTotal || event.raw?.balanceDue || 0);
          const shopTotal = Math.max(0, gross - staffPaid);
          return { event, lines, gross, staffPaid, shopCaptured, shopTotal, remainder: gross - staffPaid - shopTotal };
        }),
    [events, people],
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
    <section className="page-stack">
      <div className="panel-heading">
        <div>
          <h2>Payout Ledger</h2>
          <p>Completed-event gross, staff, shop, and remainder summary.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onBack}>Back to Admin</button>
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
              <div><dt>Captured to Shop</dt><dd>{formatPayout(card.shopCaptured)}</dd></div>
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
