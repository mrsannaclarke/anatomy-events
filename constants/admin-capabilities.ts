function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const PAYOUT_DISABLED_EMAILS = new Set<string>(['anatomytattoo@gmail.com']);
const ADMIN_PROMOTION_DISABLED_EMAILS = new Set<string>(['anatomytattoo@gmail.com']);

export function isPayoutDisabledForEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(String(email || ''));
  if (!normalized) return false;
  return PAYOUT_DISABLED_EMAILS.has(normalized);
}

export function isAdminPromotionDisabledForEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(String(email || ''));
  if (!normalized) return false;
  return ADMIN_PROMOTION_DISABLED_EMAILS.has(normalized);
}
