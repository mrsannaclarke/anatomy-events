# Current State

Last reviewed: 2026-08-26

## Product

- Product name: Events App 3.0
- Purpose: staff-only event operations for Anatomy Tattoo
- Production frontend: <https://anatomy-events.pages.dev/>
- Frontend: React 19, Vite 8, and Cloudflare Pages
- Operational source of truth: Google Sheets through the production Apps Script web app
- Detailed rule reference: [`app-rules.json`](app-rules.json)
- Current automated baseline: 30 tests, plus lint and production build

## Production connections

- [Event Details spreadsheet](https://docs.google.com/spreadsheets/d/1iT9aWn43FgKPKersRoj6LedLmrRCadtg3QrGL0joshs/edit?gid=1068094455#gid=1068094455)
- [Apps Script project](https://script.google.com/u/0/home/projects/1SdEeFXiB9SoTJhncx5b8Sn5fGYT4nwhUE1eA2mD4FtJZ3Xr_E4Z6rjGK/edit)
- [Apps Script endpoint](https://script.google.com/macros/s/AKfycbz475VzSvNesTsCuU2CdvFEX7zskQ0uyJf17CqjmYaWrMZ5vePbBpBrI-cNaYsoZQ55eA/exec)
- Last recorded Apps Script deployment: Version 101 on 2026-08-17
- [Generated contracts folder](https://drive.google.com/drive/folders/1iEL_REKwX3nJvnikrsEG6ioYszXdE6sy)
- [Uploaded art folder](https://drive.google.com/drive/folders/1YqfcaChF5xwwqW3A_MQEsb6YUxp0plYY)
- [Contract templates folder](https://drive.google.com/drive/folders/1wiu6KgqNpqr46R3GXbIqhWnzMaZky_WH)

## Current architecture

- Cloudflare Pages serves the PWA and authenticated API functions.
- KV provides continuity for the last successful Sheet reads.
- D1 stores mutation audit history, background-job state, upload state, attachment records, and monitor health.
- Cloudflare Queues process document and artwork work outside the request path.
- R2 temporarily stages artwork until the worker transfers it to the shared Drive folder.
- The background Worker runs an hourly health and cleanup check and emits logs and traces.

The Google Sheet remains authoritative. Cached data is continuity data, not a replacement ledger.

## Current capabilities

- Events feed grouped by confirmed and pending status, then sorted by date and same-day start time.
- Client details, event timing, classification, pricing, options, staffing, status/communication, and generated files.
- Standard, Corporate / Walk-Up, and Walk-Up Sales Only pricing methods.
- Shared pricing and payout calculations driven by Sheet pricing rules with bundled offline fallbacks.
- Role-filtered Pay Schedule and full-access Admin Payout Ledger.
- Background contract, temporary-license, and uploaded-art processing.
- Multiple uploaded-art attachments per event.
- Admin Change History with audit records and background-operation health.
- PWA installation, offline shell, and persistent Google-authenticated app sessions.
- Staffing-only Walk-Up Sales Only cards disappear after the event day.

## Important constraints

- Customers do not use the app; access is limited to allowlisted staff.
- Code and tests decide behavior if documentation has drifted.
- The retired Manual Upcoming Appointment Sheet column remains only to preserve schema position.
- Contract times use a 12-hour clock with `a.m.` and `p.m.`.
- `project.json` is legacy project history, not runtime configuration, and should not drive new work.
- OAuth authorized origins must remain aligned with the stable production URL.
- Cloudflare binding or queue changes require infrastructure deployment in addition to a Pages build.

## Validation before publishing

```bash
npm test
npm run lint
npm run build
```

Use `npm run deploy:check` for a preview and `npm run deploy` for production only after validation succeeds.

## Open follow-ups

- Add automatic alerts for failed or overdue background operations if notifications become desirable.
- Add a scheduled external smoke test for the app and API.
- Maintain a short outage recovery runbook for Cloudflare, Google OAuth, Apps Script, and the Sheet.
- Periodically review security headers and Cloudflare protection settings.
- Continue spot-checking exceptional payout rows against the Sheet and ledger.
