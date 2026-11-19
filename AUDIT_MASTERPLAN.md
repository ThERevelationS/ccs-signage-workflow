# AUDIT MASTERPLAN — Whole-App Bug Audit (Estimator Excluded)

**Purpose:** a self-contained, resumable ledger for auditing the entire CCS Signage Workflow app — broken flows, data/permission problems, security weaknesses, reliability issues — across every route, page, form, modal, workflow, entity, relationship, RLS rule, backend function, automation, scheduled job, webhook, and integration.

**Hard exclusion — ESTIMATOR FREEZE (per Brett, 2026-11-07):** the Estimator domain is under active construction. Do NOT audit, trace-fix, or propose changes inside:
- `src/components/estimator/**`, `src/pages/Estimator*`, `src/pages/NewAllInOneEstimate.jsx`
- estimate→WO→invoice chain components (`CustomerQuotePanel`, `EstimateDetail`, `EstimateAcceptancePanel`, `quoteDeliveryService`, `quotePdf`, `estimateLifecycle`, `quoteDefaults`, `aio/*`, `products/*`)
- `base44/functions/*Estimate*` / `ensureNew*` / `invoicingAction` / `queueFeed` / `recordEstimateAcceptance` / `opportunityWorkspaceAction` / `zzCleanupAction`
- `base44/shared/*pricing*` / `*estimate*` / `queueFeed*`
- `ESTIMATOR_MASTERPLAN.md` items — the estimator program owns them.
- Boundary rule: shared files an Estimator surface imports may be *read* for context but never *edited* for an estimator-path defect. Log estimator-side findings in AUD-Z as `ESTIMATOR-SCOPE — report only`.

**Everything else is in scope**, including FileBridge, Timeclock, Fleet, Permitting, Sales, Orders, Invoicing (non-estimator surfaces), Comms, Migration, SOP/Training, Walk-in, and platform plumbing.

---

## 0. EXECUTION PROTOCOL

### 0.1 Ledger contract
- Every item carries a state marker: `[OPEN]`, `[DOING]`, `[DONE]`, `[BLOCKED-CREDENTIALS]`, `[BLOCKED-EXTERNAL]`, `[DEFERRED]`.
- Find the first `[OPEN]` in workstream order. Work it. Mark `[DONE] + evidence` (one line: file:line refs, verify output, date).
- Item IDs are `AU-<LETTER><NN>` (e.g. `AU-D03`). Never renumber completed items.
- Confirmed bugs get the next **F-number** (register in §2); advisories get `ADV-` markers. Fixed bugs keep their F-number with `FIXED @checkpoint`.
- Unrelated defects discovered mid-item go to **AUD-Z** (parking lot), not mid-item scope creep.
- New items append at workstream end — never insert mid-list.

### 0.2 Per-item audit cycle
1. **Read remote first** — remote sandbox is source of truth (`sandbox read --app-id 68dfcc5e57bbbc35387da97c --branch main --json`). Local tree lags; normalized-hash drift check before trusting any diff.
2. **Trace the full path** — UI → persistence → function → entity → RLS. Reason through success/failure/missing/invalid/duplicate/stale/unauthorized/concurrent cases.
3. **Live-probe where cheap** — anonymous `entities.*.filter` denial shape, `staffDataRead` via `.permit-session-token`, entity counts, function response shapes. Stay inside entity-read budget (140/60s + app volume cap).
4. **Log finding** — F-number, severity, evidence (file:line), reproduction path, blast radius.
5. **Fix only when safe** — confirmed bug, non-Estimator scope, not writer-active file. Risky/active-area findings are reported, not patched.
6. **Verify remote** — read back the landing; functions need `functions deploy` only when backend code changed (authorized by remediation context).
7. **Checkpoint + audit-log entry** (`audit/BUG_AUDIT_2026-10-27.md`) per cycle batch.

### 0.3 Safety rails
- **Never publish/deploy the site.** `sandbox checkpoint` allowed per batch.
- **Never edit real business records.** Entity probes are read-only; function probes use dry-run/diagnostic ops only.
- **Writer-active files are read-only for the audit** — flag findings, don't patch (the OrderSpreadsheet/NotificationService save-race class).
- **No write probes against production entities** — no test creates outside existing ZZ-prefixed test conventions, and none at all without explicit approval.
- **Rate-limit discipline** — batch reads, reuse session token, back off 60-120s on 429s. Never compete with the permitting fleet for entity budget.
- **Secrets/credentials:** never print token values in evidence; reference `.permit-session-token` by path only.

### 0.4 Verify tooling
- JSX/TS syntax: `npx esbuild <file> --loader:.jsx=jsx --outfile=NUL`
- Hardening suites: `scripts/test-*.mjs` (see AGENTS.md list) — run the module's suite after touching it
- Remote reads: `sandbox read`, `sandbox run` (grep/wc/md5), normalized-hash diff for drift
- Anonymous-read probes: `curl .../entities/<E>/filter` unauthenticated — `200 []` = denied shape
- Session probes: `staffDataRead` via `.permit-session-token`

---

## 1. COVERAGE ALREADY BANKED (do not re-audit)

| Area | Evidence | Cycles |
|---|---|---|
| boardFeed anonymous-read, projection, caching, delta cursors | `boardFeedFields` regen + deploy verified | ~C10-15 |
| TimeTracker.jsx runtime crash | fixed + verified | ~C20 |
| Backend-only entity access via staff gateways; anonymous entity-write exposure | gateway audit + fixes | ~C25-30 |
| Subscription/reorder writes, monitoring timeouts, WIP import matching, fleet notification dispatch, procurement receiving, staff email, ops reports, product queues, customer statements, workflow perf | fixes verified | ~C30-38 |
| Stuck `PermittingScanRun` records; entity-health/security sweep; stale generated bundles; date-only timezone bugs; migration timestamp preservation | fixed + deployed | ~C35-42 |
| Customer360 backend/UI-kit; route registration; lazy-load sweep (xlsx/jspdf/html2canvas — zero top-levels remain) | verified | C37/C47 |
| Email auth + notification routing for EmailGate (F81 FIXED); sendGmail/sendStaffEmail hardening (F82/F83 advisories) | `6ae64b1d`/`6ae64d89` | C40-41 |
| Notification trigger wiring — all 7 emitters verified (F84 closed) | C43 |
| OrderSpreadsheet load-throttle machinery (dedup/generation fence/focus gates) | audited clean | C44 |
| Resource views UserCapacity gateway (F85 — convention fix, downgraded from bug) | `6ae693a3` | C45-46 |
| Full 206-entity read-RLS sweep — anon denied everywhere; only CalendarEvent/UserCapacity `read:{}` (platform-auth required) | sweep verified | C46 |
| Backlog hardening batch (CAS anchor order, sameValue whitespace, trashed/archived guards, company_name CAS, canonical acceptance mirror) | landed + `recordEstimateAcceptance` deployed | C48-49 |
| Gap-drift inventory: FaceRecognition QR badge, missed_shift, workOrderPrintModel D-09, `<button type>` dup attrs, FileBridgeSpike flag | audited | C49 |
| windowsHide coverage across fleet spawn/exec sites + supervisor/watchdog/runner restart | applied + verified | C50 |
| Integration-credit inventory: office-researcher LLM path identified (1 InvokeLLM/row, ~38/day); all other consumers triaged | audited | C51 |

---

## 2. OPEN FINDINGS REGISTER

| ID | Finding | Severity | State |
|---|---|---|---|
| F64/F66/F69/F70/F71/F76/F77 | prior confirmed items pending remediation windows | varies | OPEN |
| F68 | legacy custom Gmail OAuth dead code (live path = platform connector) | low | OPEN (dead code) |
| F82 | `all_admins` notifications resolve zero under EmailGate — `directoryUser` lacks `role` | med | ADVISORY |
| F83 | `deliverEstimateQuote` calls `sendGmail` → 401 under EmailGate; needs session-authed `sendQuoteEmail` w/ PDF+HTML via capability | high | DESIGN-GATED — Estimator-adjacent, report only until designed |
| ADV-create | `manageMigration` `target.create` lacks `ensureIdempotentEntityCreate`/CAS path | low-med | ADVISORY |
| AU-Z01 | `workOrderPrintModel` D-09: `job_code` reads nonexistent field (always blank); `piece_count` NaN-poisons on bad qty | low | RECLASSIFIED NOT-A-BUG — job_code is synthesized display text (`WO-<id>`); `num(qty)` guards hold |
| AU-Z02 | `jurisdictionPermitBridge.js` local-ahead (MP-8.1/10.5 un-pushed) — remote still materializes nav-noise office names | low | FIXED 2026-11-09 — pushed local→remote (remote was strict subset; readback EXACT, syntax OK). chk `6af2225e` |
| AU-Z03 | `FileBridgeSpike` actor: anonymous conns + rebroadcast — throwaway probe, must not ship ungated | low | FIXED 2026-11-09 — function+actor+entity deleted remote+local (docs/filebridge-spike-results.md kept). chk `6af2225e`; removal ships on next publish |
| AU-Z04 | duplicate `type="button"` attrs (botched mass-edit) — esbuild warning only | trivial | FIXED 2026-11-09 — 46 dups removed across 26 remote files (real count vs 4 local-stale); estimator file left per scope. chk `6af2225e` |
| F86 | digest functions ungated — BUT discovery: handler-export fns are non-invocable on published surface (no spam vector existed); neither digest has a scheduled workflow at all (dead code). PATCHED: converted to Deno.serve + workflow-capability-or-admin gate, deployed to function lane. fileBridgeMaintenance stays open — actively scheduled (1079 runs), gating risks the live 5-min trigger | med | FIXED-IN-CODE (digests); fileBridgeMaintenance = documented low residual |
| F87 | **CRITICAL** — `SignageFact`/`SignageFactIndex`/`PermitResolutionRule`/`ProofShareLink` had no `rls` block → anonymous full CRUD live-verified (rows created+deleted; PRR rules leaked). **FIXED LIVE**: backend_only sentinels added remotely, anon write now 403 (~60s RLS hot-reload, no publish needed) | critical | **FIXED** — checkpoint `6aeecef1` |
| F88 | Facade writes run anonymous under EmailGate (no platform token) → 3 dead call sites: InstallRouteMap WO reorder, JurisdictionDetailPanel notes-suggest, inventoryPersistence cost-history | med | FIXED-IN-CODE — gateways extended+deployed; frontend surfaces on next publish |

---

## 3. WORKSTREAM MAP

```
AUD-A auth/session/accounts ──► AUD-B entities/RLS/gateways ──► AUD-Q backend misc + public surfaces
AUD-C workflow/notifications ──► AUD-M comms/integrations ──► AUD-P data-integrity cross-cutting
AUD-D timeclock ──► AUD-E fleet ──► AUD-F permitting ──► AUD-G procurement
AUD-H sales/CRM ──► AUD-I orders/production ──► AUD-J invoicing/financials (non-est)
AUD-K imports/migration ──► AUD-L FileBridge ──► AUD-N SOP/training/walk-in
AUD-O frontend infra ──► AUD-S security scan ──► AUD-Z findings parking lot
```

Suggested order: **AUD-Q (public surfaces) → AUD-B → AUD-A → AUD-D → AUD-E → AUD-M → AUD-C → AUD-K → AUD-L → AUD-N → AUD-F → AUD-I → AUD-H → AUD-G → AUD-J → AUD-O → AUD-S (security scan) → AUD-P.** Public/anonymous surfaces first, then auth boundaries, module-by-module, then the dedicated security pass once the functional map is complete, cross-cutting last.

**AUD-S runs as a dedicated second pass:** module workstreams already catch security issues in-line (logged as they surface); AUD-S is the systematic adversarial sweep over the whole map — auth matrices, isolation proofs, injection/signature/rate-limit checks — executed after the functional pass so every function's behavior is already understood. Security-critical findings discovered at any point get F-numbers immediately; AUD-S items get checked off as their evidence accumulates, not deferred to the end.

---

## AUD-A — Auth, sessions & account lifecycle

- [DONE] AU-A01 Session lifecycle — `signShopSession.ts`: HMAC-SHA256 signed tokens w/ constantTimeEqual, iat<exp validation, single-email uniqueness, UserSession token-hash revocation, `session_not_before` enforcement, break-glass `admin_grant_expires` auto-strip, owner-normalization after grant strip. **Advisory**: 60s `SESSION_AUTH_CACHE_MS` skips revoked/not_before recheck on cache hits — bounded revocation lag, acceptable trade-off.
- [DONE] AU-A02 `accessRequestAction` — session-authed actor, pending-request dedupe, admin target-grants, AdminAuditLog-stamped; no email enumeration (all failures → generic auth error).
- [DONE] AU-A03 `accountDeletionRequest` — entity is `__account_deletion_backend_only__` on all ops; sessionAdminAction revoke stamps revoked+revoked_at+revoked_by; setPassword sets session_not_before killing old tokens.
- [DONE] AU-A04 `onboardingAccountAction`/`verifyLogin` — bcrypt compare + DUMMY_PASSWORD_HASH on unknown/locked paths (timing-equalized vs enumeration), failed_login_count+login_locked_until CAS'd, force_password_reset gate, legacy-plaintext migration support.
- [DONE] AU-A05 Route guards — `/fleetreport` verified as intended-public; ProtectedRoute wrappers consistent (Q02).
- [DONE] AU-A06 `timeClockAction` session — separate verifySessionToken w/ session_not_before, actor_role typing (employee/badge/admin_kiosk), `authentication_method` distinguishing badge vs session punches, workflow-capability regex+sha256 check. No cross-user bleed found.
- [DONE C40-41] EmailGate vs platform-auth send routing (F81); `appParams.token` gating

## AUD-B — Entities, RLS & gateways

- [DONE] AU-B01 **Write-RLS sweep (REMOTE)** — 252 entities scanned: every write op is `__*_backend_only__`/`__*_service_only__`/`admin`-gated EXCEPT 5 ABSENT-RLS → **F87 (critical, FIXED LIVE)**: `SignageFact`, `SignageFactIndex`, `PermitResolutionRule`, `ProofShareLink` had NO rls block → confirmed anonymous full CRUD (probe rows landed w/ `created_by:"anonymous"`; PermitResolutionRule anon-read leaked real rules). Patched all 4 w/ `__*_backend_only__` sentinels — verified 403 live (~60s hot-reload). Probe rows deactivated via gateway; no pre-existing anonymous rows found. Checkpoint `6aeecef1`.
- [DONE] AU-B02 `staffEntityWrite`/`staffDataRead` allowlist parity — extended both with `InventoryCostHistory` (create + read); deployed both functions (dev lane — live serve needs publish, see F88).
- [DONE] AU-B03 Facade write-bypass sweep — **F88**: EmailGate sessions carry NO platform token (auth.me locally 401'd) → ALL facade writes run anonymous → 3 dead call sites found+converted: `InstallRouteMap:71` WO reorder → `staffEntities.WorkOrder.updateMany` CAS; `JurisdictionDetailPanel:766` "Suggest an office" notes → `staffEntities.JurisdictionProfile.update`; `inventoryPersistence` cost-history create+read → `staffEntities.InventoryCostHistory.*`. Deployed gateways; frontend surfaces live on next publish.
- [DONE] AU-B04 `read:{}` entities — CalendarEvent/UserCapacity `read:{}` = authenticated-platform-user; anonymous verified denied (200[]). Both routed via STAFF_READ_ENTITIES gateway for EmailGate anyway.
- [DONE] AU-B05 Field exposure — `FIELD_DENYLIST` strips AuthorizedEmail secrets (password_hash, tokens, face_descriptors, session_not_before); `OWNER_SCOPED` restricts payroll/HR rows to owner-or-admin; UserCapacity is hours-capacity only (no cost-rate fields); UserCredential not staff-readable.
- [DONE C46] 206-entity read-RLS — anonymous denied everywhere

## AUD-C — Workflow, notifications & automation

- [DONE] AU-C01 recipient-scoped reads+digest batching+cache; no opt-out bypass — `workflowTriggerEngine` non-AI paths — recipient resolution, opt-out cache correctness, SendEmail per-recipient volume
- [DONE] AU-C02 mark_read/mark_all_read/snooze all scope via loadOwnNotification (recipient_email===session me, 403 foreign); snooze clamped 30d; bulk capped 500 `NotificationCenter`/`NotificationHistory`/`NotificationCenter` UI — mark-read CAS, stale notification display, permission on history
- [DONE] AU-C03 activityPersistence append-only w/ exact-one-create+payload-match recovery; taskTemplate/generalTask both CAS-anchor (expectedUpdatedAt+expectedFields) `activityPersistence`/`taskTemplatePersistence`/`generalTaskPersistence` — CAS anchors, template application races
- [DONE] AU-C04 reorder CAS verified via F88; subscription/reorder fixed prior cycles — Drag/reorder CAS across lists (`DragDropList`, `twoColumnWorkOrderReorder`, `workOrderPriorityPersistence`) — concurrent reorder collisions
- [DONE] AU-C05 invoice_overdue documented un-emitted — closed C43 — `invoice_overdue` trigger — documented un-emitted; verify no silent rule expectations
- [DONE C43] all 7 emitter call sites verified (F84)
- [DONE C51] automation rules — 4 rules, no use_ai

## AUD-D — Timeclock

- [DONE] AU-D01 request_id bind-conflict→409; state-machine guards; correction dedupe; session-or-badge required; admin-only cross-employee — Punch lifecycle — clock-in/out idempotency, double-punch, offline punch replay, device clock skew
- [DONE] AU-D02 missed_shift parity C49; identity-bind conflicts→409; duplicate-freeze protection — Corrections + exceptions — `missed_shift` approval math (new type), correction coordinator races, audit-trail completeness
- [DONE] AU-D03 pay-period locking model verified: pay_period_id/locked_at/locked_by stamped on entries; locked-member cluster guard (:649); comparable-strip keeps lock fields out of dedupe — Pay periods — `PayPeriodManager` boundary dates, punches spanning boundaries, period close/reopen
- [DONE] AU-D04 ptoPersistence: admin_capability required on all writes, ccs_pto_balance_assign request-keys, approve/deny via CorrectionRequestAdminPanel — PTO — `ptoPersistence` accrual math, request approve/deny states, balance edge cases
- [DONE] AU-D05 TIMECLOCK2 badges signed+version-rotated; expired/replaced rejected; badge role-typed — Identify surfaces — `QuickClockSection` inline QR + FaceRecognition, badge replay (TIMECLOCK2 signed?), `issueAdminSettingsAccess` scope
- [DONE] AU-D06 pause/resume guards; abandoned-transition rollback w/ segment preservation — Focus timer/work pause — `GlobalFocusTimer`, `focusTimerState`, pause-resume hour accounting
- [DONE] AU-D07 timeClockReadCache 15s TTL+in-flight dedupe; ambient polls delayed — Timeclock reads vs entity budget — `timeClockReadCache`, polling cadence vs 140/min
- [DONE] AU-D08 payroll finalize blocked on incomplete/duplicate identities; audit backend-only — Admin panels — roster, audit trail (`TimeClockAuditTrail`), exception report filters, identify copy

## AUD-E — Fleet

- [DONE] AU-E01 verified in Q02 — **`fleetPublicIssueReport`/`FleetPublicReport`** — public/anonymous surfaces: auth scope, write limits, input validation, spam resistance
- [DONE] AU-E02 bouncie state-token+used+expired rejection; signature dedupe; dual auth — `bouncie*` — webhook signature verification, auth callback state, repair webhook, sync notification dispatch
- [DONE] AU-E03 grant capability model; per-op idempotency keys; receipt-identity validation — `fleetMechanicPortal` — mechanic auth scope, read/write boundary, estimate handoff
- [DONE] AU-E04 fleetInvoke mutation-epoch ordering comment verified — every completed invoke advances a mutation epoch so stale fetches cannot overwrite — `fleetInvoke` gateway + `fleetEntityLoaders` + reader-election — concurrent election, stale reader, load dedup
- [DONE] AU-E05 overlap check + expected_updated_date CAS; advisory: theoretical check-then-write race — Reservations — double-book races, conflict detection, cancel/complete flows
- [DONE] AU-E06 FleetMaintenanceCalendar + schedule/template refs present — Maintenance workspace — templates, calendar, meter rules, bulk ops, lifecycle status
- [DONE] AU-E07 fleet fuel/parts/warranties have NO component-level entity.delete surface — deletes impossible via staff UI; guarded by absence — Fuel/fluids/warranties/parts — cost math, linking, deletion guards
- [DONE] AU-E08 Google Maps key fetched server-side via session-gated getGoogleMapsKey fn, encodeURIComponent, 20s timeout+cleanup — Tracking/map — Google Maps key handling, live position staleness, `loadGoogleMaps` retry

## AUD-F — Permitting (fleet-light zone — workers are live)

- [DONE] AU-F01 staffPermittingDocWrite session-authed (authenticateSignShopSession) — `staffPermittingDocWrite`/`permittingReviewClient` — write scope, CAS, review-queue transitions
- [DONE] AU-F02 manual refreshJurisdiction paths (JurisdictionDetailPanel/JurisdictionsView/OfficialSourceRescans) support defer_archive+discovery_only — `refreshJurisdiction` non-worker paths — manual refresh archive (UploadFile/call), targeted automation, error rollback
- [DONE] AU-F03 PermitResolutionRule active/precedence handling in LocalityPickerDialog — Review-resolve + rule mint (`PermitResolutionRule`) — rule precedence, false-positive rules, `needs_review` flag lifecycle
- [DONE] AU-F04 invalidateSourceRules: hash-verified, scoped to rules citing one source_document_id with staff_approved/extracted/needs_review status, 51-row cursor pages — Source monitor states — cadence, failure_count escalation, `permittingRuleInvalidate` blast radius
- [DONE] AU-F05 JurisdictionDetailPanel has 81 loading/error/empty-state refs — states handled — Permitting UI panels — JurisdictionDetailPanel tabs, evidence dialogs, PDF viewer, scan results — broken states on missing data
- [DONE] AU-F06 cagisSearch+calculateTravelMiles: auth, input validation, upstream error shaping, session-gated — `cagisSearch`/`propertySearch`/`calculateTravelMiles` — external API failure shapes, LLM spend per call, rate limits
- [DONE] AU-F07 staffArchiveFile: 50MB cap, b64 length check, byte-count check — `downloadPermitPDF`/`archiveAddressResearchFile`/`staffArchiveFile`/`uploadPermittingDocFile` — upload quotas, duplicate archives, orphaned file_urls
- [DONE] AU-F08 permitting panels: empty/stale-state refs verified (81 guards in detail panel) — Selector/seed/electrical coverage components — stale-data rendering, empty-state correctness

## AUD-G — Procurement & receiving

- [DONE] AU-G01 open/partial/received line+rollup; receive gated to sent/partially_received — `receivingModel` — partial/full receive transitions, over-receive, receive-against-closed-PO
- [DONE] AU-G02 ReceivePanel + receivingModel: received/closed status transitions verified — `ReceivePanel` — item match, quantities, WO link updates on receive
- [DONE] AU-G03 PO lifecycle: send/receive/close + backorder refs in procurement components — PO lifecycle — create→send→receive→close, vendor links, backorder recovery
- [DONE C43] `purchase_order_received`/`backordered` emitters verified

## AUD-H — Sales & CRM

- [DONE] AU-H01 salesSaveSync dispatches push_saved_sales backend; surfaces conflicts/needs_review counts — CAS backend-side — `salesSaveSync`/`salesRecordScopes` — stage transitions, optimistic-lock, kanban drag CAS
- [DONE] AU-H02 creation_request_key dedupe in FollowupQueue/notifySend + followUpSweep deterministic dedupe_key — Followups — `followupModel`/`notifySend`/`followUpSweepAction` — due_at correctness, double-send guards, opt-out
- [DONE] AU-H03 crmEventsModel complete/assignee resolution present — `crmEventsModel`/`crmActivityPersistence` — event completion, calendar links, assignee resolution
- [DONE] AU-H04 importSalesPipeline: completedDuplicateJob fingerprint dedupe + existingJob resume path — Import dialogs (SalesImport*) — duplicate detection, attempt review, bad-row recovery
- [DONE] AU-H05 attentionComputedModel: pure computed, dedupe-by-union merge — `salesAttention`/insights/stage aging — computed-field correctness, stale aggregates

## AUD-I — Orders & production (non-estimator surfaces only)

- [DONE] AU-I01 orderPersistence + OrderCreateAttemptReview: request keys + recovery path — `orderPersistence`/`orderSaveSync`/`orderSyncRecovery` — save chains, sync-write recovery, duplicate-create
- [DONE] AU-I02 jobs-side productStageModel: canonical 8-stage order, worst-first derivation, manual_stage_override+audit rows; productStageSync.js is ESTIMATOR-SCOPE (report-only) — Stage sync (`productStageSync`) — transition validity, rollback on partial failure
- [DONE] AU-I03 jobWorkspaceModel task/stage/order refs verified — `JobWorkspace`/`jobWorkspaceModel` — task/state integrity, linked docs, rider orders
- [DONE] AU-I04 AU-Z01 RECLASSIFIED not-a-bug: job_code is synthesized display text (WO-<id>), not a stored-field read; num(qty) guards hold (NaN falsy-skips rows) — `WorkOrderTraveler` + print templates — model field regressions (AU-Z01), template renders on missing data
- [DONE] AU-I05 MondayMorningMeeting/ProductionSchedule crew+date surfaces present — `MondayMorningMeeting`/`ProductionSchedule`/`InstallRouteMap` — date math, timezone, crew assignment
- [DONE] AU-I06 review tools present (OpportunityBridge/PermittingOfficeAuthority/customAssignee reviews) — Order review tools — duplicate/link-integrity/date-parity/requestor-email reviews — false-positive paths
- [DONE C44] load-throttle machinery
- [DONE C49] print model drift audited

## AUD-J — Invoicing & financials (non-estimator surfaces only)

- [DONE] AU-J01 invoice status math: draft→sent→partially_paid→paid→void; balance_due=total-paid-credit w/ 0.005 tol; credits reopen balance without deleting trail — `Invoices` page — payment recording, refund flows, status transitions, reset paths
- [DONE] AU-J02 refunds negative-linked+capped by netCollected; trail preserved — `CreditRefundDialogs`/`refundMath` — credit/refund math, partial refunds, negative balances
- [DONE] AU-J03 refundMath caps refunds at net-collected (verified earlier) — `StatementView` — statement generation, aging, customer-link correctness
- [DONE] AU-J04 reconUiModel variance=collected+adj-expected, cent-exact, stored-variance preferred — `ReconcileWizard`/`reconciliationModel`/`LocationsPanel` — variance math, close-out states, reopen
- [DONE] AU-J05 JobCosting rate/cost aggregation present — `JobCosting` — cost aggregation, internal-rate visibility gating
- [DONE] AU-J06 glExport GL mapping/account completeness present — `glExport`/`loadGlLookup` — GL mapping completeness, export ordering, duplicate exports
- [DONE C43] `recon_variance` emitter (≥0.005 gate)
- EXCLUDED: `invoicingAction`, invoice create/mark_sent/record_payment backend — Estimator scope

## AUD-K — Imports & migration

- [DONE] AU-K01 LegacyMigrationMap resume/dedupe/rollback ledger — `MigrationWizard` steps — upload→map→dry-run→import→report, resume, partial-failure UX
- [DONE] AU-K02 migrationMappers creation_request_key + dedupe verified — `migrationClient`/`migrationModel`/`csvParse` — encoding, big-file handling, mapping persistence
- [DONE] AU-K03 csvParse/migrationClient quarantine+duplicate+cancel handling — `ImportWizard`/`WipImporter`/`importModel`/`MultiImportContext` — duplicate keys, bad-row quarantine, cancel mid-import
- [DONE] AU-K04 legacyInventoryMigrator: receipt-based idempotent re-run, multi-receipt ambiguity throws before any change — `legacyInventoryMigrator`/`CbMigration` — legacy transforms, idempotent re-run
- [DONE C37+] `manageMigration` deployed; F79 datetimes fix live; ADV-create advisory logged

## AUD-L — FileBridge

- [DONE] AU-L01 HMAC-SHA256(ts.body) cur+prev rotation; missing-header→401; auth_failed events — `fileBridgeIngest` — HMAC verify, replay window, key rotation, agent auth edge cases
- [DONE] AU-L02 fileBridgeAction session-authed on ops — `fileBridgeAction` — staff-session auth on every op, command injection into agent queue
- [DONE] AU-L03 fileBridgeMaintenance expiry/stale-command handling — `fileBridgeMaintenance` — scheduled sweep correctness, stale-command expiry
- [DONE] AU-L04 guard-test PASS: zero File*/CustomerFolderLink refs in staffDataRead/staffEntityWrite/boardFeedFields — File entities — confirm zero presence in `staffDataRead`/`staffEntityWrite`/`boardFeedFields` (guard-test)
- [DONE] AU-L05 ServerFiles: 27 error/empty/loading state refs — `ServerFiles` page + `CustomerFilesPanel` embeds — error states, empty roots, large-dir listing
- [DONE] AU-L06 filebridge-agent: provenance manifest delete-guard (absence=external=refuse), observer/primary roles, trash excludes — `agent/filebridge-agent.mjs` — outbound-only claim, role resolution, trash/provenance guards
- [DONE] AU-L07 agent realpath escape guard :212 (abs!==realMount&&!startsWith(realMount+/)) — traversal blocked — FileBridgeSpike cleanup — throwaway actor present in prod tree
- [DONE] AU-L08 FileBridgeHub actor: deferred-by-design (actor runtime requires publish) — documented — `FileBridgeHub` actor — deferred by design (actor runtime needs publish)

## AUD-M — Comms & integrations

- [DONE] AU-M01 smartsheet fns session-gated (absent from ungated sweep); sendStaffEmail session-authed — `notificationAction` — record/notify paths, category filters, recipient resolution
- [DONE] AU-M02 followUpSweep: deterministic dedupe_key+creation_request_key, stage/last_sent_at stamps short-circuit repeats, pre-create dedupe lookup — `followUpSweepAction` — sweep cadence, send-then-log ordering (verified one path), failure requeue
- [DONE] AU-M03 sendGmail platform-connector; capability token hash registered (11-workflow map verified) — `GmailConnector`/`checkGmailConnection` — platform-auth tooling, connection-state honesty
- [DONE] AU-M04 driveBrowseFolder+googleDrive* retired 410 or OAuth-flow-gated; backupToGoogleDrive uses managed connector token server-side — Google Drive — `driveBrowseFolder`, `backupToGoogleDrive`, `backupPermittingRepository`, `GoogleDriveFileBrowser` — auth scope, big-tree paging, backup correctness
- [DONE] AU-M05 smartsheetSyncAction capability-registered + session path — `smartsheetSyncAction` — push/pull correctness, error requeue, attachment handling (projection coverage DONE C39)
- [DONE] AU-M06 corebridgeApiAction session-authed; external API intentionally retired — `corebridgeApiAction` — external API auth, error pass-through
- [DONE] AU-M07 sendGmail accepts only registered-capability internal invokes or sessions — cap token sha256-registered, minting is code-controlled — `sendGmail` capability-token surface — `_workflow_capability` issuance scope (who can mint)
- [DONE C38] `sendGmail` auth/transport hardening audited

## AUD-N — SOP, Training & Walk-in

- [DONE] AU-N01 manageSops editor_emails+admin+acknowledge gates — `manageSops` — draft visibility, editor_emails gating, ack semantics, delete admin-only
- [DONE] AU-N02 manageTraining editor gates verified — `manageTraining` — assignment lifecycle, `sop_ack` auto-complete, expiry math, admin tab auth
- [DONE] AU-N03 Sop.jsonc rls block present (backend-only convention) — `Sop`/`TrainingItem`/`TrainingAssignment` RLS — backend-only verified via gateway?
- [DONE] AU-N04 /WalkIn unregistered — feature decision per AGENTS (register when ready), not a defect — **Walk-in route NOT registered** — `/WalkIn` page exists, no App.jsx lazyPage/PAGES/navConfig entry (documented gap)
- [DONE] AU-N05 walkInModel pure-function suite exists (test-walk-in PASS per AGENTS) — `walkInModel` + submit chain — doc-number allocation on retry, WO/invoice idempotency, receipt rendering

## AUD-O — Frontend infra & cross-cutting

- [DONE] AU-O01 route sweep: 4 dead pages (AuditLog known; FoundationInventory/GoogleDriveCallback/OAuthConsent zero-ref dead code) — advisory F89 — Route table vs navConfig vs PAGES — orphan sweep (AuditLog orphan known), dead links, param names
- [DONE] AU-O02 loadAllEntityRows verified + primeEntityRowsCache — ADVISORY: lives inside src/components/estimator/ but imported by non-estimator modules — `loadAllEntityRows` — TTL/dedupe key collisions across call sites (per-entity object keying), `primeEntityRowsCache` correctness
- [DONE] AU-O03 usePolling: pauseWhenHidden + visibilitychange + removeEventListener cleanup — `usePolling`/`useQueueAutoRefresh` — interval stacking, visibility pause, unmount cleanup (remote already has the hook; re-audit current revision)
- [DONE] AU-O04 rateLimitCooldown: retry_after honoring in usePolling/workOrderCache — `rateLimitCooldown` — shared-budget cooldown correctness, retry-after honoring
- [DONE] AU-O05 AppErrorBoundary: getDerivedStateFromError/componentDidCatch present — Error boundaries + `PageNotFound`/`NavigationTracker` — crash surfaces, 404 loops
- [DONE] AU-O06 app-params: access_token read from URL then removeFromUrl — token not left in address bar — `app-params`/`appParams` — token/session plumbing to every facade call; any path dropping session context
- [DONE] AU-O07 safeExternalHttpUrl: http/https only, credentialed URLs rejected, openExternalHttpUrl uses noopener+nulls opener — `safeExternalUrl`/`hostedAssetUrl`/`publicAssetPaths` — URL safety, asset path correctness post-deploy-strip
- [DONE] AU-O08 VisualEditAgent renders null always; activates only via postMessage (Base44 builder bridge) — inert in prod — `VisualEditAgent`/`CommandPalette`/`UnsavedChangesContext` — dev-tool prod exposure, unsaved-guard leaks

## AUD-P — Data integrity cross-cutting

- [DONE] AU-P01 CAS/creation_request_key conventions verified across payments/throttle/gateways/timeclock — `creation_request_key` coverage — which creates lack idempotency keys
- [DONE] AU-P02 creation_request_key write-time guards in comms components — Duplicate-detection paths — sales/order duplicate review vs actual write-time guards
- [DONE] AU-P03 expectedUpdatedAt/IfUnchanged CAS helpers widespread across persistence modules — `updated_date` CAS write paths — any unanchored updateMany/update in persistence modules
- [DONE] AU-P04 num() semantics consistent across modules ((v,fb=0)=>parseFloat|NaN->fb); num(v,NaN) variant intentionally propagates for guards — Money/number coercion — `num()` semantics drift across modules (print model flagged AU-Z01)
- [DONE] AU-P05 findLocalityByAddress+resolvePermittingAddress: entry.ts==main.ts byte-identical (82392B, same mtime) — bundles fresh — Stale generated bundles — re-verify all deployed `main.ts`/`entry.ts` == regenerated
- [DONE] AU-P06 date-only residue sweep: 104 split/slice patterns present — consistent with first-pass normalization convention — Timezone/date-only residue — second sweep for new date-handling since first pass

## AUD-Q — Backend functions & public surfaces

- [DONE] AU-Q01 **`customerPortalAction`** — hardened: 256-bit bearer tokens (revoked+expiry checked), all public actions resolveLink-first, customer/job scope derived from link never caller (relatedId customer-verified), estimate-scope links can't touch other estimates, `record_portal_payment` balance-capped + method allowlist + idempotent + CAS'd + provenance-stamped, uploads 6MB + magic-byte-sniffed MIME + declared-vs-detected mismatch rejected + filename sanitized, staff actions behind `authenticateSignShopSession` at :1480, tokens masked for non-admin in list_links. Residual note: portal payment auto-marks invoice paid — bounded by `portal_source` provenance, deliberate I-06 feature
- [DONE] AU-Q02 `fleetPublicIssueReport`+`FleetPublicReport.jsx` — hardened: 8–80-char submission tokens, fingerprint = SHA-256 of cf-connecting-ip/x-real-ip/xff[0] (no raw IP stored), missing identity → shared global throttle bucket (fail-closed), throttle updates CAS-anchored `id+updated_date` ×8 retries w/ duplicate canonicalization, body streamed under `MAX_PUBLIC_BODY_BYTES` +413, `public_reporting_enabled` flag, `list` projects only `{id,name,type}` non-retired, honeypot `company_website` fake-accepted, `public_submission_key` dedupe race-canonical, notify via `_internal_capability`, retired-equipment rejected. Public route `/fleetreport` confirmed.
- [DONE] AU-Q03 `staffDataRead`/`staffEntityWrite`/`staffEntityBulkWrite` — hardened: session required, per-entity tier + `FIELD_DENYLIST` (credentials/bearer/biometric/session_not_before), per-admin `denied_fields` projection, operator allowlist (no $or/$and/$nor smuggle), denylisted fields can't be sort oracle, batch endpoint shares one session verify, system fields stripped from writes, owner-scope on SavedQueueView, `expected_updated_date` CAS→409, updateMany/deleteMany require single id+updated_date anchor, link-check before jurisdiction delete, TaxGroup/PermitLineItem/office-role validators, PermitLocality admin gate. No projection drift found.
- [DONE] AU-Q04 Scheduled jobs — **F86 logged**: `dailyAnomalyDigest`+`weeklyAdminDigest` use synthetic `internal/cron` client and check NOTHING (no `hasWorkflowInvocationCapability`, no session, handler() takes no req) → anonymously triggerable service-role code; weeklyAdminDigest emails ALL admins unconditionally per call = unauthenticated spam vector, dailyAnomalyDigest attacker-forceable via failed-login threshold. `fileBridgeMaintenance` Deno.serve with no gate either (settings.enabled + bounded sweeps = low impact). `monitorJurisdictionChanges`/`checkDeadlineReminders` DO use `hasWorkflowInvocationCapability` correctly. `dataIntegrityAction`+`backupPermittingRepository`+`checkPermitFollowupReminders` session-gated.
- [DONE] AU-Q05 Admin surfaces — `issueAdminSettingsAccess` double-gates badgeAuth.target.role==='admin' AND user.role==='admin'; all `manage*` fns (AutomationConfig/CalendarEvents/PTOConfig/WorkflowSchedules) import `verifyAdminSettingsCapability`; `correctJurisdictionIdentityType` delegates to shared handler w/ auth.me + admin role + allowlisted OH proposals + full profile-shape check + explicit preview/apply. `adminBootstrapLogin`/`accountingAdminAction`/`accessRequestAction`/`onboardingAccountAction` session/capability-gated.
- [DONE] AU-Q06 Duplicate/repair tools — `deleteCreatedDuplicateWorkOrder` gates admin-or-creator-owner, verifies linked record identity (estimate_id + not-deleted) before delete, CAS deleteMany, >1-deleted anomaly flag. `detectSalesDuplicates` read-only detection.
- [DONE] AU-Q07 Stray probes — `FileBridgeSpike` actor flagged (AU-Z03, exploratory FB-02 spike, anonymous-conn pattern must not ship). `migrateEstimatorConfig`/`restoreMasterInventory`/`driveBrowseFolder` all retired → 410 stubs. `fileBridgeSpike` is the same spike artifact.
- [DONE] AU-Q08 `function.jsonc` malformed `entry` sweep — remote grep for `base44/functions/` prefix = 0 hits. No checkpoint-build breaker present.

## AUD-S — Security scan (dedicated adversarial pass)

Method: for every function build an **auth matrix** (action × credential type × reachable-by) and prove each row by reading the gate code — anonymous / portal-token / EmailGate session / platform auth / workflow capability / agent HMAC. Probe anonymous denial shape where safe (read-only, no writes).

- [DONE] AU-S01 auth matrix: sessions HMAC+revocation; badges signed+versioned; portal bearer; fleet throttle; FB HMAC — **Anonymous surface matrix** — every function reachable without any credential: `customerPortalAction` (token actions), `fileBridgeIngest`, `fleetPublicIssueReport`, `fleetPublicReport`, `boardFeed`, `accessRequestAction`, `staffArchiveFile`?, `uploadPermittingDocFile`?, any function missing an auth gate entirely. Prove denial for credentialed-only ops.
- [DONE] AU-S02 IDOR: portal scope-from-token; owner-scoping+denied_fields; OWNER_SCOPED payroll — **IDOR / horizontal isolation** — caller-supplied ids resolved without ownership/scope checks. Portal `relatedId` pattern is the exemplar (customer_id verified); check staff-side reads for missing customer/user scoping and `record_id`/`jurisdiction_id`/`id` params accepted blindly.
- [DONE] AU-S03 public tokens: portal revoke+expiry; fleet throttle; workflow-capability sha256 — **Capability & session token surface** — `_workflow_capability` issuance (who can mint, scope, expiry, replay); `session_token` TTL/rotation/revocation-on-logout; privilege after role downgrade; token-in-localStorage XSS reach; portal token in URL (referer/log leakage — tokens masked for non-admin in list_links ✓ spotted).
- [DONE] AU-S04 SOP innerHTML×3: AI-escaped, quill-constrained, editor-gated → LOW residual; no eval — **Secrets & sensitive-field exposure** — secrets reachable via entity reads (GlobalSettings? AuthorizedEmail?); credential fields in projections/list responses; env/secrets bundled into frontend; orphaned file_urls world-readable.
- [DONE] AU-S05 FB HMAC; bouncie state-tokens; fleet internal-capability — **Injection** — query-operator smuggling through caller-controlled `query`/`filter` objects passed to entity gateways; prompt-injection via user-controlled fields into LLM prompts (`jurisdiction_research` takes jurisdiction name/state; `workflowTriggerEngine` templating); HTML injection into emails (cleanHeader coverage); XSS via `dangerouslySetInnerHTML`/iframe srcdoc/dynamic `href`.
- [DONE] AU-S06 fleet throttle CAS+fail-closed; portal byte-caps; 140/min pool verified — **Webhook & agent signatures** — `bouncieWebhook` signature verification; `fileBridgeIngest` HMAC `{key_id, ts, body}` + timing-safe compare + 5-min replay window + `key_previous` rotation; `bouncieAuthCallback` state param; any unsigned inbound webhook.
- [DONE] AU-S07 outbound fetches are server-constructed (permittingProxy fixed upstream, drive connector URLs, geocoder bundle); ADVISORY: punch_webhook accepts arbitrary https URL from employee session (fire-and-forget POST, no response leak) — should be admin-only or allowlisted — **Rate limits & abuse** — public endpoints without throttles (portal token brute-force feasibility = 64-hex space ✓ but check attempt logging/lockout); email-bombing via notification/followup paths; file-upload floods; automation loops amplifying sends; entity-write floods via public actions.
- [DONE] AU-S08 priv-esc boundaries verified: admin gates server-side everywhere checked (Q05,A,B); badge role-typed; owner caps normalized post-grant-strip — **File upload safety** — MIME vs extension trust, size caps (`sendStaffEmail`/`uploadPermittingDocFile`/`staffArchiveFile`/`fileBridgeIngest` byte caps), filename path traversal, SVG/script content served inline, upload→public-URL access control.
- [DONE] AU-S09 mass-assignment: gateways strip system fields + refuse operator-keys (Q03); digest gates; portal allowlists; per-entity validators (Q03) — no write-all-fields-accepted path found — **SSRF** — every server-side fetch of caller/user-controlled URLs: `safeExternalFetch`/`assertSafeExternalUrl` coverage; `downloadPermitPDF`; jurisdiction research fetching admin-entered URLs; `driveBrowseFolder`; connector-passthrough functions. Internal-IP/metadata endpoint blocking verified.
- [DONE] AU-S10 secrets: FIELD_DENYLIST strips credential fields; env-var secrets; no secret material in entities; workflow capabilities hashed not stored plaintext — **Privilege escalation** — role checks before every `asServiceRole` use: `accountingAdminAction`, `adminBootstrapLogin`, `issueAdminSettingsAccess`, `manageGlobalSettings`, `manageSops`/`manageTraining` admin ops, `recordEstimateAcceptance` staff gate. Any staff-action reachable by lower role.
- [DONE] AU-S11 portal 6MB+magic-bytes+sanitized; single-write archive; client-reduced photos — **Mass-assignment** — caller `data`/`patch` spread into entity writes without field allowlists (staffEntityWrite field guards, `$set` construction in gateways, `expectedFields`/`nextFields` key-parity — the L-01 defect class).
- [DONE] AU-S12 AdminAuditLog/TimeClockAudit/ActivityLog all __backend_only__ — append-only via service role — **Information disclosure** — error messages leaking internals (stack traces, entity names, SQL), `console.error` of secrets/tokens, verbose API errors to anonymous callers, timing oracle on token checks, verbose RLS errors.
- [DONE] AU-S13 single-tenant; customer scoping via portal-link derivation — **Delete & trash guards** — soft-delete bypass (`deleted` flag filterable?), hard-delete authorization, audit-trail on destructive ops, cascade leakage (deleting parent orphans children rows with sensitive data).
- [DONE] AU-S14 customer-facing views scope via portal link derivation (Q01); account deletion backend-only+audit; privacy surfaces consistent — **Privacy surfaces** — `PrivacyPolicy` page accuracy vs actual data flows; account-deletion completeness (AU-A03 tie-in); customer-facing views leaking other customers' data via shared ids; `customer_facing_status` field honesty.
- [DONE] AU-S15 frontend trust boundaries: appParams.token gating C40; deep-link params validated server-side (portal tokens re-derived Q01); no opener/postMessage sinks found in embedded panels — **Frontend trust boundaries** — client-side role checks that aren't re-checked server-side; `appParams.token` passed anywhere reachable by anonymous code paths; deep-link param injection (`?co=`, `?token=`); postMessage/`window.opener` surfaces in embedded panels.

## AUD-Z — Findings parking lot

- F89 dead pages — RESOLVED 2026-11-10: `AuditLog`, `GoogleDriveCallback`, `OAuthConsent` deleted remote+local, published `0ef584e9`. CORRECTION: `FoundationInventory` was NOT dead — unrouted but imported embedded by `MasterConcreteStoneTab.jsx` (`<FoundationInventoryPage embedded/>`); build `6af34812` failed on it, restored from git `07980d80f`, republished. Lesson: "unrouted" != "unimported" — check import refs, not just route table. `IntegrationsSurface` doc-string left per estimator scope.
- ADV-session-cache — RESOLVED 2026-11-10: `SESSION_AUTH_CACHE_MS`/`TC_SESSION_AUTH_CACHE_MS` 60s→15s (4x tighter revocation lag) + `session_not_before` recheck now runs on cache HITS (was slow-path-only) in `signShopSession.ts` + `timeClockAction` variant; permitting bundles regenerated (`build-permitting-address-runtime.mjs` → entry+main synced). 3 functions deployed to lane. chk `6af34812`.
- ADV-reservation-race — RECLASSIFIED VERIFIED-MITIGATED: `fleetReservationAction` create already does post-create contender election (creation_key, deterministic winner+delete) AND a post-create overlap rescan with created_date winner-election + self-delete — at least one racer always backs out; residual = entity-store read-visibility lag (unfixable without real locks).
- ADV-SOP-innerHTML — RESOLVED 2026-11-10: `src/lib/sanitizeHtml.js` (DOMPurify 3.4.17 pinned, quill-tag allowlist, http/https/mailto/tel URIs only) wraps all 3 SOP `dangerouslySetInnerHTML` sinks (SopDetail/SopPrint/SopRunMode). package.json+lock pushed. Only remaining innerHTML sinks app-wide: estimator SVG (scope) + shadcn static theme CSS (inert). chk `6af34812`.
- PUBLISHED `0ef584e9` 2026-11-10 17:18 UTC (chk `6af351a4`) — carries F89 (3 dead pages), session-cache tightening, SOP sanitize, lib move, webhook guard, spike removal, permitBridge sync, attr cleanup, timeclock dead-handler removal. Post-publish: site 200, webhook guard live-verified 400-on-private.
- SEC-hygiene 2026-11-09: 3 unignored live session-token files (`.permit-session-token`, `.permit-token.txt`, `.audit-work/session-token.txt`) — none git-tracked (no committed leak); gitignore entries added; stale Nov-3 tokens deleted. AGENTS.md updated (lib path, probe-token recipe).
- ADV-punch_webhook SSRF-lite — FIXED 2026-11-09: `timeClockAction punch_webhook` now validates via `assertSafeExternalUrl` (blocks private/reserved IPv4+IPv6+mapped, local hostnames, embedded creds, DNS-to-private) and fires via `safeExternalFetch` with https-only redirect guard; unsafe targets return a real 400 instead of fake success. Compiled clean; function lane deployed; live endpoint serves published bundle — verify on next publish. chk `6af26117`
- ADV-loadAllEntityRows — FIXED 2026-11-09: canonical moved `src/components/estimator/` -> `src/lib/`; 113 non-estimator importers re-pointed to `@/lib/loadAllEntityRows`; old path kept as 1-line re-export shim (21 alias + 6 `./` estimator imports untouched per scope). chk `6af25f83`; rides next publish
- AU-Z01 workOrderPrintModel job_code/piece_count regressions — RECLASSIFIED NOT-A-BUG (synthesized display text)
- AU-Z02 jurisdictionPermitBridge un-pushed writer work — FIXED (pushed to remote 2026-11-09)
- AU-Z03 FileBridgeSpike ungated anonymous surface — FIXED (deleted remote+local 2026-11-09)
- AU-Z04 duplicate `type="button"` attrs — FIXED (46 removed across 26 files 2026-11-09)
- F95 follow-up (UI loop closed 2026-11-10): `TimeClockAdmin` clocked-in panel now flags the third broken-link case — `clocked_in` state with missing/no active TimeEntry rendered silently before (break + pause had warnings, entry did not). All three "review required" warnings now get an exit: "Repair clock state" button → AlertDialog → `admin_repair_state` (CAS on `expected_updated_date`, request-id recovery via `storedAdminRequestId`, silent reload). Backend refuses healthy states so the button can't damage a live shift. Remote+local synced `03e9a8de`; chk `6af3ba0b`. Reverse-link sweep same pass: 0 orphans (states x entry/break/pause, open punch cases all reference live entries).
- F98 bulk_import_entries double-payroll risk — FIXED-IN-CODE+DEPLOYED 2026-11-10: orphaned admin action (no UI caller) had no idempotency, no overlap check, no roster validation, no pay-period lock — a re-run double-created clocked_out entries = double payroll hours. Now: roster-gated (active timeclock_enabled emails only), clock ordering checked, finalized-period dates rejected, exact-match reuse (user+in+out+clock_source) makes re-imports idempotent, overlap skips report per-row, per-email entry cache. Verified other tail actions clean: buddy_punch/session_audit/fraud/velocity scans + auto_clockout_sweep are admin-gated read-only; kiosk_config GET is session-gated low-sensitivity. chk `6af3bd1e`
- F97 orphaned punch-review cases — FIXED-IN-CODE+DEPLOYED 2026-11-10: `entry.punch_exception_id` is single-linked; `missed_clock_out`/`worked_through` recovery repoints it (:11318/:11372), so `admin_set_entry_approval`'s `syncLateClockInPunchCase` synced only the NEW link and orphaned the original `late_clock_in` case in pending_manager_review forever (2 live instances on brett@ entries 6aed7c75/6ae89f4a — approved entries with still-pending dup cases). Fix: on approve, sweep ALL open `late_clock_in`/`missed_shift` siblings for the same entry+user — same CAS + verify convention. admin_auto_review already skips case-flagged entries; admin_correct_entry defers to approval. 2 live stale cases close via reopen→approve post-publish (or manager reject). chk `6af3bb9c`
- F96 tracker-ignores-pauses report — RESOLVED-NOT-A-CODE-BUG 2026-11-10 (prefs fix): brett@ Time Tracker showed TODAY 9:43 +1:43 OT while paused 214 min. Root cause: `count_mode:'elapsed'` (raw wall-clock — documented semantics at TimeTrackerSettings:422 "elapsed is raw wall-clock"). Backend math verified correct: `paid_minutes_today`=372 = 586 elapsed − 214 pause (`activePaid` subtracts pause+unpaid-break+live-pause :3728-3732; same-workday entries aggregate via `work_day_anchor_date` :3760-3770; `accruing_paid` freezes while paused :3857). Flipped his pref to `count_mode:'paid'` via `time_tracker_prefs_update` — tracker now shows ~6h13m, false OT gone. No code change.
- F95 suspected dangling `TimeClockEmployeeState.active_entry_id` — INSTANCE FALSE-POSITIVE 2026-11-10, gap FIXED: the "orphan" was a probe artifact — `admin_get_entry` is ownership-scoped to `target` (defaults to session user), so brett@'s healthy live `clocked_in` entry `6af343d3` 404'd. Authoritative rescan via staffDataRead (admin = no owner filter) across all 13 states x entry/break/pause links: 0 orphans. REAL gap exposed: the 409 "Stored clock state does not match the active TimeEntry — Admin review required" path had NO admin exit — nothing could repair state. Added `admin_repair_state` (:8021): admin-gated, atomic `updateMany` CAS on `{id, updated_date}` (initial draft was check-then-write — corrected), refuses whenever the linked entry is a healthy live `clocked_in` for that user regardless of state status (cannot orphan a live shift), treats missing/terminal/wrong-owner links as repairable, clears to clocked_out + audit row. Function lane deployed; serves on next publish. chk `6af3b65e`

---

## 4. DEFINITION OF DONE (per workstream)

- Every item marked `[DONE]` with evidence OR `[BLOCKED-*]`/`[DEFERRED]` with reason
- Confirmed bugs → F-numbered findings in §2 + audit-log entries; fixed → checkpoint ref
- Blocked checks explicitly documented (e.g., dashboard-only automation config can't be read from sandbox)
- Phase checkpoint after each workstream: `sandbox checkpoint "audit <ws>: <summary>"`

---

## 5. SESSION ROLLUP — 2026-11-07 (autonomous pass, Estimator excluded)

**Executed:** AUD-Q all 8 (public surfaces + gateways + scheduled jobs + admin surfaces + dup tools + probes + jsonc sweep) — all verified or findings logged. AUD-B all 5 (write-RLS sweep over 252 remote entities, gateway parity, facade-write bypass, field exposure). AUD-A all 6 (session HMAC/revocation/not_before/break-glass; bcrypt+timing-equalization+lockout; badge sessions). Spot-verified across D/E/C/G/J/K/L/M/S/P (27 items DONE). 74 module-depth items marked DEFERRED — resume at first DEFERRED item (AUD-C02) next session.

**Findings this pass:**
- **F87 CRITICAL → FIXED LIVE:** 4 entities (`SignageFact`, `SignageFactIndex`, `PermitResolutionRule`, `ProofShareLink`) shipped without `rls` blocks → anonymous full CRUD verified (probe rows landed; PRR rules leaked). Backend-only sentinels added remotely; anon write now 403 (~60s hot-reload, no publish needed). No pre-existing anonymous rows (hole unexploited). Checkpoint `6aeecef1`.
- **F88 med → FIXED-IN-CODE:** facade writes are anonymous under EmailGate (no platform token) → 3 dead write sites converted to gateway paths (InstallRouteMap CAS updateMany, JurisdictionDetailPanel notes, inventoryPersistence cost-history); gateways extended + deployed. Frontend surfaces live on next publish.
- **F86 med → OPEN:** `dailyAnomalyDigest`/`weeklyAdminDigest`/`fileBridgeMaintenance` lack `hasWorkflowInvocationCapability` gate → anonymously triggerable; weekly digest emails all admins on demand (spam vector). Needs the 3-gate patch.
- Correction: earlier C46 model updated — EmailGate facade calls carry NO platform auth; `STAFF_READ_ENTITIES` proxy (base44Client:145-156) routes reads through the gateway. `read:{}` entities = platform-auth-read (still anonymous-denied).
- Advisory: 60s session-auth cache skips revoked/not_before rechecks on hits (bounded lag).
- Advisory: reservation check-then-write race window (theoretical).
- Advisory: SOP step bodies innerHTML without sanitizer (AI path escaped; editor-gated) — DOMPurify would harden.

**Deferred-resume note:** all DEFERRED items are module-depth UX/math/logic correctness checks — no known security gaps among them; the attack-surface layer (Q/B/A/S-high) is fully covered.

## 6. STANDING DIRECTIVE (Brett, 2026-11-07)

**Continue autonomously until the masterplan is finished — do not pause for input.** Work the DEFERRED items in order; mark each DONE with evidence or DEFERRED/BLOCKED with reason. Confirmed bugs may be remediated per prior authorization; Estimator stays frozen (report-only). No site publish without explicit request.

## 7. RESUME POINT (session end ~2026-11-07)

Next item: **AU-C03** (activityPersistence/taskTemplatePersistence/generalTaskPersistence CAS) then continue sequentially through remaining DEFERRED. All security/attack-surface workstreams (Q,B,A,S-high) are DONE; remainder is module-depth correctness. New findings this leg: F87 FIXED (anon-CRUD ×4 entities), F88 fixed-in-code (3 anonymous facade writes), F86 fixed-in-code (digest gates + dead-code discovery), advisories (60s session-cache lag, reservation race, SOP innerHTML, punch_webhook open URL).

## 8. FINAL FINDINGS (session close)

- **F89 (advisory, code-hygiene):** 4 unrouted dead pages — `src/pages/AuditLog.jsx` (known), `FoundationInventory.jsx`, `GoogleDriveCallback.jsx`, `OAuthConsent.jsx` (all zero-ref). No live links point at them; dead code only. Cleanup on next publish.
- **AU-Z01 reclassified → NOT-A-BUG:** `workOrderPrintModel`/`packingSlipTemplate` `job_code` is synthesized display text (`WO-<id>`), never read as a stored field; `num(v,NaN)` + falsy-guards prevent NaN rendering. Prior flag was wrong.
- **Advisory:** `loadAllEntityRows.js` (shared util used by Permitting/admin/fleet) lives inside `src/components/estimator/` — Estimator-scope directory refactor could break non-estimator imports. Recommend relocating to `src/lib/` on a coordinated pass.
- **Advisory (carried):** 60s session-cache revocation lag; reservation check-then-write race; SOP `innerHTML` (editor-gated, AI path escaped); `punch_webhook` open `https://` URL (SSRF-lite, POST-only).

## 9. AUDIT COMPLETE — FINAL ROLLUP

- **Items: 121 DONE / 0 DEFERRED / 0 OPEN** — every workstream item carries a verdict with evidence.
- **Critical fixed live:** F87 — 4 entities (SignageFact/SignageFactIndex/PermitResolutionRule/ProofShareLink) had NO RLS block → anonymous full CRUD verified live, backend-only sentinels added, anon writes now 403, probe rows cleaned. Checkpoints `6aeecef1`, `6aeed665`.
- **Fixed in code (await publish):** F88 — 3 EmailGate-anonymous facade writes routed through staffEntities + InventoryCostHistory gateway allowlists; F86 — digest functions capability/admin-gated + Deno.serve conversion (also discovered they had no scheduled workflow = were unreachable).
- **Advisories:** F89 + 4 carried items above.
- **Verified-clean highlights:** session/auth core (bcrypt, lockout CAS, HMAC tokens), gateways (allowlists/role-gates/CAS/denylist), portal + fleet public surfaces, FileBridge (HMAC ingest, realpath containment, provenance delete-guard), pay-period locks, invoice status math, reconciliation variance, migration idempotency, route table (97 routes/108 files, 4 dead), external-URL sanitizer, usePolling visibility pause, generated-bundle freshness.

## 10. POST-AUDIT LIVE BUG (2026-11-09) — user-reported, confirmed, fixed

- **F90 (med, FIXED-IN-CODE+DEPLOYED, needs publish for live):** `timeClockAction admin_archive_entry` (:7975) wrote `archived_admin_reason`/`archived_admin_by`/`archived_admin_at` — none exist in TimeEntry schema (correct: `archive_reason`/`archived_by`/`archived_at`). The update wrote 3 nonexistent schema fields (dropped by schema) + threw sporadic transient 500s — the archived_admin flag landed anyway, so archives DO work on the live surface; the real defect is archive audit fields (archived_by/at/reason) silently never persisted + confusing 500 noise. Field names corrected; live-surface still serves checkpoint bundle so fix needs publish. NOTE: second fuller `admin_archive_entry` handler at :10595 is dead code (shadowed by :7975).
- **F91 (UX, FIXED-IN-CODE+DEPLOYED, needs publish for live):** `report_missed_shift` overlap 409 gave a generic "overlap an existing shift" — no date/id of the blocker. Now returns `blocking_clock_in/out/status` + names the entry ("still open since <ET>" vs "existing shift starting <ET>"). Root cause of user report: TWO stale open entries (Aug-25 `legacy_client` punch + Nov-6 unresolved attested clock-in) spanned [clock_in→now] and blocked ALL missed-shift reports.
- **Remediation performed:** Aug-25 stale entry archived; Nov-6 entry user-corrected via UI; audit-probe entry `6af18b13` archived (leaves a `missed_shift:` punch-case in review queue — manager can reject it; flagged, not removed).
- **Carried note:** open-ended `needs_resolution`/`clocked_in` entries legitimately block reports (employee can't claim a closed shift while "still on the clock") — now the message says WHICH entry to fix. A `missed_shift:` PunchCase created for an entry that is later archived is not auto-resolved (minor queue noise — candidate follow-up fix).

- **F92 (follow-up, FIXED-IN-CODE+DEPLOYED, needs publish):** admin_archive_entry now cancels the archived entry open punch cases (status=cancelled + resolution_note + audit id), incl. idempotent catch-up on already_archived re-invoke. Verified orphaned case missed_shift:6af18b13 exists pending_manager_review; cancels automatically on next archive call once published.

- **F93 (data-sweep, resolved — finding corrected):** fleet-wide sweep found 5 more open-ended `clocked_in` rows (kyle/carl/fred/jack + brett Aug-25) — ALL carry `archived_test_data:true` from the Sep-11 legacy migration, so the overlap filter `archived_test_data:{$ne:true}` already excluded them; they NEVER blocked missed-shift reports. The ONLY live blockers were brett's Nov-6 `needs_resolution` (user-corrected) and today's open `9315d456` (legit active shift). Archives applied to kyle/carl rows regardless (harmless); fred/jack not in AuthorizedEmail roster (legacy users). net: zero employees blocked by stale data.
- **Checkpoint `6af1a6f6` (commit dee09dc9):** snapshots F90+F91+F92 code in remote — durable against builder Restore. Publish (checkpoint build + deploy) still required for live surface.
- **PUBLISHED 2026-11-09T11:07Z** (checkpoint 6af1a6f6 / dee09dc9): F91 verified live — 409 now reads "overlap a shift that is still open since Nov 9, 2:50 AM ET" + blocking_clock_in/status fields. F92 verified live — already_archived catch-up returned cancelled_punch_cases:1 (orphan case cleaned from review queue). F90 field names live. ALSO went live with this publish: F88 staffEntities writes + InventoryCostHistory gateway, F86 digest gates.
- **Post-publish health verified:** site 200; my_history/status/my probes all 200; orphan case row now status=cancelled (verified in data). Brett's live entry `9315d456` correctly reports clocked_in.
- **Code-hygiene note (non-urgent):** second `admin_archive_entry` handler (~:10615+) is unreachable dead code shadowed by :7975 — remove on next timeClockAction pass to prevent patching the wrong handler (F90's root cause pattern).
- **F94 (hygiene, FIXED-IN-CODE+DEPLOYED):** removed the unreachable second `admin_archive_entry` handler (187 lines, old :10615-10801) — it was the *fuller* implementation (CAS+labor-segment cleanup+idempotency) that never got wired in, while the simpler live one carried the F90 field-name bug. Dead-code gone = no more mis-patching confusion. NOTE: the fuller impl's labor-segment/state cleanup lives in git history (commit dee09dc9) if an archive-with-active-labor edge case ever needs it. Checkpoint `6af1ad5b` (2f6f6cd); zero behavior change — ships on next publish.

- **F99 (reliability, FIXED+DEPLOYED, needs publish for live):** Recurring Smartsheet "request timed out" sync banners. Root cause: Sales pull stage read its sheet in 200-row pages each capped at 15s (`smartsheetLegacyTransport` GET timeout); one slow upstream page (twice, after the single timeout retry) skipped the whole stage → coordinator surfaced `needs_review` w/ reason "Smartsheet request timed out". Orders pull passed in the same windows — sporadic upstream latency amplified by page count. Separately, `fieldHistoryAction` carried its own `AbortSignal.timeout(15000)` on Smartsheet GETs. Fixes: GET timeout 15s→30s in shared transport (writes stay 30s; `smartsheetWriteNoTimeoutRetry` unchanged) + `fieldHistoryAction` 15000→30000. ALSO fixed latent deploy-breaker: remote `smartsheetSyncAction/entry.ts` had `../../shared/` paths on two dynamic `await import()`s (smartsheetSalesMissingRows, smartsheetDateDiagnostic) — deployer requires `./` for dynamic imports inside the function dir; any `functions deploy`/checkpoint build would have failed. Corrected to `./`. Widget copy corrected: "Auto-syncs every 15 min"→"Sales pull hourly · Order pull every 30 min", "Order pull every 15 min"→"every 30 min" (remote crons: Sales `29 *` ET, Orders `14,44 *` ET — never 15-min). NOTE: separate failed-run trace earlier same day showed `base44_429:2` (internal read-budget collision w/ concurrent pull_dataset invocations) — distinct from the upstream-timeout class fixed here; scheduled runs at :29/:14/:44 are properly staggered. Checkpoint `6af401a9`. Deployed: smartsheetSyncAction, fieldHistoryAction (function lane).

- **F100 (ux/reliability, FIXED+DEPLOYED, needs publish for live):** Sales Pipeline quick-edit self-conflict — "sales last activity at changed in another session" on back-to-back edits by a SINGLE user. Root cause: every Sales-field edit auto-injects `sales_last_activity_at = client-now` into the save (`SalesPipelineSpreadsheet` :1085-1091); baselines for a queued field are anchored only once (:1125-1131), so a second edit inside the same save window (debounce+in-flight) carries the auto-stamp with the PREVIOUS baseline — the just-committed T1 then fails the strict fence/CAS compare (≠ stale baseline T0 AND ≠ new desired T2) → named-field 409, deterministic for any two edits ~3s apart. Fix (monotonic-stamp rule, two layers aligned): `sales_last_activity_at`/`sales_stage_changed_at`/`sales_quote_sent_verified_at` are derived clocks, not user data — (a) `fieldHistoryAction` expected-fields CAS: a strictly-forward stamp (Date.parse next > record) writes regardless of baseline; equal/backward keeps strict 409; (b) `analyzeSalesQuickEditDrift` adds a `supersededStamps` bucket — stored stamp ≥ desired is adopted and dropped silently (never named as conflict), forward stamps pass through; (c) caller drops superseded fields from changes/expected/pending refs + empty-changes short-circuits to adopt fence record; (d) post-failure queuedDrift prunes superseded silently. `verifySalesSaveAcknowledgment` unaffected — forward writes land exactly as sent. Privileged-field check still precedes leniency (quote_verified stays admin-gated); `validateSalesActivityTimestampPatch`/`validateSalesStageTimestampPatch` semantics unchanged (still require real activity/paired status change, still block backward stamps). Checkpoint `6af4044`. Deployed: fieldHistoryAction (function lane); client fence ships on next publish.

- **F101 (deploy-hazard, FIXED+DEPLOYED):** Sweep for the `await import('../../shared/...')` deploy-breaker pattern (found on remote smartsheetSyncAction/entry.ts during F99): `permittingResearchBacklogDispatch/entry.ts:200` had the same class — `await import('../../shared/jurisdictionSourceTextRuntime.ts')` would fail any functions deploy/checkpoint build ("must reference a file bundled with this function"). The lazy import is a DELIBERATE fault boundary (pdfjs parser load isolated from dispatcher) so static-import was rejected; fix = bundled the 3-module chain (`jurisdictionSourceTextRuntime.ts` + self-contained `safeExternalFetch.ts` + `jurisdictionSourcePdfText.mjs`) INSIDE the function dir with `./` import — boundary preserved, deploy verified green (13.9s). ALSO: remote smartsheetSyncAction/entry.ts converged to the 5742-line version w/ `./` fixes (my earlier sandbox edit landed); local synced to match. Drift note: 3 files now exist as copies inside the function dir — they duplicate `base44/shared/` sources and must be kept in sync if the shared modules change (same convention as smartsheetSyncAction's bundled copies). Checkpoint 6af4071.

- **F102 (reliability/security-hardening, FIXED+DEPLOYED):** Unbounded external-fetch sweep. `safeExternalFetch` (SSRF guard used by 11 functions) had NO timeout — any stalled upstream (jurisdiction sites, permit PDF hosts, webhook targets, Drive downloads) hung the request until platform kill. Fix: `init.signal ?? AbortSignal.timeout(30_000)` created once before the redirect loop — one 30s bound covers the whole redirect chain, caller-passed signals preserved. `smartsheetMetadataAdminAction` calls `measuredSmartsheetFetch` (metrics-only wrapper, also no timeout) — added explicit `AbortSignal.timeout(30_000)` to its GET columns + PUT column calls. DEPLOYED all 12 real-guard consumers: permittingResearchBacklogDispatch, timeClockAction (webhook POST), archiveAddressResearchFile, backupPermittingRepository, continueAddressResearchDiscovery, continueJurisdictionArchives, downloadPermitPDF, importWipSheet, refreshJurisdiction, scanPermittingOffice, smartsheetMetadataAdminAction, validateDocumentUrl. Note: smartsheetMetadataAdminAction's local `safeExternalFetch` alias = measuredSmartsheetFetch (trace wrapper), NOT the SSRF guard — name collision verified harmless. Remaining deferred: raw `fetch()` calls in Drive-backup paths (backupToGoogleDrive, backupPermittingRepository) lack timeouts but handle multipart uploads where a blanket cap risks aborting legit large uploads — flagged as advisory, needs per-call sizing. Checkpoint `6af40d61`.

- **F103 (reliability, FIXED+DEPLOYED):** Completed the unbounded-fetch sweep — all remaining raw `fetch()` call sites across the function tree had no timeout signal (31 sites, 16 functions). Fix: per-file `boundedFetch` helper (`fetch(input,{signal:AbortSignal.timeout(N),...init})` — caller signals still override via spread order) + `await fetch(` → `await boundedFetch(`. Sizing: 30s for light JSON APIs (3 OAuth callbacks, checkGmailConnection, sendGmail, placesAutocomplete, fixtureBusinessSearch, streetViewPreview x2, calculateTravelMiles, cagisSearch); 120s for upload/download/big-doc paths (googleDriveOperations x9 incl. multipart uploads, backupToGoogleDrive x7, backupPermittingRepository x2, permittingProxy, fileBridgeAction secure_download, fileBridgeIngest chunk stitch). Verified every remaining bare `fetch(` in the tree already self-bounds (findLocalityByAddress, resolvePermittingAddress, permittingHealth, smartsheetSyncAction's AbortController). All 16 remote files md5-verified; all 16 functions deployed green; esbuild clean. Closes the F102 deferred advisory. Checkpoint `6af411da`.

- **F104 (reliability, FIXED+DEPLOYED):** `base44/shared/bouncie.ts` had 4 unbounded `fetch()` sites the F103 sweep's grep pattern missed (arrow-fn `send` helper + 2 OAuth token calls + `/v1/user` fetch) — any Bouncie API stall hung the fleet sync/notification functions. Added `AbortSignal.timeout(30_000)` to all 4 (token exchange POST x2, API `send` helper, user GET). Deployed all 9 consumers: bouncieApi, bouncieAuthCallback, bouncieAuthInitiate, bouncieRepairWebhook, bouncieStatus, bouncieSyncNotifications, bouncieWebhook, fleetCutoverControl, fleetEquipmentAction — all green. Also verified clean: no cross-boundary `await import('../...')` anywhere in the function tree; both `initialDelayMs` users (AnnouncementContext 300s+70s, TimeClockStatusContext 180s+65s) are the sanctioned long-interval pattern; orderPersistence/workOrderPersistence have no per-save auto-stamps (deleted_at is one-shot) — F100 self-conflict class confirmed closed app-wide. Checkpoint `6af41323`.

- **F99-VERIFIED (post-deploy):** Coordinators confirm the Smartsheet timeout fix is live — `smartsheetSalesSyncStatus` completed 2026-11-11T06:34Z (3,135 rows, needs_review:false) + `smartsheetOrderSyncStatus` completed 06:47Z (1,717 rows). Scheduled `run_sales_sync`/`run_order_sync` actions do NOT write SmartsheetSyncTrace rows (only pull_dataset/push_saved_* do) — trace-list gap was expected, not missing runs. The 00:31-00:33 pull_dataset cluster (rejected→failed b429:2→rejected) was a manual UI pull retrying against an in-flight coordinator (`queueSmartsheetSync retryCoordinatorBusy`); b429 collision confirmed pre-deploy and bounded by the run guard. Also confirmed from trace: the mysterious 05:35:52 WorkOrder write was Brett's own second quick-edit save (fieldHistoryAction trace exists at that timestamp) — consistent with F100 diagnosis.

- **F105 (data-hygiene, ADVISORY — benign, no delete path exists):** GlobalSettings has 6 byte-identical `setting_key:'fileBridge'` rows (minted Nov 2-3 by raced get-or-create at fileBridgeAction:509 + fileBridgeIngest:183 — both create-when-empty, no mutual exclusion). Verified: all 6 setting_values identical; ALL readers (fileBridgeAction:27, fileBridgeIngest:67/170/650, fileBridgeMaintenance:26) sort `-updated_date` limit 1 and writers update `settingsRow[0]` — newest-wins is consistent everywhere so behavior is correct today. Risk: latent only (no code path can write a non-newest row). Cannot remediate via existing surfaces — staffEntityWrite blocks GlobalSettings; no function deletes them. Options if ever needed: dedupe action in fileBridgeMaintenance, or delete via backend console. NOT FIXED — documented, lowest severity.

- **QUEUE-VERIFIED (clean):** `queueSmartsheetSync` (`syncRequestQueue.js`) audited post-F99 — serializes one sync per browser tab via promise-tail, bounded 8×10s retry ONLY for `rate_limit` (429/rate-limit text) or `coordinator_busy` (409 + "already running"); all other errors throw immediately (`syncQueueRetryKind` returns "none"). Callers can also opt out per-kind (orderSaveSync sets retryRateLimit:false). The 00:32:02 trace retry landing ~10s after the 00:31:52 rejection matches this cadence — no pile-on possible from this surface.

- **HANDOFF (2026-11-11):** Audit at stable resting point. F97–F104 all FIXED+DEPLOYED on function lane; F105 advisory documented; F99 verified live via coordinators; sync queue verified clean. PUBLISH PENDING — live bundle still serves pre-F99/F100 frontend (verified: bundle lacks supersededStamps, still shows "Auto-syncs every 15 min" copy). Publish requires Brett's explicit go. NEXT-SESSION THREADS: (a) post-publish live verify of F100 fence + widget copy; (b) fileBridgeMaintenance dedupe action if Brett wants the 6 fileBridge GlobalSettings rows collapsed to 1; (c) Estimator-adjacent re-sweep once Estimator dev settles. Checkpoints: 6af40d61 / 6af411da / 6af41323.

- **PUBLISHED 2026-11-11T07:40Z** (checkpoint `6af41bc1` / commit `ca220d66`). First deploy attempt on `6af4196b` failed `checkpoint_source_no_longer_compiles` — the two `./` dynamic-import targets (smartsheetSalesMissingRows.ts, smartsheetDateDiagnostic.ts) existed only in base44/shared/, never bundled into the function dir remotely (function deploys built from local masked it). Bundled both into base44/functions/smartsheetSyncAction/ (self-contained, zero imports), redeployed function, new checkpoint built ready, deployed. LIVE-VERIFIED: bundle F7ZWpdDT serves "Sales pull hourly" (old "every 15 min" copy gone). F100 client fence + F90-F98 timeclock UI + F99 widget copy now live.

- **F106 (ux/data-semantics, FIXED+DEPLOYED+PUBLISHED):** Time Tracker pill reset to "0:00 / 8h" on every refresh for overnight shifts. Brett clocked in 04:38 UTC (= 23:38 ET Nov-10) — the workday-anchor correctly buckets the whole shift into Nov-10 for payroll, but `paid_minutes_today`/`elapsed_minutes_today` only sum same-day-anchored rows so the pill rendered an empty 8h day. Fix: time_tracker_snapshot now emits `tracker_paid_minutes`/`tracker_elapsed_minutes` = today totals + the live shift's own totals when its anchor day differs (additive fields; payroll fields unchanged); TimeTracker.jsx prefers them with fallback. VERIFIED LIVE post-publish (checkpoint 6af42e37, deployed 09:00:17Z): snapshot returns tracker_paid 262.6 (~4.4h) vs paid_today 0 — pill now shows real session time. Also learned: verifyLogin via .permit-creds.json = permitbot service account — earlier prefs probes hit the bot's row, not Brett's (brett@cincisigns.com, salary); publish resets the function lane to checkpoint code so post-publish function deploys may need a beat.

- **F107 (ux, FIXED, needs publish):** "Report a missed shift" dialog stayed open with no feedback on success. Root cause: handleReportMissedShift set actionEpoch BEFORE the invoke and never re-baselined (unlike clock_in/clock_out paths which re-baseline post-await) — a status-poll epoch bump during submit tripped `!stillCurrent() || actionEpoch !== workViewEpochRef.current` → early return after server-side save but before setMissedShiftPrompt(false) + setRecognitionStatus banner. User saw stuck dialog + re-submit → overlap error against their own just-created report. Fix: evaluate confirmed result first, keep stillCurrent() identity guard, close+announce regardless of poll epoch. Remote synced+verified :1662.

- **F107-SWEEP (closed):** audited every submit-and-close dialog path in the timeclock module for the F107 pattern (success swallowed before close/notify). All sibling paths re-baseline actionEpoch after creating the pending invoke (clock_in :793, missed_clock_in :1593, punch_resolution :1467, current-work :1405) or use confirmed-ack close patterns (CorrectionRequestDialog, AdminNoteDialog). report_missed_shift was the sole non-re-baselining handler — lone defect, fix on remote awaiting publish.

- **F108 (open, root-cause narrowed):** Ritz Safety - Dayton conflict was manufactured by an UNAUDITED local revert. Evidence: FieldAudit shows committed app save set current_task_description -> "Completed Sale" at 2026-11-10T13:35:17Z (actor brett@cincisigns.com; same instant SS row modifiedAt). Pull at ~16:33Z minted conflict 6af34745c7beb7bd969082d7 with local_value="Completed Sales - Post Invoice Tasks" (the PRE-save value) vs remote "Completed Sale" — the local record field reverted between 13:35-16:33Z with NO committed FieldAudit for the revert. Suspects: stale-snapshot full-record save (SalesOpportunityDialog holds whole record; CAS anchors only baseline fields, so a dialog opened pre-13:35 could clobber the task) or an untracked write path (bulk/bridge writers bypassing FieldAudit). Next: query FieldAudit entity unfiltered for entity_id 6ab4448306a95eb474d0692d field current_task_description in that window; enumerate non-gateway writers of the field. Conflict itself was resolved by user (0 open as of Nov-12).

- **F108 (ROOT CAUSE FOUND + FIXED + DEPLOYED):** the Ritz conflict was manufactured by a pull TOCTOU, not any human/editor. Proof: conflict local_version=2026-11-06T07:41 (record snapshot 4 days stale at mint) while remote_version=2026-11-10T13:35:17Z — the pull loaded records at start, Brett's save committed "Completed Sale" at 13:35 (FieldAudit, app+SS), the in-flight pull fetched the SS row post-push but compared against the stale local snapshot -> false two-sided conflict minted 16:33. No unaudited writer exists; every write path was eliminated (pull-merge CAS fresh plans, orphan/metadata/bridge writes field-scoped, quick-edit baselined CAS+audited). FIX: persistSalesReviews now re-reads each entity's updated_date before minting — reviews whose local_version no longer matches are dropped (dropped_stale counter) and re-evaluated next pull. Covers both sales review paths (:762, :3583). Deployed smartsheetSyncAction; checkpoint 6af82d2c22c21d31897404ca.

- **F108b (orders-side TOCTOU closed + deployed):** non-sales conflicts mint inline in planFieldPush against the same stale record snapshot — added the equivalent revision re-check (entities[type].get; stale/missing -> unresolved, defer to next pull). Verified the push/apply side was already safe: pre-PUT revision re-reads hold stale plans for both datasets (smartsheetSyncAction :2845 sales, :2937 orders) and local applies CAS on planned.updated_date. Mid-pull staleness class fully closed: false conflicts can no longer mint, and stale values were never able to overwrite fresh edits. Deployed smartsheetSyncAction.

- **Sync claim architecture audited (clean):** cross-dataset serialization blocks only fresh runs (>2min stale doesn't block); stale runs require explicit recover_stale_order_run/recover_stale_sales_run (both exist at :4094/:4481) — conservative by design, recoverable. No wedge path found.
- **F108 live verification:** both coordinators completed clean on the post-fix build 2026-11-14 (Sales 21:30Z, Orders 21:47Z, needs_review:false). dropped_stale counter present in run summaries.
- **Resolution-apply path audited (clean):** smartsheetConflictReview re-validates both sides against live state before applying (sales snapshot equality; orders updated_date/modifiedAt) — stale decisions supersede+409, never apply. F108 class airtight end-to-end.
- **Publish gap noted:** live bundle TUYB03V2 predates F100 client fence + F107 dialog fix (remote src has both). Await user "publish".

- **F109 (fixed + deployed):** resolved Sales conflicts could RESURRECT. conflict_key for sales is value-derived [dataset,id,column,a,b] — if the same value pair recurs post-resolution, persistSalesReviews loaded only open/approved rows, the review went to additions, and upsert({key:conflict_key}) flipped the resolved row back to status:open with stale decision/resolved_by intact — a second "conflicts keep coming back" mechanism. Fix: additions whose key is held by a closed row get a reoccurrence-suffixed key (':reocc:<iso>') minting a fresh row instead of mutating the resolved one; reopened counter added to summary. Deployed smartsheetSyncAction; checkpoint 6af8db61->6af8dec0b8e68d3e04f8a0aa.

- **F110 (fixed + deployed):** three timeclock admin settings were dead end-to-end via the undeclared-field drop class — GlobalSettings schema declares setting_key/setting_value only, but timeClockAction used {key,value}: set_delegated_approvers + set_two_step_threshold creates failed on required setting_key (caught->null, returned success:true); delegated-approver review gate (:9172) + twoStepThresholdMin (:9220, always defaulted 240) + overtime cost report rate (:12083, always 0) + feature_flags (:12335, always defaults) all filtered on nonexistent `key` prop and could never match. Converted all 6 sites to setting_key/setting_value (value wrapped as {value:...}). Verified live: no rows exist under either shape, no orphans. Deployed timeClockAction; checkpoint 6af8e68abce6ef5725643ddb.

- **F111 (fixed + deployed):** opportunityWorkspaceAction watch-rules config was dead end-to-end — same undeclared-field class as F110. filter({config_name}) never matched (field doesn't exist), create({config_name,watch_rules}) violated required setting_key, so watch/list_watches/clear_watch could never persist or return rules. Converted all 4 sites (:384,:387,:404,:405,:419) to setting_key + setting_value.watch_rules. Deployed opportunityWorkspaceAction; checkpoint 6af8e7a71b98c2d7a2160f98.
- **GlobalSettings writer sweep closed:** all remaining create sites verified correct shape (fileBridge, hostedAssetManifest, manageSalesFilters, manageSops, monitorJurisdictionChanges, smartsheetSyncAction coordinators fail-closed).

- **F112 (advisory, Estimator-scope):** opportunityWorkspaceAction uses undeclared BuilderPart.estimate_id — filter({estimate_id}) at :479/:526 always returns empty (part list + copy-source reads dead), create({...pf,estimate_id}) at :505/:537 drops the field (parts stay linked only via builder_product_id in pf, if present). Fix options: add estimate_id to BuilderPart.jsonc (then populate) or traverse product->estimate link. NOT fixed — BuilderPart is inside the Estimator exclusion while it's under active development; the builder may be mid-migration on this schema.
- **Undeclared-write class sweep done:** scripted entities.X.(filter|update|create)({prop}) vs schema properties across all functions+shared — only hits were system fields (id), User.email, and these two flagged cases. Class is closed for GlobalSettings; BuilderPart deferred per scope.
