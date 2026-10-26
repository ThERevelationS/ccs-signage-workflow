# Bouncie connection singleton create race — review

## Defect

`saveConnection` in `base44/shared/bouncie.ts` — the only `BouncieConnection.create`
site, called from `bouncieAuthCallback` after a successful OAuth code exchange —
used check-then-create:

1. `getActiveConnection` lists connections; if none, create.
2. Two concurrent first-ever OAuth callbacks each observe an empty list and each
   create a `BouncieConnection` row.

`getActiveConnection` sorts by `updated_date` desc and picks `[0]`, so with two
surviving rows whichever was patched most recently becomes "active" — tokens,
webhook ids, and error state split across rows. Worse, `bouncieAuthInitiate`'s
stale-cleanup and every reader (`bouncieStatus`, webhook handlers, vehicle sync)
see whichever row last won an unrelated update.

The OAuth-state claim in `bouncieAuthCallback` is already atomic (`updateMany`
with `id` + `updated_date` + `used:false`), but that only serializes two
exchanges sharing one state row. Two separate admin connect flows — or a retried
callback racing a fresh initiate — still race the create.

## Fix

After creating, `saveConnection` re-lists contenders, elects the earliest-created
row (`created_date` asc, `id` tiebreak — the same `canonical` convention used by
`bouncieSyncNotifications` and `bouncieWebhook`), deletes the non-winner
duplicates, and returns the canonical row. Both racing callers converge on the
same connection; `getActiveConnection` sees exactly one row afterwards.

## Test

`scripts/test-bouncie-connection-singleton-race.mjs` extracts the real
`getActiveConnection`/`saveConnection` bodies and races two first connections
behind a deferred create gate:

- Pre-fix: the race test fails — two `BouncieConnection` rows survive, callers
  receive different rows (2 boundary tests pass, confirming only the race is
  exercised).
- Post-fix: 3/3 pass — one survivor, loser retired, both callers receive the
  canonical row; the existing-connection update path and reader ordering are
  unchanged.

## Scope

- No production records touched; synthetic entities only.
- No changes to `bouncieAuthCallback`'s state-claim CAS or webhook setup.
