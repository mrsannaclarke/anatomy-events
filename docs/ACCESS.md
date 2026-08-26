# Access and Permissions

Last reviewed: 2026-08-26

This document summarizes current access behavior. The canonical email allowlist and staff identity mapping live in `shared/authPolicy.js`; payout visibility is defined in `src/auth.js`. Update code, tests, and this summary together.

## Authentication boundary

- The app is staff-only and requires Google sign-in.
- An account must appear in `shared/authPolicy.js` to enter the app and send Sheet mutations.
- Cloudflare verifies either a current Google credential or a signed secure app-session cookie before proxying requests.
- Apps Script accepts server-to-server actions through the configured sync token; the browser does not receive that token.
- Secrets belong in untracked environment files, Cloudflare secrets, or Apps Script properties—not in project documentation.

## Standard allowlisted user

- Can use the staff app and ordinary Admin links.
- Can create and update normal event data through the authenticated Cloudflare proxy.
- Can see only the payout identity mapped to their signed-in email.
- Cannot add post-deposit balance changes, regenerate a contract, delete communication entries, or view Change History unless separately authorized below.

## Full payout access

These identities receive the complete Pay Schedule person selector and full payout visibility:

- Anna: `admin@anatomytattoo.com`, `mrs.annaclarke@gmail.com`
- Shy: `events.anatomytattoo@gmail.com`, `ladyshytattoos@gmail.com`
- Tomma: `tattoosbytomma@gmail.com`, `anatomytattoo@gmail.com`

All other allowlisted accounts are restricted to their mapped person's payout data. Jeremy's counter identity is mapped to `hellasicktattz@gmail.com`.

## Change History access

The D1-backed Change History, job health, and Cloudflare monitoring screen is limited to:

- `admin@anatomytattoo.com`
- `mrs.annaclarke@gmail.com`

## Super admin

`admin@anatomytattoo.com` is the operational super-admin account. It alone may:

- add an approved modifier or adjustment to a balance after a deposit is paid;
- regenerate a contract from the event's current saved details;
- delete an individual communication entry.

Cloudflare also rejects revision-style event changes from other accounts and sanitizes protected event fields on non-super-admin writes.

## Maintaining access

1. Update the email-to-person mapping in `shared/authPolicy.js`.
2. If the account needs full payout visibility, update both full-access collections in `src/auth.js`.
3. If Change History access changes, update the matching Admin and audit authorization checks.
4. Run `npm test`, `npm run lint`, and `npm run build`.
5. Deploy and verify sign-in using the exact Google account.
6. Record the access change in this file and `CHANGELOG.md`.

Never infer elevated access from a display name. Permissions are resolved from the signed-in email address.
