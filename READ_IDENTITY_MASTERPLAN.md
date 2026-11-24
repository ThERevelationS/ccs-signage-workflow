# Read-identity rework — masterplan

Goal (Brett, 2026-11-23): staff stop sharing one Base44 rate-limit allowance. Each person's
reads should count against their own allowance so the app "runs smooth" for everyone.
Brett chose a whole-app rework (not estimator-only) and accepts that some things may break
during the move. Run it in its own session with an explicit scope grant in AGENTS.md.

## Why it is needed (evidence)

- Live 429 body: `Rate limit exceeded: entity_list allows 140 requests per 60s for each caller
  of this app (a signed-in user, a visitor's IP or a service token).`
  Samples: `ccs-cb-import/.audit-work/q-func/*.json`.
- Every staff read goes `staffEntities` (src/components/staff/staffEntities.js) →
  `staffDataRead` → `asServiceRole`. All staff and all modules share ONE service-token allowance.
- Staff sign in through the app's own EmailGate (`src/components/auth/EmailGate.jsx`,
  `verifyLogin`/`verifySession`, token in localStorage `sss_session_token`). They are not
  Base44 app users; `base44.auth.me()` rejects for them.
- Apps API docs list plan multipliers (Builder 2x, Pro 3x, Business 5x, Enterprise 10x).
  Brett does not want to pay for a limit increase.

## Already done (estimator read reduction, 2026-11-23)

Same 5-product flow on EST-00009, single-counted list entries: 62 → 32.
- `d8c285780` scoped product refresh (62 → 50)
- `5352afedb` 15-min client cache for 18 price-list catalogs, write-settled (50 → 42)
- `bc834de34` one batched Parts/Groups read per estimate (42 → 32)
429s still occur under load. Harness + artifacts: `ccs-cb-import/.audit-work/q-func/load-*.mjs|json`.

## Platform facts (docs.base44.com)

- Entities support RLS (create/read/update/delete) and FLS (per-field create/read/update/write).
  Conditions: `{{user.email}}`, `{{user.id}}`, `{{user.role}}`, `{{user.data.*}}`,
  `user_condition`, `$or/$and/$nor/$in/$nin`. Denied list/filter → empty; denied get → 404;
  denied write → 403. Admins are NOT exempt from FLS. `asServiceRole` bypasses both.
- App users are invited from the dashboard (≤50 per batch, CSV ok), roles User/Admin, custom
  fields on the User entity. No per-app-user fee found in billing docs. Private visibility
  needs Starter+.

## Current security model to preserve (staffDataRead)

- `STAFF_READABLE`: 128 entities.
- `FIELD_DENYLIST` (everyone), `STAFF_FIELD_DENYLIST` (non-admins), `OWNER_FIELD_DENYLIST`
  (owner row only, e.g. AuthorizedEmail.hr_data).
- `OWNER_SCOPED`: TimeEntry, TimeClockAudit, TimeClockBreak, TimeClockCorrectionRequest,
  TimeClockLaborSegment, TimeClockWorkPause, TimeOffRequest, UserPTOBalance.
- Library entities (PartTemplate, QuickProduct, QuickProductCategory) owner/`product_group` rules
  via `base44/shared/libraryFilteredRead.ts`.
- `authenticateSignShopSession` (used by 115 functions) rejects deactivated users and
  expired access dates — per-user identity must keep that.
- Customer/portal users must never gain read access to staff/cost data — RLS rules need a
  staff marker (e.g. `user_condition: {"data.is_staff": true}`), not just "signed in".

## Phases

### P0 — prove it (gate; no app code changes)
**RESULT 2026-11-24 00:26Z — PASS for direct user reads (path b).** `base44 exec` (user-scoped, Brett's
login, no `--privileged`) made 140 `Announcement.list` calls → call 141 got 429 "…140 requests per 60s
for each caller… Retry after 37s". 1.4s later a staff read through `staffDataRead` (service role, uncached
BuilderPart filter) succeeded. Brett's user allowance and the service-token allowance are separate.
Scripts: `ccs-cb-import/.audit-work/q-func/p0-user.ts`, `p0-staff.mjs`. Still untested: path (a),
user-scoped reads made INSIDE a backend function with the caller's token.

Throwaway function + throwaway entity. With Brett signed in as a Base44 app user, make N list
reads (a) user-scoped from inside a function, (b) direct from the browser SDK, (c) asServiceRole;
drive one path to 429 and confirm the others still succeed. Pass = user-scoped reads have their
own allowance. If (a) fails but (b) passes, design must use direct browser reads. If neither,
stop — the rework does not help.

### P1 — design (settle with Brett before code)
- Identity link: Base44 User ↔ AuthorizedEmail by email; `data.is_staff`, `data.staff_role`
  maintained server-side; deactivation/expiry mirrored.
- Sign-in UX: Base44 login replaces or follows EmailGate; decide which.
- Read path per table: user-scoped inside staffDataRead (keeps gateway checks) vs direct SDK.
- Writes: stay on service-role gateways unless P0 shows writes are also limited.
- Fallback: any table/user not migrated keeps today's service-role path.

### P2 — build on a Base44 branch
Per entity group: RLS + FLS in `base44/entities/*.jsonc` mirroring the denylists above;
gateway switch per group; regression tests that a non-admin, a customer user and an
unauthenticated caller get exactly today's visible rows/fields.

### P3 — staged rollout, busiest first
Estimator (Builder*, catalogs, AllInOneEstimate) → Time Clock → pipeline/work orders → rest.
Measure before/after with the q-func harness pattern. Invite staff before each switch.

### P4 — cleanup
Remove dead service-role read paths only after every group is migrated and verified.

## Open questions
- Does `{{user.data.*}}` support everything the owner-scoped/time-clock rules need?
- Do function invocations themselves have a shared limit separate from entity_list?
- Portal/customer users: are any already Base44 app users today?
