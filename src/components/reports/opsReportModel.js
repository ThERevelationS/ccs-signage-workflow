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
//   backend agingSummary() rule. Payments have no read action, so a
//   "Customer Payments" report is not possible yet.
// - WorkOrder has no location/sales_center field; the location filter only
//   applies to AllInOneEstimate.sales_center.

import {
  FULFILLED_STATES,
  daysInStatus,
  overdueDays,
  parseLocalDate,
} from "../queues/productQueueModel";

const DAY = 86400000;
const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => Math.round(num(n) * 100) / 100;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

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

// --- report registry -------------------------------------------------------------
// `needs` tells the view which dataset to load lazily. `filters` lists the
// filter controls the view should render for the report; the view applies
// them to the raw input before calling build().

export const OPS_REPORTS = [
  {
    key: "wip_by_product_status",
    title: "WIP by Product Status",
    group: "Production",
    needs: "workOrders",
    filters: ["responsibility", "assignedTo", "designer", "dueRange"],
    description: "Open products by operational status with quoted value.",
    notes: "Counts non-fulfilled products on active orders. Value = quoted totals.",
    build: ({ queueRows }) => wipByProductStatus(queueRows),
  },
  {
    key: "wip_by_order_stage",
    title: "WIP by Order Stage",
    group: "Production",
    needs: "workOrders",
    filters: ["createdRange", "salesperson"],
    description: "Active work orders grouped by workflow stage.",
    notes: "Excludes completed and deleted orders. Value = sum of product quoted totals (estimate amount fallback).",
    build: ({ workOrders }) => wipByOrderStage(workOrders),
  },
  {
    key: "overdue_products",
    title: "Overdue Products",
    group: "Production",
    needs: "workOrders",
    filters: ["responsibility", "assignedTo"],
    description: "Products past their product due date, by owner.",
    notes: "Owner = responsibility, falling back to assigned-to. Days overdue measured on the product due date.",
    build: ({ queueRows, now }) => overdueReport(queueRows, now),
  },
  {
    key: "on_time",
    title: "On-Time vs Late",
    group: "Production",
    needs: "workOrders",
    filters: ["createdRange", "salesperson"],
    description: "Fulfilled products delivered on or before their due date.",
    notes: "Completion = latest fulfillment status-history entry, else the completed order's last update (proxy). Days in WIP runs from order created date.",
    build: ({ workOrders, now }) => onTimeReport(workOrders, now),
  },
  {
    key: "days_in_status",
    title: "Days in Status",
    group: "Production",
    needs: "workOrders",
    filters: ["responsibility", "assignedTo", "designer"],
    description: "Average and max days products have sat in their current status.",
    notes: "Uses operational_status_changed_at; products without the timestamp are counted separately.",
    build: ({ queueRows, now }) => daysInStatusSummary(queueRows, now),
  },
  {
    key: "estimates_conversion",
    title: "Estimate Conversion by Salesperson",
    group: "Sales & Estimates",
    needs: "estimates",
    filters: ["createdRange", "salesperson", "location"],
    description: "Created / converted / cancelled estimates per salesperson.",
    notes: "Converted = linked work_order_id. Templates excluded; location = estimate sales center.",
    build: ({ estimates }) => estimatesConversion(estimates),
  },
  {
    key: "ar_aging",
    title: "AR Aging",
    group: "Receivables",
    needs: "invoices",
    filters: ["issueRange"],
    description: "Unpaid invoice balances aged by days past due.",
    notes: "Open AR = sent / partially-paid invoices with a balance. Bucketed on due date (issue date fallback). Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices, now }) => arAgingReport(invoices, now),
  },
];

export const OPS_REPORT_MAP = Object.fromEntries(OPS_REPORTS.map((r) => [r.key, r]));

export const OPS_REPORT_GROUPS = [...new Set(OPS_REPORTS.map((r) => r.group))];
