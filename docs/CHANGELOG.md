# Changelog

This file summarizes user-visible and operational milestones. Git history remains the exact technical record.

## 2026-08-26

- Added Cloudflare continuity caching for Sheet reads and D1 audit history for mutations.
- Added background queues for contract, temporary-license, and artwork processing.
- Added R2 staging, automatic stale-upload cleanup, hourly operations monitoring, Worker observability, and Web Analytics.
- Added the admin-only Change History screen with audit, queue, upload, and monitor health.
- Improved Google sign-in recovery when an installed app has a stale cached shell.
- Reorganized Admin navigation and moved counter payment links into their own Admin screen.
- Grouped event type and pricing method as Event Classification and restored the complete event-card legend.
- Added special Corporate / Walk-Up and Walk-Up Sales Only card icons and styling.
- Refined event-card icons, colors, responsive layout, staff display, and installed-app branding.
- Sorted same-day events by start time while preserving date order when a start time is missing.
- Added visible missing-time warnings.
- Added projected tattooer and counter pay to Staffing using the shared payout engine.
- Added a copy action beside the client email, Regenerate Contract, and Jeremy's staff login.
- Added support for multiple uploaded-art attachments per event.

## 2026-08-25

- Added a super-admin workflow to regenerate and relink a contract after event changes while preserving the previous Drive file.

## 2026-08-17

- Deployed Apps Script Version 101 with 12-hour contract times.
- Retired Manual Upcoming Appointment from active app and API paths while preserving its inert Sheet column.
- Added automatic expiration for staffing-only walk-up cards.
- Added the no-charge Walk-Up Sales Only pricing method and excluded it from app contracts and payouts.
- Implemented the negative-adjustment payout waterfall.
- Corrected pricing-entry field mapping and added Sienna and Consult Booked/Pending.
- Removed the production frontend's dependency on the historical root `project.json`.

## 2026-08-16

- Secured Sheet reads and writes through the authenticated Cloudflare API.
- Added event creation dates to client cards.
- Increased the Corporate / Walk-Up admin fee to $300.
- Refined pricing, active-event overwrite choices, import ordering, and pricing action layouts.
- Added start and end time fields to the Pricing Calculator.

## 2026-08-14 to 2026-08-15

- Upgraded to Vite 8 and the current React plugin toolchain.
- Added persistent app sessions and iPhone installation guidance.
- Refreshed branding and installed-app icon assets.
- Sorted the Admin Payout Ledger newest-first.
- Added the counter payout directory and OPB one-time payout exception.

## 2026-08-12 to 2026-08-13

- Applied the accepted Warmer & Softer theme.
- Reworked client cards and detail navigation to match the accepted design direction.
- Added status, icon, mobile navigation, saving-overlay, calendar, Admin, and Pay Schedule refinements.
- Added Google Drive uploaded-art and signed-contract PDF workflows.
- Added counter write-in names and super-admin communication-entry deletion.

## Earlier history

Earlier implementation detail remains recoverable from Git history and the dated audit files in `docs/`. Do not promote an old audit finding into a current requirement without confirming it against current code, tests, and `CURRENT_STATE.md`.
