# D1 Source-of-Truth Migration

Status: isolated preview shadow write verified; production remains Sheet-authoritative.

Development D1 database: `anatomy-events-shadow-dev` (WNAM). Its `EVENTS_DB` binding is configured only
under `env.preview`; production has no `EVENTS_DB` binding and therefore cannot perform shadow writes.

Private test resources created 2026-08-26:

- Sheet: [Events App 3.0 - D1 Migration Test Data - 2026-08-26](https://docs.google.com/spreadsheets/d/1LGszZUTN5-KWfkEJQ1GQUsLTMw83Fpt1RIELD_Fe2mA/edit)
- Bound Apps Script project: `1dBDbKEbgbK6e65gMtH4nyZ3Ji-xrIf6ITmYMpbC98cTYolvf5dqGQfvN`
- Bound Apps Script test deployment: `AKfycbwsiu-QxLTwcVuUfF-frhmHfYx6eilAl_m1onWjXzfr0C6FcbKCiTj_HbdTd_n3evadXQ`
- Cloudflare preview: [preview.anatomy-events.pages.dev](https://preview.anatomy-events.pages.dev)
- Sharing verification: the copied Sheet is private (`shared: false`).
- Script verification: the copied deployment reads the copied Sheet with its own rotated synchronization secret.

## Safety boundary

- Production reads and writes continue through `/api/sheet` and Apps Script.
- Contract and temporary-facility-license generation remain unchanged.
- Shadow mirroring is disabled unless an `EVENTS_DB` D1 binding exists.
- Shadow failures are logged but never change the response returned by the existing Sheet workflow.
- The Google Sheet must remain shared and operational until reconciliation and rollback testing are complete.

## Phase 1: mutation shadow

`event-migrations/0001_event_shadow.sql` creates:

- `event_shadow`: the latest canonical Sheet event JSON keyed by stable Entry ID.
- `event_shadow_mutations`: an append-only record of mutations mirrored from successful Sheet writes.

Full event saves mirror the canonical event returned by Apps Script. Partial saves perform a background
`action=event` refresh before updating the snapshot so omitted fields are not mistaken for blank values.
Deletes retain a tombstone instead of erasing migration evidence.

The first schema intentionally preserves canonical event JSON. Relational event, assignment, pricing,
payout, and attachment tables should be designed from reconciled production samples rather than guessed
from UI fields. This shadow layer supplies those samples without changing live behavior.

## Activation checklist

1. Create a separate non-production D1 database. **Complete.**
2. Apply `event-migrations` to that database. **Complete.**
3. Configure it for preview deployments as the `EVENTS_DB` binding. **Complete and deployed to Preview.**
4. Prepare a non-production Sheet destination or controlled test rows. **Private copy complete.**
5. Add a preview-only synchronization token to the copied Apps Script project and Cloudflare preview. **Complete.**
6. Deploy the copied Apps Script project and Cloudflare preview. **Complete.**
7. Exercise full saves, partial saves, and deletes against only the copied Sheet. **Complete. Full save, partial save, and deletion were verified with synthetic Entry ID `CODEX-D1-SHADOW-TEST-20260826`; the Sheet row is gone and D1 retains the expected deletion tombstone and mutation history.**
8. Reconcile every shadow snapshot against the copied Sheet and rehearse rollback. **Complete: the Preview-only backfill wrote and reconciled 30 of 30 events on 2026-08-29. Preview was then deployed without `EVENTS_DB`, successfully refreshed from the private Sheet, and returned `404` for the D1-only backfill endpoint. After restoring the binding, reconciliation again passed 30 of 30 with no pending refreshes.**
9. Only after preview verification, decide whether to enable production shadow writes.

Adding the binding enables shadow writes; omitting it is the rollback switch.

## Privacy-safe reconciliation

Export the current Sheet `events` response and the D1 query result for active shadow rows to local JSON
files, then run:

```bash
npm run reconcile:shadow -- sheet-events.json d1-shadow.json
```

The report contains Entry IDs and mismatched field names, not client field values. It exits successfully
only when row counts, IDs, canonical fields, and refresh status match.
