// Pure order-header field model for the Job Workspace header (D-01 — CoreBridge
// Order.aspx header parity). Resolves every header field through a declared
// fallback chain across the WorkOrder plus its linked AllInOneEstimate and
// Invoice rows so the header greys genuinely-empty fields (`missing: true`)
// instead of hiding them. Kept React/base44-free so the chains are
// unit-testable under Node (scripts/test-order-header.mjs).
//
// Field-name sources of truth:
//   WorkOrder        — corbridge_invoice_number (carries EST-/INV- numbers;
//                      conversion copies estimate.estimate_number into it),
//                      current_stage, title, description, date_order_created,
//                      follow_up_date, sales_rep, representative, estimator,
//                      po_number (undeclared but stored — JobWorkspace.jsx:501,
//                      workOrderPrintModel.js:349).
//   AllInOneEstimate — estimate_number, payment_terms_label, payment_terms,
//                      terms, po_number, salesperson, entered_by_display,
//                      sales_center, follow_up_date, project_name.
//   Invoice          — invoice_number, terms, entered_by, salesperson,
//                      location_id (SalesLocation link).
//   SalesLocation    — { id, name, code, active } registry (LocationsPanel).
//
// Note on created_date: the mounted header (JobWorkspace.jsx:502) shows the
// business order date first — `date_order_created || created_date` — and every
// other surface labels date_order_created "Order Created". created_date is the
// system row timestamp, so it stays the fallback here.

import { recordHref } from "../kit/recordRoutes";
import { WORKSPACE_STAGES } from "./jobWorkspaceModel";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const firstNonBlank = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

// Display order number: the human-facing reference the workspace already uses
// for the header title and document.title (JobWorkspace.jsx:391). Falls back
// to a short id so an unnumbered order still has a stable reference.
export function orderNumberFor(workOrder) {
  const wo = workOrder || {};
  return firstNonBlank(wo.corbridge_invoice_number, wo.title, clean(wo.id).slice(0, 8));
}

// Resolve the SalesLocation registry row for an order. Match order:
//   1. explicit location ids (wo.sales_location_id / wo.location_id /
//      invoice.location_id / estimate.location_id),
//   2. text keys (wo.sales_center / wo.location / estimate.sales_center /
//      invoice.location) matched against row id, code, or name,
//   3. the default — the single active location when the registry has exactly
//      one (ambiguous multi-location defaults stay unresolved rather than
//      guess the wrong center).
// Returns the row or null.
export function salesCenterFor(workOrder, { locations = [], estimate = null, invoice = null } = {}) {
  const rows = (Array.isArray(locations) ? locations : []).filter((r) => r && r.id);
  if (!rows.length) return null;
  const wo = workOrder || {};
  const idKeys = [wo.sales_location_id, wo.location_id, invoice?.location_id, estimate?.location_id]
    .map(norm)
    .filter(Boolean);
  for (const key of idKeys) {
    const hit = rows.find((r) => norm(r.id) === key);
    if (hit) return hit;
  }
  const textKeys = [wo.sales_center, wo.location, wo.sales_location, estimate?.sales_center, invoice?.location]
    .map(norm)
    .filter(Boolean);
  for (const key of textKeys) {
    const hit = rows.find((r) => norm(r.id) === key || norm(r.code) === key || norm(r.name) === key);
    if (hit) return hit;
  }
  const active = rows.filter((r) => r.active !== false);
  return active.length === 1 ? active[0] : null;
}

// A value looks like an estimate number when it carries the generated EST-
// convention prefix (generateDocNumber defaults to "EST-{seq}"; conversion
// copies estimate.estimate_number into wo.corbridge_invoice_number).
const looksLikeEstimateNumber = (v) => /^est[-_#]/i.test(clean(v));

const stageLabel = (raw) => {
  const key = norm(raw);
  if (!key) return "";
  if (WORKSPACE_STAGES[key]) return WORKSPACE_STAGES[key];
  return clean(raw).replace(/_/g, " ");
};

const field = (key, label, value, extra = {}) => ({
  key,
  label,
  value: clean(value),
  missing: !clean(value),
  ...(extra.href ? { href: extra.href } : {}),
});

// Ordered header fields for the job workspace order header. `options` accepts
// { estimate, invoice, locations } — all optional; every chain degrades to the
// WO's own fields when the linked rows aren't loaded.
export function orderHeaderFields(workOrder, { estimate = null, invoice = null, locations = [] } = {}) {
  const wo = workOrder || {};
  const est = estimate || {};
  const inv = invoice || {};
  const estimateId = firstNonBlank(wo.estimate_id, est.id);
  const locationRow = salesCenterFor(wo, { locations, estimate: est, invoice: inv });
  const defaultLocationRow = !locationRow
    ? (() => {
        const rows = (Array.isArray(locations) ? locations : []).filter((r) => r && r.id && r.active !== false);
        return rows.length === 1 ? rows[0] : null;
      })()
    : null;

  return [
    // status/current_stage — order status key labeled via WORKSPACE_STAGES;
    // completed flag is the legacy fallback for rows that predate the stage.
    field("status", "Status", stageLabel(firstNonBlank(
      wo.status,
      wo.current_stage,
      wo.completed === true ? "completed" : "",
    ))),
    // wo title → source estimate's project_name.
    field("title", "Title", firstNonBlank(wo.title, est.project_name)),
    // estimate number: wo.estimate_number → estimate.estimate_number → an
    // EST-shaped corbridge_invoice_number (conversion copies it there).
    field("estimate_number", "Estimate #", firstNonBlank(
      wo.estimate_number,
      est.estimate_number,
      looksLikeEstimateNumber(wo.corbridge_invoice_number) ? wo.corbridge_invoice_number : "",
    ), { href: estimateId ? recordHref("estimate", estimateId) : "" }),
    // corbridge_invoice_number / invoice number — the order's human-facing
    // reference; links to the Invoice row when one was passed in.
    field("order_number", "Order #", firstNonBlank(
      wo.corbridge_invoice_number,
      wo.invoice_number,
      inv.invoice_number,
    ), { href: inv.id ? recordHref("invoice", inv.id) : "" }),
    // payment_terms_label/terms — display label wins, then the terms text
    // fields, then the invoice's terms ("Due on receipt" style).
    field("payment_terms", "Payment Terms", firstNonBlank(
      wo.payment_terms_label,
      est.payment_terms_label,
      wo.payment_terms,
      est.payment_terms,
      wo.terms,
      est.terms,
      inv.terms,
    )),
    // PO# — the customer's purchase-order reference stored on the WO or its
    // source estimate.
    field("po_number", "PO #", firstNonBlank(wo.po_number, est.po_number)),
    // salesperson: sales_rep → salesperson → estimator chain, then the linked
    // rows' salesperson fields and finally representative (the order contact —
    // the existing header's sales_rep fallback, JobWorkspace.jsx:499).
    field("salesperson", "Salesperson", firstNonBlank(
      wo.sales_rep,
      wo.salesperson,
      wo.estimator,
      est.salesperson,
      inv.salesperson,
      wo.representative,
    )),
    // entered-by: entered_by_display → entered_by → created_by, spanning the
    // WO, estimate, and invoice rows.
    field("entered_by", "Entered By", firstNonBlank(
      wo.entered_by_display,
      est.entered_by_display,
      wo.entered_by,
      est.entered_by,
      inv.entered_by,
      wo.created_by,
      est.created_by,
      inv.created_by,
    )),
    // sales center: sales_center → location → default (resolved registry row;
    // the single-active-location default is applied inside salesCenterFor).
    field("sales_center", "Sales Center", firstNonBlank(
      wo.sales_center,
      est.sales_center,
      wo.location,
      locationRow ? firstNonBlank(locationRow.name, locationRow.code) : "",
      defaultLocationRow ? firstNonBlank(defaultLocationRow.name, defaultLocationRow.code) : "",
    )),
    // order description — the free-text order body.
    field("description", "Description", firstNonBlank(wo.description, wo.order_description)),
    // created date — business "Order Created" date (date_order_created) with
    // the system row timestamp as fallback, matching the mounted header.
    field("created_date", "Order Created", firstNonBlank(wo.date_order_created, wo.created_date)),
    // follow-up date — scheduled sales follow-up on the WO or its estimate.
    field("follow_up_date", "Follow-Up", firstNonBlank(wo.follow_up_date, est.follow_up_date)),
  ];
}

// Parity audit roll-up: how many header fields resolve a value for this order.
export function headerCompleteness(workOrder, options = {}) {
  const fields = orderHeaderFields(workOrder, options);
  const missingKeys = fields.filter((f) => f.missing).map((f) => f.key);
  return { populated: fields.length - missingKeys.length, total: fields.length, missing_keys: missingKeys };
}
