import { STAFF_OPTIONS } from './constants.js';

const AUTH_CACHE_KEY = 'events-app-2.0:viewer';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '';

export const FULL_PAYOUT_ACCESS_EMAILS = new Set([
  'events.anatomytattoo@gmail.com',
  'tattoosbytomma@gmail.com',
  'admin@anatomytattoo.com',
  'mrs.annaclarke@gmail.com',
]);

export const PRIMARY_PAYOUT_PERSON_BY_EMAIL = {
  'events.anatomytattoo@gmail.com': 'Shy',
  'tattoosbytomma@gmail.com': 'Tomma',
  'admin@anatomytattoo.com': 'Anna',
  'mrs.annaclarke@gmail.com': 'Anna',
};

export const STAFF_DELEGATES = {
  Megan: ['Jacob'],
  Tomma: ['Kevin', 'Jayden', 'Veda'],
  Shy: ['Jason'],
};

export const ALLOWED_USERS = [
  { email: 'tattoosbytomma@gmail.com', name: 'Tomma' },
  { email: 'ladyshytattoos@gmail.com', name: 'Shy' },
  { email: 'events.anatomytattoo@gmail.com', name: 'Shy' },
  { email: 'event.anatomytattoo@gmail.com', name: 'Shy' },
  { email: 'sketchu2@gmail.com', name: 'Summer' },
  { email: 'sailorsisilia@gmail.com', name: 'Sisi' },
  { email: 'info@agneshamilton.com', name: 'Agnes' },
  { email: 'meganechtattoos@gmail.com', name: 'Megan' },
  { email: 'meganechevarria96@gmail.com', name: 'Megan' },
  { email: 'jazzstahrtattoo@gmail.com', name: 'Jazz' },
  { email: 'jazzstahr@gmail.com', name: 'Jazz' },
  { email: 'appointments@drewlinden.com', name: 'Drew' },
  { email: 'drew@drewlinden.com', name: 'Drew' },
  { email: 'honeyandsass@gmail.com', name: 'Lindsay' },
  { email: 'inkdiva66@gmail.com', name: 'Anne' },
  { email: 'jaketongtattoos@gmail.com', name: 'Jake' },
  { email: 'artsofjayden@gmail.com', name: 'Jayden' },
  { email: 'jamueller01@gmail.com', name: 'Jayden' },
  { email: 'luckymalony@gmail.com', name: 'Lucky' },
  { email: 'sirjasonbarnes@gmail.com', name: 'Jason' },
  { email: 'veda.mueller.27@gmail.com', name: 'Veda' },
  { email: 'breannenorling@gmail.com', name: 'Bree' },
  { email: 'anatomytattoo@gmail.com', name: 'Tomma' },
  { email: 'mrs.annaclarke@gmail.com', name: 'Anna' },
  { email: 'admin@anatomytattoo.com', name: 'Anna' },
];

export function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCachedViewer() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(AUTH_CACHE_KEY) || 'null');
    return cached?.authSource === 'google' && cached?.email ? normalizeViewer(cached) : null;
  } catch {
    return null;
  }
}

export function cacheViewer(viewer) {
  window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ ...viewer, authSource: 'google' }));
}

export function clearCachedViewer() {
  window.localStorage.removeItem(AUTH_CACHE_KEY);
}

export function normalizeViewer(user) {
  const email = normalizeKey(user?.email);
  const allowlisted = ALLOWED_USERS.find((entry) => normalizeKey(entry.email) === email);
  const name = PRIMARY_PAYOUT_PERSON_BY_EMAIL[email] || allowlisted?.name || user?.name || 'Anna';
  return {
    email: allowlisted?.email || user?.email || 'mrs.annaclarke@gmail.com',
    name,
    isAllowlisted: Boolean(allowlisted),
    isAdmin: Boolean(allowlisted),
    canAccessAdminTools: Boolean(allowlisted),
    canUsePayoutFramework: Boolean(allowlisted),
    canViewFullPayout: FULL_PAYOUT_ACCESS_EMAILS.has(email),
  };
}

export function viewerFromGoogleCredential(credential) {
  const payload = decodeJwtPayload(credential);
  return normalizeViewer({
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    authSource: 'google',
  });
}

export function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google sign-in script failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google sign-in script failed to load.'));
    document.head.appendChild(script);
  });
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) throw new Error('Google sign-in did not return a valid credential.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(window.atob(padded));
}

export function getPayoutPeopleForViewer(viewer, allPeople = STAFF_OPTIONS) {
  if (!viewer?.canUsePayoutFramework) return [];
  if (viewer.canViewFullPayout) return allPeople;
  const ownName = viewer.name;
  const delegates = STAFF_DELEGATES[ownName] || [];
  return [ownName, ...delegates].filter(Boolean);
}
