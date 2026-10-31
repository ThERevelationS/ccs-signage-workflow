# Integration Progress — CoreBridge Superset Masterplan

Append-only run log. Resume rule: read this file, verify last checkpoint vs remote, continue at CURRENT line.

## CURRENT
Phase 4 — Customer 360 hub: customer_workspace backend action + page + inbound link rewrites.

## Phase status
| Phase | Status | Checkpoint |
|---|---|---|
| 0 discoverability | DONE | 6ae5eb989403141a197b3e9c |
| 1 deep-link spine | DONE | 6ae5f41181aa42baa4d60652 |
| 2 estimate relax | DONE | 6ae5f775924f04f67e10d33a |
| 3 stage sync | DONE | 6ae5fafe32bb4d1670335192 |
| 4 customer 360 | — | — |
| 5 alerts | — | — |
| 6 scale | — | — |
| 7 financial | — | — |
| 8 smtp | — | — |
| 9 ui kit | — | — |
| 10 migration | — | — |
| 11 verify | — | — |

## Log
- Phase 0: CommandPalette +10 pages (EXTRA_PAGE_NAMES, label overrides, WO→/JobWorkspace?wo=); Layout sidebar +Ops Reports/Statements/Reconciliation (+FileText/Scale icons); validator palette-coverage+sidebar asserts; PASS validator; esbuild clean.
- Line endings vary per file (CommandPalette=CRLF, Layout=LF) — check before multi-line sandbox edits; JSON edit payloads must not contain lone backslashes (use [?] char-class).
- Phase 1: deep-link spine landed (agents 2717acb6+6576e21b). WorkOrderDetailsDialog/EstimateDetail/ProductQueue→JobWorkspace+customer links; JobWorkspace→JobCosting(?job=)/POs(?wo=)/Statement/customer; Invoices/JobCosting/PO/CrmEvents/FollowupQueue/Statements cross-links. I wired PurchaseOrders ?wo= filter+banner and CustomerStatements ?customer= preselect (were dead params). JobCosting convention is ?job= NOT ?wo=. Imports skipped (no per-record ids). PASS link-spine-a+b.
- Phase 2: Edit auto-opens/creates revision via existing startEstimateRevision/ensureOpenEstimateRevision (handleEditProtected), all guards kept (CAS, price-acceptance, pipeline_sync_pending); cancelled stays locked (decision, flippable); trash open to all statuses, WO-delete guard deep-links to job; EstimatorQueues quick actions dup/archive/trash + FIXED pre-existing missing useRef import crash; ZERO InventoryMovement on estimate paths confirmed. PASS estimate-relax + lifecycle/save-recovery/persistence regression.
- Phase 3: productStageSync.js (weakest-link rollup, PRODUCT_TO_STAGE map, never-regresses); GlobalSettings.productStatusDrivesStage off/suggest(default)/auto; suggestion banner in JobWorkspace, per-row stage chip in ProductQueue, rollup chip on WorkOrderCard; open-products warning in central complete dialogs (all completion paths funnel there). Auto-mode surprises documented (board-drop on completed, queue-lens drift, permit-guard notice, re-roll triggers, proof cascade). PASS product-stage-sync+queue-model+operational-status.
- Phase 6 PREP (agent 4c4a6bd1 scale audit): loadAllEntityRows is SAFE (500/page, throws fail-closed at 50k). Real caps are backend: SDK default .filter()/.list()=50 rows — invoicingAction list_invoices fetches 50 then slices 250 (AR aging WRONG today >50 inv), export_ar 50/50, email_statement 50, full_backup 50/entity (not full!), global_search scans only 50 inv/PO/CO, search_customers only 50, list_opportunities 500+stats, list_purchase_orders/list_change_orders/list_stock 50→slice, jobCosting 400→300, customerPortal bootstrap 50/entity, dataIntegrity orphans newest-500, corebridgeApiAction throws >10k WOs. staffDataRead gateway: default 100, silently clamps >500, drops cursor+fields options, count() bounded. Permitting.jsx primes shared cache with 100-row partials (poisons other callers). boardFeed MAX_ROWS 20k, truncated only honored on delta pulls. Server-side pushdown EXISTS: filter(query,sort,limit,skip)+cursor+fields+regex ops; fleetSearch is the template. Pre-existing silent bugs: EstimatorQueues stale reload (RLS-blocked entity in catch), QuoteSettings TaxGroup TypeError (empty list), fields option dropped. Phase 6 becomes backend-first: paged reads via shared/pagedEntityRows.ts + regex pushdown, then staffDataRead cursor/count passthrough, then frontend notices + silent-bug fixes. Deploys needed beyond listed: invoicingAction, purchaseOrderAction, changeOrderAction, inventoryAction, jobCostingAction, customerPortalAction, boardFeed — granted under approved-flow autonomy (additive fixes, logged here).
