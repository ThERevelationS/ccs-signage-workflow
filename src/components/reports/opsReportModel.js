// Pure report builders for the CoreBridge-style operations report suite.
// React-free so every builder is unit-testable under Node (scripts/test-ops-reports.mjs).
//
// Uniform result shape — the view renders and CSV-exports every report the
// same way:
//   {
//     columns: [{ key, label, align: "left"|"right", format: "text"|"money"|"int"|"num1"|"percent"|"date" }],
//     rows: [[cell, ...]],              // raw values; view formats by column
//     totals: [cell, ...] | null,       // aligned to columns, first cell is a label
//     rowLinks: [href|null, ...],       // parallel to rows — drilldown target
//   }
//
// Data notes / honest gaps (fields verified against base44/entities/*.jsonc):
// - Product value = products[].quoted_total (fallback quoted_unit_price x
//   quantity). Cost/margin reports are NOT possible from WorkOrder data —
//   no cost fields exist on products (jobCostingAction computes those).
// - On-time completion date: products carry no fulfilled_at field, so the
//   latest status_history entry (field "fulfillment_state", `to` a fulfilled
//   state) is used; when missing and the order is completed, the order's
//   updated_date is the documented proxy.
// - Days in WIP = work-order created_date -> product completion date. There
//   is no per-product created_date.
// - Invoices arrive via invoicingAction.list_invoices (snapshot fields);
//   open AR = status sent|partially_paid with balance_due > 0, matching the
//   backend agingSummary() rule. Payments have no list action, so payment
//   detail comes from invoicingAction.export_ar → payments_csv, parsed by
//   statementModel.paymentsFromArCsv (same path CustomerStatements uses).
// - WorkOrder has no location/sales_center field; the location filter only
//   applies to AllInOneEstimate.sales_center.
// - Parts Needed joins WorkOrder products → BuilderPart (builder_product_id)
//   → Inventory (inventory_item_id) → open PurchaseOrder lines. BuilderPart/
//   BuilderProduct/Inventory are staffDataRead entities; PurchaseOrder is not
//   staff-readable, so the view fetches open POs via purchaseOrderAction
//   list_purchase_orders + get_purchase_order (line items only ship on the
//   detail action — open-PO fetch is capped and documented on the def).
// - Estimate funnel is a created-month COHORT report: sent/approved/converted
//   flags describe whether the estimate ever reached the stage (quote_issue_
//   date / accepted_at / work_order_id), not when — those transitions have no
//   per-stage timestamp on the estimate row itself.
// - Overrides audit only reports verifiable manual-price signals (line
//   price_state = "manual", adjustment_percent, BuilderProduct price_state =
//   "manual", BuilderPart manual_cost_override / detached_override). No
//   inferred overrides.

import {
  FULFILLED_STATES,
  daysInStatus,
  overdueDays,
  parseLocalDate,
} from "../queues/productQueueModel";
import { isVoidStatus } from "../statements/statementModel";

const DAY = 86400000;
const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => Math.round(num(n) * 100) / 100;
const qty = (n) => Math.round(num(n) * 1000) / 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// "YYYY-MM" month key in local time; "" when undated.
const monthKey = (value) => {
  const d = parseLocalDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  const d = parseLocalDate(`${key}-01`);
  return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : key;
};

// --- label maps (enum values verified against WorkOrder.jsonc) -----------------

export const OPS_STATUS_ORDER = [
  "order_review", "site_survey", "awaiting_customer_action", "awaiting_proof_approval",
  "permitting", "proof_approved", "design_review", "in_design", "in_production",
  "quality_control", "service_repair", "install_or_removal_only", "vended", "none",
];

export const OPS_STATUS_LABELS = {
  order_review: "Order Review",
  site_survey: "Site Survey",
  awaiting_customer_action: "Awaiting Customer Action",
  awaiting_proof_approval: "Awaiting Proof Approval",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "Design Review",
  in_design: "In Design",
  in_production: "In Production",
  quality_control: "Quality Control",
  service_repair: "Service/Repair",
  install_or_removal_only: "Install or Removal Only",
  vended: "Vended",
  none: "No Status",
};

export const STAGE_ORDER = [
  "estimating", "sales", "permitting", "design", "production",
  "fabrication", "installation", "completed",
];

export const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation", completed: "Completed", none: "No Stage",
};

const humanize = (key) => clean(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statusLabel = (s) => OPS_STATUS_LABELS[norm(s) || "none"] || humanize(s);
const stageLabel = (s) => STAGE_LABELS[norm(s) || "none"] || humanize(s);

const statusRank = (s) => {
  const i = OPS_STATUS_ORDER.indexOf(norm(s) || "none");
  return i === -1 ? OPS_STATUS_ORDER.length : i;
};
const stageRank = (s) => {
  const i = STAGE_ORDER.indexOf(norm(s) || "none");
  return i === -1 ? STAGE_ORDER.length : i;
};

// --- shared cell math -----------------------------------------------------------

// Customer-facing product value: quoted_total is authoritative at conversion;
// unit price x quantity is the fallback for products priced before totals
// were stamped.
export function productValue(product) {
  if (!product) return 0;
  const total = num(product.quoted_total);
  if (total) return total;
  return num(product.quoted_unit_price) * (num(product.quantity) || 1);
}

// Order value = sum of product quoted totals; estimate_amount is the fallback
// for orders whose products carry no pricing.
export function workOrderValue(wo) {
  const products = Array.isArray(wo?.products) ? wo.products.filter(Boolean) : [];
  if (products.length) return products.reduce((s, p) => s + productValue(p), 0);
  return num(wo?.estimate_amount);
}

// Best available completion date for one product: the last status_history
// entry that moved fulfillment_state into a fulfilled state; otherwise the
// order's updated_date when the order itself is completed. Documented proxy —
// products carry no dedicated fulfilled_at field.
export function productCompletedAt(product, wo) {
  const history = Array.isArray(product?.status_history) ? product.status_history : [];
  let fulfilledAt = "";
  for (const entry of history) {
    if (norm(entry?.field) === "fulfillment_state" && FULFILLED_STATES.includes(norm(entry?.to)) && entry?.at) {
      if (String(entry.at) > fulfilledAt) fulfilledAt = String(entry.at);
    }
  }
  if (fulfilledAt) return parseLocalDate(fulfilledAt);
  if (wo?.completed === true) return parseLocalDate(wo?.updated_date);
  return null;
}

const isClosed = (product, wo) =>
  FULFILLED_STATES.includes(norm(product?.fulfillment_state)) || wo?.completed === true;

// Due date for lateness: the product due date first, then the order's
// install date / due date when the product has none.
export function productDueDate(product, wo) {
  return product?.product_due_date || wo?.project_install_date || wo?.due_date || "";
}

const sum = (list, pick = (x) => x) => list.reduce((s, x) => s + num(pick(x)), 0);
const avg = (list) => (list.length ? sum(list) / list.length : null);

// Whole days between two dates (b - a); null when either side is missing.
const wholeDays = (a, b) => {
  if (!a || !b) return null;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
};

// --- builders -------------------------------------------------------------------

// WIP by Product Status — count + quoted value per operational_status.
// `rows` must be flattenQueueRows() output (deleted/completed orders and,
// unless includeFulfilled was passed, fulfilled products already excluded).
export function wipByProductStatus(rows = []) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = norm(row?.status) || "none";
    const g = groups.get(key) || { key, count: 0, value: 0 };
    g.count += 1;
    g.value = money(g.value + productValue(row?.product));
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (statusRank(a.key) - statusRank(b.key)) || b.count - a.count || a.key.localeCompare(b.key));
  return {
    columns: [
      { key: "status", label: "Product Status" },
      { key: "products", label: "Products", align: "right", format: "int" },
      { key: "value", label: "Quoted Value", align: "right", format: "money" },
    ],
    rows: sorted.map((g) => [statusLabel(g.key), g.count, g.value]),
    totals: ["Total", sum(sorted, (g) => g.count), money(sum(sorted, (g) => g.value))],
    rowLinks: sorted.map(() => null),
  };
}

// WIP by Order Stage — count + quoted value per WorkOrder.current_stage.
// Deleted and completed orders are excluded (they are not WIP).
export function wipByOrderStage(workOrders = []) {
  const groups = new Map();
  for (const wo of workOrders || []) {
    if (!wo?.id || wo.deleted === true || wo.completed === true) continue;
    const key = norm(wo.current_stage) || "none";
    const g = groups.get(key) || { key, orders: 0, products: 0, value: 0 };
    g.orders += 1;
    g.products += (Array.isArray(wo.products) ? wo.products : []).filter(Boolean).length;
    g.value = money(g.value + workOrderValue(wo));
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (stageRank(a.key) - stageRank(b.key)) || b.orders - a.orders || a.key.localeCompare(b.key));
  return {
    columns: [
      { key: "stage", label: "Order Stage" },
      { key: "orders", label: "Orders", align: "right", format: "int" },
      { key: "products", label: "Products", align: "right", format: "int" },
      { key: "value", label: "Quoted Value", align: "right", format: "money" },
    ],
    rows: sorted.map((g) => [stageLabel(g.key), g.orders, g.products, g.value]),
    totals: [
      "Total",
      sum(sorted, (g) => g.orders),
      sum(sorted, (g) => g.products),
      money(sum(sorted, (g) => g.value)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Overdue products — detail rows grouped/sorted by owner (responsibility,
// falling back to assigned_to). Days overdue is measured on the product due
// date (order install/due date fallback) in local time.
export function overdueReport(rows = [], now = new Date()) {
  const detail = [];
  for (const row of rows || []) {
    const days = overdueDays(row, now);
    if (days <= 0) continue;
    detail.push({
      owner: clean(row?.responsibility) || clean(row?.assignedTo) || "Unassigned",
      ref: clean(row?.ref) || clean(row?.workOrderId),
      company: clean(row?.company),
      productName: clean(row?.productName),
      status: statusLabel(row?.status),
      due: clean(row?.due || row?.woDue),
      days,
      value: money(productValue(row?.product)),
      workOrderId: clean(row?.workOrderId),
    });
  }
  detail.sort((a, b) =>
    a.owner.localeCompare(b.owner) || b.days - a.days || a.due.localeCompare(b.due || "9999") || a.ref.localeCompare(b.ref));
  return {
    columns: [
      { key: "owner", label: "Responsibility / Assigned" },
      { key: "ref", label: "Order" },
      { key: "company", label: "Company" },
      { key: "product", label: "Product" },
      { key: "status", label: "Status" },
      { key: "due", label: "Due", format: "date" },
      { key: "days", label: "Days Overdue", align: "right", format: "int" },
      { key: "value", label: "Quoted Value", align: "right", format: "money" },
    ],
    rows: detail.map((d) => [d.owner, d.ref, d.company, d.productName, d.status, d.due, d.days, d.value]),
    totals: [`Total — ${detail.length} product${detail.length === 1 ? "" : "s"}`, "", "", "", "", "", "", money(sum(detail, (d) => d.value))],
    rowLinks: detail.map((d) => (d.workOrderId ? `/JobWorkspace?wo=${d.workOrderId}` : null)),
  };
}

// On-time vs late — products that reached a fulfilled state (or whose order
// is completed), classified against the product due date. "Avg days in WIP"
// runs work-order created_date -> completion (documented proxy: products
// have no created date of their own). "Days vs due" is positive when late.
export function onTimeReport(workOrders = []) {
  const buckets = {
    on_time: { label: "On Time", count: 0, wipDays: [], variance: [] },
    late: { label: "Late", count: 0, wipDays: [], variance: [] },
    unrated: { label: "No Due or Completion Date", count: 0, wipDays: [], variance: [] },
  };
  for (const wo of workOrders || []) {
    if (!wo?.id || wo.deleted === true) continue;
    const created = parseLocalDate(wo.created_date);
    for (const product of Array.isArray(wo.products) ? wo.products : []) {
      if (!product || !isClosed(product, wo)) continue;
      const completedAt = productCompletedAt(product, wo);
      const due = parseLocalDate(productDueDate(product, wo));
      const wipDays = wholeDays(created, completedAt);
      const variance = wholeDays(due, completedAt);
      let bucket = "unrated";
      if (completedAt && due) bucket = variance > 0 ? "late" : "on_time";
      const b = buckets[bucket];
      b.count += 1;
      if (wipDays != null) b.wipDays.push(wipDays);
      if (variance != null) b.variance.push(variance);
    }
  }
  const rated = buckets.on_time.count + buckets.late.count;
  const ratedWip = [...buckets.on_time.wipDays, ...buckets.late.wipDays];
  const ratedVar = [...buckets.on_time.variance, ...buckets.late.variance];
  const rowFor = (b) => [
    b.label,
    b.count,
    rated ? b.count / rated : null,
    avg(b.wipDays) != null ? Math.round(avg(b.wipDays) * 10) / 10 : null,
    avg(b.variance) != null ? Math.round(avg(b.variance) * 10) / 10 : null,
  ];
  return {
    columns: [
      { key: "outcome", label: "Outcome" },
      { key: "products", label: "Products", align: "right", format: "int" },
      { key: "share", label: "Share of Rated", align: "right", format: "percent" },
      { key: "avg_wip", label: "Avg Days in WIP", align: "right", format: "num1" },
      { key: "avg_var", label: "Avg Days vs Due (+ = late)", align: "right", format: "num1" },
    ],
    rows: [rowFor(buckets.on_time), rowFor(buckets.late), rowFor(buckets.unrated)],
    totals: [
      `All rated — ${rated}`,
      rated,
      rated ? 1 : null,
      avg(ratedWip) != null ? Math.round(avg(ratedWip) * 10) / 10 : null,
      avg(ratedVar) != null ? Math.round(avg(ratedVar) * 10) / 10 : null,
    ],
    rowLinks: [null, null, null],
  };
}

// Days in current operational status — avg/max per status, using the
// product's operational_status_changed_at (undated products counted apart).
export function daysInStatusSummary(rows = [], now = new Date()) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = norm(row?.status) || "none";
    const g = groups.get(key) || { key, count: 0, days: [], undated: 0 };
    g.count += 1;
    const d = daysInStatus(row, now);
    if (d == null) g.undated += 1;
    else g.days.push(d);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (statusRank(a.key) - statusRank(b.key)) || b.count - a.count || a.key.localeCompare(b.key));
  const allDays = sorted.flatMap((g) => g.days);
  const rowFor = (g) => [
    statusLabel(g.key),
    g.count,
    avg(g.days) != null ? Math.round(avg(g.days) * 10) / 10 : null,
    g.days.length ? Math.max(...g.days) : null,
    g.undated,
  ];
  return {
    columns: [
      { key: "status", label: "Product Status" },
      { key: "products", label: "Products", align: "right", format: "int" },
      { key: "avg_days", label: "Avg Days", align: "right", format: "num1" },
      { key: "max_days", label: "Max Days", align: "right", format: "int" },
      { key: "undated", label: "No Timestamp", align: "right", format: "int" },
    ],
    rows: sorted.map(rowFor),
    totals: [
      "Total",
      sum(sorted, (g) => g.count),
      avg(allDays) != null ? Math.round(avg(allDays) * 10) / 10 : null,
      allDays.length ? Math.max(...allDays) : null,
      sum(sorted, (g) => g.undated),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Estimate conversion by salesperson — created / converted / cancelled /
// archived / open per AllInOneEstimate.salesperson. An estimate counts as
// converted when work_order_id is set; templates are excluded entirely.
// Conv% = converted / created. Quote value sums quote_total of created rows.
export function estimatesConversion(estimates = []) {
  const groups = new Map();
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const key = clean(est.salesperson) || "Unassigned";
    const g = groups.get(key) || { key, created: 0, converted: 0, cancelled: 0, archived: 0, value: 0 };
    g.created += 1;
    if (clean(est.work_order_id)) g.converted += 1;
    const status = norm(est.status);
    if (status === "cancelled") g.cancelled += 1;
    if (status === "archived") g.archived += 1;
    g.value = money(g.value + num(est.quote_total));
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.created - a.created || a.key.localeCompare(b.key));
  const rowFor = (g) => [
    g.key,
    g.created,
    g.converted,
    g.cancelled,
    g.archived,
    Math.max(0, g.created - g.converted - g.cancelled - g.archived),
    g.created ? g.converted / g.created : null,
    g.value,
  ];
  const total = sorted.reduce((t, g) => ({
    created: t.created + g.created,
    converted: t.converted + g.converted,
    cancelled: t.cancelled + g.cancelled,
    archived: t.archived + g.archived,
    value: money(t.value + g.value),
  }), { created: 0, converted: 0, cancelled: 0, archived: 0, value: 0 });
  return {
    columns: [
      { key: "salesperson", label: "Salesperson" },
      { key: "created", label: "Created", align: "right", format: "int" },
      { key: "converted", label: "Converted", align: "right", format: "int" },
      { key: "cancelled", label: "Cancelled", align: "right", format: "int" },
      { key: "archived", label: "Archived", align: "right", format: "int" },
      { key: "open", label: "Open", align: "right", format: "int" },
      { key: "conv", label: "Conv %", align: "right", format: "percent" },
      { key: "value", label: "Quote Value", align: "right", format: "money" },
    ],
    rows: sorted.map(rowFor),
    totals: [
      "Total",
      total.created,
      total.converted,
      total.cancelled,
      total.archived,
      Math.max(0, total.created - total.converted - total.cancelled - total.archived),
      total.created ? total.converted / total.created : null,
      total.value,
    ],
    rowLinks: sorted.map(() => null),
  };
}

export const AR_AGING_BUCKETS = ["0–30", "31–60", "61–90", "90+"];

const OPEN_AR_STATUSES = new Set(["sent", "partially_paid"]);

// AR bucket index for whole days past the invoice due date. Days <= 30
// (including not-yet-due and undated invoices) land in 0–30.
export function arBucketIndex(daysPastDue) {
  const d = num(daysPastDue);
  if (d <= 30) return 0;
  if (d <= 60) return 1;
  if (d <= 90) return 2;
  return 3;
}

// AR aging — unpaid balances bucketed 0–30 / 31–60 / 61–90 / 90+ by days past
// the invoice due date (issue date, then created_date, when no due date).
// Only open AR (status sent|partially_paid, balance_due > 0) counts — the
// same rule invoicingAction.agingSummary applies server-side.
export function arAgingReport(invoices = [], now = new Date()) {
  const groups = new Map();
  for (const inv of invoices || []) {
    if (!OPEN_AR_STATUSES.has(norm(inv?.status))) continue;
    const balance = num(inv?.balance_due);
    if (balance <= 0) continue;
    const basis = parseLocalDate(inv?.due_date) || parseLocalDate(inv?.issue_date) || parseLocalDate(inv?.created_date);
    const daysPastDue = basis ? Math.floor((startOfDay(now).getTime() - startOfDay(basis).getTime()) / DAY) : 0;
    const bucket = arBucketIndex(daysPastDue);
    const key = clean(inv?.customer_display_name) || "Unknown Customer";
    const g = groups.get(key) || { key, invoices: 0, buckets: [0, 0, 0, 0], balance: 0 };
    g.invoices += 1;
    g.buckets[bucket] = money(g.buckets[bucket] + balance);
    g.balance = money(g.balance + balance);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.balance - a.balance || a.key.localeCompare(b.key));
  const totals = ["Total", sum(sorted, (g) => g.invoices), 0, 0, 0, 0, money(sum(sorted, (g) => g.balance))];
  for (const g of sorted) {
    for (let i = 0; i < 4; i += 1) totals[i + 2] = money(totals[i + 2] + g.buckets[i]);
  }
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "invoices", label: "Open Invoices", align: "right", format: "int" },
      { key: "b0", label: AR_AGING_BUCKETS[0], align: "right", format: "money" },
      { key: "b1", label: AR_AGING_BUCKETS[1], align: "right", format: "money" },
      { key: "b2", label: AR_AGING_BUCKETS[2], align: "right", format: "money" },
      { key: "b3", label: AR_AGING_BUCKETS[3], align: "right", format: "money" },
      { key: "balance", label: "Open Balance", align: "right", format: "money" },
    ],
    rows: sorted.map((g) => [g.key, g.invoices, ...g.buckets, g.balance]),
    totals,
    rowLinks: sorted.map(() => null),
  };
}

// --- purchasing ------------------------------------------------------------------

// Operational states where a WIP product's parts still need purchasing
// attention: the design states plus active production. Earlier pipeline
// states (order review, permitting, proofs) have no firm demand yet; later
// states (QC, install, vended, fulfilled) should already have consumed stock.
export const PART_DEMAND_STATUSES = ["design_review", "in_design", "in_production"];

// Open PO statuses — draft/cancelled carry no commitment; received has nothing
// left to arrive. "sent" is the ordered state in PurchaseOrder.jsonc.
const OPEN_PO_STATUSES = new Set(["sent", "partially_received"]);

const indexPartsByProduct = (builderParts = []) => {
  const map = new Map();
  for (const part of builderParts || []) {
    if (!part || part.is_active === false) continue;
    const bp = clean(part.builder_product_id);
    if (!bp) continue;
    if (!map.has(bp)) map.set(bp, []);
    map.get(bp).push(part);
  }
  return map;
};

// Parts Needed — purchasing demand for WIP products in design/production.
// Required qty comes from BuilderPart rows linked through the WorkOrder
// product's builder_product_id (WorkOrder products carry no embedded BOM).
// The Builder BOM is per BuilderProduct.quantity, so demand scales by
// (work-order product qty ÷ builder product qty). On-hand joins
// Inventory.quantity_on_hand by inventory_item_id; on-order sums the open
// (unreceived) quantity on sent / partially_received PO lines for that item.
// Parts without an inventory link still show demand — on-hand/on-order are
// null and the row is flagged "No stock link".
export function partsNeededReport({ queueRows = [], builderParts = [], builderProducts = [], inventoryItems = [], purchaseOrders = [] } = {}) {
  const partsByProduct = indexPartsByProduct(builderParts);
  const productById = new Map(
    (builderProducts || []).map((p) => [clean(p?.id), p]).filter(([k]) => k),
  );
  const onHandByItem = new Map();
  const itemLabelByItem = new Map();
  for (const item of inventoryItems || []) {
    const id = clean(item?.id);
    if (!id || item?.deleted === true || item?.legacy_compatibility === true) continue;
    onHandByItem.set(id, qty(num(onHandByItem.get(id)) + num(item?.quantity_on_hand)));
    if (!itemLabelByItem.has(id)) {
      itemLabelByItem.set(
        id,
        [clean(item?.material_type), clean(item?.product_type), clean(item?.size)]
          .filter(Boolean).join(" · "),
      );
    }
  }
  const onOrderByItem = new Map();
  for (const po of purchaseOrders || []) {
    if (!OPEN_PO_STATUSES.has(norm(po?.status))) continue;
    for (const line of Array.isArray(po?.line_items) ? po.line_items : []) {
      const itemId = clean(line?.inventory_item_id);
      if (!itemId) continue;
      const open = num(line?.quantity) - num(line?.quantity_received);
      if (open > 0) onOrderByItem.set(itemId, qty(num(onOrderByItem.get(itemId)) + open));
    }
  }

  const groups = new Map();
  for (const row of queueRows || []) {
    if (!PART_DEMAND_STATUSES.includes(norm(row?.status))) continue;
    const parts = partsByProduct.get(clean(row?.bp)) || [];
    if (!parts.length) continue;
    const bpQty = num(productById.get(clean(row?.bp))?.quantity) || 1;
    const scale = (num(row?.product?.quantity) || 1) / bpQty;
    for (const part of parts) {
      const itemId = clean(part.inventory_item_id);
      const key = itemId ? `item:${itemId}` : `name:${norm(part.part_name)}|${norm(part.unit)}`;
      const g = groups.get(key) || {
        key,
        itemId,
        label: clean(part.inventory_item_name) || clean(part.part_name) || itemLabelByItem.get(itemId) || "Unnamed part",
        unit: clean(part.unit),
        needed: 0,
        products: new Set(),
        orders: new Set(),
      };
      g.needed += num(part.quantity) * scale;
      if (row?.productId) g.products.add(row.productId);
      if (row?.workOrderId) g.orders.add(row.workOrderId);
      groups.set(key, g);
    }
  }

  const rows = [...groups.values()].map((g) => {
    const linked = Boolean(g.itemId);
    const onHand = linked ? num(onHandByItem.get(g.itemId)) : null;
    const onOrder = linked ? num(onOrderByItem.get(g.itemId)) : null;
    const short = linked ? Math.max(0, qty(g.needed - onHand - onOrder)) : null;
    return {
      ...g,
      onHand,
      onOrder,
      short,
      state: !linked ? "No stock link" : short > 0.004 ? "Short" : "OK",
    };
  });
  rows.sort((a, b) =>
    num(b.short) - num(a.short) || b.needed - a.needed || a.label.localeCompare(b.label));

  return {
    columns: [
      { key: "part", label: "Part" },
      { key: "needed", label: "Needed", align: "right", format: "num1" },
      { key: "unit", label: "Unit" },
      { key: "on_hand", label: "On Hand", align: "right", format: "num1" },
      { key: "on_order", label: "On Order", align: "right", format: "num1" },
      { key: "short", label: "Net Short", align: "right", format: "num1" },
      { key: "orders", label: "Orders", align: "right", format: "int" },
      { key: "state", label: "Status" },
    ],
    rows: rows.map((g) => [
      g.label, qty(g.needed), g.unit, g.onHand, g.onOrder, g.short, g.orders.size, g.state,
    ]),
    totals: [
      `Total — ${rows.length} part${rows.length === 1 ? "" : "s"}`,
      qty(sum(rows, (g) => g.needed)),
      "",
      qty(sum(rows, (g) => g.onHand)),
      qty(sum(rows, (g) => g.onOrder)),
      qty(sum(rows, (g) => g.short)),
      sum(rows, (g) => g.orders.size),
      `${rows.filter((g) => g.state === "Short").length} short`,
    ],
    rowLinks: rows.map((g) => (g.itemId ? "/Inventory" : null)),
  };
}

// --- sales / receivables -----------------------------------------------------------

export const SALES_DATE_BASES = {
  issue_date: "Issue date (invoiced)",
  paid_date: "Paid date (cash)",
};

// Sales by Month — invoiced vs collected per calendar month. The date basis
// toggle controls which date lands an invoice's total in a month: issue_date
// (accrual — what we billed) or paid_date (cash — invoices that reached paid
// status that month). Collected always buckets payments by their paid_date
// (payments have no issue-side date). Void invoices and void/refunded
// payments are excluded; drafts never counted as sales. Months with only
// collections still appear.
export function salesByMonthReport({ invoices = [], payments = [], basis = "issue_date" } = {}) {
  const paidBasis = basis === "paid_date";
  const months = new Map();
  const bucketFor = (key) => {
    if (!months.has(key)) months.set(key, { key, invoices: 0, invoiced: 0, collected: 0 });
    return months.get(key);
  };
  let voidInvoices = 0;
  let draftInvoices = 0;
  let undatedInvoices = 0;
  for (const inv of invoices || []) {
    const status = norm(inv?.status);
    if (status === "void") { voidInvoices += 1; continue; }
    if (status === "draft") { draftInvoices += 1; continue; }
    const key = paidBasis ? monthKey(inv?.paid_date) : monthKey(inv?.issue_date);
    if (!key) { undatedInvoices += 1; continue; }
    const b = bucketFor(key);
    b.invoices += 1;
    b.invoiced = money(b.invoiced + num(inv?.total));
  }
  let voidPayments = 0;
  let undatedPayments = 0;
  for (const p of payments || []) {
    if (isVoidStatus(p?.status)) { voidPayments += 1; continue; }
    const key = monthKey(p?.paid_date || p?.created_date);
    if (!key) { undatedPayments += 1; continue; }
    const b = bucketFor(key);
    b.collected = money(b.collected + num(p?.amount));
  }
  const sorted = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const exclusions = [
    voidInvoices ? `${voidInvoices} void` : "",
    draftInvoices ? `${draftInvoices} draft` : "",
    undatedInvoices ? `${undatedInvoices} undated` : "",
  ].filter(Boolean).join(", ");
  const payExclusions = [
    voidPayments ? `${voidPayments} void/refunded payments` : "",
    undatedPayments ? `${undatedPayments} undated payments` : "",
  ].filter(Boolean).join(", ");
  const totalsLabel = ["Total", exclusions && `excl. ${exclusions} inv`, payExclusions && `excl. ${payExclusions}`]
    .filter(Boolean).join(" — ");
  return {
    columns: [
      { key: "month", label: "Month" },
      { key: "invoices", label: "Invoices", align: "right", format: "int" },
      { key: "invoiced", label: paidBasis ? "Paid-Invoice Total" : "Invoiced", align: "right", format: "money" },
      { key: "collected", label: "Collected", align: "right", format: "money" },
      { key: "net", label: "Invoiced − Collected", align: "right", format: "money" },
    ],
    rows: sorted.map((b) => [
      monthLabel(b.key), b.invoices, b.invoiced, b.collected, money(b.invoiced - b.collected),
    ]),
    totals: [
      totalsLabel,
      sum(sorted, (b) => b.invoices),
      money(sum(sorted, (b) => b.invoiced)),
      money(sum(sorted, (b) => b.collected)),
      money(sum(sorted, (b) => b.invoiced) - sum(sorted, (b) => b.collected)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Customer Analytics — per-customer lifetime invoicing picture from invoice
// snapshots: total invoiced (excludes drafts and voids), collected
// (amount_paid), open AR (sent/partially_paid balances), invoice count,
// average order value, and the most recent issue date.
export function customerAnalyticsReport({ invoices = [] } = {}) {
  const groups = new Map();
  for (const inv of invoices || []) {
    const status = norm(inv?.status);
    if (!status || status === "draft" || status === "void") continue;
    const key = clean(inv?.customer_id) || clean(inv?.customer_display_name) || "unknown";
    const g = groups.get(key) || {
      key,
      name: clean(inv?.customer_display_name) || "Unknown Customer",
      invoices: 0, invoiced: 0, collected: 0, openAr: 0, lastOrder: "",
    };
    g.invoices += 1;
    g.invoiced = money(g.invoiced + num(inv?.total));
    g.collected = money(g.collected + num(inv?.amount_paid));
    if (OPEN_AR_STATUSES.has(status)) g.openAr = money(g.openAr + num(inv?.balance_due));
    const issued = clean(inv?.issue_date);
    if (issued && issued > g.lastOrder) g.lastOrder = issued;
    if (clean(inv?.customer_display_name)) g.name = clean(inv.customer_display_name);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.invoiced - a.invoiced || a.name.localeCompare(b.name));
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "invoices", label: "Invoices", align: "right", format: "int" },
      { key: "invoiced", label: "Lifetime Invoiced", align: "right", format: "money" },
      { key: "collected", label: "Collected", align: "right", format: "money" },
      { key: "open_ar", label: "Open AR", align: "right", format: "money" },
      { key: "aov", label: "Avg Order", align: "right", format: "money" },
      { key: "last_order", label: "Last Order", format: "date" },
    ],
    rows: sorted.map((g) => [
      g.name, g.invoices, g.invoiced, g.collected, g.openAr,
      g.invoices ? money(g.invoiced / g.invoices) : null, g.lastOrder || null,
    ]),
    totals: [
      `Total — ${sorted.length} customer${sorted.length === 1 ? "" : "s"}`,
      sum(sorted, (g) => g.invoices),
      money(sum(sorted, (g) => g.invoiced)),
      money(sum(sorted, (g) => g.collected)),
      money(sum(sorted, (g) => g.openAr)),
      null,
      null,
    ],
    rowLinks: sorted.map(() => "/CustomerStatements"),
  };
}

// --- estimates -------------------------------------------------------------------

// Estimate Funnel — cohort funnel by creation month: of the estimates created
// in each month, how many went on to be sent, approved, converted to a work
// order, or cancelled. Stage definitions reuse the conversion report's rules:
// sent = quote_issue_date stamped or status sent/approved (or later proof —
// accepted_at / work_order_id); approved = accepted_at, status approved, or a
// linked work order; converted = work_order_id set; cancelled = status
// cancelled. Templates excluded. Conversion % = converted ÷ created.
// Tax Liability — sales tax charged per month, split by tax rate. The date
// basis toggle mirrors Sales by Month: issue_date = tax billed that month
// (accrual); paid_date = tax on invoices reaching paid status that month
// (cash proxy — partially-paid invoices count only once fully paid). Voids
// and drafts are excluded; invoices with no tax are counted separately so
// the exclusion is honest. One invoice lands in exactly one (month, rate)
// bucket, so invoice counts are additive in the totals row.
export function taxLiabilityReport({ invoices = [], basis = "issue_date" } = {}) {
  const paidBasis = basis === "paid_date";
  const buckets = new Map();
  let voidInvoices = 0;
  let draftInvoices = 0;
  let undatedInvoices = 0;
  let untaxedInvoices = 0;
  for (const inv of invoices || []) {
    const status = norm(inv?.status);
    if (status === "void") { voidInvoices += 1; continue; }
    if (status === "draft") { draftInvoices += 1; continue; }
    const key = paidBasis ? monthKey(inv?.paid_date) : monthKey(inv?.issue_date);
    if (!key) { undatedInvoices += 1; continue; }
    const tax = num(inv?.tax_amount);
    if (!(tax > 0)) { untaxedInvoices += 1; continue; }
    const rate = num(inv?.tax_rate);
    const bk = key + "|" + rate;
    const b = buckets.get(bk) || { key, rate, invoices: 0, taxable: 0, tax: 0 };
    b.invoices += 1;
    b.taxable = money(b.taxable + num(inv?.subtotal) - num(inv?.discount_amount));
    b.tax = money(b.tax + tax);
    buckets.set(bk, b);
  }
  const sorted = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key) || a.rate - b.rate);
  const rateLabel = (rate) => {
    if (!(rate > 0)) return "0%";
    const pct = (rate * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    return pct + "%";
  };
  const exclusions = [
    voidInvoices ? `${voidInvoices} void` : "",
    draftInvoices ? `${draftInvoices} draft` : "",
    undatedInvoices ? `${undatedInvoices} undated` : "",
    untaxedInvoices ? `${untaxedInvoices} untaxed` : "",
  ].filter(Boolean).join(", ");
  const totalsLabel = [`Total — ${sum(sorted, (b) => b.invoices)} taxed invoice(s)`, exclusions && `excl. ${exclusions}`]
    .filter(Boolean).join(" — ");
  return {
    columns: [
      { key: "month", label: "Month" },
      { key: "rate", label: "Tax Rate", align: "right" },
      { key: "invoices", label: "Invoices", align: "right", format: "int" },
      { key: "taxable", label: "Taxable Base", align: "right", format: "money" },
      { key: "tax", label: "Tax Charged", align: "right", format: "money" },
    ],
    rows: sorted.map((b) => [
      monthLabel(b.key), rateLabel(b.rate), b.invoices, b.taxable, b.tax,
    ]),
    totals: [
      totalsLabel,
      "",
      sum(sorted, (b) => b.invoices),
      money(sum(sorted, (b) => b.taxable)),
      money(sum(sorted, (b) => b.tax)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

export function estimateFunnelReport({ estimates = [] } = {}) {
  const cohorts = new Map();
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const key = monthKey(est.created_date);
    if (!key) continue;
    const c = cohorts.get(key) || { key, created: 0, sent: 0, approved: 0, converted: 0, cancelled: 0, value: 0 };
    c.created += 1;
    c.value = money(c.value + num(est.quote_total));
    const status = norm(est.status);
    const accepted = Boolean(clean(est.accepted_at)) || status === "approved";
    const converted = Boolean(clean(est.work_order_id));
    const sent = status === "sent" || accepted || converted || Boolean(clean(est.quote_issue_date));
    if (sent) c.sent += 1;
    if (accepted || converted) c.approved += 1;
    if (converted) c.converted += 1;
    if (status === "cancelled") c.cancelled += 1;
    cohorts.set(key, c);
  }
  const sorted = [...cohorts.values()].sort((a, b) => a.key.localeCompare(b.key));
  const rowFor = (c) => [
    monthLabel(c.key), c.created, c.sent, c.approved, c.converted, c.cancelled,
    c.created ? c.converted / c.created : null, c.value,
  ];
  const total = sorted.reduce((t, c) => ({
    created: t.created + c.created, sent: t.sent + c.sent, approved: t.approved + c.approved,
    converted: t.converted + c.converted, cancelled: t.cancelled + c.cancelled,
    value: money(t.value + c.value),
  }), { created: 0, sent: 0, approved: 0, converted: 0, cancelled: 0, value: 0 });
  return {
    columns: [
      { key: "month", label: "Created Month" },
      { key: "created", label: "Created", align: "right", format: "int" },
      { key: "sent", label: "Sent", align: "right", format: "int" },
      { key: "approved", label: "Approved", align: "right", format: "int" },
      { key: "converted", label: "Converted", align: "right", format: "int" },
      { key: "cancelled", label: "Cancelled", align: "right", format: "int" },
      { key: "conv", label: "Conv %", align: "right", format: "percent" },
      { key: "value", label: "Quote Value", align: "right", format: "money" },
    ],
    rows: sorted.map(rowFor),
    totals: [
      "Total",
      total.created, total.sent, total.approved, total.converted, total.cancelled,
      total.created ? total.converted / total.created : null, total.value,
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Overrides Audit — every place a human overrode computed pricing. Reliable
// signals (verified against AllInOneEstimate.jsonc / BuilderProduct.jsonc /
// BuilderPart.jsonc):
//   - estimate line_items[].price_state === "manual" (manual line price)
//   - estimate line_items[].adjustment_percent !== 0 (manual ±% adjustment)
//   - BuilderProduct.price_state === "manual" (manual product price)
//   - BuilderPart.manual_cost_override === true (manual part cost, with the
//     user's recorded reason) and builder_sync_state === "detached_override"
//     (builder part frozen off its computed price)
// Template estimates are excluded; one row per override signal.
export function overridesAuditReport({ estimates = [], builderParts = [], builderProducts = [] } = {}) {
  const productById = new Map(
    (builderProducts || []).map((p) => [clean(p?.id), p]).filter(([k]) => k),
  );
  const partsByProduct = indexPartsByProduct(builderParts);
  const detail = [];
  const push = (est, line, partName, signal, info, value) => {
    detail.push({
      estimate: clean(est?.estimate_number) || clean(est?.id),
      estimateId: clean(est?.id),
      customer: clean(est?.client_name),
      line: clean(line?.client_product_name) || clean(line?.builder_name) || clean(line?.project_name) || "Line",
      part: partName || "",
      signal,
      info: info || "",
      value: value == null ? null : money(value),
      status: humanize(est?.status),
      updated: clean(est?.updated_date),
    });
  };
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    for (const line of Array.isArray(est.line_items) ? est.line_items : []) {
      if (!line) continue;
      if (norm(line.price_state) === "manual") {
        push(est, line, "", "Manual line price",
          "price_state = manual", num(line.total_snapshot) * (num(line.customer_quantity) || 1));
      }
      const adj = num(line.adjustment_percent);
      if (adj !== 0) {
        push(est, line, "", "Line price adjustment",
          `${adj > 0 ? "+" : ""}${adj}%`, num(line.total_snapshot) * (num(line.customer_quantity) || 1) * adj / 100);
      }
      const bpId = clean(line.builder_product_id);
      const product = productById.get(bpId);
      if (product && norm(product.price_state) === "manual") {
        push(est, line, "", "Manual product price",
          "BuilderProduct price_state = manual", num(product.frozen_customer_price));
      }
      for (const part of partsByProduct.get(bpId) || []) {
        const partName = clean(part.part_name) || "Part";
        if (part.manual_cost_override === true) {
          push(est, line, partName, "Manual part cost",
            clean(part.manual_cost_override_reason) || "manual_cost_override", num(part.manual_cost));
        } else if (norm(part.builder_sync_state) === "detached_override") {
          push(est, line, partName, "Detached part price",
            clean(part.builder_detached_reason) || "builder_sync_state = detached_override", num(part.frozen_extended_cost));
        }
      }
    }
  }
  detail.sort((a, b) => b.updated.localeCompare(a.updated) || a.estimate.localeCompare(b.estimate) || a.signal.localeCompare(b.signal));
  const counts = new Map();
  for (const d of detail) counts.set(d.signal, (counts.get(d.signal) || 0) + 1);
  const summary = [...counts.entries()].map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ");
  return {
    columns: [
      { key: "estimate", label: "Estimate" },
      { key: "customer", label: "Customer" },
      { key: "line", label: "Product Line" },
      { key: "part", label: "Part" },
      { key: "signal", label: "Override" },
      { key: "info", label: "Detail" },
      { key: "value", label: "Value", align: "right", format: "money" },
      { key: "status", label: "Est. Status" },
    ],
    rows: detail.map((d) => [d.estimate, d.customer, d.line, d.part, d.signal, d.info, d.value, d.status]),
    totals: [
      `Total — ${detail.length} override${detail.length === 1 ? "" : "s"}${summary ? ` (${summary})` : ""}`,
      "", "", "", "", "", null, "",
    ],
    rowLinks: detail.map((d) => (d.estimateId ? `/EstimateDetail?id=${d.estimateId}` : null)),
  };
}

// Vendor Scorecard — purchasing performance per vendor from PO header
// snapshots: order count, spend, open POs, and on-time delivery for received
// orders (received_date vs expected_date; updated_date as fallback). Draft
// and cancelled POs excluded; headers carry no line detail so fill rate is
// intentionally not scored.
export function vendorScorecardReport({ purchaseOrderHeaders = [] } = {}) {
  const vendors = new Map();
  let excluded = 0;
  for (const po of purchaseOrderHeaders || []) {
    const status = norm(po?.status);
    if (status === "draft" || status === "cancelled") { excluded += 1; continue; }
    const name = clean(po?.vendor_name) || "Unnamed vendor";
    const v = vendors.get(name) || { name, pos: 0, spend: 0, open: 0, rated: 0, onTime: 0, lateDaysTotal: 0, lateCount: 0 };
    v.pos += 1;
    v.spend = money(v.spend + num(po?.total));
    if (["sent", "partially_received"].includes(status)) v.open += 1;
    if (status === "received") {
      const expected = clean(po?.expected_date);
      const received = clean(po?.received_date) || clean(po?.updated_date).slice(0, 10);
      if (expected && received) {
        v.rated += 1;
        const days = Math.round((new Date(received + "T00:00:00") - new Date(expected + "T00:00:00")) / 86400000);
        if (days <= 0) v.onTime += 1; else { v.lateCount += 1; v.lateDaysTotal += days; }
      }
    }
    vendors.set(name, v);
  }
  const sorted = [...vendors.values()].sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
  const rowFor = (v) => [
    v.name,
    v.pos,
    v.spend,
    v.open,
    v.rated,
    v.rated ? v.onTime / v.rated : null,
    v.lateCount ? Math.round((v.lateDaysTotal / v.lateCount) * 10) / 10 : null,
  ];
  const total = sorted.reduce((t, v) => ({
    pos: t.pos + v.pos, spend: money(t.spend + v.spend), open: t.open + v.open,
    rated: t.rated + v.rated, onTime: t.onTime + v.onTime,
    lateDaysTotal: t.lateDaysTotal + v.lateDaysTotal, lateCount: t.lateCount + v.lateCount,
  }), { pos: 0, spend: 0, open: 0, rated: 0, onTime: 0, lateDaysTotal: 0, lateCount: 0 });
  return {
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "pos", label: "POs", align: "right", format: "int" },
      { key: "spend", label: "Spend", align: "right", format: "money" },
      { key: "open", label: "Open POs", align: "right", format: "int" },
      { key: "rated", label: "Rated", align: "right", format: "int" },
      { key: "ontime", label: "On-Time %", align: "right", format: "percent" },
      { key: "avg_late", label: "Avg Days Late", align: "right" },
    ],
    rows: sorted.map(rowFor),
    totals: [
      `Total — ${sorted.length} vendor(s)${excluded ? ` — excl. ${excluded} draft/cancelled` : ""}`,
      total.pos,
      total.spend,
      total.open,
      total.rated,
      total.rated ? total.onTime / total.rated : null,
      total.lateCount ? Math.round((total.lateDaysTotal / total.lateCount) * 10) / 10 : null,
    ],
    rowLinks: sorted.map(() => "/PurchaseOrders"),
  };
}

// --- estimate lifecycle rollups (#277/#279/#280/#281/#285/#289/#298/#300) ---------
//
// Shared stage vocabulary, kept identical to the estimate_funnel payload in
// opportunityWorkspaceAction so the reports and the dashboard card agree:
//   won      = status "approved"
//   lost     = status "archived" | "cancelled"
//   decided  = won + lost
//   sent     = status sent/approved or any later proof (accepted_at /
//              work_order_id / quote_issue_date)
//   approved = accepted_at or status approved or a linked work order
//   converted= work_order_id set
// Templates never count.
const EST_WON = new Set(["approved"]);
const EST_LOST = new Set(["archived", "cancelled"]);
const isDecidedStatus = (est) => EST_WON.has(norm(est?.status)) || EST_LOST.has(norm(est?.status));
const isWonStatus = (est) => EST_WON.has(norm(est?.status));
const isLostStatus = (est) => EST_LOST.has(norm(est?.status));
const isSentEstimate = (est) => {
  const status = norm(est?.status);
  return status === "sent" || status === "approved" || Boolean(clean(est?.accepted_at))
    || Boolean(clean(est?.work_order_id)) || Boolean(clean(est?.quote_issue_date));
};
const isApprovedEstimate = (est) =>
  norm(est?.status) === "approved" || Boolean(clean(est?.accepted_at)) || Boolean(clean(est?.work_order_id));

// Monday-start week key ("YYYY-MM-DD") — the same bucketing the
// ReportingDashboard weekly chart uses (d.getDay() Sunday=0 → the following
// Monday; kept deliberately identical so week numbers match across surfaces).
const weekKey = (value) => {
  const d = parseLocalDate(value);
  if (!d) return "";
  const monday = new Date(d);
  monday.setDate(d.getDate() - d.getDay() + 1);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const weekLabel = (key) => {
  const d = parseLocalDate(key);
  return d ? `w/ ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : key;
};

// Estimate customer display name: client_name is the estimate's own field;
// customer_id is only used for grouping so name renames still aggregate.
const estimateCustomerKey = (est) => clean(est?.customer_id) || norm(est?.client_name) || "unknown";
const estimateCustomerName = (est) => clean(est?.client_name) || "Unknown Customer";

// Quote value per estimate line — the customer-facing snapshot price times
// quantity (the same line value the overrides audit uses). Used to split a
// multi-module estimate's quote_total across the modules it touches.
const estimateLineValue = (line) => num(line?.total_snapshot) * (num(line?.customer_quantity) || 1);

// Module shares for one estimate: module_key → fraction of quote_total to
// attribute, proportional to each module's line-value share. Estimates with
// no lines (or no priced lines) split evenly across the modules present;
// estimates with no lines at all land on "unassigned".
const estimateModuleShares = (est) => {
  const lines = (Array.isArray(est?.line_items) ? est.line_items : []).filter(Boolean);
  const byModule = new Map();
  let lineValueSum = 0;
  for (const line of lines) {
    const mk = clean(line?.module_key) || "unassigned";
    const lv = estimateLineValue(line);
    lineValueSum += lv;
    byModule.set(mk, num(byModule.get(mk)) + lv);
  }
  if (!byModule.size) byModule.set("unassigned", 0);
  const even = 1 / byModule.size;
  return [...byModule.entries()].map(([module, lv]) => ({
    module,
    lines: lines.filter((l) => (clean(l?.module_key) || "unassigned") === module).length,
    share: lineValueSum > 0 ? lv / lineValueSum : even,
  }));
};

// Avg Quote Value by Month per Salesperson (#277) — created-month cohorts
// bucketed by salesperson: created count, quote value, per-month average,
// plus decided/won so the month column also reads as a mini funnel.
export function avgQuoteByMonthReport({ estimates = [] } = {}) {
  const groups = new Map();
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const key = monthKey(est.created_date);
    if (!key) continue;
    const rep = clean(est.salesperson) || "Unassigned";
    const gk = `${rep}|${key}`;
    const g = groups.get(gk) || { rep, key, created: 0, value: 0, decided: 0, won: 0 };
    g.created += 1;
    g.value = money(g.value + num(est.quote_total));
    if (isDecidedStatus(est)) g.decided += 1;
    if (isWonStatus(est)) g.won += 1;
    groups.set(gk, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.rep.localeCompare(b.rep) || b.key.localeCompare(a.key));
  const total = sorted.reduce((t, g) => ({
    created: t.created + g.created, value: money(t.value + g.value),
    decided: t.decided + g.decided, won: t.won + g.won,
  }), { created: 0, value: 0, decided: 0, won: 0 });
  return {
    columns: [
      { key: "salesperson", label: "Salesperson" },
      { key: "month", label: "Created Month" },
      { key: "created", label: "Created", align: "right", format: "int" },
      { key: "value", label: "Quote Value", align: "right", format: "money" },
      { key: "avg", label: "Avg Quote", align: "right", format: "money" },
      { key: "decided", label: "Decided", align: "right", format: "int" },
      { key: "won", label: "Won", align: "right", format: "int" },
    ],
    rows: sorted.map((g) => [
      g.rep, monthLabel(g.key), g.created, g.value,
      g.created ? money(g.value / g.created) : null, g.decided, g.won,
    ]),
    totals: [
      `Total — ${sorted.length} bucket${sorted.length === 1 ? "" : "s"}`,
      "",
      total.created,
      total.value,
      total.created ? money(total.value / total.created) : null,
      total.decided,
      total.won,
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Weekly Estimate Throughput (#279) — estimates moving through the pipeline
// each week. Each column is bucketed on its own event date: created on
// created_date, sent on quote_issue_date, approved on accepted_at (an
// approved estimate whose accepted_at was never stamped falls back to its
// updated week — noted on the def). Created value follows the created count.
export function weeklyThroughputReport({ estimates = [] } = {}) {
  const weeks = new Map();
  const bump = (value, field) => {
    const key = weekKey(value);
    if (!key) return false;
    const w = weeks.get(key) || { key, created: 0, sent: 0, approved: 0, value: 0 };
    w[field] += 1;
    weeks.set(key, w);
    return true;
  };
  let undated = 0;
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const cKey = weekKey(est.created_date);
    if (!cKey) { undated += 1; continue; }
    const w = weeks.get(cKey) || { key: cKey, created: 0, sent: 0, approved: 0, value: 0 };
    w.created += 1;
    w.value = money(w.value + num(est.quote_total));
    weeks.set(cKey, w);
    if (isSentEstimate(est)) {
      const stamped = bump(est.quote_issue_date, "sent");
      // No sent timestamp — the event lands in the created week so the
      // funnel column never drops a quote that did go out.
      if (!stamped) bump(est.created_date, "sent");
    }
    if (isApprovedEstimate(est)) {
      const stamped = bump(est.accepted_at, "approved");
      if (!stamped) bump(est.updated_date || est.created_date, "approved");
    }
  }
  const sorted = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    columns: [
      { key: "week", label: "Week Of" },
      { key: "created", label: "Created", align: "right", format: "int" },
      { key: "sent", label: "Sent", align: "right", format: "int" },
      { key: "approved", label: "Approved", align: "right", format: "int" },
      { key: "value", label: "Created Value", align: "right", format: "money" },
    ],
    rows: sorted.map((w) => [weekLabel(w.key), w.created, w.sent, w.approved, w.value]),
    totals: [
      `Total${undated ? ` — excl. ${undated} undated` : ""}`,
      sum(sorted, (w) => w.created),
      sum(sorted, (w) => w.sent),
      sum(sorted, (w) => w.approved),
      money(sum(sorted, (w) => w.value)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Win Rate by Customer (#280) — decided estimates per customer:
// estimates created, decided, won, lost, win rate (won ÷ decided), plus the
// quote value at stake and the value actually won. Customer groups on
// customer_id (client_name fallback) so name changes do not fragment it.
export function winRateByCustomerReport({ estimates = [] } = {}) {
  const groups = new Map();
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const key = estimateCustomerKey(est);
    const g = groups.get(key) || {
      key, name: estimateCustomerName(est),
      estimates: 0, decided: 0, won: 0, lost: 0, value: 0, wonValue: 0,
    };
    g.estimates += 1;
    g.value = money(g.value + num(est.quote_total));
    if (isDecidedStatus(est)) g.decided += 1;
    if (isWonStatus(est)) { g.won += 1; g.wonValue = money(g.wonValue + num(est.quote_total)); }
    if (isLostStatus(est)) g.lost += 1;
    if (clean(est.client_name)) g.name = clean(est.client_name);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    b.decided - a.decided || b.value - a.value || a.name.localeCompare(b.name));
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "estimates", label: "Estimates", align: "right", format: "int" },
      { key: "decided", label: "Decided", align: "right", format: "int" },
      { key: "won", label: "Won", align: "right", format: "int" },
      { key: "lost", label: "Lost", align: "right", format: "int" },
      { key: "win", label: "Win %", align: "right", format: "percent" },
      { key: "value", label: "Quote Value", align: "right", format: "money" },
      { key: "won_value", label: "Won Value", align: "right", format: "money" },
    ],
    rows: sorted.map((g) => [
      g.name, g.estimates, g.decided, g.won, g.lost,
      g.decided ? g.won / g.decided : null, g.value, g.wonValue,
    ]),
    totals: [
      `Total — ${sorted.length} customer${sorted.length === 1 ? "" : "s"}`,
      sum(sorted, (g) => g.estimates),
      sum(sorted, (g) => g.decided),
      sum(sorted, (g) => g.won),
      sum(sorted, (g) => g.lost),
      sum(sorted, (g) => g.decided) ? sum(sorted, (g) => g.won) / sum(sorted, (g) => g.decided) : null,
      money(sum(sorted, (g) => g.value)),
      money(sum(sorted, (g) => g.wonValue)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Quote Value & Win Rate by Module (#281 + #285) — estimates touching each
// line_items[].module_key. An estimate counts once per module it touches (a
// monument+vinyl quote appears under both), so count columns are NOT additive
// — the totals row reports deduped estimate counts. Value columns ARE
// additive: each estimate's quote_total is split across its modules in
// proportion to line-value share (equal split when no line carries a price;
// "unassigned" when there are no lines). "Won value" is the same split on
// approved quotes — won estimate value, not invoiced revenue.
export function valueByModuleReport({ estimates = [] } = {}) {
  const groups = new Map();
  const distinct = { estimates: 0, decided: 0, won: 0 };
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    distinct.estimates += 1;
    if (isDecidedStatus(est)) distinct.decided += 1;
    if (isWonStatus(est)) distinct.won += 1;
    const total = num(est.quote_total);
    for (const { module, lines, share } of estimateModuleShares(est)) {
      const g = groups.get(module) || { module, estimates: 0, lines: 0, decided: 0, won: 0, value: 0, wonValue: 0 };
      g.estimates += 1;
      g.lines += lines;
      if (isDecidedStatus(est)) g.decided += 1;
      if (isWonStatus(est)) { g.won += 1; g.wonValue = money(g.wonValue + total * share); }
      g.value = money(g.value + total * share);
      groups.set(module, g);
    }
  }
  const sorted = [...groups.values()].sort((a, b) => b.value - a.value || a.module.localeCompare(b.module));
  return {
    columns: [
      { key: "module", label: "Module" },
      { key: "estimates", label: "Estimates", align: "right", format: "int" },
      { key: "lines", label: "Lines", align: "right", format: "int" },
      { key: "decided", label: "Decided", align: "right", format: "int" },
      { key: "won", label: "Won", align: "right", format: "int" },
      { key: "win", label: "Win %", align: "right", format: "percent" },
      { key: "value", label: "Quote Value (attrib.)", align: "right", format: "money" },
      { key: "won_value", label: "Won Est. Value", align: "right", format: "money" },
    ],
    rows: sorted.map((g) => [
      humanize(g.module), g.estimates, g.lines, g.decided, g.won,
      g.decided ? g.won / g.decided : null, g.value, g.wonValue,
    ]),
    totals: [
      `Total — ${distinct.estimates} estimate${distinct.estimates === 1 ? "" : "s"} across ${sorted.length} module${sorted.length === 1 ? "" : "s"} (count cols not additive)`,
      distinct.estimates,
      sum(sorted, (g) => g.lines),
      distinct.decided,
      distinct.won,
      distinct.decided ? distinct.won / distinct.decided : null,
      money(sum(sorted, (g) => g.value)),
      money(sum(sorted, (g) => g.wonValue)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

// Customer Lifetime Value (#289) — per-customer rollup across invoices and
// estimates: lifetime invoiced (drafts/voids excluded), collected, open AR,
// won estimate value (approved quote totals — pipeline value, not invoiced),
// average invoice, and last activity (latest of invoice issue date, estimate
// creation, or acceptance). Value columns stay unblended on purpose —
// invoiced and won-estimate totals overlap when a quote became a job.
export function customerLtvReport({ estimates = [], invoices = [] } = {}) {
  const groups = new Map();
  const groupFor = (key, name) => {
    const g = groups.get(key) || {
      key, name: name || "Unknown Customer",
      invoices: 0, invoiced: 0, collected: 0, openAr: 0,
      wonEstimates: 0, wonValue: 0, lastActivity: "",
    };
    if (name) g.name = name;
    groups.set(key, g);
    return g;
  };
  const touch = (g, when) => {
    const d = clean(when);
    if (d && d.slice(0, 10) > g.lastActivity) g.lastActivity = d.slice(0, 10);
  };
  for (const inv of invoices || []) {
    const status = norm(inv?.status);
    if (!status || status === "draft" || status === "void") continue;
    const g = groupFor(clean(inv?.customer_id) || norm(inv?.customer_display_name) || "unknown", clean(inv?.customer_display_name));
    g.invoices += 1;
    g.invoiced = money(g.invoiced + num(inv?.total));
    g.collected = money(g.collected + num(inv?.amount_paid));
    if (OPEN_AR_STATUSES.has(status)) g.openAr = money(g.openAr + num(inv?.balance_due));
    touch(g, inv?.issue_date || inv?.created_date);
  }
  for (const est of estimates || []) {
    if (!est || est.is_template === true) continue;
    const g = groupFor(estimateCustomerKey(est), estimateCustomerName(est));
    if (isWonStatus(est)) {
      g.wonEstimates += 1;
      g.wonValue = money(g.wonValue + num(est.quote_total));
    }
    touch(g, est?.accepted_at);
    touch(g, est?.created_date);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (b.invoiced + b.wonValue) - (a.invoiced + a.wonValue) || a.name.localeCompare(b.name));
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "invoices", label: "Invoices", align: "right", format: "int" },
      { key: "invoiced", label: "Lifetime Invoiced", align: "right", format: "money" },
      { key: "collected", label: "Collected", align: "right", format: "money" },
      { key: "open_ar", label: "Open AR", align: "right", format: "money" },
      { key: "won_est", label: "Won Estimates", align: "right", format: "int" },
      { key: "won_value", label: "Won Est. Value", align: "right", format: "money" },
      { key: "aov", label: "Avg Invoice", align: "right", format: "money" },
      { key: "last", label: "Last Activity", format: "date" },
    ],
    rows: sorted.map((g) => [
      g.name, g.invoices, g.invoiced, g.collected, g.openAr, g.wonEstimates, g.wonValue,
      g.invoices ? money(g.invoiced / g.invoices) : null, g.lastActivity || null,
    ]),
    totals: [
      `Total — ${sorted.length} customer${sorted.length === 1 ? "" : "s"}`,
      sum(sorted, (g) => g.invoices),
      money(sum(sorted, (g) => g.invoiced)),
      money(sum(sorted, (g) => g.collected)),
      money(sum(sorted, (g) => g.openAr)),
      sum(sorted, (g) => g.wonEstimates),
      money(sum(sorted, (g) => g.wonValue)),
      null,
      null,
    ],
    rowLinks: sorted.map(() => "/CustomerStatements"),
  };
}

// Portal Engagement per Estimate (#298) — the estimate_funnel payload's
// portal_engagement aggregate rendered as rows: share-link opens, customer
// messages, staff replies, approvals, revision requests, first staff
// response time (hours) and last activity. Reorder requests are
// work-order-scoped EstimatingRequests, not estimate-thread events, so they
// are honestly out of scope for this report.
export function portalEngagementReport({ estimateFunnel = null } = {}) {
  const engaged = Array.isArray(estimateFunnel?.portal_engagement) ? estimateFunnel.portal_engagement : [];
  const truncated = estimateFunnel?.portal_engagement_truncated === true;
  return {
    columns: [
      { key: "estimate", label: "Estimate" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Est. Status" },
      { key: "opens", label: "Link Opens", align: "right", format: "int" },
      { key: "cust_msgs", label: "Customer Msgs", align: "right", format: "int" },
      { key: "staff_msgs", label: "Staff Replies", align: "right", format: "int" },
      { key: "approvals", label: "Approvals", align: "right", format: "int" },
      { key: "revisions", label: "Revision Reqs", align: "right", format: "int" },
      { key: "resp", label: "First Reply (hrs)", align: "right", format: "num1" },
      { key: "last", label: "Last Activity", format: "date" },
    ],
    rows: engaged.map((e) => [
      clean(e?.estimate_number) || clean(e?.estimate_id),
      clean(e?.client_name) || "Unknown Customer",
      humanize(e?.status) || "—",
      num(e?.opens),
      num(e?.customer_messages),
      num(e?.staff_replies),
      num(e?.approvals),
      num(e?.revision_requests),
      e?.first_response_hours == null ? null : num(e.first_response_hours),
      clean(e?.last_activity_at) || null,
    ]),
    totals: [
      `Total — ${engaged.length} estimate${engaged.length === 1 ? "" : "s"} with portal activity${truncated ? " (truncated)" : ""}`,
      "", "",
      sum(engaged, (e) => e?.opens),
      sum(engaged, (e) => e?.customer_messages),
      sum(engaged, (e) => e?.staff_replies),
      sum(engaged, (e) => e?.approvals),
      sum(engaged, (e) => e?.revision_requests),
      null,
      null,
    ],
    rowLinks: engaged.map((e) => (clean(e?.estimate_id) ? `/EstimateDetail?id=${clean(e.estimate_id)}` : null)),
  };
}

// Est vs Actual Cost (#300) — estimator accuracy: per work order linked to
// an estimate, the estimate's internal cost basis (total_cost — the raw
// section sum before adjustments/margin) vs actual PO spend (sent /
// partially_received / received PO totals — committed spend; draft and
// cancelled POs carry no commitment). POs join on work_order_id, falling
// back to estimate_id when the PO header lacks a work-order link. Honest
// exclusions land in the totals label: orders with no estimate link, links
// to estimates not in the loaded set, orders with no PO spend yet, and
// estimates carrying no cost basis.
export function estVsActualCostReport({ workOrders = [], estimates = [], purchaseOrderHeaders = [] } = {}) {
  const estById = new Map((estimates || []).map((e) => [clean(e?.id), e]).filter(([k]) => k));
  const spendByWo = new Map();
  const spendByEstimateOnly = new Map();
  const SPEND_STATUSES = new Set(["sent", "partially_received", "received"]);
  let skippedPos = 0;
  for (const po of purchaseOrderHeaders || []) {
    if (!SPEND_STATUSES.has(norm(po?.status))) { skippedPos += 1; continue; }
    const total = num(po?.total);
    const woId = clean(po?.work_order_id);
    if (woId) {
      const s = spendByWo.get(woId) || { spend: 0, pos: 0 };
      s.spend = money(s.spend + total);
      s.pos += 1;
      spendByWo.set(woId, s);
      continue;
    }
    const estId = clean(po?.estimate_id);
    if (estId) {
      const s = spendByEstimateOnly.get(estId) || { spend: 0, pos: 0 };
      s.spend = money(s.spend + total);
      s.pos += 1;
      spendByEstimateOnly.set(estId, s);
    }
  }
  const detail = [];
  let noLink = 0;
  let missingEstimate = 0;
  let noPoSpend = 0;
  let noCostBasis = 0;
  for (const wo of workOrders || []) {
    if (!wo?.id || wo.deleted === true) continue;
    const estId = clean(wo.estimate_id);
    if (!estId) { noLink += 1; continue; }
    const est = estById.get(estId);
    if (!est) { missingEstimate += 1; continue; }
    const direct = spendByWo.get(clean(wo.id)) || { spend: 0, pos: 0 };
    const viaEst = spendByEstimateOnly.get(estId) || { spend: 0, pos: 0 };
    const actual = money(direct.spend + viaEst.spend);
    const pos = direct.pos + viaEst.pos;
    if (!pos) { noPoSpend += 1; continue; }
    const estCost = num(est.total_cost) > 0 ? money(num(est.total_cost)) : null;
    if (estCost == null) noCostBasis += 1;
    const variance = estCost == null ? null : money(actual - estCost);
    detail.push({
      woId: clean(wo.id),
      ref: clean(wo.corbridge_invoice_number) || clean(wo.work_order_number) || clean(wo.est_inv_at) || clean(wo.title) || clean(wo.id),
      customer: clean(wo.client_name) || clean(wo.customer_name) || clean(est.client_name) || "Unknown Customer",
      stage: stageLabel(wo.current_stage),
      estimate: clean(est.estimate_number) || estId,
      estId,
      estCost,
      pos,
      actual,
      variance,
      pct: estCost ? variance / estCost : null,
    });
  }
  // Biggest overruns first; null variance (no cost basis) last.
  detail.sort((a, b) =>
    (b.variance == null ? -Infinity : b.variance) - (a.variance == null ? -Infinity : a.variance)
    || b.actual - a.actual || a.ref.localeCompare(b.ref));
  const exclusions = [
    noLink ? `${noLink} no estimate link` : "",
    missingEstimate ? `${missingEstimate} estimate not loaded` : "",
    noPoSpend ? `${noPoSpend} no PO spend yet` : "",
    noCostBasis ? `${noCostBasis} no est. cost` : "",
    skippedPos ? `${skippedPos} draft/cancelled POs` : "",
  ].filter(Boolean).join(", ");
  const totals = detail.reduce((t, d) => ({
    pos: t.pos + d.pos,
    actual: money(t.actual + d.actual),
    estCost: money(t.estCost + (d.estCost || 0)),
    variance: money(t.variance + (d.variance || 0)),
    rated: t.rated + (d.estCost != null ? 1 : 0),
  }), { pos: 0, actual: 0, estCost: 0, variance: 0, rated: 0 });
  return {
    columns: [
      { key: "order", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "stage", label: "Stage" },
      { key: "estimate", label: "Estimate" },
      { key: "est_cost", label: "Est. Cost", align: "right", format: "money" },
      { key: "pos", label: "POs", align: "right", format: "int" },
      { key: "actual", label: "PO Spend", align: "right", format: "money" },
      { key: "var", label: "Variance $", align: "right", format: "money" },
      { key: "pct", label: "Var %", align: "right", format: "percent" },
    ],
    rows: detail.map((d) => [d.ref, d.customer, d.stage, d.estimate, d.estCost, d.pos, d.actual, d.variance, d.pct]),
    totals: [
      `Total — ${detail.length} order${detail.length === 1 ? "" : "s"}${exclusions ? ` — excl. ${exclusions}` : ""}`,
      "", "", "",
      totals.rated ? totals.estCost : null,
      totals.pos,
      totals.actual,
      totals.rated ? totals.variance : null,
      totals.estCost ? totals.variance / totals.estCost : null,
    ],
    rowLinks: detail.map((d) => (d.woId ? `/JobWorkspace?wo=${d.woId}` : null)),
  };
}

// --- report registry -------------------------------------------------------------
// `needs` lists the datasets the view must load lazily for the report.
// `filters` lists the filter controls the view should render for the report;
// the view applies them to the raw input before calling build().

export const OPS_REPORTS = [
  {
    key: "wip_by_product_status",
    title: "WIP by Product Status",
    group: "Production",
    needs: ["workOrders"],
    filters: ["responsibility", "assignedTo", "designer", "dueRange"],
    description: "Open products by operational status with quoted value.",
    notes: "Counts non-fulfilled products on active orders. Value = quoted totals.",
    build: ({ queueRows }) => wipByProductStatus(queueRows),
  },
  {
    key: "wip_by_order_stage",
    title: "WIP by Order Stage",
    group: "Production",
    needs: ["workOrders"],
    filters: ["createdRange", "salesperson"],
    description: "Active work orders grouped by workflow stage.",
    notes: "Excludes completed and deleted orders. Value = sum of product quoted totals (estimate amount fallback).",
    build: ({ workOrders }) => wipByOrderStage(workOrders),
  },
  {
    key: "overdue_products",
    title: "Overdue Products",
    group: "Production",
    needs: ["workOrders"],
    filters: ["responsibility", "assignedTo"],
    description: "Products past their product due date, by owner.",
    notes: "Owner = responsibility, falling back to assigned-to. Days overdue measured on the product due date.",
    build: ({ queueRows, now }) => overdueReport(queueRows, now),
  },
  {
    key: "on_time",
    title: "On-Time vs Late",
    group: "Production",
    needs: ["workOrders"],
    filters: ["createdRange", "salesperson"],
    description: "Fulfilled products delivered on or before their due date.",
    notes: "Completion = latest fulfillment status-history entry, else the completed order's last update (proxy). Days in WIP runs from order created date.",
    build: ({ workOrders, now }) => onTimeReport(workOrders, now),
  },
  {
    key: "days_in_status",
    title: "Days in Status",
    group: "Production",
    needs: ["workOrders"],
    filters: ["responsibility", "assignedTo", "designer"],
    description: "Average and max days products have sat in their current status.",
    notes: "Uses operational_status_changed_at; products without the timestamp are counted separately.",
    build: ({ queueRows, now }) => daysInStatusSummary(queueRows, now),
  },
  {
    key: "estimates_conversion",
    title: "Estimate Conversion by Salesperson",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Created / converted / cancelled estimates per salesperson.",
    notes: "Converted = linked work_order_id. Templates excluded; location = estimate sales center.",
    build: ({ estimates }) => estimatesConversion(estimates),
  },
  {
    key: "estimate_funnel",
    title: "Estimate Funnel by Month",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Cohort funnel: of each month's new estimates, how many sent / approved / converted / cancelled.",
    notes: "Cohort = estimate created month. Sent = quote issued (or accepted/converted); approved = accepted_at / approved status / linked work order; converted = linked work_order_id. Templates excluded.",
    build: ({ estimates }) => estimateFunnelReport({ estimates }),
  },
  {
    key: "overrides_audit",
    title: "Price Overrides Audit",
    group: "Sales & Estimates",
    needs: ["estimates", "builderProducts", "builderParts"],
    filters: ["createdRange", "salesperson"],
    description: "Estimate lines, products, and parts whose price was manually set instead of computed.",
    notes: "Signals: line price_state = manual, non-zero line adjustment %, BuilderProduct price_state = manual, BuilderPart manual_cost_override / detached_override. Templates excluded.",
    build: ({ estimates, builderProducts, builderParts }) =>
      overridesAuditReport({ estimates, builderProducts, builderParts }),
  },
  {
    key: "sales_by_month",
    title: "Sales by Month",
    group: "Receivables",
    needs: ["invoices", "payments"],
    filters: ["monthRange", "dateBasis"],
    description: "Invoiced vs collected per month, on an issue-date or paid-date basis.",
    notes: "Issue basis = what was billed that month (accrual); paid basis = invoices reaching paid status (cash). Collected always buckets by payment paid date. Void invoices/payments excluded. Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices, payments, dateBasis }) =>
      salesByMonthReport({ invoices, payments, basis: dateBasis }),
  },
  {
    key: "customer_analytics",
    title: "Customer Analytics",
    group: "Receivables",
    needs: ["invoices"],
    filters: [],
    description: "Lifetime invoiced, collected, open AR, and order stats per customer.",
    notes: "Issued invoices only — drafts and voids excluded. Open AR = sent / partially-paid balances. Last order = most recent issue date. Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices }) => customerAnalyticsReport({ invoices }),
  },
  {
    key: "ar_aging",
    title: "AR Aging",
    group: "Receivables",
    needs: ["invoices"],
    filters: ["issueRange"],
    description: "Unpaid invoice balances aged by days past due.",
    notes: "Open AR = sent / partially-paid invoices with a balance. Bucketed on due date (issue date fallback). Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices, now }) => arAgingReport(invoices, now),
  },
  {
    key: "tax_liability",
    title: "Tax Liability",
    group: "Receivables",
    needs: ["invoices"],
    filters: ["monthRange", "dateBasis"],
    description: "Sales tax charged per month, split by tax rate.",
    notes: "Issue basis = tax billed that month (accrual); paid basis = tax on invoices reaching paid status that month (cash proxy — partial payments count only at full pay). Voids, drafts, and untaxed invoices excluded. Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices, dateBasis }) => taxLiabilityReport({ invoices, basis: dateBasis }),
  },
  {
    key: "parts_needed",
    title: "Parts Needed",
    group: "Purchasing",
    needs: ["workOrders", "builderParts", "builderProducts", "inventoryItems", "purchaseOrders"],
    filters: ["responsibility", "assignedTo", "designer"],
    description: "Parts required by products in design/production vs on-hand stock and open POs.",
    notes: "Demand = BuilderPart quantities on WIP products in design review / in design / in production, scaled by work-order product qty. On hand = Inventory stock; on order = open qty on sent / partially-received PO lines (line detail fetched per open PO, capped at 60). Parts without an inventory link show demand only.",
    build: ({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }) =>
      partsNeededReport({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }),
  },
  {
    key: "vendor_scorecard",
    title: "Vendor Scorecard",
    group: "Purchasing",
    needs: ["purchaseOrders"],
    filters: [],
    description: "Per-vendor purchasing performance: spend, open orders, on-time delivery.",
    notes: "On-Time = received_date on or before expected_date (received orders only; updated_date fallback when received_date is blank). Draft and cancelled POs excluded. Line detail is not on header snapshots, so fill rate is not scored. PO list is limited to the 250 most recent by the purchasing action.",
    build: ({ purchaseOrderHeaders }) => vendorScorecardReport({ purchaseOrderHeaders }),
  },
  {
    key: "avg_quote_by_month",
    title: "Avg Quote Value by Month",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Per-month average quote value per salesperson (created-month cohorts).",
    notes: "Cohort = estimate created month. Avg = quote_total sum ÷ created that month. Decided/won follow the estimate lifecycle (won = approved; lost = archived/cancelled). Templates excluded.",
    build: ({ estimates }) => avgQuoteByMonthReport({ estimates }),
  },
  {
    key: "weekly_throughput",
    title: "Weekly Estimate Throughput",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Estimates created, sent, and approved per week.",
    notes: "Each column buckets on its own event date: created on created_date, sent on quote_issue_date (created week fallback when unstamped), approved on accepted_at (last-update fallback). Weeks start Monday, matching the dashboard chart. Created value follows the created count. Templates excluded.",
    build: ({ estimates }) => weeklyThroughputReport({ estimates }),
  },
  {
    key: "win_rate_by_customer",
    title: "Win Rate by Customer",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Decided estimates per customer: won, lost, and win rate.",
    notes: "Decided = approved + archived + cancelled; won = approved; lost = archived/cancelled. Win % = won ÷ decided (null until a quote is decided). Customer groups on customer_id so name edits do not fragment the rollup. Templates excluded.",
    build: ({ estimates }) => winRateByCustomerReport({ estimates }),
  },
  {
    key: "value_by_module",
    title: "Quote Value by Module",
    group: "Sales & Estimates",
    needs: ["estimates"],
    filters: ["createdRange", "salesperson", "location"],
    description: "Estimates, quote value, and win rate per estimate module.",
    notes: "An estimate counts once per module its lines touch (count columns are not additive — totals report deduped counts). Value is additive: quote_total splits across modules by line-value share (equal split on unpriced lines; 'unassigned' with no lines). Won Est. Value = the same split on approved quotes — won estimate value, not invoiced revenue. Templates excluded.",
    build: ({ estimates }) => valueByModuleReport({ estimates }),
  },
  {
    key: "customer_ltv",
    title: "Customer Lifetime Value",
    group: "Customers",
    needs: ["estimates", "invoices"],
    filters: [],
    description: "Lifetime invoiced, collected, open AR, and won-estimate value per customer.",
    notes: "Invoiced/collected/open AR cover issued invoices only (drafts/voids excluded; list limited to the 250 most recent). Won Est. Value = approved quote totals — pipeline value, never blended into invoiced totals. Avg Invoice = invoiced ÷ invoices. Last Activity = latest of issue date, estimate creation, or acceptance.",
    build: ({ estimates, invoices }) => customerLtvReport({ estimates, invoices }),
  },
  {
    key: "portal_engagement",
    title: "Portal Engagement",
    group: "Sales & Estimates",
    needs: ["estimateFunnel"],
    filters: [],
    description: "Customer portal activity per estimate: link opens, messages, approvals, response time.",
    notes: "Opens = open_count on the estimate's estimate/staff_view share links. Messages = customer-authored portal thread entries on the estimate; staff replies counted apart. First Reply = hours from first customer message to first staff reply on that thread. Reorder requests are work-order-scoped, not estimate-thread events, so they are not counted. Aggregated server-side in the estimate funnel payload (top 200 engaged estimates).",
    build: ({ estimateFunnel }) => portalEngagementReport({ estimateFunnel }),
  },
  {
    key: "est_vs_actual_cost",
    title: "Est vs Actual Cost",
    group: "Estimating",
    needs: ["workOrders", "estimates", "purchaseOrders"],
    filters: ["createdRange", "salesperson"],
    description: "Estimator accuracy: estimated internal cost vs actual PO spend per work order.",
    notes: "Est. Cost = the linked estimate's total_cost (raw section sum before adjustments/margin). PO Spend = committed spend — sent/partially-received/received PO totals joined on work_order_id (estimate_id fallback when the PO lacks a work-order link); drafts and cancelled POs excluded. Orders without an estimate link, without PO spend, or whose estimate is outside the loaded set are excluded and counted in the totals label. Variance = PO Spend − Est. Cost.",
    build: ({ workOrders, estimates, purchaseOrderHeaders }) =>
      estVsActualCostReport({ workOrders, estimates, purchaseOrderHeaders }),
  },
];

export const OPS_REPORT_MAP = Object.fromEntries(OPS_REPORTS.map((r) => [r.key, r]));

export const OPS_REPORT_GROUPS = [...new Set(OPS_REPORTS.map((r) => r.group))];