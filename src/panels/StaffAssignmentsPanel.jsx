import { useState } from 'react';
import { Save } from 'lucide-react';

import { Field } from '../components/Field.jsx';
import { PendingOverlay } from '../components/PendingOverlay.jsx';
import { COUNTER_OPTIONS, STAFF_OPTIONS } from '../constants.js';
import { ARTIST_COUNTS } from '../pricingMath.js';
import { pullEventByEntryId, upsertEventToSheet } from '../sheetClient.js';
import { getContrastTextForHex, getStaffColor, hexToRgba } from '../staffColors.js';
import { joinNames, normalizeStaffName, splitNames } from './panelUtils.js';

const OTHER_OPTION = 'Other';
const ARTIST_OPTIONS = [...STAFF_OPTIONS, OTHER_OPTION];
const KNOWN_ARTISTS = new Set(STAFF_OPTIONS.map((name) => name.toLowerCase()));
const KNOWN_COUNTERS = new Set(COUNTER_OPTIONS.filter((name) => name !== OTHER_OPTION).map((name) => name.toLowerCase()));

function buildPickerState(value, knownNames, normalize = (name) => name) {
  const names = splitNames(value).map(normalize);
  const customNames = names.filter((name) => !knownNames.has(name.toLowerCase()) && name !== OTHER_OPTION);
  const selections = names.filter((name) => knownNames.has(name.toLowerCase()));
  if (customNames.length > 0 || names.includes(OTHER_OPTION)) selections.push(OTHER_OPTION);
  return { selections, customName: joinNames(customNames) };
}

function expandWriteIn(selection, customName, max) {
  const expanded = selection.flatMap((name) => (name === OTHER_OPTION ? splitNames(customName) : [name]));
  return expanded.filter((name) => name !== 'None').slice(0, max);
}

function staffChipStyle(name) {
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
  const initialArtists = buildPickerState(raw.artistNames, KNOWN_ARTISTS, normalizeStaffName);
  const initialCounters = buildPickerState(raw.counterNames, KNOWN_COUNTERS);
  const [artistCount, setArtistCount] = useState(raw.numberOfArtists || '1');
  const [artists, setArtists] = useState(() => initialArtists.selections.slice(0, Number(raw.numberOfArtists) || 1));
  const [artistWriteIn, setArtistWriteIn] = useState(initialArtists.customName);
  const [counters, setCounters] = useState(() => initialCounters.selections.slice(0, 2));
  const [counterWriteIn, setCounterWriteIn] = useState(initialCounters.customName);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function toggleFromList(list, value, max) {
    if (value === 'None') return list.includes('None') ? [] : ['None'];
    const base = list.filter((item) => item !== 'None');
    if (base.includes(value)) return base.filter((item) => item !== value);
    return [...base, value].slice(0, max);
  }

  async function saveStaffAssignments() {
    const artistNames = expandWriteIn(artists, artistWriteIn, Number(artistCount) || 1).map(normalizeStaffName);
    const counterNames = expandWriteIn(counters, counterWriteIn, 2);
    if (artists.includes(OTHER_OPTION) && !artistWriteIn.trim()) {
      setStatus('Enter the tattooer name for Other before saving.');
      return;
    }
    if (counters.includes(OTHER_OPTION) && !counterWriteIn.trim()) {
      setStatus('Enter the counter staff name for Other before saving.');
      return;
    }

    setStatus('Saving staff assignments to Sheet...');
    setIsSaving(true);
    try {
      const saved = await upsertEventToSheet({
        ...raw,
        numberOfArtists: artistCount,
        artistNames: joinNames(artistNames),
        counterNames: joinNames(counterNames),
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
          {ARTIST_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              style={staffChipStyle(name)}
              className={artists.includes(name) ? 'choice-chip selected' : 'choice-chip'}
              onClick={() => setArtists((current) => toggleFromList(current, name, Number(artistCount) || 1))}
            >
              {name}
            </button>
          ))}
        </div>
        {artists.includes(OTHER_OPTION) ? (
          <Field label="Tattooer name">
            <input value={artistWriteIn} onChange={(input) => setArtistWriteIn(input.target.value)} placeholder="Enter tattooer name" />
          </Field>
        ) : null}
      </section>

      <section className="picker-section">
        <h3>Counter Staff</h3>
        <div className="chip-grid">
          {COUNTER_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              style={staffChipStyle(name)}
              className={counters.includes(name) ? 'choice-chip selected' : 'choice-chip'}
              onClick={() => setCounters((current) => toggleFromList(current, name, 2))}
            >
              {name}
            </button>
          ))}
        </div>
        {counters.includes(OTHER_OPTION) ? (
          <Field label="Counter staff name">
            <input value={counterWriteIn} onChange={(input) => setCounterWriteIn(input.target.value)} placeholder="Enter counter staff name" />
          </Field>
        ) : null}
      </section>

      <button type="button" className="primary-button detail-save" onClick={saveStaffAssignments} disabled={isSaving}>
        <Save size={16} />
        Save Staff Assignments
      </button>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
  );
}
