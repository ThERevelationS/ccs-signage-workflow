import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderDueState, orderNeededDate } from "../src/shared/orderDueState.mjs";

const spreadsheet = readFileSync("src/components/orders/OrderSpreadsheet.jsx", "utf8");
const mobileDetail = readFileSync("src/components/orders/OrderMobileDetail.jsx", "utf8");
const cellMenu = readFileSync("src/components/shared/CellContextMenu.jsx", "utf8");
const page = readFileSync("src/pages/OrderForm.jsx", "utf8");

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

console.log(`Order Form improvements: ${checks}/${checks} PASS.`);
