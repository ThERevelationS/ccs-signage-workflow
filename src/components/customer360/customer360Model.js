// Pure helpers for the Customer 360 hub page. No React, no IO — this file is
// esbuild-bundled and unit-tested under plain Node by scripts/test-customer360.mjs.
//
// Backend contract (opportunityWorkspaceAction, action "customer_workspace"):
//   { customer, contacts, locations, opportunities, estimates, work_orders,
//     invoices, payments, purchase_orders, change_orders, activities,
//     totals, truncated? }
// totals = { estimate_count, estimate_value, open_estimate_value,
//            work_order_count, invoiced, paid, balance, open_po_count,
//            open_activity_count }

export const clean = (v) => String(v ?? "").trim();
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const money = (v) => Math.round(num(v) * 100) / 100;

export const usd = (v) =>
  `$${num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Reads the customer id from the page query string. `?id=` is the canonical
// param; `?customer=` is accepted as an alias for forward compatibility with
// pages that already deep-link customers under that name (EstimatorCustomers,
// CustomerStatements, NewAllInOneEstimate).
export const readCustomerIdParam = (search) => {
  try {
    const p = new URLSearchParams(String(search ?? ""));
    return clean(p.get("id")) || clean(p.get("customer"));
  } catch {
    return "";
  }
};

export const customerName = (c) =>
  clean(c?.company_name) || clean(c?.name) || "Unnamed customer";

export const primaryContactName = (c) => {
  const full = [clean(c?.contact_first_name), clean(c?.contact_last_name)]
    .filter(Boolean)
    .join(" ");
  return full || clean(c?.billing_contact_name) || clean(c?.contact_name);
};

export const contactDisplayName = (p) =>
  clean(p?.display_name) ||
  [clean(p?.first_name), clean(p?.last_name)].filter(Boolean).join(" ") ||
  clean(p?.name) ||
  clean(p?.email) ||
  "Contact";

export const locationLabel = (l) => clean(l?.label) || clean(l?.name) || "Location";
export const locationLine = (l) =>
  [
    clean(l?.address_line_1 || l?.address_1),
    clean(l?.address_line_2 || l?.address_2),
    [
      clean(l?.city),
      [clean(l?.state), clean(l?.postal_code || l?.postal)].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");

// --- Status taxonomies -------------------------------------------------------
// Mirror the entity enums in base44/entities/*.jsonc — kept here so the page can
// classify rows without shipping schemas to the browser.
export const OPEN_ESTIMATE_STATUSES = new Set(["draft", "calculated", "sent"]);
export const CLOSED_OPPORTUNITY_STAGES = new Set(["won", "lost"]);
export const OPEN_PO_STATUSES = new Set(["draft", "sent", "partially_received"]);
export const OPEN_CHANGE_ORDER_STATUSES = new Set(["proposed", "approved"]);

export const EMPTY_TOTALS = {
  estimate_count: 0,
  estimate_value: 0,
  open_estimate_value: 0,
  work_order_count: 0,
  invoiced: 0,
  paid: 0,
  balance: 0,
  open_po_count: 0,
  open_activity_count: 0,
};

export const TOTAL_KEYS = Object.keys(EMPTY_TOTALS);

const liveRows = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => r && r.deleted !== true);

// An activity row counts as "open" when it is a follow-up style event: it has a
// due timestamp and no completion timestamp. Audit-trail rows (stage_changed,
// created, …) have no due_at and never count.
export const isActivityOpen = (a) => Boolean(clean(a?.due_at)) && !clean(a?.completed_at);
export const isActivityOverdue = (a, nowIso) =>
  isActivityOpen(a) && clean(a?.due_at) < clean(nowIso || new Date().toISOString());

// Computes the totals block client-side with the same semantics the deployed
// customer_workspace action uses: estimates/jobs count every non-deleted row,
// open_estimate_value covers draft/calculated/sent, and invoice money sums run
// over non-void rows (drafts included). Used when the action did not return
// `totals` (older deploy) or when only a partial, staff-readable list set could
// be loaded because the action is not deployed yet. Keys that need
// function-only entities (invoiced/paid/balance/open_po_count) stay 0 unless
// those lists were supplied — callers gate display on that.
export function computeTotals(lists = {}) {
  const estimates = liveRows(lists.estimates);
  const openEstimates = estimates.filter((e) =>
    OPEN_ESTIMATE_STATUSES.has(clean(e?.status) || "draft"),
  );
  const workOrders = liveRows(lists.work_orders ?? lists.jobs);
  const invoices = liveRows(lists.invoices).filter(
    (i) => clean(i?.status) !== "void",
  );
  const payments = liveRows(lists.payments).filter((p) => clean(p?.status) !== "void");
  const purchaseOrders = liveRows(lists.purchase_orders).filter(
    (p) => clean(p?.status) !== "cancelled",
  );
  const activities = liveRows(lists.activities);

  // `paid` prefers server-computed invoice.amount_paid; when invoices were not
  // supplied (or carry no applied amounts) fall back to the payments list so a
  // payments-only payload still totals correctly.
  const paidFromInvoices = invoices.reduce((s, i) => s + num(i?.amount_paid), 0);
  const paidFromPayments = payments.reduce((s, p) => s + num(p?.amount), 0);

  return {
    estimate_count: estimates.length,
    estimate_value: money(estimates.reduce((s, e) => s + num(e?.quote_total), 0)),
    open_estimate_value: money(openEstimates.reduce((s, e) => s + num(e?.quote_total), 0)),
    work_order_count: workOrders.length,
    invoiced: money(invoices.reduce((s, i) => s + num(i?.total), 0)),
    paid: money(paidFromInvoices > 0 || payments.length === 0 ? paidFromInvoices : paidFromPayments),
    balance: money(invoices.reduce((s, i) => s + num(i?.balance_due), 0)),
    open_po_count: purchaseOrders.filter((p) => OPEN_PO_STATUSES.has(clean(p?.status))).length,
    open_activity_count: activities.filter(isActivityOpen).length,
  };
}

// Normalizes the workspace payload into the canonical shape the sections render.
// Missing lists become empty arrays; missing totals are computed from whatever
// lists did arrive so an older deploy still fills the KPI strip.
export function normalizeWorkspace(data) {
  const d = data && typeof data === "object" ? data : {};
  const lists = {
    contacts: Array.isArray(d.contacts) ? d.contacts : [],
    locations: Array.isArray(d.locations) ? d.locations : [],
    opportunities: Array.isArray(d.opportunities) ? d.opportunities : [],
    estimates: Array.isArray(d.estimates) ? d.estimates : [],
    work_orders: Array.isArray(d.work_orders) ? d.work_orders : Array.isArray(d.jobs) ? d.jobs : [],
    invoices: Array.isArray(d.invoices) ? d.invoices : [],
    payments: Array.isArray(d.payments) ? d.payments : [],
    purchase_orders: Array.isArray(d.purchase_orders) ? d.purchase_orders : [],
    change_orders: Array.isArray(d.change_orders) ? d.change_orders : [],
    activities: Array.isArray(d.activities) ? d.activities : [],
  };
  const computed = computeTotals(lists);
  const rawTotals = d.totals && typeof d.totals === "object" ? d.totals : {};
  const totals = { ...EMPTY_TOTALS };
  for (const key of TOTAL_KEYS) {
    totals[key] = rawTotals[key] === undefined || rawTotals[key] === null
      ? computed[key]
      : num(rawTotals[key]);
  }
  // An explicit totals object wins even where it reports zero — but if the
  // backend omitted the key entirely we already back-filled from the lists.
  return {
    customer: d.customer && typeof d.customer === "object" ? d.customer : null,
    ...lists,
    totals,
    truncated: d.truncated ?? null,
  };
}

// `truncated` may be a boolean, an array of list names, or a map of
// {listName: true|number}. Returns the list names that hit their server cap.
export function truncatedListNames(truncated) {
  if (!truncated) return [];
  if (truncated === true) return ["records"];
  if (Array.isArray(truncated)) return truncated.map(clean).filter(Boolean);
  if (typeof truncated === "object") {
    return Object.entries(truncated)
      .filter(([, v]) => v === true || num(v) > 0)
      .map(([k]) => k);
  }
  return [];
}

// --- Row display helpers -----------------------------------------------------
export const estimateLabel = (e) =>
  clean(e?.project_name) || clean(e?.estimate_number) || "Estimate";
export const estimateNumber = (e) => clean(e?.estimate_number);
export const estimateValidUntil = (e) =>
  clean(e?.quote_valid_until) || clean(e?.quote_expiration_date);

export const workOrderLabel = (w) =>
  clean(w?.title) || clean(w?.client_name) || "Work order";
export const workOrderStage = (w) =>
  clean(w?.current_stage) || clean(w?.sales_status) || "—";

export const invoiceNumber = (i) => clean(i?.invoice_number) || "Invoice";
export const daysOverdue = (i, asOf) => {
  const due = clean(i?.due_date);
  if (!due || num(i?.balance_due) <= 0) return 0;
  const end = clean(asOf) || new Date().toISOString().slice(0, 10);
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(due)) / 86400000));
};

export const activityLabel = (a) =>
  clean(a?.subject) || clean(a?.event_type) || clean(a?.summary) || "Activity";
export const activityKind = (a) => clean(a?.event_type) || "event";
export const activityWhen = (a) =>
  clean(a?.due_at) || clean(a?.created_date) || clean(a?.updated_date);

export const changeOrderLabel = (c) =>
  clean(c?.change_order_number) || clean(c?.title) || "Change order";
export const purchaseOrderLabel = (p) =>
  clean(p?.po_number) || clean(p?.vendor_name) || "Purchase order";
export const opportunityLabel = (o) => clean(o?.title) || "Opportunity";

// Badge tones keyed by status — returns tailwind class pairs used by chips in
// the header and every status column.
export function statusTone(status) {
  const s = clean(status).toLowerCase();
  if (["active", "approved", "paid", "received", "won", "completed", "applied", "sent"].includes(s))
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (["prospect", "draft", "new", "proposed", "lead", "qualified"].includes(s))
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  if (["sent", "calculated", "quoted", "estimating", "follow_up", "partially_paid", "partially_received"].includes(s))
    return "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300";
  if (["on_hold", "pending", "overdue"].includes(s))
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  if (["lost", "void", "cancelled", "rejected", "inactive"].includes(s))
    return "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}
