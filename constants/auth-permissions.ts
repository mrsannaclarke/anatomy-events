export type StaffRole = 'artist' | 'counter' | 'admin';
export type AuthType = 'super_admin' | 'admin' | 'artist' | 'counter_guest';

export type StaffPermission = {
  name: string;
  authType: AuthType;
  roles: StaffRole[];
};

export type AllowedGoogleUser = {
  email: string;
  displayName: string;
  matchNames: string[];
  canViewInfo: boolean;
  authType: AuthType;
};

export const AUTH_TYPES: ReadonlyArray<{ key: AuthType; label: string }> = [
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'admin', label: 'Admin' },
  { key: 'artist', label: 'Artist' },
  { key: 'counter_guest', label: 'Counter/Guest' },
];

export const AUTH_FRAMEWORK_CONFIG = {
  requireAuth: true,
  enableGoogleSignIn: true,
  enableGuestSignIn: false,
} as const;

// Mirrors Pickles schedule guest password for future shared guest flow.
export const GUEST_PASSWORD = 'Tomma3021!';

// Staff permissions scaffold:
// - Includes Pickles artist/counter names
// - Excludes Sienna per request
// - Adds Veda
export const STAFF_PERMISSIONS: StaffPermission[] = [
  { name: 'Tomma', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Shy', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Megan', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Sisi', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Drew', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Agnes', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Lindsay', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Jayden', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Summer', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Anna', authType: 'super_admin', roles: ['artist', 'counter', 'admin'] },
  { name: 'Jake', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Lucky', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Anne', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Jazz', authType: 'artist', roles: ['artist', 'counter'] },
  { name: 'Jacob', authType: 'counter_guest', roles: ['counter'] },
  { name: 'Jason', authType: 'counter_guest', roles: ['counter'] },
  { name: 'Kevin', authType: 'counter_guest', roles: ['counter'] },
  { name: 'Veda', authType: 'counter_guest', roles: ['counter'] },
];

export const GUEST_ALLOWED_NAMES: string[] = STAFF_PERMISSIONS.map((entry) => entry.name);

// Google allowlist scaffold mirrored from Pickles (Sienna removed).
// This is a future-auth config only; login is not enforced right now.
export const ALLOWED_GOOGLE_USERS: AllowedGoogleUser[] = [
  { email: 'tattoosbytomma@gmail.com', displayName: 'Tomma', matchNames: ['Tomma'], canViewInfo: false, authType: 'artist' },
  { email: 'ladyshytattoos@gmail.com', displayName: 'Lady Shy', matchNames: ['Lady Shy', 'Shy'], canViewInfo: false, authType: 'artist' },
  {
    email: 'events.anatomytattoo@gmail.com',
    displayName: 'Lady Shy',
    matchNames: ['Lady Shy', 'Shy'],
    canViewInfo: false,
    authType: 'artist',
  },
  { email: 'sketchu2@gmail.com', displayName: 'Summer', matchNames: ['Summer'], canViewInfo: false, authType: 'artist' },
  { email: 'sailorsisilia@gmail.com', displayName: 'Sisi', matchNames: ['Sisi'], canViewInfo: false, authType: 'artist' },
  { email: 'info@agneshamilton.com', displayName: 'Agnes', matchNames: ['Agnes'], canViewInfo: false, authType: 'artist' },
  { email: 'meganechtattoos@gmail.com', displayName: 'Megan', matchNames: ['Megan'], canViewInfo: false, authType: 'artist' },
  { email: 'meganechevarria96@gmail.com', displayName: 'Megan', matchNames: ['Megan'], canViewInfo: false, authType: 'artist' },
  { email: 'jazzstahrtattoo@gmail.com', displayName: 'Jazz', matchNames: ['Jazz'], canViewInfo: false, authType: 'artist' },
  { email: 'jazzstahr@gmail.com', displayName: 'Jazz', matchNames: ['Jazz'], canViewInfo: false, authType: 'artist' },
  { email: 'appointments@drewlinden.com', displayName: 'Drew', matchNames: ['Drew'], canViewInfo: false, authType: 'artist' },
  { email: 'drew@drewlinden.com', displayName: 'Drew', matchNames: ['Drew'], canViewInfo: false, authType: 'artist' },
  { email: 'honeyandsass@gmail.com', displayName: 'Lindsay', matchNames: ['Lindsay'], canViewInfo: false, authType: 'artist' },
  { email: 'inkdiva66@gmail.com', displayName: 'Anne', matchNames: ['Anne'], canViewInfo: false, authType: 'artist' },
  { email: 'jaketongtattoos@gmail.com', displayName: 'Jake', matchNames: ['Jake'], canViewInfo: false, authType: 'artist' },
  { email: 'artsofjayden@gmail.com', displayName: 'Jayden', matchNames: ['Jayden'], canViewInfo: false, authType: 'artist' },
  { email: 'jamueller01@gmail.com', displayName: 'Jayden', matchNames: ['Jayden'], canViewInfo: false, authType: 'artist' },
  { email: 'luckymalony@gmail.com', displayName: 'Lucky', matchNames: ['Lucky'], canViewInfo: false, authType: 'artist' },
  { email: 'sirjasonbarnes@gmail.com', displayName: 'Jason', matchNames: ['Jason'], canViewInfo: false, authType: 'counter_guest' },
  {
    email: 'veda.mueller.27@gmail.com',
    displayName: 'Veda',
    matchNames: ['Veda'],
    canViewInfo: false,
    authType: 'counter_guest',
  },
  { email: 'breannenorling@gmail.com', displayName: 'Bree', matchNames: ['Bree', 'Breanne'], canViewInfo: true, authType: 'admin' },
  {
    email: 'anatomytattoo@gmail.com',
    displayName: 'Anatomy Tattoo',
    matchNames: ['Anatomy Tattoo'],
    canViewInfo: true,
    authType: 'admin',
  },
  { email: 'mrs.annaclarke@gmail.com', displayName: 'Anna', matchNames: ['Anna'], canViewInfo: true, authType: 'super_admin' },
  { email: 'admin@anatomytattoo.com', displayName: 'Anna', matchNames: ['Anna'], canViewInfo: true, authType: 'super_admin' },
];

export const ALLOWED_GOOGLE_EMAILS_BY_AUTH_TYPE: Readonly<Record<AuthType, string[]>> = {
  super_admin: ALLOWED_GOOGLE_USERS.filter((entry) => entry.authType === 'super_admin').map((entry) => entry.email),
  admin: ALLOWED_GOOGLE_USERS.filter((entry) => entry.authType === 'admin').map((entry) => entry.email),
  artist: ALLOWED_GOOGLE_USERS.filter((entry) => entry.authType === 'artist').map((entry) => entry.email),
  counter_guest: ALLOWED_GOOGLE_USERS.filter((entry) => entry.authType === 'counter_guest').map((entry) => entry.email),
};
