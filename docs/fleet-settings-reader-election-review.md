# Fleet settings singleton reader canonicalization — review

## Defect

`FleetSettings` (`setting_type:'general'`) is a migration-seeded singleton with
no function-side create path, so it can't gain duplicates through the create
race healed elsewhere. However, six backend read sites across five functions
picked the row with unsorted `filter(...)` + `[0]`:

- `fleetSettingsAction` — the singleton's **writer** (CAS update)
- `fleetCutoverControl` — `evaluate()` and the apply path (`mirrorSettings`
  writes back to whatever row was read)
- `fleetNotificationDispatcher` — recipient/sender config
- `fleetNotificationWorker` — reminder-day config
- `fleetScheduledReminders` — reminder enqueue config

Meanwhile the `FleetSettings` admin UI lists `-updated_date` and edits the
**newest** row. If a duplicate ever existed (manual data ops, a seeding bug, or
a restore), the UI would display row A while writers CAS-updated an arbitrary
`[0]` row and each reader could follow a different row still — settings such as
`gmail_sender_name`, `fleet_app_base_url`, and reminder day lists would diverge
between what the admin sees and what the server applies.

## Fix

New shared accessor `base44/shared/fleetSettingsSingleton.ts`:

- `canonicalFleetSettingsRow(rows)` — newest `updated_date` first (matching the
  UI's `-updated_date` ordering), `id` tiebreak. Election matches what the
  admin sees, so the server's applied row is always the displayed row.
- `getCanonicalFleetSettings(base44)` — filters `setting_type:'general'` and
  returns the canonical row; preserves error-propagation semantics.

All six sites migrated. `fleetSettingsAction`'s writer now CAS-updates the same
row the UI edits; `mirrorSettings` in `fleetCutoverControl` writes back to the
canonical row.

## Test

`scripts/test-fleet-settings-reader-election.mjs`:

- `canonicalFleetSettingsRow` elects newest-updated, id-tiebreaks equal
  timestamps, returns null on empty, never mutates input order.
- `getCanonicalFleetSettings` issues the `setting_type:'general'` filter and
  elects canonically.
- Source contracts: all four reader functions route through the shared
  accessor with no raw `[0]` pick; `fleetCutoverControl` uses the helper in
  both its read sites.

Post-fix: 5/5 pass. esbuild syntax checks clean on all edited files.

## Scope

- Read-path canonicalization only; no data writes, no production records touched.
- `FleetSettings` has no create path, so no create-side heal was needed.
