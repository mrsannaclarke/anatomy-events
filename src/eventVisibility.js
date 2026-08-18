import { isZeroWalkUpPricing } from './pricingMath.js';

function parseLocalEventDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{2,4}))/);
  if (!match) return null;

  const yearText = match[1] || match[6];
  const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
  const month = Number(match[2] || match[4]);
  const day = Number(match[3] || match[5]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function isExpiredStaffingOnlyEvent(event, now = new Date()) {
  if (!isZeroWalkUpPricing(event.raw || event)) return false;

  const eventDate = parseLocalEventDate(event.raw?.eventDate || event.eventDate);
  if (!eventDate) return false;

  const hideAt = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate() + 1);
  return now >= hideAt;
}
