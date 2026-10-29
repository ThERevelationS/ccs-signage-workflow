# Fleet cutover-state reader canonicalization — review

## Defect

`FleetCutoverState` is a singleton (`state_key:'primary'`) whose create path was
healed earlier (`fleetCutoverControl` elects the lowest-id row and retires
concurrent-create losers). However, **six backend functions read the row with
unsorted `filter(...)` + `[0]`**:

- `fleetMeterMaintenanceGeneration` — maintenance generation gate
- `fleetNotificationDispatcher` — notification enqueue gate
- `fleetNotificationWorker` — notification send gate
- `fleetPublicIssueReport` — public QR reporting gate
- `fleetScheduledMaintenanceGeneration` — scheduled generation gate
- `fleetScheduledReminders` — reminder enqueue gate

If a duplicate row ever existed (created before the heal, or by any future
regression), writers via `getCutoverState` would update the lowest-id row while
readers could pick a different row per query — gate flags
(`notifications_enabled`, `maintenance_generation_enabled`,
`public_reporting_enabled`, `scheduled_reminders_enabled`) would be
non-deterministic across functions.

## Fix

New shared accessor `base44/shared/fleetCutoverState.ts`:

- `canonicalCutoverRow(rows)` — lowest-id election (same convention as
  `getCutoverState`'s read and post-create contention paths).
- `getCanonicalCutoverState(base44)` — filters `state_key:'primary'` and
  returns the canonical row; preserves the previous error-propagation semantics
  (no `.catch` swallow).

All six readers migrated to `getCanonicalCutoverState`; `fleetCutoverControl`'s
two inline elections now use `canonicalCutoverRow`, single-sourcing the
convention. With canonical readers, even a hypothetical legacy duplicate is
harmless: every function reads and writes the same row.

## Test

`scripts/test-fleet-cutover-reader-election.mjs`:

- `canonicalCutoverRow` elects lowest id among duplicates, returns null on
  empty, never mutates input order.
- `getCanonicalCutoverState` issues the `state_key:'primary'` filter and elects
  canonically.
- Source contract: every `FleetCutoverState` reader routes through the shared
  accessor; no raw `[0]` pick remains.
- `fleetCutoverControl` uses `canonicalCutoverRow` in both the read path and
  post-create contention check.

Post-fix: 5/5 pass. Existing suites unaffected:
`test-fleet-cutover-singleton-race.mjs` 4/4 (harness updated to inject the real
`canonicalCutoverRow` from the shared module),
`test-bouncie-connection-singleton-race.mjs` 3/3.

## Scope

- Read-path canonicalization only; no data writes, no production records touched.
- Filter failures still propagate exactly as before (readers did not catch).
