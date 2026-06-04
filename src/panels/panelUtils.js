export function splitNames(value) {
  return String(value || '')
    .split(/[,;\n/&]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinNames(names) {
  return names.filter(Boolean).join(', ');
}

const STAFF_ALIASES = {
  'lady shy': 'Shy',
  'tomma mueller': 'Tomma',
  meg: 'Megan',
  babyj: 'Jayden',
  'baby j': 'Jayden',
};

export function normalizeStaffName(name) {
  const key = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return STAFF_ALIASES[key] || String(name || '').trim();
}
