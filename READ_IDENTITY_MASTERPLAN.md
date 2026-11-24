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
**Decided 2026-11-24 (Brett):** (1) Base44 sign-in REPLACES EmailGate — one login. (2) Reads go
direct from the browser as the person (path b, proven in P0) — chosen for reliability, load time and
UX (no function hop, per-user allowance, live subscriptions instead of 2-min polling). Aggregate
feeds (queueFeed, reports) may stay server-side. (3) Customers use the app-generated portal login
(`CustomerPortal.jsx` → `customerPortalAction` with a portal token) — NOT Base44 users; untouched.

**Draft design (awaiting Brett's approval):**
- Identity: each AuthorizedEmail staff row ↔ one Base44 app user (same email). Server-maintained
  User custom fields: `data.staff_id`, `data.is_staff`, `data.access_ok` (false when
  `is_deactivated` or past `access_expires_on`). Base44 role `admin` ⇔ AuthorizedEmail role admin.
  A sync function keeps these current on AuthorizedEmail change + daily.
- Sign-in: Base44 login page; then a `staffSessionV2` call validates the staff record and returns
  the profile EmailGate returns today (role, sales_roles, permissions). `authenticateSignShopSession`
  accepts a Base44 user token (lookup by email, same deactivation/expiry checks) so the 115
  functions keep working without per-function edits (needs a full app publish).
- Reads: `staffEntities` keeps its API; per migrated entity its list/filter/get/subscribe call
  `base44.entities.X` directly, else fall back to `staffDataRead`. Pages don't change.
- Rules per entity (in `base44/entities/*.jsonc`): staff read
  `{"user_condition": {"data.is_staff": true, "data.access_ok": true}}`; admin-only tables add
  role admin; OWNER_SCOPED time-clock tables `$or` owner-field = `{{user.email}}` / admin (owner
  field names to verify per entity); FIELD/STAFF/OWNER denylists → FLS `read` rules (admins are
  not exempt — add the admin condition explicitly). Library product_group rules → RLS `$or`.
- Writes stay on the service-role gateways for now (validation lives there; the bottleneck is
  entity_list).
- Shared devices (Time Clock face/kiosk flows) keep going through functions.
- Parity harness before each group switch: for an admin and a non-admin test staff account,
  direct read == gateway read (same rows, same fields) for every entity in the group. Denied
  reads return EMPTY silently, so missing-data bugs only show up in this comparison.

**Findings 2026-11-24 (read-only checks):**
- SDK `@base44/sdk` has `auth.loginViaEmailPassword(email, password)`, `resetPasswordRequest`,
  `resetPassword`, `inviteUser(email, role)`, `register`+`verifyOtp`, `setToken`, `logout`. So the
  EXISTING EmailGate screen can stay and call Base44 underneath; no redirect to a Base44 page needed.
- Transition login (no lockouts): EmailGate keeps calling `verifyLogin(username, password)`; on
  success it also tries `loginViaEmailPassword(record.email, password)`. Success → direct reads;
  failure (no Base44 account yet / different password) → today's gateway path, unchanged.
- Gating must use `{{user.role}}`, NOT `user.data.*` flags: `auth.updateMe()` lets a user edit
  their own custom User fields, so a `data.is_staff` flag would be self-grantable. Proposal: Base44
  role `staff` (or `admin`), set by a server sync from AuthorizedEmail; deactivated/expired →
  role `disabled` (or user removed). MUST PROBE: custom role values accepted? role not
  self-editable via updateMe? does a role change apply to an existing token immediately?
- Precedents already in schemas: field-level `rls` on properties (User.jsonc google tokens), and
  9 time-clock entities already carry owner rules `{"data.user_email":"{{user.email}}"}` OR admin.
  OWNER_SCOPED owner field is `user_email` on all 8 owner-scoped entities.
- Gateway inventory (`staffDataRead`): ~119 STAFF_READABLE, 15 ADMIN_READABLE, FIELD_DENYLIST
  (AuthorizedEmail secrets → server-only FLS), OWNER_FIELD_DENYLIST (AuthorizedEmail.hr_data → owner
  or admin), STAFF_FIELD_DENYLIST (TimeClockPayPeriod payroll aggregates → admin), OWNER_SCOPED (8),
  LIBRARY_ENTITIES (3, product_group/owner_email rule). Also query-shape guards (operators, $in≤200,
  regex≤200, limit≤5000) — direct reads lose these; acceptable for staff, note for review.

**Open (ask Brett):** does every staff member have a real email inbox (invites + password reset)?
Are any devices shared by several staff (shop kiosk / time clock tablet)? Google sign-in allowed?

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
