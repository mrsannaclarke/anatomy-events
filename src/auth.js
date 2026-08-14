import { STAFF_OPTIONS } from './constants.js';
import { ALLOWED_USERS } from '../shared/authPolicy.js';

const AUTH_CACHE_KEY = 'events-app-2.0:viewer';
const GOOGLE_CREDENTIAL_KEY = 'events-app-2.0:google-credential';
const STAY_SIGNED_IN_KEY = 'events-app-2.0:stay-signed-in';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '';

export const FULL_PAYOUT_ACCESS_EMAILS = new Set([
  'events.anatomytattoo@gmail.com',
  'ladyshytattoos@gmail.com',
  'tattoosbytomma@gmail.com',
  'anatomytattoo@gmail.com',
  'admin@anatomytattoo.com',
  'mrs.annaclarke@gmail.com',
]);

export const PRIMARY_PAYOUT_PERSON_BY_EMAIL = {
  'events.anatomytattoo@gmail.com': 'Shy',
  'ladyshytattoos@gmail.com': 'Shy',
  'tattoosbytomma@gmail.com': 'Tomma',
  'anatomytattoo@gmail.com': 'Tomma',
  'admin@anatomytattoo.com': 'Anna',
  'mrs.annaclarke@gmail.com': 'Anna',
};

export { ALLOWED_USERS };

export function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCachedViewer() {
  try {
    const preferredStorage = getStaySignedInPreference() ? window.localStorage : window.sessionStorage;
    const fallbackStorage = preferredStorage === window.localStorage ? window.sessionStorage : window.localStorage;
    const cached = JSON.parse(preferredStorage.getItem(AUTH_CACHE_KEY) || fallbackStorage.getItem(AUTH_CACHE_KEY) || 'null');
    return cached?.authSource === 'google' && cached?.email ? normalizeViewer(cached) : null;
  } catch {
    return null;
  }
}

export function getStaySignedInPreference() {
  return window.localStorage.getItem(STAY_SIGNED_IN_KEY) !== 'false';
}

export function cacheViewer(viewer, credential, staySignedIn = true) {
  window.localStorage.setItem(STAY_SIGNED_IN_KEY, staySignedIn ? 'true' : 'false');
  window.localStorage.removeItem(AUTH_CACHE_KEY);
  window.localStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
  window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  window.sessionStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
  const storage = staySignedIn ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_CACHE_KEY, JSON.stringify({ ...viewer, authSource: 'google' }));
  storage.setItem(GOOGLE_CREDENTIAL_KEY, String(credential || ''));
}

export async function establishAppSession(credential, staySignedIn = true) {
  if (!credential) return false;
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'X-Stay-Signed-In': staySignedIn ? 'true' : 'false',
    },
    credentials: 'same-origin',
  });
  return response.ok;
}

export async function clearAppSession() {
  try {
    await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    // Local sign-out still completes if the network is unavailable.
  }
}

export function clearCachedViewer() {
  window.localStorage.removeItem(AUTH_CACHE_KEY);
  window.localStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
  window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  window.sessionStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
}

function clearGoogleCredential() {
  window.localStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
  window.sessionStorage.removeItem(GOOGLE_CREDENTIAL_KEY);
}

export function getGoogleCredential() {
  const credential = window.localStorage.getItem(GOOGLE_CREDENTIAL_KEY)
    || window.sessionStorage.getItem(GOOGLE_CREDENTIAL_KEY)
    || '';
  if (!credential) return '';

  try {
    const payload = decodeJwtPayload(credential);
    if (!payload.exp || Number(payload.exp) * 1000 <= Date.now()) {
      clearGoogleCredential();
      return '';
    }
    return credential;
  } catch {
    clearGoogleCredential();
    return '';
  }
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
  if (viewer.canViewFullPayout) return [...allPeople].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return viewer.name ? [viewer.name] : [];
}
