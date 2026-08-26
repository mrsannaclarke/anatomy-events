# Decisions

This is the short record of choices that materially shape the app. New entries should include a date, the decision, and the reason.

## 2026-08-26 — Sheet continuity does not replace the Sheet

Cloudflare KV may serve the last successful Sheet response when a live refresh fails. The interface must clearly identify saved data without implying that it is a new ledger. Mutations still require authenticated access to the operational Sheet workflow.

## 2026-08-26 — Mutations and background work are auditable

D1 records authenticated mutations and background job state without storing uploaded file contents. Contract, temporary-license, and artwork jobs run through Cloudflare Queues. Artwork is staged temporarily in R2, copied to Drive, associated with the event, and removed from staging after completion or cleanup.

## 2026-08-26 — Operational health is visible to administrators

An hourly Worker check records monitor health and detects overdue or failed document and upload jobs. The restricted Change History screen presents audit records and operational warnings. Automatic external alerts remain optional follow-up work.

## 2026-08-26 — Event classification combines type and pricing method

Type of Event and Pricing Method are presented together as Event Classification. Standard events retain their event-type icon; Corporate / Walk-Up and Walk-Up Sales Only use pricing-specific icons and colors. Event cards sort by date and same-day start time, while missing times do not override date order.

## 2026-08-26 — An event may have multiple art attachments

Artwork uploads are stored as individual event attachments instead of treating one URL as the complete art record. New attachments must not erase earlier uploaded art.

## 2026-08-17 — Project documentation is not application configuration

Human project notes live in Markdown under `docs/`. Runtime configuration lives in source modules, Cloudflare configuration, or environment variables. `docs/app-rules.json` is a detailed documentation and test reference. The former root `project.json` is legacy project history and is not a runtime dependency.

## 2026-08-17 — Contract times use a 12-hour clock

Contract placeholders normalize setup, start, and end times to `h:mm a.m.` or `h:mm p.m.`. A saved explicit end time takes priority over a calculated fallback. Manual Upcoming Appointment is retired from active UI and API paths.

## 2026-08-17 — Walk-Up Sales Only is staffing-only

This no-charge pricing method creates a feed card that links only to Staff Assignments. It has no app contract, client-detail, status/communication, payout-ledger, deposit, balance, or tracked walk-up revenue. No artist or counter event pay is calculated in the app. The card disappears after the event day.

## 2026-08-17 — Negative adjustments use a payout waterfall

For Corporate / Walk-Up events, a negative adjustment reduces the corporate admin fee first. The $200 temporary facility license is a protected pass-through cost. Remaining reductions apply to shop earnings, salaried Tomma allocations, non-salaried artist payouts, and counter payouts last. Positive adjustments remain with the shop. Explicit one-time exceptions stay fixed.

## 2026-08-16 — Corporate admin fee is $300

Corporate / Walk-Up pricing includes a fixed $300 shop operations fee for furniture wear, supplies, and staffing needed to keep Anatomy Tattoo open. It is due in full, is not prorated, and does not create a deposit.

## 2026-08-16 — Required standard-event pricing is presented inclusively

Standard customer-facing pricing includes artist service, counter staff, and temporary facility licensing. Internally, those components remain separate so payout and accounting calculations stay accurate.

## 2026-08-16 — Sheet access is brokered by Cloudflare

Authenticated reads and mutations pass through `/api/sheet`. Cloudflare validates the Google identity and allowlist before forwarding a token-authenticated request to Apps Script. Direct anonymous Apps Script access must remain rejected.

## 2026-08-12 — Warmer & Softer visual direction

The accepted theme uses espresso surfaces, cream text, clay accents, soft serif headings, and restrained dimensional borders and shadows. Event-type and staff colors retain their semantic meaning. The Anatomy emblem remains the app emblem; invented botanical decoration was rejected.

## 2026-08-09 — One pricing source drives the app

The Pricing Rules Sheet feed configures the pricing calculator, client details, pricing display, and payout percentages. Bundled values are offline fallbacks, not a separate editable pricing authority.

## 2026-08-09 — Corporate walk-up tattoo revenue stays outside the system

For Corporate / Walk-Up events, the hiring client pays the required operational charges and selected modifiers rather than the standard tattoo base. Artists keep walk-up tattoo revenue, but those transactions are never entered, estimated, reconciled, or reported in this app.

## Continuing policy — Historical payout overrides remain authoritative

When a live staff-tab row exists for an Entry ID and person, it remains the source of truth for that historical payout. Framework math is the fallback when no authoritative override exists. One-time exceptions must be explicit and documented rather than generalized into a new rule.
