# Fleet Maintenance refresh response fencing and meter-rule save semantics

Reviewed: 2026-10-22. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).

## Findings and changes

Overlapping Fleet Maintenance page loads applied whichever response finished last. The page's
`loadData` has three callers — initial mount, the schedule dialog save (`saveTask` reloads), and the
bulk planner's `onCompleted` — so a save or bulk-plan refresh could overlap an earlier load. A slower
earlier response could restore stale schedule, equipment, work-order, Fleet part/fluid, and user state
over a newer snapshot, project its failure over a pending refresh, or clear the loading indicator while
a newer load was still in flight.

`FleetMaintenance.jsx` now sequences each load with `loadSequenceRef`, matching the Fleet Requests
fencing. Only the latest-started request applies schedule, equipment, work-order, part/fluid, user,
error, and loading state. Older responses settle without projecting stale snapshots.

`FleetMaintenanceWorkspace.jsx` reloaded meter-maintenance status inside the meter-rule dialog's
`onSaved` callback and rethrew refresh failures. Because `FleetMeterRuleDialog` awaits `onSaved` inside
its own save handler, a failed status refresh reported a **successful** rule save as failed, and a retry
generated a fresh `creation_key`, risking a duplicate rule. The refresh now runs as `refreshMeterStatus`:
a failure surfaces through the workspace error banner while the save result and dialog close remain
honest.

## Verification

- Three deterministic extracted-handler races reproduced the stale-write, loading-clear, and
  error-bleed failures before the guard and pass after it.
- Two extracted-handler meter-refresh tests proved the old `onSaved` rejection (reported to the user as
  a failed save) and confirm refresh failures now surface as workspace errors while resolving normally.
- Fleet request unit-cost, load-race, and work-order refresh regressions: 12/12.
- Targeted ESLint, production build (`BASE44_LEGACY_SDK_IMPORTS=true`), and `git diff --check`: pass.
- Global typecheck reports ~8.1k existing diagnostics; zero mention Fleet or Bouncie.

No production Fleet records were modified. Nothing was published or deployed.
