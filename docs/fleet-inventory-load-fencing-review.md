# Fleet inventory page load response fencing (Parts, Fluids)

Reviewed: 2026-10-22. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).

## Finding and change

`FleetParts` and `FleetFluids` reload their Fleet inventory through a `load` callback that fires on
mount and is re-fired after saves, `record_usage` mutations, and part-identification dismissals.
Overlapping loads applied whichever response finished last, so a slower earlier response could restore
stale `quantity_on_hand`/stock rows over the post-mutation snapshot, project its failure over a pending
refresh, or clear the loading indicator while a newer load was still in flight. Stale stock display is
misleading precisely where mechanics and admins make usage decisions.

Both pages now sequence loads with `loadSequenceRef`, matching the fencing already applied to Fleet
Requests, Fleet Maintenance, Fleet Inspections, Fleet Fuel, Fleet Warranties, and Fleet Reservations.
Only the latest-started request applies state; older responses settle without projecting stale snapshots
or clearing a newer loading state. The existing server-side `expected_updated_date` version checks and
`creation_key` idempotency on inventory mutations are unchanged.

## Verification

- Six deterministic extracted-handler races (three per page) reproduced the stale-write, loading-clear,
  and error-bleed failures before the guard and pass after it.
- Fleet load-race, unit-cost, work-order refresh, and inventory version regressions.
- Targeted ESLint, production build (`BASE44_LEGACY_SDK_IMPORTS=true`), and `git diff --check`.
- Global typecheck diagnostics remain pre-existing; zero mention Fleet or Bouncie.

No production Fleet records were modified. Nothing was published or deployed.
