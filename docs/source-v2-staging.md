# Source V2 Staging (Do Not Cut Over Yet)

## Current state
- Production app source remains unchanged.
- New staging script/sheet are prepared separately.

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
- `Generated Files`
- `Audit Log`
- `Settings`

## Next staged validation
1. Run `v2ResetAndBootstrap` in Apps Script editor.
2. Run `v2MigrateFromLegacyEventDetails` if you want a baseline import.
3. Validate API `action=health`, `action=events`, `action=pricing`.
4. Compare payout math and generator outputs against current source.
5. Approve cutover before changing app sync constants.

## Cutover rule
Do not update app `SHEET_SYNC_CONFIG` to staging IDs until explicit approval.
