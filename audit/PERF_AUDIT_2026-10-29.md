# Performance & 500-Error Audit — CCS Signage Workflow
App ID: `68dfcc5e57bbbc35387da97c` · branch `main` · **LOCAL-ONLY audit record — do not publish/push to the app.**

Companion to `audit/BUG_AUDIT_2026-10-27.md` (functional bugs) — this log covers the
rate-limit/500-error and page-load-performance investigation requested 2026-10-29,
plus the remediation applied.

## Root cause of the user-facing 500s

Two shared `entity_list` rate budgets (140 req / 60s per caller) are being saturated:

1. **Visitor IP budget** — `WorkOrder`, `Order`, `GeneralTask` have fully open read
   RLS (`"read": {}`), so EmailGate staff read them directly through the SDK. Every
   staff device behind the office NAT shares one 140/min bucket.
2. **Service-token budget** — every `asServiceRole` read inside all ~156 backend
   functions shares one bucket. Every `functions.invoke` also costs ≥1 read for
   `authenticateSignShopSession` (`AuthorizedEmail.filter`) before the action runs.

### Measured load

| Source | Cost | Cadence |
|---|---|---|
| WorkOrder table (`completed:false`) | 3,127 rows ≈ **14.8 MB**, 137 fields/row | full pull per page mount + per poll |
| Board pages (Design/Fabrication/Production/InstallationDeliver/Estimating/MyWorkflow/SalesPipeline/OrderSpreadsheet aux) | ~7 entity reads per pull | every 30–120s per open tab |
| `attention_feed` (AttentionBell) | ~12 service reads (11 entity filters + auth) | every 60s per signed-in tab |
| `status_lite`/`status` (TimeClockStatusContext) | ~3–10 service reads | every 60s per tab |
| `staffEntities.subscribe` polyfill | 1 read (up to 500 rows) | every 60s per subscription |
| Workflows | ~200+ runs/day (Bouncie ~93, notify worker ~46, Smartsheet sales ~31, backlog refill ~30) | continuous |

Live `logs --level error` (2d): the **only** error class was
`entity_list allows 140 requests per 60s` — 32 hits on `manageAnnouncements` +
6 on `timeClockAction` inside one ~45-min window. `Announcement` has 0 rows —
the function is a victim of shared-budget saturation, not a cause.

### Field-size analysis (300-row WorkOrder sample)

`smartsheet_sync_snapshot` ≈ 43% of bytes, `work_notes` ≈ 28%. Neither is read by
any board/list view (only detail dialogs + permitting + smartsheet admin).

## Remediation applied (remote `main`)

### Batch 1 — read volume / 500s

| Change | Files | Effect |
|---|---|---|
| NEW `boardFeed` function — session-optional, entities allowlist (WorkOrder/Order/JurisdictionProfile), denylist projection strips the 2 fat fields, `since` → server-side `updated_date >` delta cursor, `fields` projection, sort/query validation, paged to 20k with `truncated` flag, 429 passthrough | `base44/functions/boardFeed/entry.ts` | board reads = 1 invoke instead of ~7+ entity reads; ~70% smaller payloads |
| Shared delta row store: per-entity `{rows:Map, cursor, inFlight}` with in-flight dedupe, 10-min full-resync safety net, subscribe-event patching, `fetchAllWorkOrders`/`fetchAllOrders`/`useAllWorkOrders` exports | `src/lib/workOrderCache.js` | one pull per tab shared by all consumers; steady-state refresh = 1 delta read |
| Boards → cache | `src/pages/{Design,Fabrication,Production,InstallationDeliver,Estimating,MyWorkflow}.jsx` | dropped per-page 60–120s full-table polls |
| OrderSpreadsheet aux WO read → `fetchAllWorkOrders` | `src/components/orders/OrderSpreadsheet.jsx` | |
| SalesPipeline `current`+`outcomes` scopes → `fetchAllWorkOrders` (archive/history scopes keep paged reads) | `src/components/sales/SalesPipelineSpreadsheet.jsx` | |
| AttentionBell poll | 60s → 180s | `src/components/workflow/AttentionBell.jsx` |
| `staffEntities.subscribe` check poll | 60s → 120s | `src/components/staff/staffEntities.js` |
| 429 passthrough in catch blocks (was masked as 500 → governor couldn't retry) | `staffDataRead`, `staffEntityWrite`, `manageAnnouncements`, `opportunityWorkspaceAction`, `timeClockAction`, `verifySession` | rate-limit responses now retryable client-side |

### Batch 2 — load time

Already done by the concurrent writer before this pass (verified remotely):
`src/App.jsx` + `src/pages.config.js` lazy-load all ~90 pages via
`src/lib/lazyPage.js` (chunk-miss auto-reload guard) + `PageLoading` fallback +
`Suspense` wrappers — the 12 MB monolithic bundle is gone. `src/lib/workOrderCache.js`
(react-query shared cache) also theirs; extended here with the delta store.

### Batch 3 — automation hygiene

- Workflow failures this window: `Smartsheet Scheduled Order Sync` auto-disabled
  by stale-run 409 gate (needs manual `recover_stale_order_run` + re-enable —
  see BUG_AUDIT F45); `Time Clock Stale Shift Monitor` auto-disabled (hash fixed
  remotely, needs re-enable — F46). `Weekly Sales Duplicate Detection` still dead (F1).
- Scheduler cadence: Bouncie ~93 runs/day is the largest single contributor.

## Status — all pushed & verified on remote `main`

The sandbox bridge hit a long `SANDBOX_BUSY` flush mid-push; several edits
reported timeouts but landed anyway — every change above was re-verified on
remote via `sandbox read`/`run grep` before checkpointing.

**Checkpoint:** `6ae31280458a14d61964a768` (commit `4826e4ae`) — "Board feed
delta-sync + slim rows + 429 passthrough (rate-limit/500 remediation)".

Note: changes are committed to `main` but take effect for staff on the next
publish — no publish was requested or performed.

## Follow-up verification (same day)

- `boardFeed` was **not** auto-deployed by the file write — deployed explicitly
  via `functions deploy boardFeed` (8.6s). Smoke test: delta call returned 34
  changed rows in 24h with both fat fields stripped. Working end-to-end.
- Re-verified all remote markers after the busy window: no concurrent-writer
  reverts this cycle.
- **Permitting.jsx converted (second pass, verified remote, checkpoint
  `6ae3251a2bb06916cbe0c943`):** WO read moved off `loadEntitiesBatch` onto
  `fetchAllWorkOrders` (slim+delta); `openWorkOrder` now hydrates the full row
  via `WorkOrder.get(id)` so `WorkOrderDetailsDialog`/`PermitLineNotesSection`
  still see `work_notes`. Writes were already safe — `mutateWorkOrderArrayField`
  re-reads the row server-side for CAS.
- **SIPs.jsx + MondayMorningMeeting.jsx converted (verified remote,
  checkpoint `6ae326891bc0f1e04c01e6cf`):** the last two fixed-interval WO
  pollers now read through `fetchAllWorkOrders` (same slim+delta store).
  **Every recurring full-table read in the app now goes through the shared
  feed.**
- **Batch-3 conversions (verified remote, checkpoint `6ae34126d901176eb434ba48`):**
  `ResourcePlanning.jsx`, `ReportingDashboard.jsx`, `Financials.jsx`,
  `TimeClockReportsDashboard.jsx`, `BulkDuplicateCleanup.jsx`,
  `AddTaskDialog.jsx`, `customerSync.js` all read through `fetchAllWorkOrders`
  (slim+delta) instead of full-table `loadAllEntityRows`.
- **Stragglers (2, unconverted):** `CurrentWorkCard.jsx` + `ClockOutDialog.jsx`
  — on-demand search-dialog reads only (not pollers); `sandbox edit` anchors
  kept missing (file likely CRLF-encoded or drifted). Lowest priority; convert
  on the next pass via full-file write.
- Remaining full-table readers after batch 3 are single-row `entity.get`
  dialogs and filtered-by-parent reads (`WorkOrderOrders`, `OrderTrash`) —
  already bounded, no action needed.

## Emergency stabilization — 2026-10-29 PM

Post-publish production incident: near-1min first loads, login 429s, ~50 errors/page.

**Root causes found**
- `timeClockAction` TDZ crash (use-before-declaration, concurrent-writer bug shipped at publish) — 500 on every call for ~2h. Fixed + deployed.
- `Entity schema UserSession not found` — entity existed in sandbox but was NEVER in prod schema (UI publish does NOT create entities — `entities push` does). `signShopSession` revocation check's "non-blocking" guard rethrew any error with `.status`; Base44Error has one → every authenticated call 500'd on cold isolates. Guard narrowed to rethrow only revoked-session 401s.
- 5 entities missing from prod total: UserSession, TimeClockDevice, AccessRequest, AdminAuditLog, FailedAdminAttempt — created via `entities push` after full remote→local entity sync.
- `TimeClockDevice.jsonc` invalid `entityType` keyword — was rejecting entire entity sync (publish silently skipped schema).
- `withEntityRateLimitRetry` default maxRetries=5 on interactive functions: ~6× budget amplification + past-function-timeout → platform 500s with no log entries. Set `maxRetries:1` on 10 interactive functions.

**Mitigations shipped (deployed + published)**
- Server caches: boardFeed 30s + PAGE_SIZE 5000 (1 read/pull), attention_feed 120s (12 reads→~0), signShopSession auth 60s (~2 reads/invoke→0 warm), staffDataRead 45s read cache.
- Frontend: workOrderCache IndexedDB snapshot + BroadcastChannel cross-tab (instant paint, delta-sync behind), staffEntities auto-batching (mount burst ~15 invokes→~1-3, dedupes identical calls), fleetInvoke maxRetries 4→1, TimeClockStatusContext poll 60s→180s, Permitting cacheTtlMs.

**Result**: ~50 errors/page → 0-8 retriable 429/403s; SalesPipeline verified clean. Residual: honest rate-limit on shared 140/min service-token budget during cold bursts.

**Remaining**: manageSops deployable only via publish (function.jsonc/bundler conflict); manageAnnouncements intermittent 404 (registry lag); subscribe checks still poll per-entity (server cache dedupes); workflows not yet audited for burn (detectSalesDuplicates O(n²), monitorJurisdictionChanges per-row LLM still disabled-pending-fix).

## Volume-cap mitigation — 2026-10-31

New failure mode found: `App entity read traffic volume limit exceeded` — a whole-app rolling entity-read **bytes** ceiling (distinct from per-caller 140 req/60s). When tripped, EVERY function's entity reads fail simultaneously; waves of "pages erroring out" traced to this.

**Sustained burner found**: `permitting-address-validation.mjs --limit 500` running live for 3.5+h (PID identified via cmdline; `.validation-live-biz-500.json` growing incrementally, ~1 lookup/2-4min). Script now has `--delay-ms` (live default 1000ms) + cap-sustained backoff (4 busy-waits → 30-45s pause).

**Mitigations deployed**
- `boardFeed` server-side field projection (SDK `filter(q,sort,limit,skip,fields)`): WorkOrder pulls 143 schema+extra fields (incl. undeclared `_salesTaskAdoption` caught via live-row inspection) instead of ~140+fat blobs — upstream read volume cut ~82% on the app's biggest call. Allowlist generated: `scripts/build-board-feed-fields.mjs` → `base44/shared/boardFeedFields.ts`. Self-healing: falls back unprojected if SDK rejects the 5th arg.
- `loadAllEntityRows`: optional `fields` arg + page cap 500→5000, default 2000 (all functions benefit at next deploy).
- `smartsheetSyncAction`: `syncPullFields(dataset, bindings)` derived projection (mappable ∪ binding keys ∪ sync-meta ∪ audited side fields ∪ system ≈ 50-60/143 fields) applied to 12 of 13 WorkOrder `loadAllEntityRows` sites — linked pulls, verification pulls, ownership/claims pulls, push pulls, admin audit pulls. Field audit caught 6 initial misses (`sales_neutral_closed_at` etc.) — coverage verified against every smartsheet shared module + entry.ts receiver sweep.
- `resolvePermittingAddress`/`findLocalityByAddress` geocode chain: Google REQUEST_DENIED cooldown (10min TTL per isolate, `geocode_diagnostic` bypasses) → browser census_hint → OSM Nominatim FIRST (6s) → US Census LAST (5s dedicated timeout — worker historically can't reach census.gov, was burning a 15s fixedJSON timeout before OSM). Live lookup: 8-9s → 2.5-3.5s and actually resolves (`us_census` match).
- `workOrderCache` `FULL_RESYNC_MS` 10m→30m (frontend, queued for next publish).

**4h error sweep (16:00-20:00 UTC)**: boardFeed/staffDataRead/timeClockAction/resolvePermittingAddress/fleetDataRead zero errors; opportunityWorkspaceAction last error 15:18; smartsheetSyncAction last error 17:44 (per-caller 429 during deploy window); no `traffic volume` recurrence since 15:58.

**Verified healthy**: timeClock clock-in/out path (durable request IDs in sessionStorage, ambiguous-outcome classification `!response||status>=500`, epoch guards, `retry_same_request`, backend `withEntityRateLimitRetry` on every entity call, frontend requestGovernor dedupe+retry on every invoke).

**Build gate**: local repo had drifted 41 files + 4 deps (dayjs, @mantine/{core,dates,hooks}) behind remote — synced; `npm run build` green (169MB dist, 256 chunks; entry chunk 1.4MB driven by Layout eager tree).

**Still open (user-side)**: GOOGLE_GEOCODING_API_KEY `REQUEST_DENIED` (server key + Geocoding API + billing — Google Console fix), Base44 usage dashboard check for plan-level entity-read quota.
