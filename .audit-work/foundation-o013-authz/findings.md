# O-013 Candidate Findings

Severity key: **[AUTHZ]** = breaks an O-013 invariant · **[FUNC]** = fail-closed functional bug (control holds, feature dead) · **[NOTE]** = design exception / observation.

---

## F-1 · [AUTHZ] `fileBridgeMaintenance` — unauthenticated anonymous write path to backend-only entities

- **Where:** `base44/functions/fileBridgeMaintenance/entry.ts` (whole handler, `Deno.serve` at l.21); invoked by `base44/workflows/File Bridge Maintenance.jsonc` (`args:{}` — **no `_workflow_capability`**).
- **What:** No session, capability, HMAC, or credential check anywhere in the file. An anonymous invoke runs `asServiceRole` mutations: `FileBridgeCommand` update/deleteMany (l.36,46,52,94), `FileBridgeHealth` update (65), `FileBridgeEvent` deleteMany+create (75,268), `FileBridgeRecent` deleteMany (81), `FileBridgeChunk` deleteMany (86), `FileIndex` update (113,263), `CustomerFolderLink` create/update (150,216,221), plus a 2,000-row `Customer` read (l.127). `CustomerFolderLink` is backend-only RLS and per `AGENTS.md` must never be in staff gateways.
- **Contrast:** `checkDeadlineReminders` verifies `_workflow_capability` via `shared/workflowInvocationCapability.ts:38-49` (SHA-256 + constant-time compare) — the intended scheduled-function pattern this file lacks.
- **Impact:** anonymous side-effect writes incl. customer-folder auto-link creation + mass deletes; bounded/idempotent (time-windowed sweeps, no caller payload) but still an anonymous write endpoint. Also a free request amplifier on the shared entity budget.
- **Scope:** FileBridge module — **outside the active Estimator scope**; reported because O-013 asks for "no anonymous writes to backend-only entities" app-wide.
- **Fix sketch:** add `await hasWorkflowInvocationCapability(body,'fileBridgeMaintenance')` gate (register its hash + add capability to the workflow args), or require an admin session.

## F-2 · [FUNC] `staffEntities.AllInOneEstimate.update` — 3 dead write call sites (server allows only `updateMany`/`delete`)

- **Where:** `src/pages/EstimateDetail.jsx:319`, `src/pages/EstimatorQueues.jsx:89`, `src/pages/EstimatorQueues.jsx:193`.
- **What:** `staffEntities.update` maps to `staffEntityWrite` op `"update"` (`src_staffEntities.js:228-229`); `WRITE_OPS['AllInOneEstimate'] = new Set(['updateMany','delete'])` (`staffEntityWrite:11`) → all three calls 403.
  - `EstimatorQueues.jsx:89` — `quote_expired` flag write is `.catch(()=>{})`-swallowed → **quote expiry marker silently never persists**.
  - `EstimatorQueues.jsx:193` — bulk `status` update always fails.
  - `EstimateDetail.jsx:319` — secondary-estimate status write throws.
- **Impact:** fail-closed; no authz issue. Estimator features silently broken.

## F-3 · [FUNC / REQUIRES-LIVE-PROBE] `updateEstimateRevisionAudit` — caller-scoped read of backend-only entity makes `complete_manual_revision` unreachable

- **Where:** `base44/functions/updateEstimateRevisionAudit/entry.ts:41` (`const EstimateUser = base44.entities.AllInOneEstimate;` — caller context, not `asServiceRole`), used at l.65.
- **What:** `AllInOneEstimate` read RLS is `__allinoneestimate_backend_only__` → `.catch(()=>null)` → `!estimate?.id` → 404 at l.66 for every caller type (EmailGate anonymous context AND platform users). `attach_delivery_evidence` (l.111+) uses `RevisionService` (service role) correctly.
- **Impact:** `complete_manual_revision` is a dead action unless runtime `base44.entities` semantics differ — confirm with live probe.

## F-4 · [FUNC] `EstimatorAuditPanel.jsx:49` — direct `AdminAuditLog` read bypasses client proxy → dead "admin" tab

- **What:** `AdminAuditLog` ∉ `STAFF_READ_ENTITIES` (`base44Client.js` 44-entity set) → raw `base44.entities` call → platform RLS `admin`-only → fails for EmailGate sessions (and is only staff-relevant via the ADMIN_READABLE tier of staffDataRead, which the raw call never reaches).
- **Note:** `AuditLog.jsx:32-33` reads `EstimateRevision`/`OpportunityActivity` — both proxied → fine.

## F-5 · [NOTE] `workOrderTraveler` — intentional public endpoint exposes `unit_cost`/`jurisdiction_fee_amount`

- **Where:** `base44/functions/workOrderTraveler/entry.ts:4-8` (documented public, WO-id = capability), field allowlists l.10-30 (`MATERIAL_FIELDS` includes `unit_cost`; `PERMIT_FIELDS` includes `jurisdiction_fee_amount`).
- **What:** Read-only, narrow projection by design for shop-floor QR travelers — but cost/fee fields ride along. Confirm the field list is an accepted exposure (printed travelers see them anyway).

## F-6 · [NOTE] `auth.me()` fallbacks accept any platform user — no role check

- **Where:** `updateEstimateRevisionAudit:35-37`, `ensureEstimateLifecycleRevision:102-104`, `ensureBuilderPriceRevision:101-103`, `ensureCustomerSummary:238-240`.
- **What:** On session failure they accept `base44.auth.me()` with no `role` check. If the platform-user population == staff, parity holds; if any non-staff platform account exists, it gains staff-tier mutation reach (CAS writes to `EstimateRevision`, `BuilderPriceRevision`, `CustomerSummary`).

## F-7 · [NOTE] `EstimateClipboardItem` — gateway wider than entity RLS

- `staffDataRead` `STAFF_READABLE` (l.13) grants **any staff** read-all, while the entity's RLS read role is `admin` only (create/update/delete `__admin_settings_backend_only__`), and it is not `OWNER_SCOPED` in the gateway. Low sensitivity (estimate scratch pads) but a documented RLS-vs-gateway mismatch — staff-tier reads of an admin-tier entity.

## F-8 · [NOTE] `invoicingAction` — no per-action role gates on financial mutations

- Session required (l.206) but `void_invoice`, `refund_payment`, `record_payment`, `issue_credit_memo`, `mark_sent` etc. are all staff-tier. Consistent with the staff-wide model elsewhere; confirm intent for AR-mutating actions.

## F-9 · [NOTE] Adjacent observations (out of estimator scope)

- `jurisdiction_research` — accepts any authenticated platform user (no role check).
- `fileBridgeSpike` — hardcoded probe-key function (throwaway; FileBridge scope).
- `EnhancedSipChecklist.jsx:827,874,1669,1709` — direct `base44.entities.WorkOrder` writes; `WorkOrder` RLS allows platform admin+user so platform sessions work, EmailGate fails closed. SIP/workflow module.
- `src/components/masterInventory/{FoundationMaterialDialog,MasterEquipmentTab}` — `base44.entities.FoundationInventory` raw reads; not client-proxied → EmailGate fail-closed (admin surface).
- `FoundationInventory` is intentionally staff-RLS-readable (`admin`+`user` read; admin writes) — **not** a backend-only entity; both gateways also expose it with CAS anchoring.
- `WorkOrder` RLS is intentionally `admin`+`user` c/r/u (delete admin) — the broadest staff-RLS entity in the estimator chain; all staff writes still route through `staffEntityWrite` (op set `create`,`updateMany`) or dedicated functions.
