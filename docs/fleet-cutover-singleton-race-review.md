# Fleet cutover-state singleton creation race review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Backend Fleet write-path audit after the frontend fencing sweep: verify every
`fleet*` function either has optimistic-concurrency/`creation_key` coverage or
is structurally idempotent.

## Audit result

- `fleetNotificationWorker` and `fleetMeterMaintenanceGeneration` use the
  full receipt-claim protocol (`operation_key` dedup, contender election,
  recovery tokens) — safe under overlapping scheduler ticks.
- `fleetScheduledReminders`'s check-then-enqueue race is absorbed downstream:
  the worker's receipt key is `fleetnotify-send:{notification_key}`, so a
  duplicate queue row resolves `applied` → marked `sent` without a second
  send. Zombie rows are cosmetic.
- `fleetBouncieNotificationAction`'s `mark_read` is naturally idempotent.
- `fleetCutoverControl`'s `getCutoverState` was the one real gap — see below.

## Defect reproduced

`scripts/test-fleet-cutover-singleton-race.mjs` executes the real extracted
`getCutoverState` body against a simulated entity where two concurrent
first-ever calls both observe an empty table:

- Both calls created a `FleetCutoverState` row for `state_key: 'primary'` and
  returned different rows. The duplicate survived forever.
- Severity is higher than cosmetic: `getCutoverState` itself reads the
  lowest-id row deterministically, but **five other functions**
  (`fleetMeterMaintenanceGeneration`, `fleetNotificationDispatcher`,
  `fleetNotificationWorker`, `fleetPublicIssueReport`,
  `fleetScheduledMaintenanceGeneration`) read `FleetCutoverState` with
  unsorted `[0]` — an unspecified pick across duplicates could show different
  gate flags than the row `fleetCutoverControl` writes, making enable/disable
  cutover state non-deterministic.

## Change

- `base44/functions/fleetCutoverControl/entry.ts` — after creating the state
  row, `getCutoverState` re-filters contenders and applies the same
  lowest-id-wins loser election the notification worker uses for receipt
  claims: if our row lost, it is deleted and the canonical row returned. The
  gate row can no longer duplicate under concurrent first calls, and every
  reader/writer converges on one row.

## Tests

- 4 tests: concurrent first-call loser election + row retirement, existing-row
  short-circuit, no-create when not requested, and deterministic lowest-id
  resolution of pre-existing duplicates. Only the race test failed pre-fix
  (boundary locks pass both ways); 4/4 pass post-fix.

## Boundaries preserved

- No production data read or written; extracted source body + simulated
  entity only.
- Cutover gate payloads, the frozen-source confirmation string, `evaluate`
  counts/mirroring, and the `state_key: 'primary'` contract unchanged. The
  heal path deletes only a row this same call created and lost — never an
  existing canonical row.
