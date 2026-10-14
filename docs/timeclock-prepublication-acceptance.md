# CCS Signage Workflow — Time Clock pre-publication acceptance

**App:** CCS Signage Workflow — Base44 App ID `68dfcc5e57bbbc35387da97c`

**Scope:** Time Clock only. Other CCS agents may change the shared repository. Inspect fresh HEAD and diff first. **No publication without explicit approval. No synthetic punches or payroll records in production.**

## Current pre-publication position (2026-10-14)

- **Source and synthetic acceptance:** all 13 Time Clock test suites passed, totaling 218 scenarios/renderer groups, including component-level checks that stale cross-employee status replies, background refreshes, delayed post-punch kiosk cleanup, Work Pause overlay session/poll/resume acknowledgements, late break/lunch and Current Work labor responses, and old Clock Out allocation previews cannot overwrite newer authoritative state. Interrupted Resume Work, unpaid-lunch, and Current Work start acknowledgements retry the exact request ID. Shift-specific Clock Out suggestions and manual allocations are isolated, with same-shift draft preservation on close/reopen. Final Clock Out reconciliation verifies the open shift and unchanged employee draft after awaiting the server, blocks duplicate submissions, and refuses changed authoritative totals until reconciled. If the Clock Out acknowledgement is uncertain, the original exact request ID and lunch, allocations, and notes must be retried unchanged without generating a new preview; an edited draft must fail closed rather than change that pending request, and a late acknowledgement cannot affect another employee. A valid final preview must still allow Clock Out. Normal Current Work start/change/stop, paid breaks, confirmed Clock Out, and Resume Work cleanup remain covered. Run `node scripts/check-timeclock-prepublish.mjs` to reproduce this read-only gate against current source. It also checks authoritative backend action wiring, admin UI route guards, and create/update/delete RLS for 12 Time Clock schemas.
- **Coordinator provisioning:** read-only production queries on 2026-10-13 returned **exactly one** clean `TimeClockPayPeriodCreateGate` (`6ab9aadd0d7161cf840af039`) and **exactly one** clean `TimeClockAdminCorrectionGate` (`6acd8dd2c591e8c0d99da473`), both `scope=company`, `status=idle`, with no claim metadata. These are dated observations; query both again immediately before publication.
- **Local static/build readiness:** focused lint and backend bundle should pass, and full `npm run build` must succeed on the current HEAD. Synthetic validation does not test deployed Base44 CAS semantics, permissions in a deployed session, or device behavior.
- **Remote publication and authenticated browser acceptance: NOT VERIFIED.** Building/checkpointing is not publication. Do not declare release ready on code-level tests alone.

## Safe repeatable checks

1. Confirm fresh `git rev-parse HEAD`, clean working tree and Time Clock diff from latest checkpoint. Preserve concurrent Sales, Orders, Fleet, Permitting, SIPS, Admin, and shared code.
2. Run `node scripts/check-timeclock-prepublish.mjs` (read-only source inspection plus synthetic fixtures; no live API calls).
3. Bundle the Time Clock backend with `npx esbuild base44/functions/timeClockAction/entry.ts --bundle --platform=neutral --format=esm '--external:npm:*' --outfile=/tmp/timeclock-prepublish-backend.js`.
4. Run `npx eslint scripts/check-timeclock-prepublish.mjs scripts/validate-timeclock-*.mjs src/components/timeclock/CorrectionCoordinatorDiagnostics.jsx src/components/timeclock/TimeClockAdmin.jsx`, `git diff --check`, and `npm run build`.
5. Read production `TimeClockPayPeriodCreateGate` and `TimeClockAdminCorrectionGate` **without mutating either**. For EACH independently require exactly one row, `scope=company`, `status=idle`, empty `request_id`, `payload_hash`, `claim_token`, null/empty `started_at`; also require empty `time_entry_id` for the manager correction gate. Any missing, duplicate or held claim blocks release pending investigation. Confirm schemas remain backend-only for writes.
6. Validate the exact candidate commit, published revision (if any), and deployment method. **Do not run deployment or publish commands without separate user approval.** Current Base44 connector may not expose publication. Never assume a checkpoint is live.

## Authenticated browser acceptance — controlled NONPRODUCTION environment only

Use distinct manager and employee accounts, two browser sessions/devices, and synthetic users/records in a **separate authorized staging environment**. Do not touch real payroll or employee production punches for test convenience. Record actual results and evidence; do not mark steps passed by rendering tests.

| Flow | Normal acceptance | Safety / edge acceptance | Status |
|---|---|---|---|
| Employee sign-in / session | Sign in, view Today, refresh and restore own status | Employee cannot read or edit another person's time; badge/login identity cannot access manager diagnostics; switching employee session must not apply a prior session's delayed status response | **Pending** |
| Clock In / Clock Out | Official server punches; clock-out allocations reconcile; confirmed state persists | Double-tap, cross-tab race, interrupted request/retry, clock-out without clock-in, stale client clock; delayed background status must not reopen a completed punch dialog; old kiosk cleanup must not erase a newer authoritative shift or interrupt new recognition | **Pending** |
| Break and lunch | Start/end paid and unpaid breaks; worked minutes correct | Duplicate taps, refresh/reopen, clock-out transitions, no overlapping break/pause; a pending former employee break must not block another employee's status or overwrite their break totals; interrupted unpaid-lunch start must retry the original request | **Pending** |
| Work Pause | Explicitly allowed employee pauses/resumes and sees full-screen guard | Permission disabled, permission removed mid-pause, multiple pauses, refresh/device restore, cannot clock out while paused; stale status/events/resume responses must not cross employee sessions; uncertain Resume retry reuses exact request ID | **Pending** |
| Current Work | Start/change/stop optional labor, one active segment; job linking optional | Break/Work Pause/Clock Out close segment, second device contention, allocation suggestions editable, WorkOrders unchanged; interrupted start retries exact ID; late labor acknowledgements/errors cannot revive stopped labor, override a newer break, or cross employee sessions; old Clock Out previews cannot overwrite new shift suggestions or edited allocations; closing/reopening same shift preserves drafts; final Clock Out preview must fail closed for changed server totals, a session swap, edited in-flight draft, or duplicate tap; lost Clock Out acknowledgement retries must preserve both original request ID and exact payload without recalculating totals, while valid server totals permit submission | **Pending** |
| Missed punches | Missed Clock Out pre-clock-in review; late Clock In claim and manager review | Overnight/extra-long shifts, Worked Through attestation, never fabricate a punch, interrupted recovery & audit | **Pending** |
| Employee corrections | Request with original snapshot, reason and server timestamp | Exact retry, stale entry version, unauthorized edit, approved shift returns Needs Review | **Pending** |
| Manager correction review | Approve / modify / reject with audit and separate shift approval | Two employees with same review ID, two manager tabs, lost ACK, mismatched audit, company lock fail-closed | **Pending** |
| Manager direct correction | Change reviewed times with reason, original/audit preserved | Concurrent direct vs review correction, stale version, duplicate global ID, finalize lock | **Pending** |
| Pay periods | Manual Open → Review → Finalized, required approvals and Excel/audit review | Concurrent overlapping create, unresolved correction, active shift, reopened history and finalized lock | **Pending** |
| Management and diagnostics | Live status, Needs Attention, shift drill-down, audit viewer, coordinator status | Read-only held/invalid diagnostics, failed network, session swap, no unlock/reset affordance | **Pending** |
| Responsive UI | Phone and desktop controls, focus timer/pause layout, clear error dialogs | No browser-native alerts, no accidental retry after uncertain response | **Pending** |
| Shared CCS regression | Admin auth/navigation and related WorkOrders remain functional | Other CCS areas not inadvertently changed by deployment | **Pending** |

### Two-session atomicity prerequisite

The synthetic CAS race suites **pass**, but actual deployed `updateMany` atomicity, authoritative `updated` counts and two-session behavior remain unverified. Test only with staging coordinator rows provisioned once and disposable staging time data. Never run race/duplicate-write probes against actual payroll or production TimeEntries. If staging is unavailable, keep the browser/concurrency gate **Pending**, not passed.

### Release decisions and sign-off

- **Code and synthetic source gate:** pass only if the current candidate commit passed every step above.
- **Infrastructure gate:** pass only after fresh read-only coordinator/schema validation.
- **Staging authenticated browser gate:** **Pending** until a manager and employee actually complete the matrix.
- **Publish approval:** **Not granted by this document.** Explicit operator/user permission required.
- **Live post-publication smoke test:** **Pending** until publication is approved and verified; use read-only flows first, avoid modifying production payroll records. Confirm published revision and coordinator health again.

Record when performed: **Candidate commit:** ______  **Environment:** ______  **Reviewer:** ______  **Date:** ______  **Browser evidence location:** ______  **Result / blocking issue:** ______

Any contradictory status, unknown write outcome, unverified permission, malformed audit/lock, or source-to-deployment mismatch is a **STOP**. Preserve data and investigate before further action.
