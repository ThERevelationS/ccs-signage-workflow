# ESTIMATOR MASTERPLAN — CoreBridge V2 Parity Buildout & Hardening

**Purpose:** a self-contained, resumable execution ledger for bringing the CCS estimator to full CoreBridge V2 operational parity while preserving CCS's superior architecture (linked entities, modern UI, server-persisted views). Designed for unattended execution across many sessions.

**Source documents:** `COREBRIDGE_MAP.md` (parity spec, §13 build order, §14 non-goals), `.audit-work/ESTIMATOR_BACKLOG.md` (500-item predecessor, ~470 done), linkage-audit findings (2026-11-02 session).

**Approved scope (Brett, 2026-11-02):** full lifecycle (estimator core + opportunity workspace + WO + invoicing/financials + queues + portal + reports) fully incorporated into existing systems. Mail-dependent work built email-ready, off by default. Full accounting parity incl. QBO (credential-gated items marked BLOCKED-CREDENTIALS). Agent may deploy functions + write `ZZ`-marked test records + checkpoint per phase. No site publish. No edits to real customer/production records.

---

## 0. EXECUTION PROTOCOL — how any session runs this plan unattended

### 0.1 The ledger contract
- **This file is the ledger.** Every item carries a state marker in brackets: `[OPEN]`, `[DOING]`, `[DONE]`, `[BLOCKED-CREDENTIALS]`, `[BLOCKED-EXTERNAL]`, `[DEFERRED]`.
- On session start: find the first `[OPEN]` item in dependency order (see §3 map). Work it. Mark `[DONE] + evidence` (one line: commit/checkpoint id, verify output, date). Never leave `[DOING]` at session end — either complete or revert to `[OPEN]` with a note.
- Items are numbered `<WS>-<NN>` (e.g. `F-14`). Never renumber completed items.
- When an item discovers a real defect unrelated to itself, log it under `WS-Z` (discovered-defects parking lot) rather than expanding scope mid-item.
- New items append at the end of their workstream — never insert mid-list (keeps numbering stable).

### 0.2 Per-item work cycle
1. **Read remote first.** Remote sandbox is source of truth: `npx base44@latest sandbox read <path> --app-id 68dfcc5e57bbbc35387da97c --branch main --json`. Never edit from a stale local file; diff local vs remote before every edit.
2. **Implement** following existing conventions (`AGENTS.md`): `authenticateSignShopSession` + service-role entities in functions; `createFoundationRecordWithRecovery`/`ensureIdempotentEntityCreate` for creates; `replaceFoundationFieldsIfUnchanged`/CAS anchored on `updated_date` for guarded writes; `loadAllEntityRows` for list reads; ESLint-clean JSX, compact style.
3. **Local verify** — run the item's verify step (hardening suites in `scripts/`, esbuild syntax check, or a targeted node test). Must pass before remote writes.
4. **Remote write** — `sandbox edit` (existing files, old_text/new_text in **CRLF** — matcher works on stored bytes; `sandbox read` normalizes to LF) or `sandbox write --overwrite` via stdin. Verify every write landed by re-reading — writes can 502 yet land, or 200 yet no-op.
5. **Deploy functions when the item ships backend code**: `npx base44@latest functions deploy <name> --app-id 68dfcc5e57bbbc35387da97c --json` (uploads local file + shared imports — ensure local == intended remote state first). **Verify rotation via a response-shape marker** (a new response field/value), never by timing — workers rotate staggered, observed up to ~50min.
6. **Live verify** — the item's verify step against live data where feasible (staff function calls via `.audit-work/fn-call.mjs` + `.audit-work/creds.mjs`; browser via mcp-playwright at `localhost:5174` or the preview URL).
7. **Mark DONE with evidence line.**

### 0.3 Safety rails (hard rules for unattended operation)
- **Never publish/deploy the site** (`sandbox checkpoint` is allowed and required per phase; `deploy`/`retry-build`/`publish` are forbidden).
- **Never edit real business records** — only `ZZ E2E`-prefixed test records, always with `creation_request_key` for idempotency. Delete test records only via the cleanup runbook (§Z-04).
- **CAS writes always carry expected baselines**; `expectedFields` keys must equal `nextFields` keys (the `revoke_link`/`bumpOpen` defect class — see L-01 audit item).
- **`expected` values must match stored representation** — unset link fields persist `null`, not `""` (the `?? null` fix). Prefer `expectedFoundationFields(record, desired)` which passes raw stored values.
- **No blind retries on writes** — on failure, read the record first; distinguish failed-op from partially-completed-op (the half-linked handoff pattern).
- **Rate-limit discipline**: entity reads share ~140/60s per-caller + a whole-app rolling volume cap. Batch calls, reuse tokens, never run browser pollers during smoke tests, back off 60-120s on "rate-limited"/"entity read traffic" errors. If the app cap is saturated by outside traffic, park the item `[OPEN]` and move to a local-only item rather than hammering.
- **Stop conditions** — park and end the session if: 3 consecutive unrelated live-call failures, auth rejects a fresh token twice, or any destructive operation is required to proceed.
- **Silent-swallow rule**: `.catch(() => null)` on writes is banned for new code; surface as `*_warning` response fields (the `intake_link_warning` pattern).
- **Worker rails (parallel mode)**: workers never touch the ledger, claims, PROGRESS_LOG, AGENTS.md, or hooks; ZZ test data + all entity writes = orchestrator-only (L3); worker scope violations → orchestrator reverts immediately.

### 0.4 Phase gates
- After each workstream completes (or hits a dependency gate): `sandbox checkpoint "<ws>: <what shipped>"`, append a phase summary to `PROGRESS_LOG.md`, run `node scripts/validate-opportunity-workspace.mjs` + relevant hardening suites, and confirm `git status` shows no unrelated churn.
- **Parallel mode:** a phase gate also requires all claims integrated or released — zero `[DOING]` — before the checkpoint.
- A workstream is only complete when every `[OPEN]` in it is `[DONE]`/`[BLOCKED-*]` with a reason.

### 0.5 Context budget discipline (for very long runs)
- Research once, cite file+line in the item's evidence, don't re-read whole files per item.
- Prefer `grep`/`find` tools over shell `grep`/`rg`/`find` (per shell policy).
- When a function file exceeds ~100KB, read targeted ranges (the entry.ts files are huge).

### 0.6 PARALLEL EXECUTION MODEL — orchestrator + subagent workers

This plan runs as **one orchestrator session + up to ~8 subagent workers** (`run_subagent` / `subagent_general`, background where possible). The orchestrator is kept alive by `.devin/stop-masterplan.ps1` (Stop hook, gated by `.devin/MASTERPLAN_SESSION_ACTIVE`, ends when `.devin/MASTERPLAN_DONE` exists).

#### Roles
- **Orchestrator** (the hooked session): the ONLY writer of ledger marks, `.masterplan-claims/claims.jsonl`, `PROGRESS_LOG.md`, `AGENTS.md`, hooks. Owns **all remote writes** (`sandbox edit`/`sandbox write`), **all `functions deploy`**, **all live verification** (fn-call, entity reads/writes, browser tests), checkpoints. Dispatches work and integrates results; may take its own claimed item while workers run.
- **Workers**: receive a bounded brief (below); write ONLY local files in their owned set; MAY run local commands (`node scripts/*`, esbuild) and `sandbox read` (source reads are bridge API — they don't touch entity budget); may NOT deploy, push remote, touch entities, run live calls, or edit orchestrator-owned files.

#### Worker brief contract — every dispatch carries
```
ITEM: <ID> — <title + acceptance copied verbatim from the ledger>
OWNED FILES: <explicit allowlist of paths the worker may create/edit>
NEW FILES ALLOWED IN: <dirs>
FORBIDDEN: all other entities, other functions, shared modules not listed,
           App.jsx/pagesConfig/nav files, deploys, remote writes, live calls,
           entity reads/writes, browser, ledger/claims/PROGRESS_LOG/AGENTS.md/hooks
RULES: AGENTS.md conventions — service-role entities in functions,
       idempotent creation_request_key creates, CAS anchored on updated_date,
       expectedFields keys == nextFields keys, unset link fields persist null
       (never ""), loadAllEntityRows for lists, NO .catch(() => null) on write
       paths — surface *_warning fields instead.
VERIFY: <exact local command(s) that must pass>
EVIDENCE: final message = {files_touched, verify_output, deviations, open_questions}
```

#### Lanes (per-item default set in each workstream header)
- **L1 local-only** — suites, docs, pure new shared modules, fixtures, standalone components: freely parallel up to cap.
- **L2 sandbox-disjoint** — per-entity `.jsonc`, per-function dirs, owned src files: parallel-safe. Worker produces LOCAL file state; the orchestrator pushes remote writes sequentially (`sandbox write` full-file — avoids the CRLF-matcher problem) after verify.
- **L3 live-serialized** — deploys, fn-call, entity reads/writes, browser: orchestrator-only, one at a time, rate-budget disciplined.

#### Claiming
- Orchestrator picks next `[OPEN]` items in dependency order whose owned-file sets are **pairwise disjoint**, marks them `[DOING w-N]`, and appends one JSON row per claim to `.masterplan-claims/claims.jsonl` (append-only, orchestrator-written): `{ts, worker, item, owned_files, status: claimed|integrated|failed|released}`.
- Workers never self-select items and never edit the ledger.

#### Integration loop
1. Worker returns → orchestrator diffs `git status` vs the OWNED set.
2. **Out-of-scope changes** → orchestrator reverts those files, re-briefs (max 2), then `[BLOCKED-EXTERNAL]` with a note.
3. In-scope → run the item's local VERIFY → pass → orchestrator remote-writes the owned files → marks `[DONE]` + evidence line.
4. Worker crash/timeout → claim released → item back to `[OPEN]`.

#### Concurrency policy
- Default cap **8 concurrent workers**; orchestrator halves on repeated worker timeouts or local-resource symptoms; never exceeds cap.
- Background subagents preferred; orchestrator spends idle dispatch time on L3 work (deploys, live verification of already-integrated items) rather than idling.
- If >half the pool fails on **2 consecutive batches** → orchestrator pauses dispatch, checkpoints, writes an incident note to PROGRESS_LOG.

#### Deploy batching
- `functions deploy` is orchestrator-only and **batched** per workstream-phase (or every ~10 integrated backend items, whichever first) — deploys upload shared imports, so batching prevents pushing a sibling worker's half-finished shared file.
- Rotation verified via response-shape markers (observed ~50min worst case), never by timing.

#### Live telemetry (drives the dashboard)
- Orchestrator appends one JSON row per action to `.masterplan-claims/events.jsonl` (append-only): `{ts, type, item, ws, detail, note}` where `type` ∈ `dispatch|integrate|verify|deploy|checkpoint|live_call|warning|fail|scope_violation|phase_gate` (`ws` is derived from the item letter when omitted).
- **Workers append one plain-text progress line per meaningful step to `.masterplan-claims/worker-<id>.log`** — the ONLY file in `.masterplan-claims/` a worker may write, and only its own. Format: `HH:MM:SS <item> :: <what I'm doing>` (e.g. `14:32:07 A-07 :: read tierMatrix.mjs, starting TDD for precedence`). This is what makes the dashboard show real live activity rather than just claim events — treat it like narrating your work; a line on every read/write/verify milestone. The orchestrator truncates the file to its last ~20 lines on each integration so logs stay bounded.
- The dashboard (`node scripts/masterplan-serve.mjs` → http://localhost:5170) reads claims + events + worker logs + the ledger: per-workstream live consoles (last 4 lines each), worker cards, bars, event feed — pushed over SSE on every file change, so what you see is what just happened.
- Event/log emission is cheap and mandatory — every dispatch/return/deploy/checkpoint/failure gets a row and every worker step gets a line. If a workstream's console goes quiet mid-run, that worker is silent — investigate, don't assume it's working.

#### Shared-choke-point serialization
Only the orchestrator (or a worker EXPLICITLY briefed for that file) edits: `base44/shared/*` existing files (new shared files are worker-safe), `src/pages/App.jsx`/`pagesConfig`/nav files (route registration choke point), `ESTIMATOR_MASTERPLAN.md`, `PROGRESS_LOG.md`, `.masterplan-claims/**`, `AGENTS.md`, `.devin/**`. Route registration for worker-built pages is an orchestrator integration step.

---

## 1. CURRENT STATE — verified inventory (don't rebuild)

### 1.1 Already built and live-verified (2026-11-02 e2e smoke + earlier backlog)
- Full chain `Customer→Intake→Opportunity→EstimatingRequest→Estimate→sent→approved→WorkOrder→Invoice→Payment` — every link stamped and resolving; opportunity workspace + Customer360 aggregate all 7 entity types.
- `WorkOrder.products[]` carries the CoreBridge product-level model: `operational_status`, `operational_substatus`, `customer_facing_status`, `fulfillment_state`, `design_due_date`, `product_due_date`, `hard_due_date`, `proof_status`, `proof_file_url/name/version`, `proof_approved_version`, per-product audit fields.
- Conversion-by-product-approval (`allProductsOperationallyApproved`), deposit gate, walk-in counter sale, per-user prefs, `SavedQueueView` components (`src/components/queues/`), notification engine (`notificationAction`: record/evaluate_triggers/daily_digest/snooze/dismiss/preferences; `Notification` entity with category/severity/deep_link/dedupe_key/meta).
- `purchaseOrderAction`: list/get/create/update/mark_sent/receive_items/mark_invoiced/mark_paid/cancel — full PO lifecycle.
- `ReconciliationBatch` entity (batch_number, location, expected/collected/cash_adjustment/variance/payment_ids/method_totals/status) + `manageReconciliation` (bootstrap/get_batch/create_batch…).
- `PricingTierMatrix` (customer_tier × category markup_pct + per_unit_breaks qty×unit_price), `MachineRate` (setup_minutes, runtime/maintenance rate, waste_pct), `LaborLevel` (hourly_rate, categories, rank), `MarkupTier`, `PricingMode`, `TaxGroup`, `ChangeOrder` (full chain links), `NotificationPreference`, `EmailNotificationSettings`, `GlobalSettings`.
- CAS/recovery/idempotency layer: `opportunityFoundationPersistence.mjs`, `estimatePersistence`, `estimateSaveRecovery`, `estimateMutationGuard`, `workOrderSyncPersistence`.
- Fixes shipped 2026-11-02: `?? ""`→`?? null` CAS baselines ×2 (`opportunityWorkspaceAction` 1704/2100), WO upstream links (`workOrderConversion.js` stamps `opportunity_id`/`estimating_request_id`), `intake_link_warning` instrumentation, `workOrderCache` stable-empty fix (update-depth loops on 6 pages), `badge.jsx` forwardRef (app-wide tooltip anchoring), `EstimatorCustomers` guarded load, `CustomerPortal` invoice-guard, `EstimatorTools` dedup key, `customerPortalAction` revoke/bumpOpen CAS baselines.
- Test/verification infrastructure: ~40 hardening suites in `scripts/` (all `PASS <name>`), `validate-opportunity-workspace.mjs`, `nav-wiring` check, `.audit-work/` harness (fn-call, waterfall, sweeps), playwright-core with Chromium at `~/AppData/Local/ms-playwright/chromium-*`.

### 1.2 Known-open tail from ESTIMATOR_BACKLOG.md (carried into WS-L)
- ~22 unchecked §20 items (476–500) incl. `jurisdiction_research` rename (publish blocker, cross-module flag).
- 3 BLOCKED on `sendEmail` disabled → converted to the email-ready adapter workstream (WS-H).
- `due_date` day-boundary bug family (item 492) on CompletedReports/FeatureReports/Opportunities/Financials/CustomerPortal.

### 1.3 Confirmed non-goals (COREBRIDGE_MAP §14 — hard constraints)
- No single-record collapse of estimate+order+invoice; no browser-local queue pins; no flat status enums (keep CCS stage model + add product layer); no CB UI chrome cloning; no franchise/royalty; no iframe/tooltip-driven editing UX.

---

## 2. WORKSTREAM MAP & DEPENDENCY GRAPH

```
WS-A Entities/schema foundations ──┬─► WS-B Product ops depth ──► WS-C Queues ──► WS-D Job workspace
                                  ├─► WS-E Proof & fulfillment ──► WS-D
                                  ├─► WS-F Pricing engine (biggest)
                                  ├─► WS-G CRM depth ────────────► WS-H Comms automation
                                  └─► WS-I Accounting ───────────► WS-J Reports
WS-K System/settings & admin ───── (parallel)
WS-L Backlog tail ─────────────── (parallel, low-risk)
WS-M Rate-limit & performance ─── (parallel, precedes heavy live verification)
WS-N Verification infra ────────── (runs throughout; final gate = full sweep)
WS-Z Parking lot (discovered defects)
```

Dependency notes: A (schema fields) precedes B/E/F/G/I. F (pricing) is the largest cluster — internally ordered: catalog model → tier engine → formula engine → machine/labor costing → import. I precedes J (reports consume GL + reconciliation data). H consumes G's typed events + customer contact roles.

---

## WS-A — ENTITY/SCHEMA FOUNDATIONS
*Extend schemas to carry the fields downstream workstreams write. All additive (new optional fields); no renames/deletes on live fields.*

**Default lane:** `L2` (entities/function dirs disjoint; orchestrator pushes). Exceptions: `A-23` boardFeedFields regen → `L3`; `A-24` audit suite → `L1`.

- [ ] `A-01` **[OPEN]** `IncomeAccount` entity — GL-coded income accounts (code, name, parent_account, status). Seed with CoreBridge-style 4000-series defaults via `ensureNewIncomeAccount`-style idempotent seed in a new `accountingAdminAction`. | Verify: entity exists, seed action creates ≤17 rows w/ creation keys, re-run = 0 dupes.
- [ ] `A-02` **[OPEN]** `COGSAccount` entity — same shape (5000-series). Same admin action. | Verify: same.
- [ ] `A-03` **[OPEN]** `BuilderPart` + `PartTemplate` — add `income_account_code`, `cogs_account_code`, `pricing_template_id`, `part_group_id`, `design_lead_days`, `product_lead_days`, `labor_level_id`, `machine_ids[]`, `taxable`, `separate_on_invoice`, `double_sided`, `min_charge`, `parent_sizes[]`, `vendor_id`, `mfg_part_number`, `size_discounts[]`. | Verify: schema fields present; `staffEntityWrite` round-trips one part with all fields.
- [ ] `A-04` **[OPEN]** `PricingTemplate` entity — named qty-break×tier margin charts by unit category (17 CoreBridge templates as seed reference shapes). Fields: name, unit_category, breaks[] (qty, customer_tier→markup_pct map), market_based flag. | Verify: CRUD via staffEntityWrite or new admin action.
- [ ] `A-05` **[OPEN]** `PartGroup` entity — shared catalog config inheritance (distinct from estimate-internal `BuilderPartGroup` — name it `CatalogPartGroup` to avoid the §2 collision). Fields: name, description, shared_defaults (JSON of inheritable fields), part_ids[]. | Verify: create + attach 2 parts; inheritance resolver returns merged config.
- [ ] `A-06` **[OPEN]** `PricingModifier` + `ModifierOption` entities — custom properties (typed inputs, `can_use_in_pricing`), variable rates (label/retail/cost/per-unit), formula text, flags (include_setup_fee, min_charge, affects_waste, inventoried_part_type), pricing_tier link, display order. | Verify: CRUD + one formula-safe eval smoke (see F-09 sandbox).
- [ ] `A-07` **[OPEN]** `GlobalPricingTier` entity — named shared rule sets (Standard Tier, Painting, Retail Parts for Modifiers analog). Fields: name, rules[] (tier→markup/market). | Verify: CRUD.
- [ ] `A-08` **[OPEN]** `Machine` entity (unified registry beyond `VinylMachine`) — machine_type enum (roll_fed/sheet_fed/other), cost_per_hour, profiles[] (speed settings), disposable_cost_per_unit, setup_cost, setup_minutes, labor_pct, weighted_multiplier, margin_chart_id, income_account override. | Verify: CRUD; VinylMachine rows remain untouched.
- [ ] `A-09` **[OPEN]** `TaxAgency` entity — agency registry (name, rate, jurisdiction, gl_account, reporting_period). Extend `TaxGroup` usage to reference agency. | Verify: CRUD + estimate tax summary can resolve agency.
- [ ] `A-10` **[OPEN]** `Customer` — add `industry_type`, `origination_path` (hierarchical "Networking Group : BNI - Carl - Tier 1"), `customer_type`, `status` (Lead/Prospect/Active/Inactive), `auto_inactive_months`, `master_account_id`, `po_required`, `credit_terms_days`, `credit_limit`, `tax_exempt_reason`, `tax_exempt_id`, `tax_exempt_expires`, `in_store_credit_balance`, `pricing_tier`, `warning_flags[]`. | Verify: schema additive; one customer updated round-trip.
- [ ] `A-11` **[OPEN]** `CustomerContact` — add `role` (primary/billing/site), `email_groups[]`, `contact_status` (active/deactivated/do_not_mail/hot_prospect/referral). | Verify: roles round-trip; Customer360 picks roles in contact lists.
- [ ] `A-12` **[OPEN]** `CrmEventType` entity — typed event taxonomy seed (Call: AR/Collections/EstimateFollowUp/Prospecting/Proof; Email: Estimate/FollowUp; Visit: Installation/Sales/SiteSurvey; Consultation; ReDoWork). Fields: channel, label, sort, is_custom. | Verify: seed + list.
- [ ] `A-13` **[OPEN]** `OpportunityActivity`/CRM event — add `event_type_id` (typed link to CrmEventType), `completed_at`, `completed_by`, `due_date`, `assigned_to`, `outcome`. | Verify: typed event created + completed round-trip.
- [ ] `A-14` **[OPEN]** `Vendor` entity — name, contacts, terms, gl_default, communication prefs, `statement_email`. Extend `PurchaseOrder.vendor_name`→`vendor_id` (keep name for display). | Verify: CRUD + PO can resolve vendor_id.
- [ ] `A-15` **[OPEN]** `Payment` — add `portal_source` flag ("added from Customer Portal" event class), `deposit_applied_to_invoice_id`, `reconciliation_batch_id` (exists), `gl_memo`. | Verify: schema; portal payment path stamps source (portal payment exists — check `customerPortalAction` pay path first).
- [ ] `A-16` **[OPEN]** `Invoice` — add `salesperson`, `entered_by`, `income_account_splits[]` (computed from line parts), `statement_batch_id`. | Verify: schema + `create_from_estimate` stamps salesperson from estimate chain.
- [ ] `A-17` **[OPEN]** `WorkOrder.products[]` — add `responsibility` (department/person/group + color), `priority` (1–99), `quick_tags[]` (persistent custom substatus), `assigned_to`, `design_time_seconds`, `production_time_seconds`. | Verify: schema + one WO product updated via CAS path.
- [ ] `A-18` **[OPEN]** `AllInOneEstimate` — add `sales_center` (location), `po_number`, `entered_by_display`, `follow_up_date`, `payment_terms_label` (e.g. "Balance Due Upon Receipt"), `internal_discount`, `fee_lines[]` (shipping/postage/discount w/ taxable flag + income account). | Verify: schema + one estimate round-trips.
- [ ] `A-19` **[OPEN]** `ReportDefinition`/`FeatureReport` — check `manageFeatureReports` schema coverage for the report catalog in WS-J; add missing fields (category, parameters schema, default_filters, export_formats). | Verify: definitions persist parameterized reports.
- [ ] `A-20` **[OPEN]** `SavedQueueView` — confirm entity backing (components exist; check `savedViewsPersistence.js` target). If localStorage-only, create `SavedQueueView` entity (user_email, page, name, filters JSON, pinned, sort) + migrate persistence. | Verify: saved view survives cross-browser read.
- [ ] `A-21` **[OPEN]** `GlobalSetting` keys — `hoursOfOperation` {sales_center_hours[], production_hours[]} (two clocks for deadline vs follow-up math), `emailDelivery` {enabled, default_from, authorized_domains[], from_salesperson_toggle}, `deadlineRules` {recalc_on_proof_approval, respect_hard_dates}, `creditTermsDefaults`, `autoInactiveMonths`. | Verify: settings round-trip via GlobalSettings write path.
- [ ] `A-22` **[OPEN]** `OrderFee` shape — shipping/postage/discount fee lines on estimate+invoice with `taxable` + `income_account_code`. (Concretize inside A-18 or its own entity — decide during implementation; keep one source.) | Verify: fee line flows estimate→invoice w/ account code.
- [ ] `A-23` **[OPEN]** `boardFeedFields.ts` regeneration — after all A-items land, run `node scripts/build-board-feed-fields.mjs` + redeploy `boardFeed` (per AGENTS note — required after ANY entity-schema change). | Verify: script runs clean; boardFeed returns projected fields incl. new ones where feedable.
- [ ] `A-24` **[OPEN]** Schema additive audit — confirm every A-field added is optional/nullable; write `scripts/test-schema-additions.mjs` asserting each new field name+type in each entity file. | Verify: suite PASS; no required-field additions anywhere.

## WS-B — PRODUCT OPERATIONAL MODEL DEPTH
*CoreBridge §3/§7: product status × substatus × fulfillment × responsibility × priority × dual due-dates, already scaffolded on `WorkOrder.products[]` — now wire it through every surface.*

**Default lane:** `L2`. `B-01`/`B-07` new shared modules are worker-safe `L1` but orchestrator pushes them (shared-file choke); live verifications → `L3`.

- [ ] `B-01` **[OPEN]** Operational-status enum lock — freeze `operational_status` vocabulary to the CB WIP set: `order_review`, `site_survey`, `awaiting_customer_action`, `awaiting_proof_approval`, `permitting`, `proof_approved`, `in_production`, `install_removal_only`, `quality_control`, `design_review`, `service_repair` + `built`/`completed`/`voided` wrappers. Put the map in `base44/shared/productStatusModel.ts` (shared w/ frontend). | Verify: shared module exports status set + stage map; both function + UI import it.
- [ ] `B-02` **[OPEN]** `customer_facing_status` label map — per-status display text (e.g. "WIP: Awaiting Proof Approval"→"Requires Proof Approval") in the same shared module; portal + customer-facing surfaces render the label, never the internal status. | Verify: portal shows mapped label on a test product.
- [ ] `B-03` **[OPEN]** `operational_substatus` quick tags — persistent custom tags on products (create/rename/delete in product editor + queue filter). Store on `products[].quick_tags[]` (A-17) + a `ProductSubstatus` registry entity for the picklist. | Verify: tag persists, appears in filter, registry CRUD.
- [ ] `B-04` **[OPEN]** `responsibility` model — department/person/group + color on products; drives queue grouping + color chips. Registry `Responsibility` entity (name, type, color, members[]). | Verify: assign + queue groups by responsibility.
- [ ] `B-05` **[OPEN]** Numeric `priority` 1–99 on products + queue sort-by-priority. | Verify: sort order correct in ProductQueue.
- [ ] `B-06` **[OPEN]** `design_due_date` vs `product_due_date` split in the product editor UI + queue columns (two distinct date columns, over-due highlighting per date). | Verify: dates edit independently; columns show both.
- [ ] `B-07` **[OPEN]** Due-date engine — per-part `design_lead_days`/`product_lead_days` (A-03) with min/standard/additional tiers; `product_due = max(part leads)`, `order_due = max(products)`; "Recalculate Product Due Date upon Proof Approval" respects `hard_due_date` and only pushes forward. Implement in `base44/shared/dueDateEngine.ts` + `manageWorkOrderProducts` action. | Verify: unit suite `scripts/test-due-date-engine.mjs` PASS (hard date hold, proof-recalc push-forward, max-of-parts).
- [ ] `B-08` **[OPEN]** `hard_due_date` protection — UI badge + server-side rule blocking auto-recalc past it (in the engine + product update CAS). | Verify: hard-dated product never auto-moves.
- [ ] `B-09` **[OPEN]** Product-scoped job time tracking — start/stop timer on products writing `design_time_seconds`/`production_time_seconds` (A-17) + `WorkOrderTimeEntry` records (user, product, start/stop, source). Reuse TimeClock patterns without touching the TimeClock module's scope rules. | Verify: timer creates entry, summary per product/user/department matches.
- [ ] `B-10` **[OPEN]** Audience-routed product notes — `products[].notes[]` with channel (sales/design/production/customer/vendor); each surface shows its channel; customer channel surfaces to portal. | Verify: notes route correctly across JobWorkspace/portal/queue detail.
- [ ] `B-11` **[OPEN]** Status-override required-reason — `GlobalSettings.statusOverrideReasons[]` (cancel-estimate reasons + custom); override dialog forces reason when configured; reason lands in product audit trail + activity feed. | Verify: override without reason rejected when list non-empty.
- [ ] `B-12` **[OPEN]** Per-product audit trail view — product history tab (status/substatus/proof/date/assignment changes w/ actor+timestamp) fed from `OpportunityActivity`/dedicated `ProductActivity` rows. | Verify: each change lands a typed event; history renders chronologically.
- [ ] `B-13` **[OPEN]** `syncWorkOrderStage` → product-driven order stage — WO `current_stage` derives from products' operational statuses (worst-first); keep manual override w/ audit note. | Verify: all-products-in-production flips WO stage; single straggler holds it.
- [ ] `B-14` **[OPEN]** Estimate→WO product seeding — conversion maps estimate sections/products onto `products[]` with initial operational_status=`order_review`, dual dates from part leads (B-07), responsibility from estimate defaults. | Verify: converted WO has populated product rows (fresh ZZ convert).
- [ ] `B-15` **[OPEN]** Customer-visible product status on portal — portal "Your order" view lists products w/ customer-facing labels (B-02) + proof approval actions (E-xx). | Verify: portal renders product rows + labels.

## WS-C — SHARED QUEUE SYSTEM
*§4: CB's home = counters + filtered queues with a shared filter bar. CCS has per-stage queues; make them product-level with the full CB filter set + server-saved views (better than browser-local).*

**Default lane:** `L2`. `C-01` QueueFilterBar + `C-02`/`C-03`/`C-06`/`C-08`/`C-10` new files → `L1`; `C-04`/`C-05`/`C-07` mount into existing stage pages → `L2` per-page disjoint; `C-09` feed function verify → `L3`.

- [ ] `C-01` **[OPEN]** `QueueFilterBar` shared component — machine, part category, parts, designer, date presets (Past Due / Today / Tomorrow / This Week / Next 7 / Rush / hard-dates-only), substatus, responsibility, assigned-to, salesperson, entered-by, free search, page size. Stateless: takes filters + emits onChange. | Verify: mounts on Design/Estimating/Fabrication/InstallationDeliver/Production + EstimatorQueues without page-specific forks.
- [ ] `C-02` **[OPEN]** `ProductQueue` rows at product granularity — each row = order# + product position ("INV-14022 3/3"), Product, Company, Product Name, Status/Substatus, both due dates, responsibility color, priority. Data path: WO `products[]` denormalized or a `productQueueFeed` function projection. | Verify: a WO with 3 products shows 3 rows; fields match spec.
- [ ] `C-03` **[OPEN]** Server-saved views via `SavedQueueView` (A-20): save/rename/pin/delete per user per page; views apply through QueueFilterBar; per-session persistence fallback. | Verify: saved view round-trips through the entity; pin ordering stable.
- [ ] `C-04` **[OPEN]** Queue counters — per-module home counts (matching current estimator tiles + CB counters: awaiting proof, past due, rush, unassigned). Counters from same feed (no extra entity reads — reuse feed payload). | Verify: counts == filtered row counts.
- [ ] `C-05` **[OPEN]** Proof lookup on queues — proof status chip + preview popover per product row (CB parity). | Verify: chip shows current proof_version + approval state.
- [ ] `C-06` **[OPEN]** Queue prioritization — responsibility grouping headers + priority sort + color (B-04/B-05). | Verify: grouped render matches responsibility order.
- [ ] `C-07` **[OPEN]** Auto-refresh with budget discipline — queues refresh on a slow timer ONLY when tab visible, using the feed's delta cursor/`updated_since` if available; NEVER poll faster than the existing boardFeed cadence. | Verify: no `entity_list` budget regression (feed stays within projection + cache).
- [ ] `C-08` **[OPEN]** Filter state in URL — queues serialize filters to query params (deep-linkable + back-safe). | Verify: reload restores filters; nav-wiring test unaffected.
- [ ] `C-09` **[OPEN]** `productQueueFeed` backend projection — add to an existing read function (boardFeed or new `queueFeed`) returning only queue-needed fields (A-23 regeneration after). | Verify: payload < full WO row; fields sufficient for C-02..C-07.
- [ ] `C-10` **[OPEN]** My-queue personalization — "assigned to me" preset + per-user default view (ties to item 481). | Verify: default view applies on first load.

## WS-D — JOB WORKSPACE DEPTH
*§5: one screen = header + products + waterfall + history + payments + actions. JobWorkspace exists; deepen to CB detail parity.*

**Default lane:** `L2` — serialize edits to `JobWorkspace.jsx` itself (one worker at a time on that file); `D-08`/`D-09` print templates → `L1` new files; portal/live checks → `L3`.

- [ ] `D-01` **[OPEN]** Order header parity — status, EST-/INV- numbers, payment terms label, PO#, salesperson, entered-by, sales center, order description, created/follow-up dates — all populated (A-16/A-18). | Verify: header renders all fields on a converted test WO.
- [ ] `D-02` **[OPEN]** Waterfall — Subtotal→Discount→Shipping→Postage→New Subtotal→Tax%→Total→Total Paid→Balance Due, computed server-side from invoice + fee lines (A-22). | Verify: waterfall math matches invoice totals to the cent.
- [ ] `D-03` **[OPEN]** Tabs — Products / Order Contact / Address Info / Notes / Order History / Overrides / Payments. Map existing JobWorkspace panels to the tab model where missing. | Verify: all seven tabs render with real data.
- [ ] `D-04` **[OPEN]** Order Details drawer — per-product price/cost/margin + "overridden during order entry" flags + order-level margin (profitability.js exists — extend display). | Verify: overridden product shows badge; margin math correct.
- [ ] `D-05` **[OPEN]** Order History actor-type coloring — staff black / customer green / vendor blue entries + downloadable history (CSV/print). Event sources: OpportunityActivity + product audit (B-12) + payment events + emails. | Verify: three actor classes render distinctly; download produces complete CSV.
- [ ] `D-06` **[OPEN]** Conversion event history entries — "Estimate Converted to Order - via product status (APPROVED)" style events written at conversion time (workOrderConversion writes a history event). | Verify: conversion lands a typed history row.
- [ ] `D-07` **[OPEN]** Actions row — Edit, Clone, Print/Email Invoice, Packing Slip, Invoice View Settings, Void, Enter Payment — wire existing actions + add Packing Slip + Invoice View Settings if absent. | Verify: each action works on a test WO; Void is guarded (role + confirm).
- [ ] `D-08` **[OPEN]** Packing Slip — printable slip (products, qty, notes, no prices) via `quotePdf.js` patterns. | Verify: print renders, no monetary fields.
- [ ] `D-09` **[OPEN]** Work-order print templates (5: Original, Streamlined Landscape, Landscape Spanish, v2, Invoice-styled) — extend `WorkOrderTraveler` print path with a template picker. | Verify: all 5 render on the same test WO; no layout breakage.
- [ ] `D-10` **[OPEN]** Product rows expand to parts — layout info (roll length used, waste sqft, # cuts), machine steps (machine + detail + use time), modifiers w/ answers, part text/notes, vendor cost/markup on vended parts, per-part proof upload. | Verify: expanded part shows all fields present in the estimate's part snapshot.
- [ ] `D-11` **[OPEN]** "Overridden during order entry" provenance — when a line price/qty is manually edited post-conversion, stamp `overridden` + actor + timestamp on the product; badge everywhere. | Verify: edit produces the badge + history row.
- [ ] `D-12` **[OPEN]** Job workspace deep links — `/JobWorkspace?wo=<id>` + queue/estimate/invoice cross-links resolve (deepLinks.js exists — extend for all entity types). | Verify: each entity card links to workspace + back.

## WS-E — PROOF WORKFLOW & FULFILLMENT
*§3/§7/§13.4-5: Awaiting Proof→Approved with portal approval + due-date recalc; then built→fulfillment→completed→closed, unpaid-completed legal.*

**Default lane:** `L2`. Portal/fulfillment live checks → `L3`.

- [ ] `E-01` **[OPEN]** Proof upload pipeline — per-product + per-part proof upload (file criteria list), `proof_version` increment, prior versions retained (`proof_history[]`). | Verify: upload bumps version, history retained, portal sees current.
- [ ] `E-02` **[OPEN]** `awaiting_proof_approval` → `proof_approved` transitions via portal (customer approval action) and staff (design review queue action); both write the same `proof_approved_version` + audit. | Verify: both paths work on test product; audit records actor class.
- [ ] `E-03` **[OPEN]** Proof-change requests — customer "request changes" action → status back to design + reason captured + notification to designer (H-xx). | Verify: status regresses, reason stored, notification fires.
- [ ] `E-04` **[OPEN]** Proof-approval due-date recalc (B-07 engine) — fires on proof_approved, respects `hard_due_date`, only pushes order date forward. | Verify: unit + live test on dated product.
- [ ] `E-05` **[OPEN]** `built_status`/`fulfillment_state` — awaiting_pickup / awaiting_installation / awaiting_shipping / awaiting_delivery → completed-by-method (picked_up / installed / shipped / delivered). | Verify: each transition + customer-facing label renders.
- [ ] `E-06` **[OPEN]** Completed ≠ paid preserved — WO can be `completed` with open balance; `closed` only via paid-in-full or admin close; aging continues post-completion. | Verify: completed WO with balance shows in AR, never in Closed.
- [ ] `E-07` **[OPEN]** `on_account` / `past_due` completed substatuses — invoice-driven flags mirrored on the WO product/order view (CB COMPLETED set). | Verify: past-due flag follows invoice due date.
- [ ] `E-08` **[OPEN]** Fulfillment method capture — pickup vs install vs ship vs deliver chosen at conversion or product edit; drives queue bucketing + customer label. | Verify: method persists + filters queues.
- [ ] `E-09` **[OPEN]** Proof external-share — portal-safe proof link w/ disclaimer text (A-21 settings) + expiry. | Verify: link renders proof + disclaimer; revoked link rejects.
- [ ] `E-10` **[OPEN]** Multi-product proof batches — approve-all-pending / per-product approve on portal; staff side shows per-product state (parity w/ CB batch behaviors where sane). | Verify: batch approve updates only pending products.

## WS-F — PRICING ENGINE PARITY (largest cluster)
*§8: tier charts, market-based mode, formula modifiers, labor levels, machine costs, part groups, variable rates, global variables, size discounts, import pipeline, GL mapping — with PricingTierMatrix/MachineRate/LaborLevel already scaffolded. Internal order: catalog model → tier engine → formula engine → machine/labor → import → GL wiring.*

**Default lane:** `L1` core — `F-01` doc, `F-02`/`F-09`/`F-11`/`F-12`/`F-13`/`F-14`/`F-15`/`F-16` pure modules + suites are maximally parallel; `F-03`–`F-08`/`F-10`/`F-17`–`F-22`/`F-24` wiring → `L2`; `F-23a`–`F-23j` per-module wires = 10 separate workers on disjoint module dirs → `L2`; `F-20` import function → `L2`; live price checks → `L3`.

- [ ] `F-01` **[OPEN]** Pricing architecture doc → `docs/pricing-engine.md` — current aioPricing.js/customerPricing.js flow vs target CB model; decide compose-vs-replace per module (keep CCS module estimators intact, inject shared engine). | Verify: doc committed; two module owners' files referenced correctly.
- [ ] `F-02` **[OPEN]** `pricingEngine` shared module (`base44/shared/pricingEngine.ts`) — pure functions: cost base → tier lookup → markup → minimums → tax → total. Deterministic, unit-testable, no entity access. | Verify: `scripts/test-pricing-engine.mjs` PASS w/ ≥30 cases.
- [ ] `F-03` **[OPEN]** Tier resolution precedence — customer tier → part-specific tier/fixed → machine override → global default (§8 precedence order exactly). | Verify: precedence cases in the suite (each override layer wins correctly).
- [ ] `F-04` **[OPEN]** `PricingTierMatrix` activation — wire the entity into pricingEngine (qty breaks × customer_tier, interpolation between breaks, effective_from/to windows honored). | Verify: interpolation cases pass; expired rows ignored.
- [ ] `F-05` **[OPEN]** Market-based mode — retail+discount chart alternative to cost-plus, per part/template (PricingMode entity exists — resolve per part: cost_plus | market_based | fixed). | Verify: a market-based part prices off chart not cost.
- [ ] `F-06` **[OPEN]** `PricingTemplate` application (A-04) — part picks template → engine applies its qty×tier chart; template CRUD UI in EstimatorSettings. | Verify: swapping template re-prices deterministically.
- [ ] `F-07` **[OPEN]** Global variables registry — quantity/height/width/depth/stitch_count defaults for formulas (GlobalSettings.pricingVariables). | Verify: variables resolve inside formulas.
- [ ] `F-08` **[OPEN]** `PricingModifier` engine (A-06) — typed custom-property inputs on parts ("can use in pricing" gates availability), variable rates (label+retail+cost+per-unit), order/dependency. | Verify: modifier with variable rate prices correctly; non-pricing modifiers excluded.
- [ ] `F-09` **[OPEN]** Formula engine — safe evaluator (no eval(): mathjs-expression-parser or a small recursive-descent — pick a lib ALREADY in package.json or add a mature pinned dep ≥7 days old) with reserved vars (PartBaseCost, PartRetail, Width, Height, Quantity, StitchCount…) + global vars + modifier answers. | Verify: formula cases incl. divide-by-zero/unknown-var → clean error not crash.
- [ ] `F-10` **[OPEN]** Modifier→formula wiring — modifier flagged `can_use_in_pricing` surfaces its vars to the part's formula; flags: include_setup_fee, min_charge, affects_waste, inventoried_part_type honored. | Verify: each flag changes price per spec.
- [ ] `F-11` **[OPEN]** Labor levels application (LaborLevel exists) — part associates labor levels ("Easy Weeding 125 SqFt/hr" analog: name, rate basis, hourly_rate); engine prices qty÷rate×hourly. | Verify: labor-level part prices correctly; multiple levels compose.
- [ ] `F-12` **[OPEN]** Machine cost model (Machine entity A-08 + MachineRate) — cost_per_hour × use-time + setup cost/time + disposable per-unit + labor% + weighted multiplier + margin charts + per-machine part overrides (disposable, income account, price calc, second-side). | Verify: machine step prices match manual computation.
- [ ] `F-13` **[OPEN]** `CatalogPartGroup` inheritance (A-05) — part inherits group defaults; per-part overrides win; group edit propagates to members without overrides (diff-track `overridden_fields` per part). | Verify: group markup change reprices members without overrides; overridden members hold.
- [ ] `F-14` **[OPEN]** Size-based discounts — part `size_discounts[]` (threshold sqft/dim → discount_pct) applied post-tier. | Verify: thresholds trigger correctly.
- [ ] `F-15` **[OPEN]** Setup fees + minimums — part setup_fee + min_charge + modifier min compose (largest wins or additive per CB semantics — check map §8 and decide, document choice). | Verify: minimum enforcement cases.
- [ ] `F-16` **[OPEN]** Order fees engine (A-22) — shipping/postage/discount lines with taxable flag + income-account mapping; flow into waterfall (D-02) + invoice. | Verify: taxable vs non-taxable fee lines compute tax correctly.
- [ ] `F-17` **[OPEN]** GL mapping on parts/fees/modifiers (A-03/A-06) — income_account_code + cogs_account_code resolved at price time; line carries resolved account into invoice splits (A-16). | Verify: invoice `income_account_splits[]` sums by account == line totals.
- [ ] `F-18` **[OPEN]** Double-sided rules — `double_sided` parts price second-side per machine override (§8 Options). | Verify: second-side pricing matches rule.
- [ ] `F-19` **[OPEN]** Parent sizes + minimums — `parent_sizes[]` constrain orderable dims; minimums enforced at entry + engine. | Verify: out-of-parent size rejected at line-add.
- [ ] `F-20` **[OPEN]** Part catalog import pipeline — CSV import for parts, part-group parts, vendor-association w/ import history + "Import Part" system defaults for e-commerce clones (admin tool page + `catalogImportAction`). | Verify: fixture CSV imports idempotently (creation keys), history row written, re-import = update not dupes.
- [ ] `F-21` **[OPEN]** Vendor cost/markup on vended parts — `vendor_id` + vendor cost + markup surfaces in part rows + reports (§5 parts view). | Verify: vended part shows cost→retail split.
- [ ] `F-22` **[OPEN]** Customer tier on Customer (A-10 `pricing_tier`) — resolution feeds F-03 precedence; admin UI assigns tier. | Verify: customer-tier part prices via tier chart.
- [ ] `F-23` **[OPEN]** Module estimator integration — wire pricingEngine into each module's price path behind the existing `aioPricing`/`customerPricing` seams (channel, vinyl, brick, CNC, laser, metal, paint, foundation, maintenance, custom). One module per sub-item; default = current behavior if no tier config (zero regression). | Verify: per-module price outputs identical when no new config; new tier config changes price only where assigned. 10 sub-items, one per module: `F-23a` channel `F-23b` vinyl `F-23c` brick `F-23d` cnc `F-23e` laser `F-23f` metal `F-23g` paint `F-23h` foundation `F-23i` maintenance `F-23j` custom.
- [ ] `F-24` **[OPEN]** Pricing admin surfaces — tabs parity in EstimatorSettings: Pricing Tiers / Templates / Global Variables / Modifiers / Machines / Labor Levels / Part Groups / Import history. | Verify: each tab CRUDs its registry w/ service-role writes.
- [ ] `F-25` **[OPEN]** Margin visibility — line-level + estimate-level margin using resolved costs (existing profitability.js extended for machine/labor/modifier cost components). | Verify: margin report on test estimate matches manual calc.
- [ ] `F-26` **[OPEN]** Price-lock override audit — manual price edits log override w/ actor+reason (ties to D-11) + "Overrides by Salesperson" feed. | Verify: override rows queryable for J-reports.

## WS-G — CUSTOMER / CRM DEPTH
*§9: hierarchical origination, master accounts, contact roles, typed events, auto-inactive, credit, tax-exempt, in-store credit, analytics.*

**Default lane:** `L2` (entity/registry + page pairs disjoint per item); `G-14` merge live test → `L3`.

- [ ] `G-01` **[OPEN]** Hierarchical `origination_path` — tree-managed list (settings registry `OriginationNode`), customer picks path, reports group by any level. | Verify: "Networking Group : BNI - Carl" parses into levels; report groups correctly.
- [ ] `G-02` **[OPEN]** Master accounts — `master_account_id` on Customer; master view rolls up child customers' balances, jobs, contacts. | Verify: rollup totals = sum of children.
- [ ] `G-03` **[OPEN]** Customer status lifecycle — Lead→Prospect→Active→Inactive + `auto_inactive_months` sweep (`manageWorkflowSchedules` or new scheduler action; disable-able per customer). | Verify: test customer inactivates after simulated window; opt-out honored.
- [ ] `G-04` **[OPEN]** Contact roles + statuses (A-11) — primary/billing/site assignment UI + email groups; billing contact used for statements/invoices. | Verify: statement emails default to billing contact.
- [ ] `G-05` **[OPEN]** Typed CRM event queue — `CrmEventType` (A-12) + event queue page (create event w/ due date + assignee; Mark Complete writes completed_at/by + outcome; per-salesperson filter). | Verify: queue filters by salesperson; complete updates row.
- [ ] `G-06` **[OPEN]** Follow-up linkage — CRM events of type EstimateFollowUp auto-suggest from sent-estimate age (H-xx automation creates suggested events; user confirms → real event). | Verify: suggestion appears for stale sent estimate; confirm materializes event.
- [ ] `G-07` **[OPEN]** Credit terms/limit — `credit_terms_days` drives invoice `due_date` default; `credit_limit` warns (not blocks) at estimate/invoice when open balance exceeds; usage = open invoices + unpaid portal. | Verify: terms → due date; warning surfaces at limit breach.
- [ ] `G-08` **[OPEN]** Tax-exempt registry — reason+ID+expiration on customer; expired → estimate warns + taxes normally; reports list exempt (J-xx). | Verify: expired exemption re-taxes; warning shows.
- [ ] `G-09` **[OPEN]** In-store credit — `in_store_credit_balance` ledger (credit memo + credit application on payments); apply-credit at payment time reduces balance_due + ledger. | Verify: credit issued→applied→balance decreases; ledger reconciles.
- [ ] `G-10` **[OPEN]** PO-required flag — `po_required` customer blocks quote-send/approve without `po_number` (A-18) on estimate. | Verify: required customer can't send quote w/o PO#.
- [ ] `G-11` **[OPEN]** Warning flags — `warning_flags[]` display as badges on customer pickers, estimate header, workspace. | Verify: flag renders on all three surfaces.
- [ ] `G-12` **[OPEN]** Customer Analytics tab — avg order, closed/completed totals+counts, all-time/year splits, discounts given (extends Customer360 with analytics block). | Verify: analytics math vs manual on test customer.
- [ ] `G-13` **[OPEN]** Customer imports — company+addresses+contacts CSV import w/ history (parallel to F-20 tooling; dedupe by name+email). | Verify: fixture imports, dupes merge, history row lands.
- [ ] `G-14` **[OPEN]** Customer merge — `CustomerMergeDialog` exists — extend for master-account merge + full relink sweep (estimates, WOs, invoices, payments, opportunities, contacts, locations, intakes, requests, COs, POs). | Verify: merge leaves zero dangling `customer_id` on the loser.

## WS-H — COMMUNICATION AUTOMATION (email-ready, off by default)
*§9: templated customer notifications + two-stage follow-ups + vendor set + broadcast + per-user subscriptions. `sendEmail` disabled → everything routes through a `deliveryChannel` adapter: `email` (flagged off) or `smartsheet_note`/`internal_notification` (live now).*

**Default lane:** `L1` — `H-01` adapter, `H-03` renderer, `H-04`/`H-06` state machines, `H-13` digest logic are pure modules + suites; `H-02`/`H-05`/`H-07`–`H-12`/`H-14` wiring → `L2`; `H-15` backlog conversion → `L2`.

- [ ] `H-01` **[OPEN]** `deliveryChannel` adapter (`base44/shared/delivery.ts`) — resolve channel from GlobalSettings.emailDelivery (A-21): if enabled → sendEmail; else → Smartsheet activity + `notificationAction.record` internal row. Every downstream item writes through it. | Verify: flag off → Smartsheet+internal rows land; flag on → adapter would call sendEmail (assert adapter path chosen, don't actually send).
- [ ] `H-02` **[OPEN]** `NotificationTemplate` entity — templated messages w/ placeholders (order/customer/company/user/location fields), from-location vs from-salesperson toggle, CC-billing flag, attach-PDF flag. Seed CoreBridge's set: estimate ready, new order, action needed, proof ready, built, completed, payment-due-5-day, monthly statement, estimate follow-up #1/#2, proof follow-up #1/#2, credit memo, multi-invoice, login info. | Verify: seed + render of every placeholder on a test record.
- [ ] `H-03` **[OPEN]** Template renderer — placeholder substitution engine (safe, no eval; `{{field.path}}` resolution + formatters for money/dates). | Verify: `scripts/test-template-render.mjs` PASS incl. missing-field behavior.
- [ ] `H-04` **[OPEN]** Follow-up state machine — `follow_up_state` on Estimate (stage: none|fu1_sent|fu2_sent|answered|closed, last_sent_at, next_due_at). X-day delay, non-repeating, status-gated (only `sent`), cancelled on approve/decline/convert. | Verify: state machine unit suite PASS incl. status-gate holds.
- [ ] `H-05` **[OPEN]** Follow-up scheduler — `manageWorkflowSchedules` (exists) or `notificationAction.evaluate_triggers` extension: daily sweep enqueues due follow-ups via adapter. Idempotent `automation_deadline_fired`-style dedupe (WO already has that field pattern — mirror on estimate). | Verify: two runs same day = one delivery.
- [ ] `H-06` **[OPEN]** Proof follow-ups — same two-stage machine on products' `awaiting_proof_approval` age. | Verify: stale proof fires fu1 then fu2 on schedule.
- [ ] `H-07` **[OPEN]** Payment-due reminders — "payment-due-5-day" template on invoice due_date−5 + past-due variant (exists `send_past_due_reminder` — wire to template engine + dedupe). | Verify: reminder fires once at T−5, once per past-due cadence.
- [ ] `H-08` **[OPEN]** Monthly statement job — statement template + batch generation for all customers w/ completed balance (extends `email_statement` path via adapter). | Verify: batch run produces per-customer statement rows; zero-balance skipped.
- [ ] `H-09` **[OPEN]** Vendor notifications — PO created, quote request, line-item feedback-sent, file uploaded; PO email template w/ arrive-by date + vendor-portal-link field. | Verify: `purchaseOrderAction.mark_sent` emits notification row w/ placeholders.
- [ ] `H-10` **[OPEN]** Estimate/proof ready triggers — quote-send + proof-upload events emit notifications (estimate ready to customer; proof ready to customer + assigned designer internally). | Verify: both events land notification rows with deep_link.
- [ ] `H-11` **[OPEN]** In-app broadcast messaging — `BroadcastMessage` entity + composer (Everyone/Design/Production/Sales/Managers/Individual) + banner on recipients' home; ack/dismiss. | Verify: targeted message reaches only the intended cohort.
- [ ] `H-12` **[OPEN]** Per-user alert subscriptions — extend `NotificationPreference` with `subscriptions[]` (event type + criteria → delivery: feed/digest) for: Client Change Request, Client Uploaded Files, Customer Notes, Portal Payment, Estimate Converted, Payment Received, Proof Approved, Sales Notes. `evaluate_triggers` fans out per subscription. | Verify: two users w/ different subscriptions get different feeds on same event.
- [ ] `H-13` **[OPEN]** Digest batching — `daily_digest` (exists) composes per-user digest from subscriptions; dedupe vs individual sends (an event either feeds digest or immediate, per pref). | Verify: digest contains queued events, no doubles.
- [ ] `H-14` **[OPEN]** Notification delivery telemetry — per-notification `delivery_channel`, `delivered_at`, `delivery_error` on the Notification row (prepared for real mail telemetry; unblocks backlog 242/246/296 when email re-enabled). | Verify: fields populate via adapter in both modes.
- [ ] `H-15` **[OPEN]** Convert BLOCKED items — port the three sendEmail-blocked backlog items (portal reply notifications, two bounce-tracking items) into adapter-based implementations; keep true bounce/webhook parts `[BLOCKED-EXTERNAL]` pending mail telemetry. | Verify: backlog items referenced + resolved or re-marked.

## WS-I — ACCOUNTING
*§10: GL accounts, reconciliation batches (entity exists), export files, QBO adapter, statements, in-store credit (G-09), portal-payment flag.*

**Default lane:** `L2`; `I-08`/`I-09`/`I-10` export/QBO dry-run suites → `L1`; `I-03`/`I-04` share `manageReconciliation` — serialize that function dir to one worker; live batch checks → `L3`.

- [ ] `I-01` **[OPEN]** Income/COGS account admin (A-01/A-02) — Manage Accounts page (admin): CRUD + parent accounts + active toggle. | Verify: admin CRUD; inactive accounts excluded from pickers.
- [ ] `I-02` **[OPEN]** Invoice GL splits — `income_account_splits[]` (A-16) auto-computed from line parts' accounts at invoice create/edit (F-17); manual split override w/ audit. | Verify: splits sum == invoice total; override persists + audits.
- [ ] `I-03` **[OPEN]** Reconciliation close flow — `manageReconciliation`: build batch from unbatched payments (location/date/method filters), expected vs collected vs cash_adjustment → variance; close locks payments' `reconciliation_batch_id`; reopen guard (admin + reason). | Verify: batch closes, variance math correct, reopen audits, payments locked after close.
- [ ] `I-04` **[OPEN]** Reconciliation UI — Financials tab: batch list (group#, location, date, collected, variance, created-by), batch detail (payments, adjustments), close-batch wizard. | Verify: UI drives the I-03 flow end-to-end.
- [ ] `I-05` **[OPEN]** Payments register — search page (customer, method, date range, batch status) + receive-payment + refund entries wired to `invoicingAction` (record_payment/refund exist). | Verify: search filters work; refund writes negative rows + audit.
- [ ] `I-06` **[OPEN]** "Payment added from Customer Portal" — `portal_source` flag (A-15) stamped by portal pay path; events feed + register filter. | Verify: portal payment shows flag + distinct event row.
- [ ] `I-07` **[OPEN]** Accounting Home alerts feed — payments, conversions, batch variances surfaced on Financials home (reuse attention feed patterns). | Verify: feed shows all three event classes.
- [ ] `I-08` **[OPEN]** Export engine — `accountingExportAction`: builds CSV/QBO-IIF/GL-journal files from batches/invoices/payments (date range + location filters); export history + re-download; safe-column sanitize (no internal notes in exports). | Verify: generated file parses; row totals match batch figures; history row per export.
- [ ] `I-09` **[OPEN]** QBO adapter — `quickbooksExport` module: token storage shape (GlobalSettings.qbo {realm_id, refresh_token_ref}), sync action stubs (push invoices/payments, pull accounts), dry-run mode producing the payload it WOULD send. `[BLOCKED-CREDENTIALS]` for live OAuth; everything else testable. | Verify: dry-run payload validates against QBO entity schema docs; marked blocked-for-credentials on live call.
- [ ] `I-10` **[OPEN]** Lump-sync export — all-time GL dump (invoices+payments+journal splits) for one-shot migration import. | Verify: dump reconciles to Financials totals.
- [ ] `I-11` **[OPEN]** Statements — customizable statement text (settings) + per-customer + batch generation (completed-balance customers); statement PDF + history (`statement_batch_id` A-16). | Verify: statement renders aging + payments; batch marks invoices.
- [ ] `I-12` **[OPEN]** Credit memo issuance — `issue_credit_memo` (exists in invoicingAction) → G-09 in-store credit ledger; credit memo template (H-02) notification. | Verify: memo → credit balance; applies at next payment.
- [ ] `I-13` **[OPEN]** Sales tax liability — tax collected by TaxGroup/agency for period (ties A-09 + J-report). | Verify: liability math matches invoice tax sums.

## WS-J — REPORTS PARITY
*§11: reconcile report catalog; Summary/Detail/Drilldown/Export variants, explicit date basis + void-inclusion rules. FeatureReports/manageFeatureReports is the runtime — extend `reportEngine`.*

**Default lane:** `L1` — `J-01` engine + `J-04`/`J-05`/`J-06`/`J-07`/`J-08` report definitions as pure spec rows (worker-parallel); `J-02`/`J-09`/`J-10`/`J-11` page/function wiring → `L2`; live reconciliation → `L3`.

- [ ] `J-01` **[OPEN]** `reportEngine` shared module — parameterized definitions (name, category, params: date_basis[created|completed|built], date_range, salesperson, location, void_policy), runner returns rows + summary, export to CSV. | Verify: `scripts/test-report-engine.mjs` PASS w/ fixture rows.
- [ ] `J-02` **[OPEN]** Report catalog page — reports registry (admin CRUD on ReportDefinition A-19) + run/preview/export UI in FeatureReports. | Verify: registry drives the catalog UI.
- [ ] `J-03` **[OPEN]** AR Aging suite — summary / detail / by-customer / by-salesperson (aging buckets already in get_customer_360 — generalize into engine). | Verify: aging buckets reconcile to invoice balances.
- [ ] `J-04` **[OPEN]** Customer Payments / Customer Balance / In-Store Credit / Credit Terms-Limits-Usage / Tax Exemption Status / Customers by Created Date / by Master Account / Dormant Customers / Phone-Address List. | Verify: each runs + exports.
- [ ] `J-05` **[OPEN]** Sales-by-Customer (+contacts) / Billing Locale / Salesperson (+averages, created/completed basis, month + month×year crosstab) / Entered By / Income Account / Product Category / Industry Type / Customer Origination (hierarchical levels) / Order Origination / Master Account / Volume-Frequency / by-Month split (in-house/vended/postage/shipping/discount) / Part Category / Parts-Modifiers-Fees (summary+detail+drilldown) / Discounts Given / Overrides by Salesperson (F-26 feed). | Verify: each report reconciles to source totals on test data.
- [ ] `J-06` **[OPEN]** Production reports — WIP by Product Status / Order Status / Salesperson / Responsibility+Prioritization / by Built Date; Addresses by Disposition; Built; **Part Amount Needed by Created/Due Date** (w/ dims+vendor — purchasing-critical); Part Amount Used; **On-Time Orders by Built Date** (avg days in WIP); Vendor Part List; Part Details export; PO Listing by Order; Quick Product Summary. | Verify: WIP report matches live WO products; parts-needed aggregates open WO demand correctly.
- [ ] `J-07` **[OPEN]** Estimate reports — Current, Activity/Conversion, **Conversions by Salesperson**, by Customer/Salesperson/EnteredBy/Industry/Origination/CustomerType. | Verify: conversion math = estimates converted ÷ sent in window.
- [ ] `J-08` **[OPEN]** Financial reports — **Sales Tax Liability** (I-13), Sales Commission (income acct/salesperson, completed/closed/vended filters), Business Summary, Invoice Summary, Built Summary, Void Summary, Customer Earnings, Employee Time Clock, Employee Contact List. | Verify: tax liability ties to invoice tax sums.
- [ ] `J-09` **[OPEN]** Saved report runs — run history + parameter persistence + re-run + scheduled digest delivery via H-13. | Verify: re-run reproduces; schedule delivers.
- [ ] `J-10` **[OPEN]** Report drilldowns — row → source-record deep links (workspace/estimate/invoice/customer360). | Verify: each drill target resolves.
- [ ] `J-11` **[OPEN]** Sales Home funnel parity — company funnel tiles (new customers, estimates created/cancelled/converted, orders placed/built/completed/closed w/ pre+post-completion void splits, collected, refunds) + goals by location/salesperson/income-category + calendar. | Verify: funnel numbers reconcile to entity counts for the period.

## WS-K — SYSTEM / SETTINGS / ADMIN
*§12 + §20 backlog admin items.*

**Default lane:** `L2` (settings pages + numbering paths disjoint); `K-07` rename touches permitting agent wiring → `L3` verify; admin-page live checks → `L3`.

- [ ] `K-01` **[OPEN]** Hours of operation (A-21) — sales-center hours vs production hours (open/close vs start/day); deadline math uses production clock; follow-up math uses sales clock. | Verify: due-date engine consumes the right clock per rule.
- [ ] `K-02` **[OPEN]** Email/domain settings — authorized sending domains, default outgoing address (location email / noreply), per-user send-as; stored + validated (no sending while disabled). | Verify: settings save + adapter honors from-rules.
- [ ] `K-03` **[OPEN]** User management depth — per-user prefs parity (My Account page: view prefs, queue defaults, timezone, notification subscriptions H-12). | Verify: prefs persist per user.
- [ ] `K-04` **[OPEN]** Data export (admin) — export all estimator data (estimates + inventory + customers + invoices + payments) w/ audit (item 482). | Verify: export completes + logged.
- [ ] `K-05` **[OPEN]** Admin — view all estimates regardless of salesperson (item 485, role-gated). | Verify: admin sees all, sales sees own.
- [ ] `K-06` **[OPEN]** Admin audit-log view (item 490) — who changed what/when across estimator entities (activity records → admin page w/ entity/user/date filters). | Verify: change appears in log w/ actor.
- [ ] `K-07` **[OPEN]** `jurisdiction_research` rename (items 478/500 — publish blocker, cross-module flag: agent rename + `callJurisdictionAgent` reference update). | Verify: call resolves post-rename.
- [ ] `K-08` **[OPEN]** Services/integrations surface — merchant provider + Zapier-key + portal settings surface (presence-only OK per map — record what's connected vs available). | Verify: settings page lists integrations w/ status.
- [ ] `K-09` **[OPEN]** Estimate numbering formats (items 476/484/499) — prefix/suffix patterns + per-module formats + reissue policy. | Verify: numbering honors pattern + no dupes under concurrent creates.
- [ ] `K-10` **[OPEN]** Quote defaults depth — `quote_valid_days`, signature text, footer terms/warranty/disclaimer, tax-rate source picker, print preview (items 477/479/480/486/491/494/497). | Verify: each default drives the quote output.
- [ ] `K-11` **[OPEN]** Custom estimate statuses (item 493) — beyond the 7 built-ins; `quoteDefaults.status_transitions` custom rows → status pickers + funnel buckets map them to canonical stage. | Verify: custom status selectable + funnels to right bucket.
- [ ] `K-12` **[OPEN]** Per-user defaults — timezone (item 488), default view per page (481), date display formats (userDateDisplay exists — wire pref). | Verify: per-user rendering honors prefs.

## WS-L — BACKLOG TAIL & REGISTERED DEFECTS
*Explicit carry-over from ESTIMATOR_BACKLOG.md + audit findings.*

**Default lane:** `L2` disjoint fixes; `L-01`/`L-02` audit suites → `L1`; `L-09`/`L-12` live paths → `L3` orchestrator-only.

- [ ] `L-01` **[OPEN]** CAS expected/nextFields key-parity sweep — every `replaceFoundationFieldsIfUnchanged`/`replaceEstimatingRequestFieldsIfUnchanged` call site across all functions: assert `expectedFields` keys == `nextFields` keys (the revoke_link/bumpOpen defect class). Write `scripts/test-cas-key-parity.mjs`. | Verify: suite PASS; fix any site failing it.
- [ ] `L-02` **[OPEN]** Silent-swallow sweep — `.catch(() => null)` / `.catch(() => {})` on WRITE paths across functions: each must either surface `*_warning` in the response or carry a code-comment justifying silence. Write `scripts/test-write-swallow-audit.mjs`. | Verify: suite PASS; convert offending swallows.
- [ ] `L-03` **[OPEN]** `sameFoundationValue` empty-equivalence — decide + implement: treat `null`/`undefined`/`""` as one empty class (fixes the whole defect family at the root) OR document strict semantics + fix every call site to match storage. Choose in implementation; add unit cases either way. | Verify: `scripts/test-entity-persistence.mjs` + new empty-class cases PASS.
- [ ] `L-04` **[OPEN]** `due_date` day-boundary bug (backlog 492) — CompletedReports/FeatureReports/Opportunities/Financials/CustomerPortal timezone boundary: audit each date compare to use a shared `businessDay()` helper (project timezone). | Verify: boundary cases (23:59 UTC vs local) render correct bucket on all five pages.
- [ ] `L-05` **[OPEN]** `ensureOpportunityWorkspace` session_token → 401 not 500 (item 483). | Verify: unauthenticated call returns 401.
- [ ] `L-06` **[OPEN]** `EstimatorSettings` estimator_tools hub link coverage + Export-all tool link (items 487/496). | Verify: nav-wiring check covers both links.
- [ ] `L-07` **[OPEN]** `FoundationEstimator`/`BrickStoneEstimator`/`SalesHome` loadError render verify (items 495/498) — confirm the catch-landed error state displays (not just logged). | Verify: forced failure shows banner, spinner clears.
- [ ] `L-08` **[OPEN]** `backupPermittingRepository` Drive upload format (item 489 — related non-estimator fix). | Verify: upload format matches Drive API expectation.
- [ ] `L-09` **[OPEN]** Orphan test-record repair — `6ae812787fdadfae4566b425` back-stamp + the 9 `ZZ E2E` records cleanup via runbook Z-04 when Brett approves deletion. | Verify: post-rotation `capture_intake` retry stamps the field; cleanup verified.
- [ ] `L-10` **[OPEN]** Estimate `estimate_amount` seeding — converted WO carries `estimate_amount` from quote_total (test WO showed 0 because quote was unpriced at convert; confirm fresh converts seed correctly + backfill policy decision). | Verify: fresh priced convert seeds WO estimate_amount.
- [ ] `L-11` **[OPEN]** Payment `estimating_request_id` — confirm Payment schema coverage (summary suggested missing); if absent, add field + stamp in `record_payment` for complete chain symmetry. | Verify: payment carries the request id.
- [ ] `L-12` **[OPEN]** `get_opportunity` un-`.catch`'d load — the user-exception seen on the fan-out: identify the unguarded load, wrap to match sibling behavior (fail-closed section vs hard fail). | Verify: saturated budget → graceful degraded response not worker exception.

## WS-M — RATE-LIMIT & PERFORMANCE DISCIPLINE
*The whole-app entity-read cap + per-caller 140/60s are the scaling constraint; every new feature must live inside the budget.*

**Default lane:** `L1` audits/docs/suites; `M-03`/`M-04`/`M-08` shared-path wiring → `L2` serialized; any live measurement → `L3`.

- [ ] `M-01` **[OPEN]** Read-budget audit — per-page entity-read inventory (which function, which entities, paging) → `docs/read-budget.md`; flag any page >2 entity fan-outs without cache. | Verify: doc lists every surface's read cost.
- [ ] `M-02` **[OPEN]** `loadAllEntityRows` telemetry — count/log pages fetched per call in dev builds; surfaces exceeding budget get projections or cursors. | Verify: telemetry identifies top consumers.
- [ ] `M-03` **[OPEN]** Feed consolidation — boardFeed-style projection+cache for queue feeds (C-09), Customer360, workspace fan-outs (single reader returns composed payload instead of N parallel entity pulls). | Verify: per-view entity reads measurably lower.
- [ ] `M-04` **[OPEN]** Delta cursors — `updated_since`/`updated_after` params on feed readers (skip unchanged rows); cursors persisted per user/session. | Verify: repeat poll transfers only deltas.
- [ ] `M-05` **[OPEN]** Poll hygiene — no page polls while `document.hidden`; shared poll registry so one interval serves all listeners on a page (the update-depth class of fix generalized). | Verify: hidden tab → zero network in waterfall.
- [ ] `M-06` **[OPEN]** `useAllWorkOrders` pattern generalization — stable-empty + stable-result for every cached list hook (audit all `= []` defaults feeding effect deps, the loop class already fixed once). | Verify: no `data: x = []` → effect-dep loops anywhere (grep sweep + the M-06 assertion script).
- [ ] `M-07` **[OPEN]** Whole-app cap headroom — quantify normal operation's read volume vs cap; design the paging/caching so a single user never approaches the app cap alone (the external-traffic spike is out of our control — our own traffic must be tiny). | Verify: doc + measured numbers.
- [ ] `M-08` **[OPEN]** Backoff standard — shared `withEntityBudget(fn)` wrapper: exponential backoff + jitter + max-wait for all service reads; replaces bespoke retry loops. | Verify: wrapper in shared module, call sites migrated.

## WS-N — VERIFICATION INFRASTRUCTURE & TEST COVERAGE
*Every workstream's verify steps run through here; final gate = full-suite + route sweep + live chain.*

**Default lane:** `L1` suites; `N-08`/`N-09`/`N-11`/`N-12` live gates → `L3` orchestrator-only.

- [ ] `N-01` **[OPEN]** Test-file conventions — all new suites `scripts/test-<domain>.mjs` printing `PASS <name>`; pure-domain tests esbuild-bundled Node (existing pattern). Add to AGENTS verify list as they land. | Verify: convention lint (file naming, PASS output).
- [ ] `N-02` **[OPEN]** Pricing engine suite (F-02..F-26) — the biggest correctness surface: ≥60 cases incl. precedence, interpolation, formula errors, GL splits, module regression (no-config → identical prices). | Verify: PASS.
- [ ] `N-03` **[OPEN]** Due-date engine suite (B-07) — lead-time max, hard-date hold, proof-recalc push-forward, two-clock rule. | Verify: PASS.
- [ ] `N-04` **[OPEN]** Report engine suite (J) — fixture-driven reconciliation asserts for the top-10 reports. | Verify: PASS.
- [ ] `N-05` **[OPEN]** Accounting suite (I) — batch variance, GL splits, export file shape, credit ledger, statement batching. | Verify: PASS.
- [ ] `N-06` **[OPEN]** Notification/follow-up suite (H) — state machine transitions, status gates, dedupe, digest, adapter channel choice. | Verify: PASS.
- [ ] `N-07` **[OPEN]** CRM suite (G) — origination hierarchy, master rollup, auto-inactive, credit limit, tax-exempt expiry, merge sweep. | Verify: PASS.
- [ ] `N-08` **[OPEN]** Live chain regression — re-run the e2e lifecycle script (`.audit-work/final_scripts__test-estimate-lifecycle.mjs` pattern) after each phase; must produce a fully-linked ZZ chain. | Verify: all links asserted post-phase.
- [ ] `N-09` **[OPEN]** Route sweep refresh — bulk sweeper (`.audit-work/sweep.mjs` pattern) over the full route list + new pages; EMPTY-recheck protocol; console/pageerror class checks. | Verify: zero real defects; regressions triaged.
- [ ] `N-10` **[OPEN]** `nav-wiring` + contract suites — keep `validate-opportunity-workspace.mjs` + nav-wiring green after every page/nav change (fix the checker when features move files — categories extraction lesson). | Verify: green each phase.
- [ ] `N-11` **[OPEN]** Playwright waterfall — `.audit-work/waterfall.mjs` for the heaviest new surfaces (queues, job workspace, reports) with `MSYS_NO_PATHCONV=1`; assert no 4xx/5xx bursts, no runaway request counts. | Verify: budgets respected.
- [ ] `N-12` **[OPEN]** Final gauntlet — end-state: full suite + sweep + e2e chain + checkpoint; the masterplan is not DONE until this gate passes in one run. | Verify: single green run recorded.

## WS-Z — PARKING LOT (discovered defects — append, never mid-list insert)

**Default lane:** orchestrator-only.
- `Z-01` **[OPEN]** EstimatingRequest stale-worker back-stamp orphan: `6ae812787fdadfae4566b425` (see L-09).
- `Z-02` **[OPEN]** 9 `ZZ E2E` live test records — deletion runbook (below).
- `Z-03` **[OPEN]** (reserved)
- `Z-04` **[OPEN]** **Cleanup runbook** (when approved): delete in dependency order — Payments → Invoices → ChangeOrders → PurchaseOrders → PermitLineItems → WorkOrder → Estimate → EstimatingRequest → OpportunityIntake → Opportunity → CustomerContact/Location → Customer; each via entity-appropriate path w/ conditional guard (no blind deletes); verify count after each step; never touch non-ZZ records.

---

## 3. ESTIMATED SHAPE & EXECUTION STRATEGY
- ~220 items across 12 workstreams + parking lot. Item sizing deliberately small (0.5–4 tool-hours) so a worker completes several per dispatch.
- **Parallel cadence (§0.6):** the orchestrator dispatches up to 8 file-locked workers per batch, integrating + remote-writing as they return, batch-deploying at phase gates, and spending its own time on L3 lanes (deploys, live verification). On live-read saturation it shifts dispatch weight to L1 items — never idles.
- **Solo fallback:** if run without subagents, pick items in workstream order; skip `[BLOCKED-*]`; on saturation switch to L1 items — same ledger, same rules.
- Every phase ends: checkpoint + PROGRESS_LOG entry + suites green + ledger updated + zero live claims. A new session reads the ledger and continues cold.
