export function splitNames(value) {
  return String(value || '')
    .split(/[,;\n/&]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinNames(names) {
  return names.filter(Boolean).join(', ');
}

export function buildClientContactClipboardText({ clientName, email, contactPhone }) {
  return [
    ['Client', clientName],
    ['Email', email],
    ['Phone', contactPhone],
  ]
    .map(([label, value]) => [label, String(value || '').trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

export function toggleBoundedSelection(list, value, max, noneValue = 'None') {
  if (value === noneValue) return list.includes(noneValue) ? [] : [noneValue];

  const base = list.filter((item) => item !== noneValue);
  if (base.includes(value)) return base.filter((item) => item !== value);

  const limit = Math.max(1, Number(max) || 1);
  if (base.length < limit) return [...base, value];
  return [...base.slice(0, limit - 1), value];
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
