function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

type LoginCapabilityUser = {
  email?: string | null;
  disablePayoutAccess?: boolean;
};

const FULL_PAYOUT_ACCESS_EMAILS = new Set<string>([
  'events.anatomytattoo@gmail.com',
  'tattoosbytomma@gmail.com',
  'admin@anatomytattoo.com',
  'mrs.annaclarke@gmail.com',
]);

export function hasFullPayoutAccessForEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(String(email || ''));
  if (!normalized) return false;
  return FULL_PAYOUT_ACCESS_EMAILS.has(normalized);
}

export function hasFullPayoutAccessForUser(user: LoginCapabilityUser | null | undefined): boolean {
  if (user?.disablePayoutAccess) return false;
  return hasFullPayoutAccessForEmail(user?.email);
}
