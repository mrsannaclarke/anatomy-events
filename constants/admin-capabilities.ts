function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

type LoginCapabilityUser = {
  email?: string | null;
  disablePayoutAccess?: boolean;
};

const PAYOUT_DISABLED_EMAILS = new Set<string>();

export function isPayoutDisabledForEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(String(email || ''));
  if (!normalized) return false;
  return PAYOUT_DISABLED_EMAILS.has(normalized);
}

export function isPayoutDisabledForUser(user: LoginCapabilityUser | null | undefined): boolean {
  if (user?.disablePayoutAccess) return true;
  return isPayoutDisabledForEmail(user?.email);
}
