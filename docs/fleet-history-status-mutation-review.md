# Fleet History feedback-status mutation fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Audit Fleet pages for unguarded per-row mutation handlers — the remaining
defect class after the load-fencing sweep. Every Fleet dialog save/submit is
busy-gated; `FleetHistory`'s feedback status `<select>` was the one control
that could fire overlapping writes.

## Defects reproduced

`scripts/test-fleet-history-status-race.mjs` executes the real extracted
`changeReportStatus` body against deterministic deferred promises. 4/6 failed
pre-fix:

1. **Stale-apply**: two rapid status changes on the same report; whichever
   response landed last won the local `reports` state — so the UI could show
   the older status while the server held the newer write.
2. **Stale version token**: the handler passed `report.updated_date` captured
   at render time. A change fired after a previous update applied still sent
   the old `expected_updated_date`, forcing a server version rejection on an
   otherwise-valid chained change.
3. **No busy serialization**: nothing stopped the select from re-firing while
   its write was in flight (the control had no `disabled` state at all).
4. **Stale error bleed**: a superseded change's failure could surface the
   shared error banner over a pending newer change.

## Changes

- `src/pages/FleetHistory.jsx`
  - `statusChangeSequence` (per-report `Map`) sequences `changeReportStatus`:
    only the newest-started change for a given report may apply `reports`
    state, surface an error, or clear the busy marker. Different reports still
    update concurrently.
  - `reportsRef` mirrors `reports` each render so each change sends the fresh
    `expected_updated_date` the previous response established — chained
    changes (new → in_review → in_progress) no longer version-conflict.
  - `statusBusyId` early-returns same-report calls while one is in flight and
    disables that report's status `<select>` (`disabled:opacity-50`) —
    matching the `busyId` per-row convention used on Fleet Requests.

## Tests

- 6 deterministic real-handler tests: stale-apply drop, fresh version token
  on chained changes, same-report busy serialization, stale-error
  suppression, cross-report concurrency preserved, and the pre-existing
  invalid-status guard. The last two are boundary locks (pass both ways);
  the other four reproduced pre-fix and pass post-fix.

## Boundaries preserved

- No production data read or written; extracted source bodies + synthetic
  fixtures only.
- `update_status` payload shape, server-side optimistic-concurrency check,
  report list ordering, and feedback-create `creation_key` flow unchanged.
