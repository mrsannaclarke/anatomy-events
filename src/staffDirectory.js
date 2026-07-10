import { COUNTER_OPTIONS, GUEST_ARTIST_OPTION, STAFF_OPTIONS } from './constants.js';

const BASE_ALIASES = {
  Lindsey: 'Lindsay',
  'Lady Shy': 'Shy',
  'Tomma Mueller': 'Tomma',
  meg: 'Megan',
  'Baby J': 'Jayden',
  babyj: 'Jayden',
  Guest: GUEST_ARTIST_OPTION,
  'Guest Artist': GUEST_ARTIST_OPTION,
};

function cleanName(value) {
  return String(value || '').trim();
}

function splitAliases(value) {
  return String(value || '')
    .split(',')
    .map(cleanName)
    .filter(Boolean);
}

function isActive(row) {
  return String(row?.Active || '').trim().toUpperCase() !== 'NO';
}

function hasRole(row, role) {
  return String(row?.Roles || '').toLowerCase().split(',').map((item) => item.trim()).includes(role);
}

function displayName(row) {
  return cleanName(row?.['ED Entry']) || cleanName(row?.Name);
}

function uniqueNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStaffDirectory(staffRows = []) {
  const activeRows = staffRows.filter(isActive);
  const artists = uniqueNames(activeRows.filter((row) => hasRole(row, 'artist')).map(displayName)).sort((a, b) => a.localeCompare(b));
  const artistOptions = uniqueNames([...(artists.length ? artists : STAFF_OPTIONS), GUEST_ARTIST_OPTION]);
  const counterNames = uniqueNames(activeRows.filter((row) => hasRole(row, 'counter')).map(displayName)).sort((a, b) => a.localeCompare(b));
  const counters = [...counterNames, 'None', 'Other'];
  const aliases = activeRows.reduce((acc, row) => {
    const canonical = displayName(row);
    [row.Name, row['Legal Name'], row['ED Entry'], ...splitAliases(row['Alias Names'])].forEach((alias) => {
      const clean = cleanName(alias);
      if (clean && canonical) acc[clean.toLowerCase()] = canonical;
    });
    return acc;
  }, { ...Object.fromEntries(Object.entries(BASE_ALIASES).map(([alias, canonical]) => [alias.toLowerCase(), canonical])) });

  return {
    artists: artistOptions,
    counters: counters.length > 2 ? counters : COUNTER_OPTIONS,
    aliases,
    rows: staffRows,
  };
}

export function normalizeStaffNameFromDirectory(name, aliases = {}) {
  const clean = cleanName(name);
  return aliases[clean.toLowerCase()] || clean;
}
