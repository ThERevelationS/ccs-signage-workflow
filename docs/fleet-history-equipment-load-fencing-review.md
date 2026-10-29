# Fleet History & Equipment load-response fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Fence the remaining admin Fleet load surfaces so only the newest-started refresh
projects state, and so FleetHistory's paginated "load more" cannot append stale
pages onto a refreshed log list or duplicate a page fetched twice.

## Defects reproduced

`scripts/test-fleet-history-equipment-load-race.mjs` executes the real extracted
handler bodies against deterministic deferred promises. 9/9 failed pre-fix:

1. **FleetHistory `load`** (mount + Refresh button): overlapping refreshes let a
   slower earlier response overwrite newer `reports`/`logs`/`user` state, clear
   the newer loading indicator, or surface a superseded error.
2. **FleetHistory `loadMoreLogs`**: appends `FleetSystemLog` rows at offset
   `logs.length`. Two defects:
   - a full `load()` that starts after the page request but applies first leaves
     the pending append writing its stale-offset page onto the refreshed list
     (duplicated/out-of-order rows);
   - two overlapping page fetches (both read the same `logs.length` offset)
     append the same page twice. The `loadingMore` button guard alone does not
     cover programmatic or rapid repeat invocation.
3. **FleetEquipment `loadData`** (mount, `saveEquipment`, `reactivateEquipment`):
   same classic pattern — a stale load could roll back equipment status,
   work-order history, maintenance schedules, and Bouncie vehicle rows
   (`bouncieApi` list) after a reactivation or save-triggered refresh.

## Changes

- `src/pages/FleetHistory.jsx`
  - `loadSequenceRef` sequences `load`; stale responses return before applying
    `user`/`reports`/`logs`/`logHasMore`, cannot clear a newer `loading`, and
    cannot surface a superseded error.
  - `moreSequenceRef` sequences `loadMoreLogs`; only the newest page fetch may
    append, set `logHasMore`, surface an error, or clear `loadingMore`.
  - When `load` applies a fresh first page it also bumps `moreSequenceRef` and
    clears `loadingMore`, so any page fetch in flight (started before or during
    the reload) is superseded and its stale-offset append is dropped. This
    covers both race windows without blocking pagination.
  - Non-admin early return is unaffected: the stale-load guard precedes
    `setUser`, and `loadMoreLogs` is unreachable for non-admins.
- `src/pages/FleetEquipment.jsx`
  - `loadSequenceRef` sequences `loadData`; stale responses return before
    applying equipment, work-order history, maintenance tasks, current-user, or
    Bouncie vehicle state; cannot clear a newer loading indicator or surface a
    superseded error. Auth/Bouncie per-call catches (`catch(() => null)`) are
    unchanged, preserving fail-open display of Bouncie data on partial failure.

## Tests

- `scripts/test-fleet-history-equipment-load-race.mjs` — 9 deterministic
  real-handler tests covering: stale-load overwrite, loading control, error
  bleed, reload-drops-pending-append, duplicate-page prevention, superseded
  page-fetch error suppression, and the standard FleetEquipment race trio.
- Pre-fix run reproduced all 9 defects; post-fix 9/9 pass.

## Boundaries preserved

- No production data read or written; tests use extracted source bodies and
  synthetic fixtures only.
- Pagination semantics unchanged: `LOG_PAGE_SIZE`, `-created_date` ordering, and
  `logs.length` offsets are preserved; only stale-response application is
  fenced.
- `submitReport`/`changeReportStatus` mutation paths, `creation_key`
  idempotency, and feedback notification queueing are untouched.
- Fleet logs/feedback remain Fleet entities; no signage-entity reuse.
