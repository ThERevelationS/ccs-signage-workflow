# Fleet equipment-scoped load response fencing (Fuel, Warranties, Reservations)

Reviewed: 2026-10-22. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).

## Finding and change

`FleetFuel`, `FleetWarranties`, and `FleetReservations` each reload their equipment-scoped dataset
through a `load` callback whose dependencies include the equipment filter (and, for Fuel, the year).
Changing the filter re-creates `load` and re-fires it, so overlapping requests are routine — and post-save
and post-action reloads (fuel entry/import/delete, warranty save/delete, reservation save, cancel,
check-out, and return) can overlap them too. Whichever response finished last won, so a slower earlier
load could restore equipment, user, summary, warranty, or reservation state from the previous filter over
the newer snapshot, project its failure over a pending refresh, or clear the loading indicator while a
newer load was still in flight.

Each page now sequences loads with `loadSequenceRef`, matching the Fleet Requests, Fleet Maintenance,
and Fleet Inspections fencing. Only the latest-started request applies state; older responses settle
without projecting stale snapshots or clearing a newer loading state. Fleet Fuel guards both of its
sequential apply points (equipment/user, then the summary).

## Verification

- Nine deterministic extracted-handler races (three per page) reproduced the stale-write, loading-clear,
  and error-bleed failures before the guard and pass after it.
- Fleet load-race, unit-cost, work-order refresh, and inventory version regressions.
- Targeted ESLint, production build (`BASE44_LEGACY_SDK_IMPORTS=true`), and `git diff --check`.
- Global typecheck diagnostics remain pre-existing; zero mention Fleet or Bouncie.

No production Fleet records were modified. Nothing was published or deployed.
