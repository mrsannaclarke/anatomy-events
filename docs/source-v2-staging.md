# Source V2 Staging (Do Not Cut Over Yet)

## Current state
- Production app source remains unchanged.
- New staging script/sheet are prepared separately.
- Staging script is deployed at version `@3` with outbound credit-write support.

## Staging references
- Sheet ID: `1iT9aWn43FgKPKersRoj6LedLmrRCadtg3QrGL0joshs`
- Script ID: `1SdEeFXiB9SoTJhncx5b8Sn5fGYT4nwhUE1eA2mD4FtJZ3Xr_E4Z6rjGK`
- Deployment ID: `AKfycbxCsETuWS84X7XYsvIGKpdbJPpxMlLpn-UBea_MwSriiqjEe5wqRq-jlViuMCwV_wQkBA`
- Exec URL: `https://script.google.com/macros/s/AKfycbxCsETuWS84X7XYsvIGKpdbJPpxMlLpn-UBea_MwSriiqjEe5wqRq-jlViuMCwV_wQkBA/exec`
- Local script workspace: `/Users/Anna/Documents/Project Files/Event Details Project/clean-source-v2`

## Bootstrapped V2 tabs
- `Events`
- `Staff Directory`
- `Pricing Rules`
- `Credit Sources`
- `Generated Files`
- `Audit Log`
- `Settings`

## Next staged validation
1. Run `v2ResetAndBootstrap` in Apps Script editor.
2. Run `v2SeedCoreData` to seed staff/pricing + artist credit-source placeholders.
3. Fill artist credit mappings in `Credit Sources` (`Target Spreadsheet ID`, target tab, target cell per artist).
4. Enter/edit credit amounts manually in `Staff Directory -> Current Credit`.
5. Run `v2PushStaffCredits` and confirm target sheets receive updated credit values.
6. Optional: run `v2MigrateFromLegacyEventDetails` if you want a baseline import.
7. Validate API `action=health`, `action=events`, `action=pricing`, `action=creditsources`, `action=staffcreditpushpreview`.
8. Compare payout math and generator outputs against current source.
9. Approve cutover before changing app sync constants.

## Cutover rule
Do not update app `SHEET_SYNC_CONFIG` to staging IDs until explicit approval.
