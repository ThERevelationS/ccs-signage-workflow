// Pure computed-section logic for the unified attention feed
// (src/components/workflow/AttentionFeed.jsx) and the bell badge
// (src/components/workflow/AttentionBell.jsx). No I/O — callers load rows
// through the staff gateways and pass plain arrays in, so the module bundles
// cleanly under esbuild for scripts/test-unified-alerts.mjs.
//
// Computed attention items, each deep-linked to its record route:
//   overdueProducts       — product_due_date < today && non-terminal status
//                           (/ProductQueues)
//   dueCrmEvents          — open CRM events due today or overdue (/CrmEvents)
//   dueCommsFollowups     — comms follow-up queue items due (/CommsFollowups)
//   overdueInvoices       — due_date passed && balance_due > 0
//                           (/Invoices?invoice=)
//   overdueOpenPos        — open POs past expected_date (/PurchaseOrders?po=)
//   varianceBatches       — reconciliation batches closed with variance
//                           (/Reconciliation)

import { flattenQueueRows } from "@/components/queues/productQueueModel";
import { isOpenEvent } from "@/components/crm/crmEventsModel";
import { findDueFollowups } from "@/components/comms/followupModel";

const clean = (v) => String(v ?? "").trim();
const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const isoDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const endOfToday = (now = new Date()) => {
  const d = new Date((now && now.getTime ? now.getTime() : Date.now()));
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

// Feed category keys for the client-computed sections. The invoice/PO overdue
// rows merge into the server feed's existing "invoices"/"pos" categories
// (deduped by id) — those keys stay unchanged so stored hide/snooze prefs keep
// working.
export const COMPUTED_SECTION_KEYS = [
  "overdue_products",
  "crm_events_due",
  "comms_followups_due",
  "recon_variance_batches",
];

// Products whose product_due_date already passed on a non-terminal row.
// flattenQueueRows drops deleted/completed work orders and fulfilled products
// (picked_up/installed/shipped/delivered are the terminal fulfillments).
export function overdueProducts(workOrders = [], now = new Date()) {
  const today = isoDay(now);
  return flattenQueueRows(workOrders, { dueField: "product_due_date" })
    .filter((row) => clean(row.due) && clean(row.due).slice(0, 10) < today)
    .sort((a, b) => clean(a.due).localeCompare(clean(b.due)));
}

// Open CRM events due today or overdue (due_at <= end of today).
export function dueCrmEvents(activities = [], now = new Date()) {
  const cutoff = endOfToday(now);
  return (Array.isArray(activities) ? activities : [])
    .filter((a) => {
      if (!isOpenEvent(a)) return false;
      const t = Date.parse(clean(a?.due_at));
      return Number.isFinite(t) && t <= cutoff;
    })
    .sort((a, b) => Date.parse(clean(a?.due_at)) - Date.parse(clean(b?.due_at)));
}

// Comms follow-ups currently due — the same findDueFollowups model that
// drives /CommsFollowups, so the feed suggests exactly what the queue sends.
export function dueCommsFollowups({ estimates, invoices, activities, rules, now } = {}) {
  return findDueFollowups({ estimates, invoices, activities, rules, now: now || new Date() });
}

// Overdue open invoices — the same predicate the Invoices page Overdue filter
// uses: positive balance on an issued invoice whose due date already passed.
export function overdueInvoices(invoices = [], now = new Date()) {
  const today = isoDay(now);
  return (Array.isArray(invoices) ? invoices : [])
    .filter((i) => num(i?.balance_due) > 0
      && ["sent", "partially_paid"].includes(clean(i?.status))
      && clean(i?.due_date) && clean(i?.due_date) < today)
    .sort((a, b) => clean(a?.due_date).localeCompare(clean(b?.due_date)));
}

// Overdue open POs — mirrors the PurchaseOrders page isOverdue predicate:
// sent or partially received with expected_date before today.
export function overdueOpenPos(purchaseOrders = [], now = new Date()) {
  const today = isoDay(now);
  return (Array.isArray(purchaseOrders) ? purchaseOrders : [])
    .filter((p) => ["sent", "partially_received"].includes(clean(p?.status))
      && clean(p?.expected_date) && clean(p?.expected_date) < today)
    .sort((a, b) => clean(a?.expected_date).localeCompare(clean(b?.expected_date)));
}

// Reconciliation batches closed with a non-zero variance, most recent first.
export function varianceBatches(batches = []) {
  return (Array.isArray(batches) ? batches : [])
    .filter((b) => Math.abs(num(b?.variance)) >= 0.005)
    .sort((a, b) => clean(b?.closed_at).localeCompare(clean(a?.closed_at)));
}

// Union helper for merging server-feed rows with computed rows — dedupes by
// record id so a record never renders twice when both paths report it.
export function dedupeById(rows = []) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const key = clean(r?.id) || JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Bell-badge snapshot ------------------------------------------------------
// The feed publishes its latest computed sections so AttentionBell can include
// them in the badge count without fetching the sources itself.
let latestComputed = {};
export function publishComputedAttention(sections = {}) {
  latestComputed = sections && typeof sections === "object" ? sections : {};
}
export function computedAttentionCount() {
  return Object.values(latestComputed).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}
