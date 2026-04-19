# Payout Source Audit (2026-04-18)

## Scope
- Compared live app source (`AKfycby...`) vs legacy source (`AKfycbz...`) payout-related data.
- Cross-checked policy in `project.json` (`payout_policy.fallback_source = "none"`).

## Findings
- New source has no artist payout tabs and no `Event Complete` tab.
  - `sheettabs` on new source returns: `Events`, `Pricing Rules`, `Credit Ledger`, `Staff Directory`, `Credit Sources`, `Generated Files`, `Audit Log`, `Settings`.
- App code previously fell back to legacy payout endpoint when these tabs were missing.
- That fallback contradicted `project.json` and could inject old payout overrides.

## Old-vs-New Event Drift Snapshot
- `old.events`: 25
- `new.events`: 15
- Missing in new: `213, 397, 557, 569, 674, 759, 814, 859, 3281, 3741`
- Notable field drift across shared entries:
  - Entry `1513`: `staffPriceAdjustment` now `600.00` (old was blank), `temporaryTattoos` changed `YES -> NO`
  - Entry `1728`: adjustment changed sign (`optionalFee 200.00 -> -200.00`, `staffPriceAdjustment -200.00`)
  - Entry `3765`, `4179`, `4181`: `customFlash` / `temporaryTattoos` flags changed versus legacy

## Legacy Override Delta vs Current Schedule (largest deltas)
- Entry `1` Jessie Smith: Tomma `1200 -> 600` (`-600`), Shy `1200 -> 600` (`-600`)
- Entry `1065` Jaimee Lyne: Drew `1400 -> 1050` (`-350`)
- Entry `1728` Gracie Allen: Tomma `1400 -> 1050` (`-350`)
- Entry `1729` Jenn Hegstrom: Tomma `1780.25 -> 1480.25` (`-300`)
- Entry `1730` Jennifer Oakley: Tomma `1300 -> 1000` (`-300`)
- Entry `2` Justin and Amelia: Tomma/Shy/Sisi `1216.67 -> 1000` (`-216.67`)
- Entry `820` Kynzi and Alejandro: Shy/Megan `1608.25 -> 1395.75` (`-212.5`)
- Entry `1513` Amelia Bambam: Tomma/Shy `1262.5 -> 1350` (`+87.5`)

## Code Corrections Applied
- Removed legacy payout fallback path in `lib/sheets-sync.ts` for:
  - staff-tab override pulls
  - completed-assignment pulls
- Bumped persisted staff-tab override cache key to invalidate stale legacy snapshots.
- Added pricing-schema compatibility:
  - If `Custom Flash Artist Bonus` column is absent, derive per-artist bonus from `Custom Flash Fee (Event)` and `Custom Flash Artist %`.

