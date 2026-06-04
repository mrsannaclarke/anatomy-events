# Events App 2.0 Front-End Parity Audit

Source contracts:
- `project.json`
- `docs/app-rules.json`

Status meanings:
- `pass`: implemented in Events App 2.0 and behavior matches the contract.
- `partial`: visible or partly implemented, but missing required behavior.
- `fail`: absent, misleading, or functionally different.
- `blocked`: needs backend/action coverage or explicit product decision.

## Global

| Area | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Sheet source of truth | Pull events by `action=events&limit=1000`; save by `action=upsertEvent`; do not wipe local state on failed/empty pull. | partial | Live pull works through `/api/sheet`; save helper exists; empty-pull guard exists; production mutation tests still pending. |
| Auth | Google sign-in required; allowlist users normalized to broad app permissions. | partial | Lightweight allowlist/viewer model exists for local permission testing; Google OAuth is not wired yet. |
| Navigation | Events, Pricing, Payout, Admin visible per role; hidden routes reachable from card/actions. | partial | Top-level nav exists; Payout/Admin/Payout Ledger pages exist; hidden route semantics and OAuth gating still need parity. |
| Retired systems | Do not rebuild View As or Admin Promotion without approval. | pass | Not present in 2.0. |

## Event Ledger / Client Cards

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Visibility | Hide Complete/Event Complete/Event Complete Balance Late; Cancelled remains visible. | pass | 2.0 filters complete/event complete/event complete balance late; cancelled remains visible. |
| Sort | Upcoming appointment timestamps first, soonest first; past next newest; undated by client name. | partial | Manual appointment + event date priority exists; external calendar feed matching still missing. |
| Card actions | Four buttons in order: Client Details opens edit mode; Staff opens Staff Assignments; Notes opens Notes; Files opens Generators & Files. | partial | Buttons open functional in-app panels from one shared action source. Full parity still needs route semantics, auth gating, and production write testing. |
| Money visibility | Computed Total and Balance only for admin-money viewers and non-open statuses. | partial | Local allowlist viewer gate and computed total display exist; real OAuth gate still missing. |
| Calendar action | Google Calendar add button on bottom row. | pass | Calendar link is generated from date/client/type/address/contact fields. |
| Map action | Map button when venue/address is usable. | pass | Map link is shown only when a usable venue/address value exists. |
| Communication preview | Latest staff activity preview at card bottom. | pass | Latest `COMMUNICATION ENTRY[...]` line is shown on the event card. |

## Client Details

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Access | Admin/super_admin/admin-role only. | fail | Auth/role gating not rebuilt. |
| Edit mode | Locked by default; Client button opens editable; single pencil toggles all editable fields. | partial | Client panel opens editable from card and has pencil lock/edit toggle; needs route/query parity and auth gate. |
| Core fields | Price Plan, Client Name, Date, Venue, Type, Phone, Email, Address, Guest Count. | partial | Editable panel displays required core fields plus travel distance in the bottom Client Information section, matching the Expo section order. |
| Removed fields | No Gravity raw import, auto-pricing toggle, full payout toggle, do-not-use-credit, credit applied. | pass | Those retired fields are not present in the 2.0 Client Details panel. |
| Pricing/totals | Event Pricing follows gold-standard Expo row order with modifiers, total, deposit, and balance; no Base Source. | pass | Event Pricing uses the shared Expo-style pricing row builder. |
| Save/delete | Save upserts to Sheet; delete requires confirmation and calls deleteEvent. | partial | Save/delete are wired but not live-tested against production rows. |

## Pricing

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Schedule | 2025/2026 locked schedule; artist counts 1-4; 5-hour base. | pass | Ported into `src/pricingMath.js`. |
| Page order | Price Plan, Plan table, Pricing Calculator inputs, pricing breakdown, then New/Import/Overwrite workflow. | pass | 2.0 Pricing page now follows the Expo render order with the current Pricing Calculator label. |
| Import | Import selected Sheet event into calculator. | pass | Selecting a Sheet event imports fields; explicit Import mode exists. |
| Overwrite | Save pricing fields to selected Sheet event by `upsertEvent`. | partial | Save helper is wired but not live-tested to avoid production overwrite. |
| New entry | New Client Entry mode. | partial | New mode and client fields exist; production mutation test still pending. |
| Staff adjustment | Reason required when non-zero. | partial | Implemented with a numeric check that needs stricter money parsing. |
| Expo pricing table | 5-hour Base and Counter rows, conditional under-5-hour prorated rows, modifiers, Total, Deposit, Balance. | pass | Pricing Calculator and Client Details now render from the same Expo-style row builder. |
| Under-5-hour prorate | Base prorates below 5 hours; counter scales with booked hours. | pass | Calculator math now scales both base and counter for under-5-hour pricing. |
| Travel/radius | Manual travel distance computes radius; address lookup can auto-fill mileage. | pass | Manual travel distance remains supported, and Lookup Radius from Address uses Anatomy Tattoo, Portland, OR as base. |
| Pricing links | Plan-year share/open pricing-sheet actions. | pass | Share/copy and View actions are present. |
| Copy table | Compact icon-only copy control; no status text; copied text matches table order. | pass | Copy output uses the same Expo-style pricing row builder as the visible table. |

## Staff Assignment

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Access | Admin/super_admin/admin-role only. | fail | Auth/role gating not rebuilt. |
| Artist count | 1-4 artist count options. | pass | Panel uses 1-4 options. |
| Artist picker | Live sheet artist list merged with local permissions; normalized ED entry output. | partial | Built-in artist chips exist; live artist endpoint merge/alias normalization still missing. |
| Counter picker | None/Jason/Kevin/Jacob/Jayden/Veda; max one selected. | partial | Counter choices include required names plus staff roster; current max is 2 per latest rules, but legacy max-one conflict should be resolved. |
| Save | Upsert event to Sheet, then refresh by Entry ID. | partial | Save now refreshes by Entry ID when possible; production mutation test still needed. |

## Notes

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Status options | Full status list; admin/super_admin can edit. | partial | Status dropdown exists; auth/admin edit gate is missing. |
| Client notes | Read-only client notes; communication entries append activity log. | pass | Client notes are read-only; communication entries append save to Sheet and render in a Feed section. |
| Manual appointments | Save manual upcoming appointment used by ledger sorting/display. | pass | Notes stores manual appointment locally and includes it in ledger sorting. |

## Payout

| Rule | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Visibility | Staff see own/delegated payout; full picker only for full-access emails. | partial | Rebuilt with allowlist viewer model; full-access emails get full picker and start on mapped primary person. OAuth still missing. |
| Source truth | Live staff-tab payout override wins; framework math only if no override. | blocked | Current Apps Script 2.0 source exposes Events/Pricing Rules but not legacy staff payout tabs; page labels schedule fallback. |
| Year filter | All + completed years descending. | partial | Year filter exists; needs final descending/year edge-case verification. |
| Completed only | Pay rows show completed event statuses only. | pass | Pay page filters to Event Complete/Event Complete Balance Late. |
| Completed totals by year | Pay page shows year-level completed payout totals beneath the current completed summary. | pass | Restored `Completed Totals by Year` with Total/Artist/Counter amounts for the visible filter set. |
| Card information architecture | Expo card structure: event-type icon/color, client, total under client, event date, completed timestamp, role, itemized payout lines. | pass | Restored the old structure and removed generic `Artist Modifiers` / per-card source labels from staff payout rows. |
| Temporary tattoos in fallback math | Schedule fallback does not add temporary tattoo artist share to staff payout cards. | pass | Rebekah Leone / Tomma now matches the Expo sample at $1,294.38 with Artist Base $1,200, Custom Flash Bonus $62.50, Radius Share $31.88. |
| Historical exceptions | Entries 1, 2, 1513 exactly honored. | partial | Compact fallback honors Entry 1/2 flat artist bases and Entry 1513 $1,350 artist breakdown; live staff-tab override truth is still blocked. |

## Admin / Payout Ledger / Generators

| Area | Required behavior | 2.0 status | Notes |
| --- | --- | --- | --- |
| Admin tools | Action hub; no Admin Promotion system; Payout Ledger only full-access emails. | partial | Action hub rebuilt without Admin Promotion. Payout Ledger action appears only for full-access emails. |
| Payout Ledger | Completed events, gross/staff/shop/remainder waterfall, year filter, live sheet refresh. | partial | Ledger page rebuilt with completed rows and summary waterfall; live staff-tab override source is blocked by current endpoint shape. |
| Generators & Files | Admin controls for contracts/TFL; staff art upload/save; email/copy actions by role. | partial | Contract/TFL generation, link display, art URL save, copy, and email actions are wired; actual file upload and role gates are still missing. |
| Audit/activity | Audit log and event activity log behavior. | fail | Not rebuilt. |

## Immediate Corrections

1. Wire Google OAuth for the 2.0 app or document/deploy the local viewer-selector fallback as test-only.
2. Restore or replace live staff-tab payout override access; schedule fallback is not enough for source-of-truth parity.
3. Event cards still need external calendar-feed appointment matching; local manual appointment and event date sorting are in place.
4. Add actual file upload and OAuth role gates for Generators & Files.
