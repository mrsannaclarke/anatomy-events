import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { ALLOWED_EMAILS } from '../shared/authPolicy.js';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_COOKIE = 'anatomy_events_session';
const SESSION_ISSUER = 'anatomy-events.pages.dev';
const SESSION_AUDIENCE = 'anatomy-events-app';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secretKey(secret) {
  return new TextEncoder().encode(String(secret || ''));
}

function cookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export async function authenticateGoogleCredential(credential, clientId) {
  if (!credential) throw new Error('Missing Google credential.');
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  const email = String(payload.email || '').trim().toLowerCase();
  if (payload.email_verified !== true || !ALLOWED_EMAILS.has(email)) {
    throw new Error('This Google account is not authorized.');
  }
  return email;
}

export async function createSessionToken(email, secret) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey(secret));
}

export async function authenticateAppRequest(request, clientId, secret) {
  const authorization = request.headers.get('Authorization') || '';
  const credential = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (credential) return authenticateGoogleCredential(credential, clientId);

  const sessionToken = cookieValue(request, SESSION_COOKIE);
  if (!sessionToken) throw new Error('Missing app session.');
  const { payload } = await jwtVerify(sessionToken, secretKey(secret), {
    algorithms: ['HS256'],
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
  });
  const email = String(payload.email || '').trim().toLowerCase();
  if (!ALLOWED_EMAILS.has(email)) throw new Error('This app session is not authorized.');
  return email;
}

export function sessionCookie(token, persistent = true) {
  const maxAge = persistent ? ` Max-Age=${SESSION_MAX_AGE};` : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api;${maxAge} HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
