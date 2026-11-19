# WS-O · O-013 (CMP-A13) — Static-Verifiable Audit Verdict

**App:** `68dfcc5e57bbbc35387da97c` · **Branch:** `main` · **Mode:** read-only sandbox inspection (no deploy, no publish, no live entity ops, no real-session probes)
**Date:** 2026-11 (audit session) · **Scope:** Estimator/Foundation/estimate-lifecycle surfaces per `AGENTS.md` active scope

---

## Verdict summary

| # | Invariant | Verdict | Primary evidence |
|---|-----------|---------|------------------|
| I-1 | Estimator/Foundation data entities use backend-only RLS (or intentionally narrower/wider documented shapes) | **PROVEN-BY-SOURCE** | `base44/entities/*.jsonc` (252 files inventoried); see `entity_rls_table.md` |
| I-2 | Staff reads of backend-only entities flow through a session-authenticated, allowlisted gateway | **PROVEN-BY-SOURCE** | `base44/functions/staffDataRead/entry.ts:10,143,188,451-458,464-509,554-555` |
| I-3 | Staff writes of backend-only entities flow through a session-authenticated, operation-allowlisted gateway with CAS anchors | **PROVEN-BY-SOURCE** | `base44/functions/staffEntityWrite/entry.ts:10-90,132,143-184,318-359` |
| I-4 | Every function touching protected entities authenticates via `authenticateSignShopSession`/`resolveFleetStaffUser` or an equivalent credential | **PROVEN-BY-SOURCE with enumerated exceptions** | awaited-auth call verified in 126 function files; exceptions classified in `function_auth_matrix.md` |
| I-5 | Role restrictions enforced (admin gates, owner scoping, per-admin denied fields) | **PROVEN-BY-SOURCE** | `staffEntityWrite:91,143-176,285`; `staffDataRead:143-186,188-200,202-206`; `zzCleanupAction:60`; `customerPortalAction` per-action kind/customer scoping |
| I-6 | Read-only share links: a share token cannot reach mutation paths | **PROVEN-BY-SOURCE for `staff_view` links; PARTIAL — portal links are *not* read-only by design; `ProofShareLink` unwired** | `customerPortalAction:445-542,601-1476`; `proofShareLinkModel.ts`; no `createEstimateReadOnlyShareLink` exists |
| I-7 | No estimator frontend code calls `base44.entities.*` outside the gateway abstraction | **PROVEN-BY-SOURCE for writes; reads partially direct but gateway-routed** | `base44Client.js:7760+,10441+`; estimator grep results below |
| I-8 | No anonymous/unauthenticated write path to backend-only entities | **GAP-FOUND** | `base44/functions/fileBridgeMaintenance/entry.ts` (zero auth, invoked by workflow `args:{}`) — FileBridge module, outside estimator scope |

**Findings register:** see `findings.md` (9 items: 1 authz-relevant gap + 3 fail-closed functional bugs + 5 design exceptions/observations).

---

## I-1 · Entity RLS — PROVEN-BY-SOURCE

All 252 `base44/entities/*.jsonc` files were pulled from remote and parsed (`extract_rls.py` → `rls_inventory.json`; `access_matrix.json`). Result: **164 fully backend-only, 88 non-backend-only** — the estate is intentionally mixed; the estimator-critical records are all backend-only:

- **Fully backend-only (create/read/update/delete all gated):** `AllInOneEstimate`, `FoundationProject`, `BuilderProduct`, `BuilderPart`, `BuilderPartGroup`, `Customer`, `CustomerNote`, `CustomerLocation`, `CustomerPortalLink`, `PortalMessage`, `ProofShareLink`, `Invoice`, `Payment`, `ChangeOrder`, `Opportunity`, `OpportunityActivity`*, `EstimatingRequest`, `EstimateSectionAcceptance`, `EstimateOption`, `DocNumberCounter`, `AuthorizedEmail`, `QuoteScopeLine`, `EstimatingRequest`, `CostPlusConfig`, plus ~120 more. (`OpportunityActivity` verified backend-only in inventory; it is also in the read gateway allowlist.)
- **Intentionally staff-readable (RLS `admin`+`user` read, restricted writes):** `FoundationInventory` (read admin+user; create/update/delete admin), `WorkOrder` (c/r/u admin+user; delete admin), `MaintenanceProject`, `SourceCollectionQueue`, `EstimateRevision`/`EstimateAcceptance`/`EstimateQuoteDelivery` (read admin+user; mutations backend-only), `BuilderPriceRevision`, `CustomerContact` (delete admin), `ProjectTemplate`, `QuickProductCategory`, `SalesFilter`, `EmailGroup`, `Announcement`, `AutomationRule`, `PendingImport` (update backend-only).
- **Admin-only:** `FoundationInventory` writes, `MarkupCategory`, `Inventory`, `InventoryCostHistory`, `DimensionalLetterMaterial`, `SaveColor`, `CustomerSummary`, `AdminAuditLog`, `UserSession`, `AccessRequest`, `LegacyMigrationMap`, `FailedAdminAttempt`, `PartTemplate` (read admin), `BackupLog` (read admin).
- **Special shapes:** `CalendarEvent`/`UserCapacity` read `{}` with backend-only writes; `PermittingOfficeAuthorityReview` read admin+user with `update:false,delete:false`; `User` has only a `__google_oauth_service_only__` read.
- **`Estimate` and `CustomerSession` entities do not exist** — the estimate entity is `AllInOneEstimate` (aliased `Estimate` inside `customerPortalAction:409`).

## I-2 · Read gateway — PROVEN-BY-SOURCE

`staffDataRead/entry.ts`:
- Header comment (l.5-9 region) documents EmailGate sessions cannot satisfy entity RLS → all staff reads route here.
- `STAFF_READABLE` allowlist l.10-142 (~130 entities incl. `AllInOneEstimate:41`, `FoundationInventory:59`, `FoundationProject:60`, `OpportunityActivity:74`, `PortalMessage:81`, `ProjectTemplate:117`); `ADMIN_READABLE` l.143-186 (`AdminAuditLog:145`); `OWNER_SCOPED` l.188-200; `FIELD_DENYLIST` l.165; `MAX_LIMIT 5000` l.181.
- Filter operators rejected anywhere in query (`l.243-287`); denylisted fields can't be probed via operators.
- Entity allowlist gate `l.451`, admin-tier gate `l.454`, service-role access only after checks `l.458`, owner-scoping `l.464-509`, 45s response cache keyed by role/owner/denied-scope `l.403-426`, 429 mapping `l.524-528`.
- **Session required first:** `resolveFleetStaffUser(base44, body?.session_token)` l.554 → 401 l.555.
- Client side: `base44.entities.X.read` is proxied to `staffEntities` for the 44 whitelisted `STAFF_READ_ENTITIES` (`src/api/base44Client.js:7760-7770`, proxy at `10441+`); `staffEntities` → `invokeFleet('staffDataRead')` → `session_token: getSessionToken()` injected at `fleetInvoke.js:45`. Only `READ_METHODS` are proxied — writes through `base44.entities` are NOT gateway-routed.

## I-3 · Write gateway — PROVEN-BY-SOURCE

`staffEntityWrite/entry.ts`:
- `authenticateSignShopSession` required before dispatch — l.132.
- `WRITE_OPS` explicit per-entity op sets l.10-90 (`AllInOneEstimate: updateMany+delete`, `FoundationProject: create+updateMany`, `FoundationInventory: create+updateMany+deleteMany`, `Customer: updateMany` only, `WorkOrder: create+updateMany`, `Invoice`/`Payment`/`ChangeOrder`/`Opportunity`/`CustomerPortalLink`/`ProofShareLink`/`EstimateAcceptance`/`EstimateRevision`: **absent → denied** — those are function-mediated only).
- `ADMIN_ONLY_WRITE` l.91 + inline admin gates l.143-176 (`PermitLocality`, `TaxGroup`, `MarkupTier`, `SalesLocation`, `SourceCollectionQueue`, …).
- Client identity/system fields stripped l.184 (and l.341 inside patch); operator keys (`$set` except the one allowed CAS slot, `$where`, …) rejected recursively.
- `updateMany` requires exactly `{id, updated_date}` and only `$set` — l.318-342; `FoundationProject` typed anchors l.324-325.
- `deleteMany` requires `{id, updated_date}` anchor — l.346-359; `FoundationInventory` deleteMany same contract l.266-275.
- `SavedQueueView` owner check l.285 (non-admin can't touch others' views or transfer ownership); `expected_updated_date` CAS l.299-300.

## I-4 · Session gateway coverage — PROVEN-BY-SOURCE (with enumerated exceptions)

`authenticateSignShopSession` (`shared/signShopSession.ts:49-127`): HMAC-signed 2-part token, `SESSION_SIGNING_SECRET`, expiry, `UserSession` revocation by token hash, exactly-one `AuthorizedEmail` row, `session_not_before` logout, 60s auth cache. `resolveFleetStaffUser` (`shared/fleetStaffSession.ts:1-36`) accepts only `admin`/`user`.

A grep for `await authenticateSignShopSession(|await resolveFleetStaffUser(` returned **126 function files with awaited calls — every file that imports the auth helper also invokes it** (no import-only dead imports). All estimator/estimate-lifecycle functions authenticate before dispatch:

| Function | Auth line | Notes |
|---|---|---|
| `staffDataRead` | 554 | via `resolveFleetStaffUser` |
| `staffEntityWrite` | 132 | |
| `invoicingAction` | 206 | before action dispatch; no per-action admin gates (finding F-8) |
| `recordEstimateAcceptance` | 285 | session only |
| `recordEstimateQuoteDelivery` | 151 | session only |
| `ensureNewEstimate` / `ensureEstimateCustomer` / `ensureNewCustomer` | 88 / 164 / 78 | session only |
| `ensureOpenEstimateRevision` | ~107 | session only |
| `ensureEstimateLifecycleRevision` | 102-104 | session **or** `auth.me()` fallback (no role check) |
| `ensureBuilderPriceRevision` | 101-103 | session **or** `auth.me()` fallback |
| `ensureCustomerSummary` | 238-240 | session **or** `auth.me()` fallback |
| `updateEstimateRevisionAudit` | 35-37 | session **or** `auth.me()` fallback |
| `queueFeed` | ~390 | session |
| `boardFeed` | 154 | session required (stale comment claims optional — code fails closed) |
| `opportunityWorkspaceAction` | ~288 | session |
| `zzCleanupAction` | 59-60 | session **and** admin role |
| `customerPortalAction` | 1480 | staff lane after session auth; public lane before it uses portal-link credentials |
| `smartsheetSyncAction` | session + `hasWorkflowInvocationCapability` | dual credential lanes |
| `monitorJurisdictionChanges` | `authenticateAdminSession` or workflow capability | admin or scheduled |
| `fileBridgeIngest` | agent HMAC credential | FileBridge scope |
| `timeClockAction` | session/badge/workflow capability | out of scope |
| `changeOrderAction`,`inventoryAction`,`jobCostingAction`,`manageReconciliation`,`purchaseOrderAction`,`quickbooksExport`,`importOrders`,`importSalesPipeline`,`importWipSheet`,`manageCustomerLifecycle`,`notificationAction`,`fieldHistoryAction`,`generateDocNumber`,`deleteCreatedDuplicateWorkOrder`, ~100 more | verified in the 126-file awaited-auth set | |

**Exceptions (each classified in `function_auth_matrix.md`):**
- **Public-by-design:** `workOrderTraveler` (WO-id capability, narrow projection — see finding F-5), `hostedAssetManifest.get_manifest`, `verifyLogin` (mints sessions), `setPassword`/`issuePasswordReset` (reset-token or session), `onboardingAccountAction` (onboarding token), `adminBootstrapLogin` (retired → 410).
- **Workflow-capability:** `checkDeadlineReminders`, `checkPermitFollowupReminders`, `monitorJurisdictionChanges`, `sourceMonitorScan`, `followUpSweepAction`, `smartsheetSyncAction`, `backupToGoogleDrive`, `auditJurisdictionAccuracy`, `refreshJurisdiction(Targeted)`, `detectSalesDuplicates`, `sendGmail` — SHA-256 constant-time verify (`shared/workflowInvocationCapability.ts:38-49`); raw capability lives only in the workflow jsonc args.
- **Platform `auth.me()` admin-gated:** the `opportunityBridge*`, `permitting*` admin tools, `sourceMonitorSeed`, `manageAutomationConfig` (admin capability), `downloadPermitPDF`, `searchExternalClients` (platform auth + feature flag), `jurisdiction_research` (any platform user — finding F-9).
- **Unauthenticated — GAP:** `fileBridgeMaintenance` (finding F-1) and `fileBridgeSpike` (probe key, out of scope).

## I-5 · Role restrictions — PROVEN-BY-SOURCE

- Admin-only write entities/ops enforced in `staffEntityWrite` (`ADMIN_ONLY_WRITE` + inline gates).
- `zzCleanupAction` admin-only at line 60.
- `accessRequestAction`, `issuePasswordReset`, `manageAuthorizedUsers`, `sessionAdminAction` etc. require admin role for other-user/admin operations.
- `staffDataRead` `ADMIN_READABLE` tier (`AdminAuditLog`, …) requires `role==='admin'` (l.454); `OWNER_SCOPED` entities filter `user_email` to caller for non-admins (l.464-509); per-admin `denied_fields` projection (l.202-206).
- Per-action admin gates exist inside domain functions where implemented (e.g. `invoicingAction` has none — finding F-8; `opportunityWorkspaceAction`/`manage*`/import functions checked individually in matrix).
- **Note:** the four `auth.me()` fallbacks accept **any** authenticated platform user with no role check — same nominal tier as a staff session, but the check is absent (finding F-6).

## I-6 · Share/link semantics — MIXED VERDICT

**`staff_view` portal links (the actual "read-only share"):** **PROVEN-BY-SOURCE read-only.**
`customerPortalAction`: `staff_view` links resolve only inside `bootstrap` (l.525-537 → `view_only:true` + `estimatePortalView` projection). Every mutation action kind-gates: `post_message` l.606 (customer/work_order only), `upload_file` l.745, `estimate_respond` l.788+793 (customer/estimate only, record-scoped), `counter_offer` l.1091+1096, `payment_notice` l.1194, `record_portal_payment` l.1236, `request_job_revision` l.1317, `request_reorder` l.1392, token-`list_thread` l.1461-1469 (work_order/customer only). `staff_view` can call *nothing* else — **no mutation path reachable with a staff_view token.**

**`ProofShareLink`:** entity fully backend-only (`ProofShareLink.jsonc:76-79`), model is view-only (`proofShareLinkModel.ts` — status/telemetry/revocation builders only), but **no function references the entity at all** — no resolution endpoint, no create endpoint. The named `createEstimateReadOnlyShareLink` does not exist; the live equivalent is `customerPortalAction create_link kind:'staff_view'` (staff-session gated l.1480-1509). Proof shares are scaffolded-but-unwired → trivially no mutation path; feature is not live.

**`CustomerPortalLink` non-`staff_view` kinds are NOT read-only (by design):**
- `estimate` links: `estimate_respond` writes `AllInOneEstimate.status`→approved/cancelled via CAS (l.889-892,970-975), creates `EstimateSectionAcceptance` (l.805-830), `EstimateAcceptance` (l.920-946), `PortalMessage`, `OpportunityActivity` — all record-scoped (`link.record_id===estimate_id` l.793, `status==='sent'` + expiry gates).
- `customer` links: full workspace + all mutation actions (messages, uploads, quote respond/counter, payment notice, `record_portal_payment` → real `Payment` row, `request_job_revision` → `ChangeOrder` draft, `request_reorder`), each re-verified against the link's `customer_id`.
- `work_order` links: job-scoped view + scoped messages/uploads; `invoice` links: invoice view only.
- Token controls: length 16-128, revocation, expiry, kind + customer/record scoping, `bumpOpen` telemetry (l.44-74).
- Staff link management (`create_link`/`revoke_link`/`list_links`/`email_link`/`portal_inbox`/`mark_all_read`/`reply_message`/`list_thread`) all sit behind `authenticateSignShopSession` at l.1480.

**Verdict:** read-only shares = `staff_view` → PROVEN. If the invariant intended *all* external share tokens to be read-only, that is **not** the deployed model — `estimate`/`customer`/`work_order` links are delegated customer credentials with deliberate scoped mutations. Flagged as a requirements-clarification item, not a code defect.

## I-7 · Frontend direct-access — PROVEN-BY-SOURCE (with one dead-read note)

- `invokeFleet` injects `session_token` on every call (`src/components/fleet/fleetInvoke.js:45`).
- `base44.entities.X.<read>` is proxied into `staffDataRead` for the 44 `STAFF_READ_ENTITIES` (`src/api/base44Client.js:7760-7770, 10441+`). Direct `base44.entities.*` reads found in estimator components (`foundationTemplateService.js:38`, `moduleTemplateService.js:32`, `EstimatorAuditPanel.jsx:47-48`, `ConvertToWorkOrder.jsx:26,84`, `BuilderPartsPanel.jsx:307`, `CustomerQuotePanel.jsx:273`, `estimateRevisionService.js:152`, `EstimateActivityPanel.jsx:21,23`, `AuditLog.jsx:32-33`) all target proxied entities → equivalent to `staffEntities`.
  - **Exception (fail-closed):** `EstimatorAuditPanel.jsx:49` calls `base44.entities.AdminAuditLog.filter` — `AdminAuditLog` is NOT in the client proxy set → raw platform call → denied for EmailGate staff → dead "admin" audit tab (finding F-4).
- **No `base44.entities.*` write calls anywhere in estimator scope** (`src/components/estimator/*`, `src/pages/Estimator*`, `src/pages/EstimateDetail.jsx`, `src/pages/*Estimator*` greps clean for create/update/delete/updateMany/deleteMany). All writes go through `staffEntities` → `staffEntityWrite`.
  - Out-of-scope exception: `src/components/workflow/EnhancedSipChecklist.jsx:827,874,1669,1709` direct `WorkOrder` writes — SIP checklist module, not estimator surface.
  - Out-of-scope reads: `src/components/masterInventory/*` call `base44.entities.FoundationInventory.*` — not client-proxied → fail-closed for EmailGate (platform-admin surface).

## I-8 · Anonymous write paths — GAP-FOUND

- **`fileBridgeMaintenance`** (`base44/functions/fileBridgeMaintenance/entry.ts`): no session check, no `_workflow_capability` verify; its scheduled workflow invokes it with `args:{}` (no capability — compare `Daily Deadline Reminder Check.jsonc` which sends one). Anonymous invoke performs `asServiceRole` mutations: `FileBridgeCommand` update/deleteMany (l.36,46,52,94), `FileBridgeHealth` update (65), `FileBridgeEvent` deleteMany+create (75,268), `FileBridgeRecent`/`FileBridgeChunk` deleteMany (81,86), `FileIndex` update (113,263), **`CustomerFolderLink` create/update (150,216,221)** — a backend-only entity — and reads the full `Customer` table (l.127). Payload-free so blast radius is bounded/idempotent, but it is an unauthenticated anonymous write endpoint. **FileBridge module — outside estimator scope but violates the "no anonymous backend-write" invariant globally.**
- All other non-session functions use platform auth, admin capability, workflow capability, HMAC agent credential, badge credential, or are intentionally public read-projections — matrix in `function_auth_matrix.md`.

---

## What remains for live probes (cannot be done without publishing / real credentials)

1. **REQUIRES-LIVE-PROBE** — end-to-end revocation/expiry of a real `sss_session_token` (server-side `UserSession` revocation + `session_not_before` enforcement are proven in source; actual 401 on revoked token needs a real session).
2. **REQUIRES-LIVE-PROBE** — `updateEstimateRevisionAudit` `complete_manual_revision` runtime behavior: source shows a caller-scoped `base44.entities.AllInOneEstimate.get` (l.41,65) that should fail for every caller type under backend-only RLS (finding F-3) — confirm the 404 path with a real session/platform user.
3. **REQUIRES-LIVE-PROBE** — `jurisdiction_research` breadth for a non-admin platform user (needs a real 'user'-role platform account).
4. **REQUIRES-LIVE-PROBE** — portal-token edge behavior on the published app (expired-token 404s, cross-customer scope rejection) — needs a minted `CustomerPortalLink` token.
5. **REQUIRES-LIVE-PROBE** — `fileBridgeMaintenance` anonymous-invoke confirmation (call without credentials; needs a deployed function URL / published runtime).
6. All of the above run inside Base44's hosted function runtime — **none can be exercised from the sandbox CLI without a deployed function endpoint or real session credentials**; no publish was performed.

## Artifacts

- `rls_inventory.json` — parsed RLS for all 252 entities
- `access_matrix.json` — per-entity: RLS shape × staffDataRead tier × staffEntityWrite ops × admin-gate × client-proxy flag (155 entities)
- `entity_rls_table.md` — human-readable RLS table for estimator-surface entities
- `function_auth_matrix.md` — every function touching protected entities → auth mechanism + line
- `findings.md` — candidate findings F-1..F-9 with file:line
- `extract_rls.py`, `staffDataRead_entry.ts`, `base44_functions_staffEntityWrite_entry.ts`, `base44_shared_signShopSession.ts`, `base44_shared_fleetStaffSession.ts`, `base44_shared_proofShareLinkModel.ts`, `base44_functions_customerPortalAction_entry.ts`, `base44_functions_boardFeed_entry.ts`, `base44_shared_boardFeedFields.ts`, `fn_workOrderTraveler.ts`, `fn_updateEstimateRevisionAudit.ts`, `fn_ensure{EstimateLifecycleRevision,BuilderPriceRevision,CustomerSummary}.ts`, `src_api_base44Client.js`, `src_staffEntities.js`, assorted `fn_*.ts` evidence copies.
