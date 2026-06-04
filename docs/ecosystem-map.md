# Anatomy Events Ecosystem Map (Read-Only Contract)

## Purpose

This system handles real payouts and accounting. Data integrity is mandatory.  
No source cutover should occur without reconciliation checks passing.

## Current Production Flow

1. App (`anatomy-events`) reads/writes Event data through the production Apps Script web app.
2. Production Apps Script reads/writes the production Event Details sheet.
3. Weekly artist sheets import event income from Event Details (via formulas/IMPORTRANGE).
4. Master books sheet imports each weekly sheet Totals tab and aggregates books.

## Staging V2 Flow (Not Connected to App)

1. Clean-source-v2 Apps Script + duplicated sheet are staging only.
2. Legacy event rows are migrated into normalized `Events` model.
3. Credits are outbound from `Staff Directory.Current Credit` -> mapped destination sheets/cells in `Credit Sources`.
4. App must remain pointed at production source until explicit signoff.

## Source-of-Truth Rules

1. Event operational truth: production Event Details + Event Complete rows.
2. Staff payout truth: live staff-tab payout rows when present; framework math only when no row exists.
3. Accounting truth: weekly sheets + master books aggregation chain.
4. Historical exceptions must be explicit and named, never inferred.

## High-Risk Failure Modes

1. Date/key mismatch (`m/d` text, row order drift, renamed tabs) breaking cross-sheet matching.
2. Formula chain break in IMPORTRANGE/MATCH without obvious UI error.
3. App math diverging from sheet payout schedule or historical overrides.
4. Silent schema drift between production source and staging source-v2.

## Required Safety Gates Before Any Cutover

1. Event-by-event reconciliation: gross, staff total, shop total, and per-person payout lines.
2. Counter assignment reconciliation: unassigned vs `None` behavior must match policy.
3. Generated file link parity: contract/license/art URLs must survive migration.
4. Weekly + master parity sample checks across multiple weeks and artists.
5. Signed approval checkpoint before switching app sync URL.

## Local-Only Planning Artifact

- Weekly sheets planning file (do not commit externally):  
  `/Users/Anna/Documents/Project Files/Event Details Project/weekly sheets project.json`
