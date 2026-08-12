import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Heart, PartyPopper, ScrollText, Sparkles, Users } from 'lucide-react';

import { getPayoutPeopleForViewer, normalizeKey } from '../auth.js';
import { DecorativeSprig } from '../components/DecorativeSprig.jsx';
import {
  buildPricingPayoutMap,
  formatPayout,
  getCompletedYear,
  getPeopleFromEvents,
  getPersonPayRow,
  normalizeNameKey,
} from '../payoutMath.js';
import { pullPricingRulesFromSheet } from '../sheetClient.js';

function roleLabel(role) {
  if (role === 'artist+counter') return 'Artist + Counter';
  if (role === 'counter') return 'Counter';
  return 'Artist';
}

function getEventTypeVisual(eventType) {
  const normalized = String(eventType || '').trim().toLowerCase();
  if (normalized.includes('private')) return { icon: PartyPopper, color: '#b58bff' };
  if (normalized.includes('corporate')) return { icon: BriefcaseBusiness, color: '#6ab7ff' };
  if (normalized.includes('wedding')) return { icon: Heart, color: '#ff7fb8' };
  if (normalized.includes('fundraiser')) return { icon: Users, color: '#7fd29a' };
  return { icon: ScrollText, color: '#f1b56f' };
}

function formatEventDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
  return text || 'No date';
}

function formatCompletedAt(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return 'timestamp pending';
  return parsed.toLocaleString();
}

function modifierItems(row) {
  return [
    ['Custom Flash Bonus', row.artistModifierBreakdown.customFlash],
    ['Radius Share', row.artistModifierBreakdown.radius],
    ['Temporary Tattoos', row.artistModifierBreakdown.temporaryTattoos],
    ['Extra Hourly Share', row.artistModifierBreakdown.extraHourly],
    ['Licensing Split (Historical)', row.artistModifierBreakdown.licensingSplit],
  ].filter(([, amount]) => amount > 0);
}

export function PayoutPage({ events, viewer }) {
  const allPeople = useMemo(() => getPeopleFromEvents(events), [events]);
  const selectablePeople = useMemo(() => getPayoutPeopleForViewer(viewer, allPeople), [allPeople, viewer]);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedYear, setSelectedYear] = useState('All');
  const [pricingPayoutMap, setPricingPayoutMap] = useState({});
  const [syncStatus, setSyncStatus] = useState('loading');

  const canPickPerson = viewer.canViewFullPayout;
  const defaultPerson = viewer.name;
  const effectivePerson = useMemo(() => {
    if (!viewer.canUsePayoutFramework) return '';
    if (!canPickPerson) return defaultPerson;
    const selected = selectablePeople.find((name) => normalizeNameKey(name) === normalizeNameKey(selectedPerson));
    if (selected) return selected;
    return selectablePeople.find((name) => normalizeNameKey(name) === normalizeNameKey(defaultPerson)) || selectablePeople[0] || defaultPerson;
  }, [canPickPerson, defaultPerson, selectablePeople, selectedPerson, viewer.canUsePayoutFramework]);

  useEffect(() => {
    if (!effectivePerson || selectedPerson) return;
    setSelectedPerson(effectivePerson);
  }, [effectivePerson, selectedPerson]);

  useEffect(() => {
    let mounted = true;
    setSyncStatus('loading');
    pullPricingRulesFromSheet()
      .then((rows) => {
        if (!mounted) return;
        setPricingPayoutMap(buildPricingPayoutMap(rows));
        setSyncStatus('ready');
      })
      .catch(() => {
        if (!mounted) return;
        setPricingPayoutMap({});
        setSyncStatus('fallback');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!effectivePerson) return [];
    return events
      .map((event) => getPersonPayRow(event, effectivePerson, pricingPayoutMap))
      .filter((row) => row?.isComplete)
      .sort((a, b) => {
        const aDate = new Date(a.event.raw?.eventDate || a.event.eventDate).getTime();
        const bDate = new Date(b.event.raw?.eventDate || b.event.eventDate).getTime();
        if (Number.isNaN(aDate) && Number.isNaN(bDate)) return a.event.clientName.localeCompare(b.event.clientName);
        if (Number.isNaN(aDate)) return 1;
        if (Number.isNaN(bDate)) return -1;
        return bDate - aDate;
      });
  }, [effectivePerson, events, pricingPayoutMap]);

  const yearOptions = useMemo(() => {
    const years = [...new Set(rows.map((row) => getCompletedYear(row.event)).filter((year) => year && year !== 'Untracked'))].sort((a, b) => Number(b) - Number(a));
    return ['All', ...years];
  }, [rows]);
  const effectiveYear = yearOptions.includes(selectedYear) ? selectedYear : 'All';
  const visibleRows = useMemo(() => (effectiveYear === 'All' ? rows : rows.filter((row) => getCompletedYear(row.event) === effectiveYear)), [effectiveYear, rows]);
  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (sum, row) => ({
          total: sum.total + row.totalPayout,
          artist: sum.artist + row.artistPayout,
          counter: sum.counter + row.counterPayout,
        }),
        { total: 0, artist: 0, counter: 0 },
      ),
    [visibleRows],
  );
  const totalsByYear = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      const key = getCompletedYear(row.event) || 'Untracked';
      if (!acc[key]) acc[key] = { total: 0, artist: 0, counter: 0 };
      acc[key].total += row.totalPayout;
      acc[key].artist += row.artistPayout;
      acc[key].counter += row.counterPayout;
      return acc;
    }, {});
  }, [visibleRows]);
  const totalsByYearKeys = useMemo(() => Object.keys(totalsByYear).sort((a, b) => {
    if (a === 'Untracked') return 1;
    if (b === 'Untracked') return -1;
    return Number(b) - Number(a);
  }), [totalsByYear]);

  if (!viewer.canUsePayoutFramework) {
    return (
      <section className="empty-state">
        <DecorativeSprig placement="empty" />
        <strong>Pay Schedule</strong>
        <span>Pay schedule is visible to allowlisted Anatomy users.</span>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="panel-heading">
        <DecorativeSprig />
        <div>
          <h2>Pay Schedule</h2>
          <p>{canPickPerson ? 'Full payout picker enabled for this login.' : 'Access limited to your own and delegated payout schedules.'}</p>
        </div>
        <span className="status-pill">{syncStatus === 'ready' ? 'Pricing rules live' : 'Schedule fallback'}</span>
      </div>

      <section className="tool-panel">
        <div className="form-grid">
          <label className="field">
            <span>Year</span>
            <select value={effectiveYear} onChange={(event) => setSelectedYear(event.target.value)}>
              {yearOptions.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Person</span>
            {canPickPerson ? (
              <select value={effectivePerson} onChange={(event) => setSelectedPerson(event.target.value)}>
                {selectablePeople.map((person) => (
                  <option key={person}>{person}</option>
                ))}
              </select>
            ) : (
              <div className="readonly-select">
                {effectivePerson}
                <ChevronDown size={16} />
              </div>
            )}
          </label>
        </div>
      </section>

      <section className="summary-grid">
        <div>
          <span>Total</span>
          <strong>{formatPayout(totals.total)}</strong>
        </div>
        <div>
          <span>Artist</span>
          <strong>{formatPayout(totals.artist)}</strong>
        </div>
        <div>
          <span>Counter</span>
          <strong>{formatPayout(totals.counter)}</strong>
        </div>
      </section>

      <section className="tool-panel">
        <h3 className="section-title-tight">Completed Totals by Year</h3>
        {totalsByYearKeys.length === 0 ? (
          <p className="info-line">No completed payouts yet.</p>
        ) : (
          <div className="year-total-list">
            {totalsByYearKeys.map((year) => (
              <div key={year} className="year-total-row">
                <strong>{year}</strong>
                <span>Total {formatPayout(totalsByYear[year].total)}</span>
                <span>Artist {formatPayout(totalsByYear[year].artist)}</span>
                <span>Counter {formatPayout(totalsByYear[year].counter)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ledger-list">
        <h3 className="section-title-tight">Assigned Events</h3>
        {visibleRows.length === 0 ? (
          <section className="empty-state">
            <DecorativeSprig placement="empty" />
            <strong>No completed payouts found.</strong>
            <span>{effectivePerson ? `${effectivePerson} has no completed rows for this filter.` : 'Select a person to view payout rows.'}</span>
          </section>
        ) : null}
        {visibleRows.map((row) => {
          const eventVisual = getEventTypeVisual(row.event.raw?.eventType);
          const EventIcon = eventVisual.icon || Sparkles;
          return (
            <article key={`${row.event.entryId}-${normalizeKey(effectivePerson)}`} className="ledger-card payout-event-card">
              <div className="payout-card-top">
                <div>
                  <div className="payout-title-row">
                    <span className="event-type-dot small" style={{ borderColor: eventVisual.color }}>
                      <EventIcon size={13} color={eventVisual.color} />
                    </span>
                    <h3 style={{ color: eventVisual.color }}>{row.event.clientName}</h3>
                  </div>
                  <strong>{formatPayout(row.totalPayout)}</strong>
                </div>
                <div className="payout-date-block">
                  <span>{formatEventDate(row.event.raw?.eventDate || row.event.eventDate)}</span>
                  <span>Completed: {formatCompletedAt(row.event.raw?.eventCompletedAt)}</span>
                </div>
              </div>
              <div className="payout-breakdown-row">
                <span className="role-chip">Role: {roleLabel(row.role)}</span>
                <div className="payout-breakdown-lines">
                  {row.role !== 'counter' ? <span>Artist Base {formatPayout(row.artistBasePayout)}</span> : null}
                  {row.counterPayout > 0 ? <span>Counter {formatPayout(row.counterPayout)}</span> : null}
                  {modifierItems(row).map(([label, amount]) => (
                    <span key={label}>
                      {label} {formatPayout(amount)}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
