const STAFF_COLOR_MAP = {
  anna: '#1aa7a1',
  anne: '#8b5cf6',
  agnes: '#fa8072',
  drew: '#ff4fa8',
  jacob: '#8f5ab8',
  jake: '#ff8c00',
  jason: '#1f4ea8',
  jayden: '#e14b2d',
  jazz: '#b0e0e6',
  kevin: '#8e1d4a',
  veda: '#8e1d4a',
  lindsay: '#ffd54f',
  lucky: '#9acd32',
  megan: '#b57edc',
  shy: '#1e6bff',
  sienna: '#228b22',
  sisi: '#a66a3a',
  summer: '#3eb489',
  tomma: '#c72c67',
};

const FALLBACK_STAFF_COLOR = '#8AA4BF';
let liveStaffColorMap = {};

function normalizeName(name) {
  return String(name || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[’']s$/i, '')
    .trim()
    .toLowerCase();
}

export function getStaffColor(name) {
  return liveStaffColorMap[normalizeName(name)] || STAFF_COLOR_MAP[normalizeName(name)] || FALLBACK_STAFF_COLOR;
}

export function setLiveStaffColors(staffRows = []) {
  liveStaffColorMap = staffRows.reduce((acc, row) => {
    const color = String(row?.['Color Hex'] || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return acc;
    const names = [row.Name, row['ED Entry'], ...(String(row['Alias Names'] || '').split(','))].map((name) => normalizeName(name)).filter(Boolean);
    names.forEach((name) => {
      acc[name] = color;
    });
    return acc;
  }, {});
}

export function hexToRgba(hex, alpha) {
  const cleaned = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return `rgba(138, 164, 191, ${alpha})`;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastTextForHex(hex) {
  const cleaned = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return '#f7fbff';
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0b1117' : '#f7fbff';
}
