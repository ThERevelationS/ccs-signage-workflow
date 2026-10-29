# Fleet Analytics & Equipment Detail load-response fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Audit the remaining mounted-guard Fleet surfaces for stale-response application
inside a live mount, and fence the one page whose reload path had no protection
at all: FleetEquipmentDetail's asset-switch load and its chained Bouncie trip
fetch.

## Audit result

Mounted-guard effects that return `() => { mounted = false; }` are already
race-safe across re-fires: React runs the previous effect's cleanup before
re-running, so a stale in-flight response sees `mounted === false` and cannot
apply. FleetAnalytics's year-scoped fuel fetch, FleetOverview, FleetNotifications,
FleetPublicReport, and the FleetEquipmentDetail tab children (FuelTab,
WarrantyTab, AssignmentsTab) all use that pattern correctly and needed no
change. The fuel-effect boundary is now locked in by regression tests that call
the returned cleanup exactly the way React does.

## Defects reproduced

`scripts/test-fleet-analytics-detail-load-race.mjs` executes the real extracted
handler bodies against deterministic deferred promises. The two genuinely
unprotected paths failed pre-fix (verified by rerunning the suite against the
pre-fencing commits):

1. **FleetEquipmentDetail `load`**: `useEffect(() => { load(); }, [id])` has no
   cleanup and `load` had no internal fencing. Navigating between assets
   quickly let asset A's equipment record, work-order history, tasks, logs,
   inspections, parts, requests, Bouncie live state, notifications, and
   metadata overwrite asset B's page, and let A's `finally` clear B's loading
   indicator.
2. **FleetEquipmentDetail `loadTrips`**: chained from `load` for VIN+IMEI-linked
   assets, unguarded. A's vehicle-identity check and 7-range trip fetch could
   still be in flight when the user switched to asset B — its results then
   applied A's trips onto B's page and flickered B's trip indicator.

## Changes

- `src/pages/FleetEquipmentDetail.jsx`
  - `loadSequenceRef` sequences `load`: stale responses return before applying
    the resolved equipment record (and the not-found state reset) and before
    the nine-dataset apply block; stale catches cannot surface errors or clear
    `loading`. The valid-load apply also clears `tripsLoading` alongside
    `setTrips([])` so an orphaned trip indicator from a superseded fetch is
    reset when the newer asset's data lands.
  - `loadTrips` captures `loadSequenceRef.current` at call time: a trip fetch
    started under a superseded asset load returns before applying vehicle
    identity results, trip rows, warnings, or clearing `tripsLoading`. The
    existing fail-closed identity checks (exact VIN+IMEI match required;
    mismatch warning hides trips) are unchanged.
- `src/pages/FleetAnalytics.jsx`
  - `loadSequenceRef` sequences the mount `load` for consistency with every
    other Fleet page (guards strict-mode replay and any future param
    dependencies). The year-scoped fuel effect needed no fencing — its
    per-effect cleanup already retires superseded fetches; that boundary is
    now covered by regression tests.

## Tests

- `scripts/test-fleet-analytics-detail-load-race.mjs` — 5 deterministic
  real-handler tests: fuel-effect cleanup boundary (stale overwrite + stale
  failure, both protected by the returned cleanup), asset-switch stale
  overwrite, cross-asset loading control, and stale trip-fetch drop.
- Pre-fix rerun: the 3 EquipmentDetail tests fail (the real defects) while the
  2 fuel-cleanup boundary tests pass unchanged (already protected). Post-fix
  5/5 pass.

## Boundaries preserved

- No production data read or written; tests use extracted source bodies and
  synthetic fixtures only.
- Bouncie identity proof (exact VIN+IMEI) and fail-closed trip hiding are
  untouched — fencing only drops responses from superseded loads.

