# Events App 2.0 Functionality Audit - 2026-06-04

Contracts checked:
- `project.json`
- `docs/app-rules.json`
- `docs/frontend-parity-audit.md`

## Adjustments Made

| Area | Adjustment |
| --- | --- |
| Event ledger | Added Google Calendar link, Map link, latest communication preview, admin-gated computed total/balance display, and manual-appointment-aware sorting. |
| Notes | Made Client Notes read-only, added Manual Upcoming Appointment storage, and kept communication entries appended to private notes/activity log. |
| Staff assignments | Added common alias normalization, made `None` exclusive in counter selection, and refreshed saved rows by Entry ID after upsert. |
| Client details | Refreshed saved rows by Entry ID after upsert. |
| Pricing | Tightened staff adjustment reason check with money parsing and refreshed saved rows by Entry ID. |
| Generators & Files | Added uploaded art URL save, copy-link controls, and email shortcuts for contract, TFL, and uploaded art links. |
| Payout | Added documented fallback historical exceptions for Entry 1, Entry 2, and Entry 1513. |
| Payout ledger | Added captured-to-shop display for Tomma payout lines and sorted year filters. |

## Remaining Partial / Blocked Items

| Area | Status | Reason |
| --- | --- | --- |
| Google OAuth | partial | 2.0 uses a local allowlist viewer selector for permission testing. Real Google sign-in is not connected. |
| Live payout overrides | blocked | Current Apps Script 2.0 source exposes `Events` and `Pricing Rules`, but not legacy staff payout tabs. Payout pages use schedule fallback until a live override source is restored or replaced. |
| Production writes | partial | `upsertEvent`, `deleteEvent`, `generateContract`, and `generateTfl` are wired, but no production row was deliberately mutated during this audit. |
| Calendar feed parity | partial | Manual appointment and event-date sorting work; external calendar feed matching is not rebuilt. |
| File upload | partial | Uploaded art URL save works; binary/file upload to Drive is not rebuilt. |
| Audit log | fail | Admin audit log page and persisted audit trail are not rebuilt. |
| Pricing modes | pass | Explicit New Client Entry / Import Existing / Overwrite Existing controls are present. |

## Verification

- `npm run build` passed.
- Manual ledger sort smoke test passed.
- Entry 1513 fallback payout smoke test returned `$1,350` for each artist path.
