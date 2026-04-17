# Anatomy Events

Anatomy Events is an Expo app for managing tattoo event operations:
- event ledger and status tracking
- client details and pricing breakdowns
- staff assignments and payouts
- admin payout ledger/audit tools
- generated files workflow (contracts, licensing, uploaded art)

The app syncs with a Google Sheet via an Apps Script web app.

## Tech

- Expo + React Native + Expo Router
- TypeScript
- Google OAuth (via `expo-auth-session`)
- Google Sheets/Apps Script backend

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID
```

3. Start the app:

```bash
npm run web
# or
npm run ios
# or
npm run android
```

## Auth and app identifiers

Current identifiers in this repo:
- iOS bundle id: `com.anatomytattoo.anatomyevents`
- Android package: `com.anatomytattoo.anatomyevents`
- App scheme: `anatomyevents`

Google sign-in is enforced through allowlisted emails in:
- `constants/auth-permissions.ts`

## Backend integration

Apps Script web app URL is configured in `app.json` under:
- `expo.extra.sheetSyncWebAppUrl`

Operational project context and continuity notes are tracked in:
- `project.json`

## Web deployment (GitHub Pages)

This repo is configured for GitHub Pages deploys.

- Base path: `/anatomy-events` (configured in `app.json`)
- Deploy scripts:
  - `npm run predeploy` -> `expo export -p web`
  - `npm run deploy` -> publish `dist` to `gh-pages`

Deploy steps:

```bash
npm run deploy
```

Then in GitHub repo settings:
- `Settings -> Pages`
- Source: `Deploy from a branch`
- Branch: `gh-pages` / root

Expected URL:
- `https://mrsannaclarke.github.io/anatomy-events/`

## OAuth settings for web login

For Google OAuth web client, include:
- Authorized JavaScript origin: `https://mrsannaclarke.github.io`
- Authorized redirect URI: `https://mrsannaclarke.github.io/anatomy-events/`

## Validation

Before pushing changes:

```bash
npm run lint
npx tsc --noEmit
```
