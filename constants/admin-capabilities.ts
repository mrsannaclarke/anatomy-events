function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

type LoginCapabilityUser = {
  email?: string | null;
  disablePayoutAccess?: boolean;
  disableAdminPromotion?: boolean;
};

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

export function isPayoutDisabledForUser(user: LoginCapabilityUser | null | undefined): boolean {
  if (user?.disablePayoutAccess) return true;
  return isPayoutDisabledForEmail(user?.email);
}

export function isAdminPromotionDisabledForUser(user: LoginCapabilityUser | null | undefined): boolean {
  if (user?.disableAdminPromotion) return true;
  return isAdminPromotionDisabledForEmail(user?.email);
}
