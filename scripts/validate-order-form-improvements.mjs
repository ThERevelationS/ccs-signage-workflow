import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderDueState, orderNeededDate } from "../src/shared/orderDueState.mjs";

const spreadsheet = readFileSync("src/components/orders/OrderSpreadsheet.jsx", "utf8");
const mobileDetail = readFileSync("src/components/orders/OrderMobileDetail.jsx", "utf8");
const cellMenu = readFileSync("src/components/shared/CellContextMenu.jsx", "utf8");
const dupReview = readFileSync("src/components/orders/OrderDuplicateReview.jsx", "utf8");
const page = readFileSync("src/pages/OrderForm.jsx", "utf8");
const orderEntity = readFileSync("base44/entities/Order.jsonc", "utf8");

let checks = 0;
const yes = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

// ---- Overdue due-state semantics ----
const open = { status: "pending", date_needed: "2026-10-20" };
same(orderDueState(open, "2026-10-23"), "overdue", "Past needed date on an open order is overdue");
same(orderDueState(open, "2026-10-20"), "due_soon", "Needed today counts as due soon");
same(orderDueState({ ...open, date_needed: "2026-10-25" }, "2026-10-23"), "due_soon", "Needed within 3 days is due soon");
same(orderDueState({ ...open, date_needed: "2026-11-01" }, "2026-10-23"), "ok", "Needed beyond 3 days is not flagged");
same(orderDueState({ ...open, date_received: "2026-10-19" }, "2026-10-23"), "ok", "A received order is never overdue");
same(orderDueState({ ...open, receipt_option: "In Stock" }, "2026-10-23"), "ok", "A receipt option marks the order fulfilled");
same(orderDueState({ ...open, status: "cancelled" }, "2026-10-23"), "ok", "A cancelled order is never overdue");
same(orderDueState({ status: "pending", date_needed_option: "ASAP" }, "2026-10-23"), "ok", "A text needed option is never overdue");
same(orderDueState({ status: "pending", date_needed: "not-a-date" }, "2026-10-23"), "ok", "An unparsable needed date is never overdue");
same(orderNeededDate({ date_needed: "2026-02-31" }), null, "Impossible calendar dates are rejected");

// ---- Overdue badge, count and filter wiring ----
yes(spreadsheet.includes('orderDueState(order, todayStr) === "overdue"') &&
    spreadsheet.includes('orderDueState(order, todayStr) === "due_soon"'),
  "Date Needed cell must render Overdue and Due soon badges");
yes(spreadsheet.includes("overdueCount") && spreadsheet.includes("overdue orders"),
  "The counts bar must surface the overdue order count");
yes(spreadsheet.includes('filterStatus === "overdue" && orderDueState(order, todayStr) !== "overdue"'),
  "The overdue filter must restrict rows to overdue open orders");
yes(page.includes('value="overdue">Overdue'), "The Order Form filter must offer an Overdue option");

// ---- Mobile detail replaces alert() ----
yes(!spreadsheet.includes("onOpenDetails={(order) => alert("),
  "Mobile order cards must not open an alert() stub");
yes(spreadsheet.includes("<OrderMobileDetail") && spreadsheet.includes("setMobileDetailOrderId(order.id)"),
  "Mobile order cards must open the detail dialog");
yes(mobileDetail.includes("onMarkReceived") && mobileDetail.includes("onMarkOrdered") &&
    mobileDetail.includes("Mark Received"),
  "The mobile detail dialog must offer Mark Ordered and Mark Received actions");
yes(mobileDetail.includes("onUpdate(order.id"), "Mobile field edits must route through the shared updateOrder path");

// ---- Quick actions through verified writes ----
yes(spreadsheet.includes("const markOrderOrdered = async (order)") &&
    spreadsheet.includes("const markOrderReceived = async (order)"),
  "Shared mark helpers must exist for context menu and mobile dialog");
yes(spreadsheet.includes("validateOrderForReceived(order)"),
  "Mark Received must run the existing received-field validation");
const orderedPersistIdx = spreadsheet.indexOf('"Mark ordered today"');
const receivedPersistIdx = spreadsheet.indexOf('"Mark received today"');
yes(orderedPersistIdx > 0 && receivedPersistIdx > 0 &&
    spreadsheet.indexOf("persistImmediateOrderFields", orderedPersistIdx - 500) > 0,
  "Mark actions must write through persistImmediateOrderFields");
yes(spreadsheet.includes("actions={orderContextActions(contextMenu.order)}"),
  "The Order cell context menu must receive per-order quick actions");
yes(cellMenu.includes("actions = []") && cellMenu.includes("action.onSelect?.()"),
  "CellContextMenu must render optional caller actions above Field History");

// ---- Search coverage ----
yes(spreadsheet.includes("linkedJob?.title") && spreadsheet.includes("linkedJob?.est_inv_at"),
  "Order search must include the linked Work Order job title and est/inv number");

// ---- Duplicate warning ----
yes(spreadsheet.includes("duplicateOrderIds.has(order.id)") &&
    spreadsheet.includes("Possible duplicate"),
  "Open orders sharing customer+description+vendor must show a duplicate warning");

// ---- Duplicate review workflow ----
yes(spreadsheet.includes('duplicate_review_status === \'not_duplicate\''),
  "A verified 'not duplicates' decision must stop flagging the Order");
yes(spreadsheet.includes("duplicateGroupsById"),
  "The duplicate detector must keep group membership for review");
yes(spreadsheet.includes('filterStatus === "duplicates" && !duplicateOrderIds.has(order.id)'),
  "The duplicates filter must restrict rows to flagged open orders");
yes(page.includes('value="duplicates">Possible Duplicates'),
  "The Order Form filter must offer a Possible Duplicates option");
yes(spreadsheet.includes("setDuplicateReviewOrderId(order.id)") &&
    spreadsheet.includes("<OrderDuplicateReview"),
  "Clicking the duplicate badge must open the review dialog");
yes(spreadsheet.includes("handleDuplicateKeep") &&
    spreadsheet.includes('label: "Order duplicate review keep"') &&
    spreadsheet.includes("softDeleteOrderFromLoadedSnapshot"),
  "Keep-one must trash the rest through the guarded soft-delete path");
yes(spreadsheet.includes("removeOrdersFromState([other.id])"),
  "Trashed duplicates must leave every local edit/sync ledger");
yes(spreadsheet.includes("handleDuplicateNotDuplicates") &&
    spreadsheet.includes("nextFields: { duplicate_review_status: 'not_duplicate' }"),
  "The not-duplicate decision must write only the Base44-only review field");
const notDupBody = spreadsheet.slice(
  spreadsheet.indexOf("handleDuplicateNotDuplicates"),
  spreadsheet.indexOf("handleDuplicateNotDuplicates") + 2500);
yes(!notDupBody.includes("smartsheet_pending_local_sync"),
  "The review annotation must not queue a Smartsheet write");
yes(dupReview.includes("Keep Order") && dupReview.includes("Not duplicates") &&
    dupReview.includes("COMPARE_FIELDS") && dupReview.includes("smartsheet_row_id"),
  "The review dialog must compare fields, show row links, and offer explicit decisions");
yes(dupReview.includes("recoverable") && dupReview.includes("Nothing changes in Smartsheet"),
  "The review dialog must disclose that trashing is recoverable and Smartsheet is untouched");
yes(orderEntity.includes('"duplicate_review_status"'),
  "The Order entity must declare the review annotation field");
yes(!spreadsheet.slice(spreadsheet.indexOf("const confirmDelete"), spreadsheet.indexOf("const getFilteredWorkOrders")).includes("pendingSyncVersionRef.current.delete(target.id)"),
  "The single-row delete must reuse the shared removeOrdersFromState cleanup");

console.log(`Order Form improvements: ${checks}/${checks} PASS.`);
