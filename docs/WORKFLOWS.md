# Workflows

Last reviewed: 2026-08-26

## Events feed

The feed excludes closed events and groups visible events into confirmed and pending categories. Confirmed events appear first. Within each category, events sort by date from soonest to latest and by start time when events share a date. An event with a missing start time retains its date position and displays a warning instead of being silently reordered.

Closed statuses are `Cancelled`, `Not Likely to Continue`, and completed states that belong in payout history. `Event Complete Balance Late` remains actionable and visible.

## Creating and pricing an event

1. Open Pricing and choose New Client Entry, Import, or Overwrite.
2. Enter client identity, date, start/end time, and venue details.
3. Choose Type of Event and Pricing Method together under Event Classification.
4. Choose artist count and modifiers, then review the itemized calculation.
5. Save a new event or deliberately overwrite an active event offered by the app.
6. The Sheet receives the event and creation timestamp; the feed refreshes from the Sheet or the last successful continuity cache.

New events default to the 2026 plan. The legacy 2025 plan remains readable for older records but is not offered as the normal new-event choice.

### Standard

The hiring client pays the required standard-event price, including artist service, counter staff, and temporary facility licensing, plus selected modifiers. The normal deposit and balance workflow applies.

### Corporate / Walk-Up

The hiring client pays required operational charges—the counter charge, $200 temporary facility license, $300 corporate admin fee—and selected modifiers such as custom flash, temporary tattoos, radius, and extra hours. The standard tattoo base is not charged to the hiring client. A five-hour minimum applies and the amount is due in full without a deposit split. Walk-up tattoo transactions remain outside the app.

### Walk-Up Sales Only

Use for a no-charge relationship-building event when the app needs only a staffing card. The app calculates no artist or counter event pay and tracks no contract, client invoice, deposit, balance, status feed, payout-ledger entry, or walk-up revenue. The card disappears after the event day.

## Status flow

Confirmed statuses include:

- New
- Need To Send Contract/Deposit Invoice
- Contract Signed
- Deposit Sent
- Deposit Paid
- Temporary License Submitted
- Temporary License Received
- Awaiting Follow Up
- Needing Changes
- Balance Invoice Sent
- Invoice Paid in Full
- Event Complete Balance Late

Pending statuses include:

- Consult Booked/Pending
- Post Consult Decision
- Deposit Late

Closed statuses include:

- Cancelled
- Not Likely to Continue
- Event Complete

`Invoice Paid in Full` means the client invoice is paid. It does not by itself mark the event complete or make it payout-eligible.

## Contracts and temporary licenses

- Generation begins from an authenticated app action and is recorded as a background document job.
- Cloudflare Queue workers call the protected Apps Script action and record completion or failure in D1.
- Generated times use a 12-hour clock with `a.m.` and `p.m.`.
- When a contract already exists, `admin@anatomytattoo.com` may use **Regenerate Contract**. The old Drive file remains, and the new file becomes the event's active Contract URL.
- A Google Workspace signature PDF may replace the generated Doc URL in the Sheet; the app opens the current Sheet URL.
- The scheduled PDF sync matches signed PDFs conservatively and does not infer `Contract Signed`.

## Uploaded art

1. Choose one or more photos/files from the event's Generators & Files page.
2. The authenticated API stages the upload in R2 and records an upload job without writing file contents into the audit log.
3. The background worker copies the file to the shared Drive folder and associates its Drive URL with the event.
4. The app displays all recorded attachments for the event; a new upload must not replace earlier attachments.
5. Completed or stale R2 staging objects are removed by the cleanup workflow.

## Payouts

- Only completed-event workflow records are payout-eligible.
- Ordinary users see only their mapped payout identity.
- Anna, Shy, and Tomma-designated accounts can view the full Pay Schedule.
- The Admin Payout Ledger sorts completed events newest-first.
- Tomma is salaried, so her calculated allocations are captured to the shop while salary is paid separately.
- Historical staff-tab overrides and explicit one-time exceptions take priority over fallback framework math.
- Corporate negative adjustments follow the waterfall in `DECISIONS.md`; licensing is protected and counter pay is reduced last.
- Staffing previews per-person tattooer and counter pay through the same payout engine and live pricing-rule percentages.

## Authentication and saving

- Only Google accounts in the shared allowlist may enter the app or write to the Sheet.
- Keep me signed in is enabled by default and creates a longer-lived secure app session.
- Cloudflare validates identity and permission before forwarding Sheet actions.
- Successful Sheet reads update the continuity cache; a failed refresh may show saved data with an explicit status message.
- Signing out clears the app session and locally cached viewer identity.

## Change History and operations

- Authorized administrators can open Change History from Admin.
- The screen shows recent audited mutations, document-job health, upload-job health, and the last hourly monitor result.
- Failed, retrying, or overdue operations remain visible for manual follow-up.
- The hourly worker also cleans stale upload staging records and objects.

## Documentation maintenance

- Update `CURRENT_STATE.md` when deployment, architecture, or major capabilities change.
- Add consequential business or technical choices to `DECISIONS.md`.
- Add concise completed milestones to `CHANGELOG.md`.
- Update this file when a staff workflow changes.
- Update `ACCESS.md` whenever the allowlist or elevated permissions change.
- Keep detailed rule mappings in `app-rules.json` and verify them against current code and tests.
