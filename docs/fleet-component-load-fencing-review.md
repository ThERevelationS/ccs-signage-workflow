# Fleet component load-response fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Extend the page-level fencing sweep to the three Fleet components whose reload
paths had no protection: the equipment-scoped panels that re-fire when the
parent switches assets, and the repair-approval policy list that reloads on
mount, Retry refresh, and post-mutation refresh.

## Audit note

Fleet components whose effects return `() => { mounted = false; }` are already
race-safe (React runs the cleanup before re-firing, retiring the stale fetch).
The three components below had effects with no cleanup at all — the same defect
class as the unfenced pages.

## Defects reproduced

`scripts/test-fleet-component-load-race.mjs` executes the real extracted
handler bodies against deterministic deferred promises. 8/8 failed pre-fix:

1. **FleetLifecyclePanel `load`** — re-fires on `[equipment?.id, isAdmin]`.
   Asset A's lifecycle profile/metrics/flags/priority/form could overwrite
   asset B's panel; a superseded failure could surface its error and clear the
   newer load's indicator.
2. **FleetEquipmentDocuments `loadDocuments`** — re-fires on
   `[equipment?.id, equipment?.name]` and from the Refresh button (only
   state-guarded). Asset A's document list could overwrite asset B's.
3. **FleetRepairApprovalPolicies `load` + `refreshAfterMutation`** — `load`
   fires on mount and from `retryRefresh`; `refreshAfterMutation` applies the
   policy list unconditionally after saves. An in-flight `load` could roll the
   list back over a post-mutation refresh.

## Changes

- `src/components/fleet/FleetLifecyclePanel.jsx` — `loadSequenceRef` sequences
  `load`; stale responses return before applying lifecycle state, cannot
  surface errors, and cannot clear a newer `loading`.
- `src/components/fleet/FleetEquipmentDocuments.jsx` — `loadSequenceRef`
  sequences `loadDocuments` the same way.
- `src/components/fleet/FleetRepairApprovalPolicies.jsx` — one shared
  `loadSequenceRef` sequences both `load` and `refreshAfterMutation`, so the
  newest-started refresh owns the list regardless of which path fired it.
  A superseded `load` returns `false` (it did not apply) so `retryRefresh`'s
  focus management behaves correctly, and `refreshAfterMutation` clears
  `loading` when it applies — otherwise a superseded `load`'s indicator would
  be orphaned forever, since its seq-guarded `finally` no longer clears it.

## Tests

- `scripts/test-fleet-component-load-race.mjs` — 8 deterministic real-handler
  tests: per-component stale overwrite, loading control, error suppression,
  superseded-load return value, and the cross-function load-vs-mutation-refresh
  race including the orphaned-indicator case caught by the test.
- Pre-fix run reproduced all 8; post-fix 8/8 pass.

## Boundaries preserved

- No production data read or written; extracted source bodies + synthetic
  fixtures only.
- Policy editor mutation flows, recovery/uncertainty handling, focus
  management, and the post-mutation warning text are unchanged.
- Lifecycle save flow applies its own response directly and is untouched.
