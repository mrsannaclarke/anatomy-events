# Anatomy Events

Anatomy Events is a Vite/React web app for managing tattoo-event operations:

- event ledger and status tracking
- client details and pricing
- staff assignments and payouts
- payout-ledger and admin tools
- contracts, licensing, and uploaded-art links

Google Sheets is the operational data source through an authenticated Apps Script web app. The production frontend is hosted on Cloudflare Pages.

## Technology

- React 19 and Vite
- Google Identity Services
- Google Sheets and Apps Script
- Cloudflare Pages and Pages Functions
- Progressive Web App manifest and service worker

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure `.env.local` using the existing `.env` variable names. Do not commit secrets.

3. Start the local app:

```bash
npm run dev
```

## Validation

Run both checks before publishing:

```bash
npm run lint
npm run build
```

## Deployment

Publish the production build to Cloudflare Pages:

```bash
npm run deploy
```

Production URL: <https://anatomy-events.pages.dev/>

Google OAuth must use the stable production origin. Temporary Cloudflare deployment URLs are not registered OAuth origins.

## Backend

The production Apps Script and spreadsheet identifiers are recorded in `project.json`. Frontend mutations pass through `functions/api/sheet.js`, which verifies the signed-in Google user before forwarding authorized writes.

Operational rules and continuity notes are maintained in:

- `project.json`
- `docs/app-rules.json`
- `docs/project-notes.md`
