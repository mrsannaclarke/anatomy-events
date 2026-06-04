import { useState } from 'react';
import { Save } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { COUNTER_OPTIONS, STAFF_OPTIONS } from '../constants.js';
import { ARTIST_COUNTS } from '../pricingMath.js';
import { pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';
import { getContrastTextForHex, getStaffColor, hexToRgba } from '../staffColors.js';
import { joinNames, normalizeStaffName, splitNames } from './panelUtils.js';

function staffChipStyle(name, selected) {
  const color = getStaffColor(name);
  return {
    '--staff-color': color,
    '--staff-color-muted': hexToRgba(color, 0.14),
    '--staff-color-border': hexToRgba(color, 0.55),
    '--staff-selected-text': getContrastTextForHex(color),
  };
}

export function StaffAssignmentsPanel({ event, onSaved }) {
  const raw = event.raw || {};
  const [artistCount, setArtistCount] = useState(raw.numberOfArtists || '1');
  const [artists, setArtists] = useState(() => splitNames(raw.artistNames).map(normalizeStaffName).slice(0, Number(raw.numberOfArtists) || 1));
  const [counters, setCounters] = useState(() => splitNames(raw.counterNames).slice(0, 2));
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function toggleFromList(list, value, max) {
    if (value === 'None') return list.includes('None') ? [] : ['None'];
    const base = list.filter((item) => item !== 'None');
    if (base.includes(value)) return base.filter((item) => item !== value);
    return [...base, value].slice(0, max);
  }

  async function saveStaffAssignments() {
    setStatus('Saving staff assignments to Sheet...');
    setIsSaving(true);
    try {
      const saved = await upsertEventToSheet({
        ...raw,
        numberOfArtists: artistCount,
        artistNames: joinNames(artists.map(normalizeStaffName).slice(0, Number(artistCount) || 1)),
        counterNames: joinNames(counters),
      });
      onSaved(saved.entryId ? (await pullEventByEntryId(saved.entryId)) || saved : saved);
      setStatus('Saved staff assignments.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save staff assignments.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="detail-stack pending-scope">
      <PendingOverlay show={isSaving} label="Saving staff assignments to Sheet..." />
      <div className="form-grid">
        <Field label="Number of Artists">
          <select value={artistCount} onChange={(input) => setArtistCount(input.target.value)}>
            {ARTIST_COUNTS.map((count) => (
              <option key={count}>{count}</option>
            ))}
          </select>
        </Field>
      </div>

      <section className="picker-section">
        <h3>Artists</h3>
        <div className="chip-grid">
          {STAFF_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              style={staffChipStyle(name, artists.includes(name))}
              className={artists.includes(name) ? 'choice-chip selected' : 'choice-chip'}
              onClick={() => setArtists((current) => toggleFromList(current, name, Number(artistCount) || 1))}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="picker-section">
        <h3>Counter Staff</h3>
        <div className="chip-grid">
          {COUNTER_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              style={staffChipStyle(name, counters.includes(name))}
              className={counters.includes(name) ? 'choice-chip selected' : 'choice-chip'}
              onClick={() => setCounters((current) => toggleFromList(current, name, 2))}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="primary-button detail-save" onClick={saveStaffAssignments} disabled={isSaving}>
        <Save size={16} />
        Save Staff Assignments
      </button>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
  );
}
