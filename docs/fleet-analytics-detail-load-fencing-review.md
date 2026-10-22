# Fleet Analytics & Equipment Detail load-response fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Fence the last two Fleet surfaces where overlapping loads could project stale
data inside a live mount: the year-scoped fuel summary on FleetAnalytics, and
the asset-switch load (plus chained Bouncie trip fetch) on FleetEquipmentDetail.
Mounted guards already prevented post-unmount writes but cannot stop a stale
response overwriting a newer response on the same mount.

## Defects reproduced

`scripts/test-fleet-analytics-detail-load-race.mjs` executes the real extracted
handler/effect bodies against deterministic deferred promises. 5/5 failed
pre-fix:

1. **FleetAnalytics fuel effect**: re-fires on `selectedYear`/`user?.role`
   changes. The `mounted` flag reset per effect run, but rapid year changes let
   an older year's `fleetFuelAction` summary apply last — the panel header shows
   the newly selected year while the numbers belong to another year. A
   superseded year's failure could also blank the summary with an error.
2. **FleetEquipmentDetail `load`**: re-fires on `[id]` changes. Navigating
   between assets quickly let asset A's equipment record, work-order history,
   tasks, logs, inspections, parts, requests, Bouncie live state,
   notifications, and metadata overwrite asset B's page, and let A's `finally`
   clear B's loading indicator.
3. **FleetEquipmentDetail `loadTrips`**: chained from `load` for VIN+IMEI-linked
   assets. A's trip fetch could still be in flight when the user switched to
   asset B — its identity check and 7-range trip fetch then applied A's trips
   onto B's page, and its `finally` could flicker B's trip indicator.

## Changes

- `src/pages/FleetAnalytics.jsx`
  - `loadSequenceRef` sequences `load` (consistent with other Fleet pages;
    covers mount re-fires/strict-mode replays): stale responses return before
    `setUser`, before the equipment/work-order/task apply, and before the
    lifecycle-portfolio apply; stale catches cannot surface errors or clear
    `loading`.
  - `fuelSequenceRef` sequences the year-scoped fuel fetch inside the existing
    effect (kept alongside `mounted`): a superseded year's response cannot
    apply `fuelSummary`, project `fuelError`, or clear `fuelLoading`.
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

## Tests

- `scripts/test-fleet-analytics-detail-load-race.mjs` — 5 deterministic
  real-handler tests: fuel-year stale overwrite, superseded fuel-year failure,
  asset-switch stale overwrite, cross-asset loading control, and stale trip
  fetch drop.
- Pre-fix run reproduced all 5 defects; post-fix 5/5 pass.

## Boundaries preserved

- No production data read or written; tests use extracted source bodies and
  synthetic fixtures only.
- Bouncie identity proof (exact VIN+IMEI) and fail-closed trip hiding are
  untouched — fencing only drops responses from superseded loads.
- The `loadingMore`-style pagination and mounted-guard single-shot effects on
  FleetOverview, FleetNotifications, and FleetPublicReport were reviewed: they
  have no reload callers, so no fencing was needed there.
