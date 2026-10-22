# Fleet Tracking Bouncie refresh fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Fence the three unfenced Bouncie refresh paths on Fleet Tracking — the last
Fleet page whose reloadable state could still be overwritten by a slower
earlier response. Completes the page-level fencing audit; every Fleet page is
now either sequence-fenced or protected by a real per-effect cleanup.

## Audit result

- `loadTrips` was already fenced (`tripLoadGeneration`) — unchanged.
- FleetSearch uses a debounced `requestSequence` guard — already correct.
- FleetMechanic `load` is fenced (`portalRequestRef`); its work-recovery path
  is fenced (`workRecoveryRequestRef`).
- FleetOverview/FleetNotifications/FleetPublicReport mount loads are
  single-shot or cleanup-guarded — no repeat callers.
- Fleet dialogs' `open`-gated effects hydrate form state synchronously; their
  awaits are user-triggered mutations/uploads, not overlapping loads.
  `FleetRepairEstimateDialog` already fences with `loadEpochRef`.

## Defects reproduced

`scripts/test-fleet-tracking-load-race.mjs` executes the real extracted
callback bodies against deterministic deferred promises. 6/7 failed pre-fix
(the seventh asserts preserved silent-failure semantics and passes both ways):

1. **`loadVehicles`** — callers: initial connect effect, 60-second refresh
   interval, OAuth poll, manual refresh button. A slow 60s-poll response could
   overwrite newer vehicle positions/data from a manual refresh, clear a newer
   `vehiclesLoading` indicator, or project a stale poll failure over a pending
   refresh.
2. **`loadStatus`** — callers: initial effect and the 4-second OAuth
   connection poll. A stale status could overwrite a newer connection state.
   Fencing preserves the return contract: a superseded check still returns its
   own fetched status so the OAuth poll keeps making decisions from fresh
   data — only `setStatus` application is gated. The catch now returns the
   `{connected:false,error}` fallback (previously `undefined`); both callers
   only inspect `s?.connected`, so behavior is identical.
3. **`loadNotifications`** — callers: initial effect, interval, OAuth poll,
   mark-read recovery, clear-all recovery, manual refresh. A stale list could
   restore already-read or superseded notification rows. Its swallow-and-keep-
   the-map-usable error semantics are unchanged.

## Changes

- `src/pages/FleetTracking.jsx` — `statusLoadGeneration`,
  `vehicleLoadGeneration`, and `notificationLoadGeneration` refs sequence the
  three callbacks, matching the file's existing `tripLoadGeneration` pattern.
  Only the newest-started request applies `status`/`vehicles`/`notifications`,
  clears `vehiclesLoading`, or surfaces a vehicle-load error.

## Tests

- `scripts/test-fleet-tracking-load-race.mjs` — 7 deterministic tests: stale
  vehicle overwrite, `vehiclesLoading` control, stale error suppression, stale
  status overwrite, preserved OAuth-poll return contract, stale notification
  overwrite, and preserved silent notification failure.
- Pre-fix run reproduced 6/7 (the silent-failure lock passes both ways);
  post-fix 7/7 pass.

## Boundaries preserved

- No production data read or written; extracted source bodies + synthetic
  fixtures only.
- Bouncie OAuth flow, 60s/4s polling cadence, deep-link VIN/IMEI resolution,
  `tripLoadGeneration` fencing, and notification optimistic updates are
  unchanged.
