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
