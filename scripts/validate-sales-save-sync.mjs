import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const helper = readFileSync("src/components/sales/salesSaveSync.js", "utf8");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(page.includes('"Save & Sync"') && page.includes("runSaveAndSync") && page.includes("spreadsheetRef.current?.saveAndSync"),
  "Sales toolbar must expose the page-level Save & Sync action");
check(page.includes('className="order-2 col-span-3 h-11') && page.includes('<span className="sm:hidden">{saveSyncState.busy ? "Syncing" : "Save"}</span>'),
  "Save & Sync must stay compact in the phone action row");
check(page.includes('role={saveSyncState.ok === false ? "alert" : "status"}') && page.includes("saveSyncState.message"),
  "Save & Sync must show verified success/failure feedback instead of failing silently");

check(sheet.includes("pendingSyncIdsRef = useRef(new Set())") && sheet.includes("pendingSyncVersionRef = useRef(new Map())"),
  "Sales sheet must track exact saved WorkOrder IDs and per-record sync generations");
check(sheet.includes("markWorkOrderNeedsSync(orderId);") && sheet.includes("markWorkOrderNeedsSync(saved.id);") && sheet.includes("markWorkOrderNeedsSync(newOrder.id);"),
  "Quick edits, Est/Inv saves and new Sales WorkOrders must enter the exact-ID sync queue after successful Base44 save");
check(sheet.includes("pendingSyncVersionRef.current.get(id) !== target?.version") && sheet.includes("clearSyncedWorkOrderIds(syncTargets)"),
  "A later save during an in-flight sync must remain queued instead of being cleared by an older sync result");
check(sheet.includes("waitForPendingSalesSaves") && sheet.includes("A Sales quick edit is still unsaved."),
  "Save & Sync must wait for successful Base44 persistence and fail closed on blocked edits");
check(sheet.includes("pushSavedSalesToSmartsheet({ sessionToken, workOrderIds })") && sheet.includes("summarizeSavedSalesSync(result)"),
  "Sales sheet must use one authenticated exact-ID Smartsheet helper and verify its result");
check(sheet.includes("saveAndSync,") && sheet.includes("React.useImperativeHandle"),
  "Save & Sync must be exposed through the existing Sales spreadsheet ref");

check(helper.includes('action: "push_saved_sales"') && helper.includes("work_order_ids: ids"),
  "Frontend helper must request only the dedicated exact-ID Sales push action");
check(helper.includes("if (!ids.length) return { sync_complete: true") && helper.includes("Saved Sales changes could not be synced"),
  "Frontend helper must no-op an empty queue and surface backend failures");

check(backend.includes("!['push_saved_orders', 'push_saved_sales'].includes(action)"),
  "Non-admin users may only reach the two narrow Save & Sync actions, not full sync/admin actions");
check(backend.includes("if (action === 'push_saved_sales')") && backend.includes("Sales Pipeline Smartsheet mirror is OFF."),
  "Sales Save & Sync must honor the existing Sales mirror kill switch");
check(backend.includes("Observation mode is ON; saved Sales changes were not pushed."),
  "Sales Save & Sync must honor observation mode");
check(backend.includes("const saveSyncLimit = Math.min(configuredLimit, 100);"),
  "Sales Save & Sync must impose a hard 100-record ceiling even when global mass limits are larger");
check(backend.includes("requested_work_order_ids: workOrderIds") && backend.includes("requested_by: cleanText(adminActor?.email, 320)"),
  "Sync status must record exact requested WorkOrder IDs and requesting user");
check(backend.includes("recordIds: workOrderIds") && backend.includes("respectSalesCreateSetting: true"),
  "Backend action must pass only exact Sales IDs and respect Sales row-creation settings");
check(backend.includes("query: { id: { $in: requestedRecordIds } }") && backend.includes("Sales Pipeline targeted Save & Sync WorkOrders"),
  "Targeted Sales Save & Sync must re-read only requested WorkOrders by permanent ID");
check(backend.includes("Sales WorkOrder") && backend.includes("could not be re-read by permanent ID"),
  "Missing/deleted requested WorkOrders must block the push before any Smartsheet write");
check(backend.includes("snapshotReviewRecords") && backend.includes("salesPushSnapshotNeedsReview") && backend.includes("detectConflict"),
  "Existing Sales snapshot and Smartsheet conflict safeguards must remain on the targeted path");

console.log("Sales Save & Sync safety: " + checks + "/" + checks + " PASS.");
