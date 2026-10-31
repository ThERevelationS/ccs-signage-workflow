// Pure job-workspace helpers for the unified Job Workspace page (CoreBridge
// "Order.aspx" equivalent). Kept React-free so the logic is unit-testable
// under Node.

import { deriveBillingState, scheduleFromEntity } from "../procurement/progressBillingModel";

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const money = (v) => Math.round(num(v, 0) * 100) / 100;

// Stage badge labels for WorkOrder.current_stage (schema enum).
export const WORKSPACE_STAGES = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
  completed: "Completed",
};

export const PAYMENT_STATUS_LABELS = {
  uninvoiced: "Not Invoiced",
  partial: "Partially Paid",
  invoiced_unpaid: "Invoiced — Unpaid",
  paid: "Paid In Full",
  overpaid: "Overpaid",
};

// Locate a work order by its entity id or its human-facing reference
// (corbridge_invoice_number carries EST-/INV- style numbers).
export function findWorkOrder(workOrders = [], id = "") {
  const key = clean(id);
  if (!key) return null;
  return (workOrders || []).find(
    (wo) => clean(wo?.id) === key || clean(wo?.corbridge_invoice_number) === key
  ) || null;
}

// Every non-deleted work order that points at a given estimate — usually one,
// but retries/conversions can leave several, so callers show a picker.
export function findWorkOrdersForEstimate(workOrders = [], estimateId = "") {
  const key = clean(estimateId);
  if (!key) return [];
  return (workOrders || [])
    .filter((wo) => wo?.deleted !== true && clean(wo?.estimate_id) === key)
    .sort((a, b) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
}

// An invoice/payment belongs to this job when it links by work_order_id, or by
// the estimate this work order was converted from (invoicingAction writes
// work_order_id only when the estimate already carried one).
export function recordLinksWorkOrder(record, workOrder) {
  if (!record || record.deleted === true) return false;
  const woId = clean(workOrder?.id);
  const estId = clean(workOrder?.estimate_id);
  if (woId && clean(record?.work_order_id) === woId) return true;
  if (estId && clean(record?.estimate_id) === estId) return true;
  return false;
}

const liveInvoice = (inv, workOrder) =>
  recordLinksWorkOrder(inv, workOrder) && clean(inv?.status) !== "void";

// A payment counts toward this job when it links directly or lands on one of
// the job's invoices. Voided and refunded payments are money not held.
const livePayment = (pay, workOrder, invoiceIds) => {
  if (!pay || pay.deleted === true) return false;
  if (["void", "refunded"].includes(clean(pay?.status))) return false;
  if (recordLinksWorkOrder(pay, workOrder)) return true;
  return invoiceIds.has(clean(pay?.invoice_id));
};

export function jobFinancialSummary({ workOrder, invoices = [], payments = [] } = {}) {
  const wo = workOrder || {};
  const products = Array.isArray(wo.products) ? wo.products : [];
  const quotedFromProducts = products.reduce((sum, p) => sum + num(p?.quoted_total), 0);
  const quotedTotal = money(products.length ? quotedFromProducts : num(wo.estimate_amount));

  const linked = (invoices || []).filter((inv) => liveInvoice(inv, wo));
  const invoiceIds = new Set(linked.map((inv) => clean(inv?.id)).filter(Boolean));
  const invoicedTotal = money(linked.reduce((sum, inv) => sum + num(inv?.total), 0));
  const paidTotal = money(
    (payments || [])
      .filter((pay) => livePayment(pay, wo, invoiceIds))
      .reduce((sum, pay) => sum + num(pay?.amount), 0)
  );
  // balance_due is maintained server-side on each invoice; fall back to
  // total - amount_paid when a snapshot lacks it.
  const balanceDue = money(
    linked.reduce((sum, inv) => sum + num(inv?.balance_due, num(inv?.total) - num(inv?.amount_paid)), 0)
  );
  const unpaidInvoiceCount = linked.filter((inv) => num(inv?.balance_due, num(inv?.total) - num(inv?.amount_paid)) > 0).length;

  let paymentStatus;
  if (!linked.length) {
    paymentStatus = "uninvoiced";
  } else if (paidTotal > invoicedTotal && invoicedTotal >= 0 && paidTotal > 0) {
    paymentStatus = "overpaid";
  } else if (balanceDue <= 0) {
    paymentStatus = "paid";
  } else if (clean(wo.current_stage) === "completed") {
    // CoreBridge rule: a COMPLETED order with a balance is still open AR —
    // Completed ≠ paid.
    paymentStatus = "invoiced_unpaid";
  } else if (paidTotal > 0) {
    paymentStatus = "partial";
  } else {
    paymentStatus = "invoiced_unpaid";
  }

  // Progress billing surface: when the work order carries a milestone
  // schedule, count how many the invoiced dollars already cover — same basis
  // as the Job Costing panel (draft invoices don't bill a milestone), so this
  // strip agrees with its "Bill next" state.
  const schedule = scheduleFromEntity(wo.billing_schedule);
  let milestoneBilling = null;
  if (schedule.length) {
    const billableInvoiced = money(
      linked
        .filter((inv) => clean(inv?.status) !== "draft")
        .reduce((sum, inv) => sum + num(inv?.total), 0)
    );
    const billing = deriveBillingState({ jobTotal: quotedTotal, schedule, invoiced: billableInvoiced });
    const billed = billing.milestones.filter((m) => m.status === "billed").length;
    milestoneBilling = {
      total: schedule.length,
      billed,
      billed_pct: billing.billed_pct,
      label: `${billed} of ${schedule.length} milestones billed`,
    };
  }

  return {
    quotedTotal,
    invoicedTotal,
    paidTotal,
    balanceDue,
    invoiceCount: linked.length,
    unpaidInvoiceCount,
    paymentStatus,
    milestoneBilling,
  };
}

// Merge every product's status_history into one newest-first timeline.
// Entries carry { at, product, field, from, to, by }; capped at `limit`.
export function jobActivityTimeline(workOrder, { limit = 100 } = {}) {
  const products = Array.isArray(workOrder?.products) ? workOrder.products : [];
  const entries = [];
  products.forEach((p, idx) => {
    if (!p) return;
    const name = clean(p.description || p.client_product_name) || `Product ${idx + 1}`;
    for (const h of Array.isArray(p.status_history) ? p.status_history : []) {
      if (!h) continue;
      entries.push({
        at: clean(h.at),
        product: name,
        field: clean(h.field),
        from: h.from ?? "",
        to: h.to ?? "",
        by: clean(h.by),
      });
    }
  });
  // ISO timestamps sort lexicographically; undated entries fall to the end.
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries.slice(0, Math.max(0, num(limit, 100)));
}

// One row per product for the workspace products table. Unlike the queue
// model's flattenQueueRows, completed work orders still contribute rows —
// a finished job's workspace must show what was built.
export function workspaceProductRows(workOrder) {
  const wo = workOrder || {};
  const products = (Array.isArray(wo.products) ? wo.products : []).filter(Boolean);
  return products.map((p, idx) => ({
    workOrderId: wo.id || "",
    product: p,
    productId: p.id || `${wo.id}-${idx}`,
    editable: Boolean(p.id),
    position: `${idx + 1}/${products.length}`,
    name: clean(p.description || p.client_product_name) || `Product ${idx + 1}`,
    moduleKey: clean(p.module_key),
    quantity: num(p.quantity, 1),
    quotedUnitPrice: num(p.quoted_unit_price),
    quotedTotal: num(p.quoted_total),
    status: clean(p.operational_status) || "none",
    customerLabel: clean(p.customer_facing_status),
    substatus: clean(p.operational_substatus),
    proof: clean(p.proof_status) || "none",
    fulfillment: clean(p.fulfillment_state) || "none",
    designDue: clean(p.design_due_date),
    productDue: clean(p.product_due_date),
    hardDue: p.hard_due_date === true,
    historyCount: (Array.isArray(p.status_history) ? p.status_history : []).length,
  }));
}
