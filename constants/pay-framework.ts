export const ARTIST_PAY_SHEET_TABS: string[] = [
  'Tomma',
  'Shy',
  'Megan',
  'Sisi',
  'Drew',
  'Agnes',
  'Lindsay',
  'Jayden',
  'Summer',
  'Anna',
  'Jake',
  'Lucky',
  'Anne',
  'Jazz',
];

export const COMPLETED_PAY_STATUSES = new Set(['event complete', 'event complete balance late']);
export const CANCELLED_PAY_STATUSES = new Set(['cancelled', 'canceled']);

export function normalizeStatusKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isCompletedPayStatusValue(value: string): boolean {
  const key = normalizeStatusKey(value);
  if (!key) return false;
  return COMPLETED_PAY_STATUSES.has(key);
}

export function isCancelledPayStatusValue(value: string): boolean {
  const key = normalizeStatusKey(value);
  if (!key) return false;
  return CANCELLED_PAY_STATUSES.has(key);
}

export function normalizeNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const SHOP_CAPTURED_TO_SHOP_NAME_KEYS = new Set<string>(['tomma']);

export function isShopCapturedToShopByName(personName: string): boolean {
  const key = normalizeNameKey(personName);
  if (!key) return false;
  return SHOP_CAPTURED_TO_SHOP_NAME_KEYS.has(key);
}
