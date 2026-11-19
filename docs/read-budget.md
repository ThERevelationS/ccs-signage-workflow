# Entity-read budget audit (M-01)

Audit date: 2026-11 — worker `w-20`, local tree `ccs-signage-workflow-clean`.
Scope: every surface's entity-read cost vs the two shared budgets documented in
`AGENTS.md`:

- **`entity_list` per-caller budget — ~140 reads / 60 s.** Every page in the app
  drains one token pool per caller identity (service-role tokens used by backend
  functions count too).
- **Whole-app rolling entity-read volume cap.** When it trips, *every* function's
  entity reads fail simultaneously (`App entity read traffic volume limit
  exceeded`), not just the noisy one.

Key multiplication factors found in the tree:

- `loadAllEntityRows` (`base44/shared/pagedEntityRows.ts`) pages **2,000 rows/
  call** server-side; `src/components/estimator/loadAllEntityRows.js` pages
  **500 rows/call** client-side. A "one read" of the ~3.1k-row WorkOrder table
  is really **2–7 entity_list calls** depending on which helper issues it.
- Every staff-session invoke pays **+2 auth reads** (`AuthorizedEmail.filter` +
  `UserSession.filter` in `base44/shared/signShopSession.ts`), amortized by a
  **60 s per-isolate cache** — cold isolates re-pay it.
- `withEntityRateLimitRetry` / `withEmployeeAccessReads` retry 429s up to 4–5
  times with backoff — under saturation each retry is another billable read.
- `loadGlobalSettingSingleton` (`base44/shared/globalSettingSingleton.ts`) is an
  **uncached** `GlobalSettings.filter` — `GlobalSettings` is the most-touched
  entity in the backend (**88 call sites**).

---

## 1. Read-path architecture (who spends what)

| Path | File | Cache / dedupe | Notes |
|---|---|---|---|
| Staff entity reads | `src/components/staff/staffEntities.js` → `staffDataRead` | **30 ms batch window → ≤16 entities/invoke; 30 s positive cache** (session-keyed, write-busted); 403 negative cache; in-flight dedupe | `filter`/`list` batched; `get`/`count` unbatched; `subscribe()` = **synthetic 120 s poll** per entity (`limit:50, -updated_date`) |
| Fleet entity reads | `src/components/fleet/fleetEntityLoaders.js` → `fleetDataRead` | **In-flight dedupe only — NO TTL cache** | 500-row pages; 429 retry ×4 |
| Big-table reads (WorkOrder/Order) | `src/lib/workOrderCache.js` → `boardFeed` | **Delta `since` cursor; IndexedDB snapshot; BroadcastChannel cross-tab; 30 min full resync; in-flight dedupe** | `useAllWorkOrders` react-query `staleTime 60 s` + `refetchInterval 120 s` — one shared queryKey across ~24 consumer files |
| Invoke transport | `src/components/fleet/fleetInvoke.js` | Governor `maxConcurrent 6`, `maxRetries 1` | Global 429 circuit breaker (`src/api/rateLimitCooldown.js`, 20 s→60 s backoff) consulted by pollers/subscribe ticks |
| Standard poller | `src/lib/usePolling.js` | Hidden-tab pause, cooling-down skip, in-flight guard, focus-refresh dedupe, jitter | 11 call sites |
| Staff read gateway | `base44/functions/staffDataRead/entry.ts` | **45 s per-entry `staffReadCache` + in-flight dedupe**; batch ≤16, concurrency 4; cursor/projection reads | + auth (cached 60 s) |
| Fleet read gateway | `base44/functions/fleetDataRead/entry.ts` | **None** | 1 entity read per call + auth |
| Board feed | `base44/functions/boardFeed/entry.ts` | **30 s feed cache; 5,000-row pages; server-side projection (`FEED_FIELDS`); `since` delta cursor** | WorkOrder/Order/JurisdictionProfile allowlist; staff session required |

---

## 2. Backend function read costs

Counts below are **per-invocation of the named action** (dispatchers only run one
action per call). "Fan-out" = distinct entities touched; "reads" = entity_list/
entity_get calls issued (paged scans multiply by page count).

| Function / action | Entities (fan-out) | Reads per call (est.) | Paging | Cache | Trigger |
|---|---|---|---|---|---|
| `boardFeed` | 1 of {WorkOrder, Order, JurisdictionProfile} | 1–4 | 5 k rows/page, 20 k cap | **30 s module cache** (identical full pulls), `since` delta, projection | `useAllWorkOrders`/`useAllOrders` 120 s refetch + manual |
| `staffDataRead` (single) | 1 | 1 (+2 auth) | caller limit ≤…, cursor | **45 s entry cache + in-flight dedupe** | every `staffEntities` read |
| `staffDataRead` (batch ≤16) | 1–16 | ≤16 (+2 auth) | per-entry | same | mount bursts via `batchedRead`/`loadEntitiesBatch` |
| `fleetDataRead` | 1 | 1 (+2 auth) | 500/page client | **none** | every `readFleetRows`/`listAllFleetRows`/`filterAllFleetRows` |
| `opportunityWorkspaceAction` (23 ent, 57 read sites) | | | | | |
|  · `attention_feed` | **11** | 11–40+ | capped first page → full paged scan when cap trips | **120 s module cache** (isolate) | **AttentionBell 60 s poll (global layout)** |
|  · `get_opportunity` | **12** | ~12 parallel (+ reconcile writes) | 100–500 caps | none | workspace open |
|  · `get_customer_360` | **8** | 8 paged scans (2 k pages) | `loadAllEntityRows` | none | Customer360 open |
|  · `customer_workspace` | **~11** | 8×1k filters + **4 k PurchaseOrder scan** + per-opp Activity (≤12) or 3 k scan | mixed | none | Customer360 open |
|  · `global_search` | **~9** | 8 parallel + LegacyMigrationMap + Estimate tail scan | caps | none | GlobalSearch keystrokes (debounced) |
|  · `send_digest` | 4 | 4 **full-table** pulls | `loadAllEntityRows` | none | manual |
|  · `list_opportunities` | 1 | full Opportunity scan (≥1–2) | `loadAllEntityRows` | none | Opportunities mount |
|  · `list_estimating_requests` / `list_follow_ups` / `search_customers` | 1–2 | 1 full scan each (customers can fall back to whole table) | `loadAllEntityRows` | none | page loads |
| `customerPortalAction` (14 ent, 43 sites) — **no read cache, public token auth** | | | | | |
|  · `bootstrap` (customer link) | **7+N** | 6 paged reads + QuoteDefaults + **1 `EstimateSectionAcceptance` scan per estimate** | `loadAllEntityRows` | none | portal page load |
|  · `bootstrap` (invoice link) | ~3 | link+invoice+payments | paged | none | portal load |
|  · `bootstrap` (estimate/work_order/staff_view) | 3–6 | paged + thread | paged | none | portal load |
|  · `post_message`/`estimate_respond`/`counter_offer` | 3–6 | thread scans + read-receipt writes | paged | none | user action |
| `timeClockAction` (22 ent, 330 sites — largest dispatcher) | | | | | |
|  · `status_lite` | 3–5 | ~3–6 (state/entry/break/pause/labor summaries) | filters | none | **TimeClockStatusContext 180 s poll** + QuickClock 3 s transition watch |
|  · `status` | 6–9 | ~6–10 (manager adds 3–4 punch-review scans) | filters+gets | none | **EmployeeTodayCard / WorkPauseOverlay 60 s polls** |
|  · `admin_load_all` | **8** | 8 × `loadAllEntityRows` **full scans** (200-row pages) | paged | none | TimeClock admin |
|  · `who_is_in`, `list_face_enrollment`, `list_timeclock_audit`, `list_shift_templates`, `list_pending_requests`, `pto_liability_report`, `admin_period_compare`, `list_devices` | 2–6 each | ~2–8 each | mixed | none | **AdminRosterPanels fires all 8 in parallel every 60 s** |
| `invoicingAction` (9 ent, 38 sites) — no read cache | | | | | |
|  · `list_invoices` / `list_invoiceable_estimates` | 1–2 | full-table paged pulls ×1–2 | `loadAllEntityRows` | none | Invoices page |
|  · `revenue_summary` / `export_ar` | 2 | 2 full-table pulls each | `loadAllEntityRows` | none | Financials |
|  · `get_invoice` | ~6 | get + payments + 4 conditional gets | mixed | none | detail open |
|  · create/mark/record paths | 2–5 | gets + prior-invoice filter | mixed | none | user action |
| `smartsheetSyncAction` (8 ent, 36–41 sites) | WorkOrder, Order, CellHistory, FieldAudit, SyncConflict, GlobalSettings, BackupLog, AuthorizedEmail | **Full-table paged pulls (projected via `syncPullFields`) + per-row `WorkOrder.get` readbacks inside loops + CellHistory `$in` readbacks** | 2 k pages | field projection only | manual/scheduled sync — **biggest single-burst consumer** |
| `notificationAction` (9 ent) | Notification, NotificationPreference, + scan sources | `list_mine` 1–2; `evaluate_triggers` ~6 scan reads | caps | **5 min `scanCache` + 10 min eval throttle** | bell poll piggyback (eval ≤1/12 min) |
| `fleetSearch` | **15** | **14–15 parallel `.filter` per search** | 500 caps | none | FleetSearch keystrokes |
| `fleetWorkOrderAction` | 11 | ~3–8/action | mixed | none | fleet UI |
| `fleetMechanicPortal` | 10 | ~3–8/action | mixed | `fleetMechanic*` caches (partial) | mechanic portal |
| `fleetInventoryAction` / `fleetEquipmentAction` | 9 / 8 | ~3–8/action | mixed | partial (equipment) | fleet UI |
| `fleetNotificationDispatcher` / `Worker` / `fleetScheduledReminders` / `fleetScheduledMaintenanceGeneration` / `fleetMeterMaintenanceGeneration` / `fleetIntegrityAudit` | 3–7 each (22 sites in audit) | scheduled scans; dispatcher fans out per queued row | paged | none | **scheduled workers — steady background drain** |
| `jobCostingAction` | 7 | ~4–8 | mixed | none | JobCosting page |
| `purchaseOrderAction` / `changeOrderAction` / `inventoryAction` | 6 each | ~3–6/action | mixed | none | user actions |
| `checkDeadlineReminders` | 6 | AutomationRule + Opportunity + Order + WorkOrder + EmailGroup scans | paged | none | **scheduled** |
| `monitorJurisdictionChanges` / `refreshJurisdiction` / `auditJurisdictionAccuracy` / permitting* review fns (RuleReview 8, SourceAuthority 6, OfficeAuthority 6, BacklogDispatch 7, RuleInvalidate 5, RuleExtraction 3) | 3–8 each | JurisdictionProfile/catalog scans | paged | mostly none (monitorJurisdictionChanges minor) | scheduled/manual research |
| `resolvePermittingAddress` / `findLocalityByAddress` | 5 each | PermitLocality + JurisdictionProfile catalogs + scan-run reads | paged | **5 min catalog cache; 90 s session cache; 10 min Google-denied cooldown** | LocalityPickerDialog + external scripts |
| `dataIntegrityAction` / `manageMigration` / `staffEntityWrite` | dynamic `entities[…]` (7/3/1) | varies | dynamic | none | admin tools |
| `fieldHistoryAction` | 3 | CellHistory + FieldAudit + GlobalSettings scans | paged | none | audit page |
| `manageAuthorizedUsers` / `managePTOConfig` / `manageSops` / `processWorkflowTriggers` / `backupToGoogleDrive` | 3–8 each | user/config/rule scans | paged | none | admin / scheduled |

Session-auth surcharge (all of the above): `authenticateSignShopSession` =
**2 entity reads/invoke** (AuthorizedEmail + UserSession), 60 s isolate cache —
per-call cost on cold isolates only.

---

## 3. Frontend surface read costs

"Idle reads/min" = while the page sits open in a visible tab; staff-side reads
go through `staffEntities` (30 s cache, ≤16/batch) unless noted. WO/Order big-
table reads go through `workOrderCache` (delta feed).

| Surface | Entities read | Path | Poll cadence | Cache | Est. idle reads/min |
|---|---|---|---|---|---|
| **Layout `AttentionBell`** (1 mount — side-vs-top nav conditional) | 11–12 via `attention_feed` + Notification | 2 invokes (`opportunityWorkspaceAction` + `notificationAction list_mine`) | **60 s** | server 120 s feed cache + 5 min scan cache | ~2 invokes/tick; **~6–8 entity reads/min amortized** (cold isolate: ~12 + eval/digest riders ≤1/12 min) |
| `useAllWorkOrders` (~24 consumer files: MainWorkflow, Production, Fabrication, Design, Estimating, Permitting, ProductionSchedule, MyWorkflow, SIPs, ReportingDashboard, Financials, InstallRouteMap, InstallationDeliver, MondayMorningMeeting, ProductQueues, JobWorkspace, OrderSpreadsheet, ProductQueue, OpsReportView, SalesPipelineSpreadsheet, TimeClockReportsDashboard, AddTaskDialog, AttentionFeed, customerSync) | WorkOrder | boardFeed delta | **120 s** shared queryKey + `WorkOrder.subscribe` synth-poll 120 s | delta cursor + IDB + BroadcastChannel + 30 s feed cache | **~1 delta read/2 min + ~1 subscribe read/2 min** (~1/min total, shared across all consumers) |
| `Permitting.jsx` | PermitLineItem, PermitLocality, AuthorizedEmail, GlobalSettings ×2 + WO feed | `staffEntities` + `loadAllEntityRows(cacheTtl)` | **60 s** setInterval (guarded) | cacheTtl 15–60 s + facade 30 s | ~3–6/min |
| `OrderSpreadsheet.jsx` (orders surfaces) | Order (full paged scan!), WorkOrder, AuthorizedEmail | `staffEntities`+`loadAllEntityRows` | **60 s** + **30 s** while pendingSync>0 + 5 s autosave (writes only) | aux 5 min throttle; facade 30 s; load-in-flight fence | **~2–6/min** (Order full pull ≈2 pages each tick) |
| `TimeClock` page — `AdminRosterPanels` | 8 invoke fan-out: who_is_in, list_face_enrollment, list_timeclock_audit, list_shift_templates, list_pending_requests, pto_liability_report, admin_period_compare, list_devices | `timeClockAction` ×8 parallel | **60 s** setInterval (guarded) | none | **~16–40+ entity reads/min — worst idle drain** |
| `EmployeeTodayCard` / `WorkPauseOverlay` | timeClock `status` (~6–10/action) | `timeClockAction` | **60 s** each (guarded) | none | ~6–10/min each when mounted |
| `TimeClockStatusContext` (app-wide when signed in) | `status_lite` (~3–6) | `timeClockAction` | **180 s** `usePolling` | none | ~1–2/min |
| `TimeTracker` | `time_tracker_snapshot` + `list_correction_requests` | `timeClockAction` | **300 s** + template interval | none | <1/min |
| `SalesPipelineSpreadsheet` | WorkOrder feed + SalesFilter | `useAllWorkOrders` + `SalesFilter.subscribe` | **60 s** `usePolling` + 120 s subscribe | shared feed | ~1/min + subscribe 0.5/min |
| `StageTasksPanel` | GeneralTask etc. | `loadAllEntityRows` | **60 s** (guarded) | facade 30 s | ~1–2/min |
| `FleetTracking` | BouncieVehicleLiveState + BouncieNotification + bouncieApi/status | `listAllFleetRows`/`filterAllFleetRows`/`invokeFleet` | **60 s** while connected | none (fleetDataRead) | ~2–4/min when connected |
| `FleetOverview` (mount) | **9–10 fleet entities + 5–6 invokes** (+4 admin) | `listAllFleetRows`/`filterAllFleetRows` ×9–10 + `fleetReservationAction`/`fleetWarrantyAction`/`fleetLifecycleAction`/`fleetDashboardPreferenceAction`/`bouncieApi`/`bouncieStatus` | mount only | **none — fleetDataRead uncached** | **~16–20 backend calls per mount (~20–30 entity reads)** |
| Other Fleet* pages (FleetEquipment 9, FleetMaintenance 11, FleetParts, FleetAnalytics 5, FleetInspections 6, FleetSettings 6, FleetEquipmentDetail, FleetWorkOrders) | 3–11 fleet entities each | `listAllFleetRows`/`filterAllFleetRows` + action invokes | mount-only mostly | none | ~4–12 reads/mount |
| `JurisdictionsView` | JurisdictionProfile paged | `loadAllEntityRows` | **300 s** (guarded) | facade 30 s | ~0.3/min |
| `RegulationAlertPanel` | RegulationAlert | — | **300 s** `usePolling` | — | ~0.3/min |
| `SyncConflictAlert` (admin) | SyncConflict | — | **60 s** `usePolling` | — | ~1/min (admins) |
| `SyncConflictReview` / `OrderIndependentPullEvidence` / `MondayMorningMeeting` / `SIPs` | SyncConflict / Order pull evidence / WO feed | `usePolling` | 60 s (runOnMount:false or admin-gated) | shared/feed | ~0–2/min while open |
| `SmartsheetSyncWidget` | sync status | `smartsheetSyncAction` | **1 s while running, 120 s idle** | — | ~0.5–60/min (running only) |
| `ActivityFeed` (admin) | CellHistory + ActivityLog | `staffEntities` (batched) | ~60 s + jitter | facade 30 s | ~1–2/min |
| `AnnouncementContext` | Announcement | fetch + `Announcement.subscribe` | **300 s** + 120 s synth-poll | facade | ~0.7/min |
| `DrainLiveFeed` (permitting scans) | scan queue | — | **60 s** (mounted during scans) | — | ~1/min while scanning |
| `ImportProgressContext` | import progress | invoke | **1 s during imports** | — | 60/min while importing (short-lived) |
| `QuickClockSection` | `status` | `timeClockAction` | **3 s only while a transition is pending**; geo 300 s local | — | ≤20/min during transitions only |
| `Customer360` | ~11 via `customer_workspace`/`get_customer_360` | `opportunityWorkspaceAction` | mount | none | ~10–11 reads/open |
| `EstimateDetail` | AllInOneEstimate (+Customer/WorkOrder/QuoteDefaults/Inventory… ~7) | `staffEntities` mostly `.get` retries across code paths | mount | facade | ~3–8 reads/open (call sites are conditional paths, not a single burst) |
| `Opportunities` / `SalesHome` / `CommsFollowups` / `CustomerStatements` / `CrmEventsQueue` / `OpsReportView` | Opportunity, EstimatingRequest, Invoice, Payment, Customer, Activity… (3–7 each) | `useQuery`/`loadAllEntityRows` → staffDataRead | mount + react-query staleTime 60–120 s | facade 30 s | ~3–8 reads/mount, ~0.5–1/min stale refetch |
| `GlobalSearch` (layout) | ~9 via `global_search` | `opportunityWorkspaceAction` | per keystroke (debounced) | none | ~9 reads/search |

---

## 4. Uncached >2-fan-out surfaces (flag list)

Surfaces issuing **>2 entity reads per invocation with no server-side read
cache**. Function entries count one action path each; * indicates paged scans
that multiply further by table size.

**`opportunityWorkspaceAction` (8):** `get_opportunity` (12), `customer_workspace` (~11, incl. 4 k PO scan + ≤12 per-opp Activity)*, `get_customer_360` (8 paged)*, `global_search` (~9)*, `send_digest` (4 full)*, `list_opportunities`*, `list_estimating_requests`*, `list_follow_ups`/`search_customers` (whole-table fallback)*

**`customerPortalAction` (5):** `bootstrap` customer (7+N — per-estimate `EstimateSectionAcceptance` scan)*, `bootstrap` work_order/estimate/staff_view (3–6 each), `post_message`/read-receipt paths, `estimate_respond`/`counter_offer`

**`timeClockAction` (8):** `admin_load_all` (8 full scans)*, `status` (6–10), `who_is_in`, `pto_liability_report`*, `admin_period_compare`*, `payroll_export`*, `my_history`, `monitor_stale_shifts` — **compounded by AdminRosterPanels polling 8 invokes/60 s**

**`invoicingAction` (4):** `revenue_summary`*, `export_ar`*, `list_invoiceable_estimates`*, `get_invoice` (~6) — `list_invoices`* sits at the 2-scan boundary

**Fleet functions (14):** `fleetSearch` (15 parallel filters — heaviest single action), `fleetWorkOrderAction` (11), `fleetMechanicPortal` (10), `fleetInventoryAction` (9), `fleetEquipmentAction` (8), `fleetRequestAction` (6), `fleetInspectionAction` (6), `fleetRepairEstimateAction` (6), `fleetMeterMaintenanceGeneration` (6), `fleetScheduledMaintenanceGeneration` (5), `fleetScheduledReminders` (5), `fleetMeterMaintenanceAction` (5), `fleetMaintenanceAction` (5), `fleetNotificationDispatcher` (7)

**Estimator/finance actions (4):** `jobCostingAction` (7), `purchaseOrderAction` (6), `changeOrderAction` (6), `inventoryAction` (6)

**Scheduled/admin scans (10):** `checkDeadlineReminders` (6)*, `permittingRuleReview` (8)*, `permittingResearchBacklogDispatch` (7)*, `permittingSourceAuthorityReview` (6)*, `permittingOfficeAuthorityReview` (6)*, `permittingRuleInvalidate` (5)*, `backupToGoogleDrive` (8)*, `manageAuthorizedUsers` (5), `managePTOConfig` (4), `dataIntegrityAction` (~7 dynamic)

**Frontend surfaces (10):** `FleetOverview` (~20 entity reads/mount — **fleetDataRead has no cache**), `AdminRosterPanels` (~16–40/min idle), `EmployeeTodayCard`+`WorkPauseOverlay` 60 s `status` polls (~6–10/min each), `OrderSpreadsheet` 60 s full-Order poll*, `Permitting` 60 s 5-entity poll (short TTLs), `Customer360`/`customer_workspace` (~11/open), `EstimateDetail` (~7/open), `FleetTracking` 60 s (~3/min), `TimeClockReportsDashboard`, `OpsReportView`/`CommsFollowups`/`CrmEventsQueue` (3–7 mount fans, only react-query staleTime — **staffEntities 30 s cache is the only shield**)

**Total uncached >2-fan-out surfaces: ~63** (≈53 backend action paths + ~10 frontend mount/poll surfaces).

Surfaces deliberately NOT flagged: `boardFeed` (cache+projection+delta),
`staffDataRead` (45 s cache+batch), `resolvePermittingAddress`/
`findLocalityByAddress` (catalog+session caches), `attention_feed` (120 s
cache), `notificationAction evaluate_triggers` (5 min scan cache + 10 min
throttle), `useAllWorkOrders` (delta cursor + IDB + shared queryKey),
`fleetMechanicPortal` partial caches, `subscribe()` synth-polls (1 read/2 min
each, batched path).

---

## 5. Top-5 worst offenders

1. **`AdminRosterPanels` → `timeClockAction` ×8 invokes / 60 s / open tab**
   (`src/components/timeclock/AdminRosterPanels.jsx:48-55`). Each action reads
   2–8 entities (who_is_in, audit, shift templates, pending requests, PTO
   liability, period compare, devices) — **~16–40+ entity reads/min per open
   TimeClock admin tab, zero caching.** Also the highest per-caller budget risk
   because all 8 invokes share one service token.

2. **`AttentionBell` → `opportunityWorkspaceAction attention_feed` 60 s global
   poll** (`src/components/workflow/AttentionBell.jsx:140`,
   `base44/functions/opportunityWorkspaceAction/entry.ts:607-640`). 11-table
   fan-out (each capped-first-page that trips escalates to a **full paged
   scan**); the 120 s isolate cache helps only while an isolate stays warm —
   isolate churn + many staff tabs makes this the largest *steady fleet-wide*
   drain (its own comment says so, line 47-49).

3. **`FleetOverview` mount burst** (`src/pages/FleetOverview.jsx:95-124`).
   ~16 backend calls per mount — 9–10 paged `fleetDataRead` pulls (**no TTL
   cache, in-flight dedupe only**) + 5–6 multi-entity `fleet*Action` invokes;
   admins add 4 more. Other fleet pages (FleetMaintenance, FleetEquipment,
   FleetAnalytics…) repeat the pattern at smaller scale.

4. **`opportunityWorkspaceAction` customer aggregates** —
   `customer_workspace` (`entry.ts:2274+`) and `get_customer_360`
   (`entry.ts:2150+`): 8–11 uncached reads per open incl. a **4,000-row
   PurchaseOrder scan** and ≤12 per-opportunity Activity reads;
   `get_opportunity` (`entry.ts:1353+`): 12 parallel reads. Fired on every
   workspace open with no cache and no pagination cap beyond FETCH_LIMIT.

5. **`OrderSpreadsheet` 60 s full-`Order` poll**
   (`src/components/orders/OrderSpreadsheet.jsx:345,431-454`). Re-pages the
   entire Order table every 60 s (≈2+ paged reads/tick), plus a second 30 s
   poll while `pendingSyncCount>0`; WorkOrder+AuthorizedEmail aux throttled to
   5 min. Runner-up dishonorable mention: **`smartsheetSyncAction`** — not
   idle-drain, but when a sync runs it issues full-table pulls plus **per-row
   `WorkOrder.get` readbacks in loops** (`entry.ts:1038,1095,1484`) — the
   largest single-burst consumer against the app volume cap.

---

## 6. Existing mitigations (keep these)

- **`boardFeed`**: server-side projection (`base44/shared/boardFeedFields.ts`
  — rebuild via `node scripts/build-board-feed-fields.mjs` on schema change),
  5 k-row pages, `since` delta cursor, 30 s identical-pull cache, staff-session
  gate.
- **`workOrderCache.js`**: delta cursor + 30 min full resync, IndexedDB
  snapshot persistence, BroadcastChannel cross-tab snapshot sharing, in-flight
  dedupe, cooling-down/429 keeps stale rows.
- **`staffEntities` facade**: 30 ms mount-storm batching (≤16/invoke), 30 s
  positive cache (write-busted, session-keyed), 403 negative cache,
  `subscribe()` synthetic 120 s digests instead of platform subscriptions.
- **`staffDataRead`**: 45 s per-entry cache + in-flight dedupe + 16-wide
  batches at concurrency 4.
- **`usePolling`**: visibility + circuit-breaker aware, jittered, in-flight
  guarded, focus-refresh dedupe.
- **`fleetInvoke`/`requestGovernor`/`rateLimitCooldown`**: maxConcurrent 6,
  global 429 breaker (20 s→60 s) consulted by every background tick.
- **`attention_feed`**: 120 s isolate cache + capped-first-page reads +
  single-Estimate-scan merge (#401/#406).
- **`notificationAction`**: 5 min `scanCache`, 10 min `EVAL_THROTTLE_MS`, bell
  client-side 12 min `EVAL_GAP_MS`.
- **`signShopSession`**: 60 s auth cache (was ~2 reads/invoke before).
- **`findLocalityByAddress`/`resolvePermittingAddress`**: 5 min catalog cache,
  90 s session cache, 10 min Google REQUEST_DENIED cooldown.
- **`smartsheetSyncAction`**: `syncPullFields` derived projection on sales pulls.
- **`loadAllEntityRows` (client)**: optional `cacheTtlMs` ≤30 s +
  `primeEntityRowsCache` seeding from batch reads (Permitting uses 15–60 s).

## 7. Gaps / cheapest wins

- `fleetDataRead` lacks the 45 s cache `staffDataRead` has — one TTL there
  collapses most fleet-page mount storms (FleetOverview = ~20 reads → ~10).
- `AdminRosterPanels` needs a single `admin_roster_snapshot` aggregate action
  (one invoke) and/or a 60–120 s server cache — currently the worst idle drain.
- `customer_workspace`/`get_customer_360`/`get_opportunity`/`global_search`
  have no cache — a 30–60 s per-key isolate cache (same pattern as
  `attention_feed`) removes re-open storms; PO scan could key on
  `updated_date` delta.
- `OrderSpreadsheet`'s 60 s full-Order re-page could ride the Order `boardFeed`
  feed (delta cursor already exists for Order) or drop to `since`-bounded reads.
- `subscribe()` synth-polls cost 1 read/entity/2 min per tab — the
  BroadcastChannel already used by `workOrderCache` could elect one tab as the
  poller and share digests.
- Session auth (2 reads/invoke) is only isolate-cached — per-token server-side
  TTL longer than 60 s would cut cold-isolate surcharges further.

*Method note: read counts are static call-site analysis (grep + read); a
`loadAllEntityRows` site = ≥1 entity_list call per 2 k rows (server) or 500 rows
(client). Where a dispatcher only fires one action per invoke, fan-out is
reported per action, not per file.*
