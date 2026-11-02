// Pure customer-facing product projection for the portal "Your order" view
// (masterplan B-15). Maps WorkOrder.products[] rows onto customer-safe rows:
// the customer never sees a raw operational_status — only the locked B-02
// label vocabulary from base44/shared/productStatusModel.ts, fulfillment
// state wording, or an explicit customer_facing_status already on the row.
//
// Import-free apart from the shared status model so it bundles cleanly for
// the Node test harness and stays safe inside function runtimes.

import {
  CUSTOMER_FACING_LABELS,
  customerFacingLabel,
  isInternalStatus,
} from "../../../base44/shared/productStatusModel.ts";

const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const firstNonBlank = (...values) =>
  values.find((v) => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

// Retired operational_status spellings still live on stored rows (pre-B-01
// vocabulary — see the NOTE in productStatusModel.ts). Fold them onto the
// locked set so labels and summary buckets use one canonical vocabulary.
const LEGACY_STATUS_EQUIVALENTS = {
  in_design: "design_review",
  vended: "built",
  install_or_removal_only: "install_removal_only",
};

export function canonicalProductStatus(status) {
  const v = norm(status);
  if (!v || v === "none") return "";
  return LEGACY_STATUS_EQUIVALENTS[v] || v;
}

// Spec-named label map: the locked B-02 customer-facing labels plus safe
// wording for retired values still indexed by raw stored statuses. Locked
// statuses always resolve through CUSTOMER_FACING_LABELS.
export const OPERATIONAL_STATUS_CUSTOMER_LABELS = {
  ...CUSTOMER_FACING_LABELS,
  in_design: CUSTOMER_FACING_LABELS.design_review,
  vended: CUSTOMER_FACING_LABELS.built,
  install_or_removal_only: CUSTOMER_FACING_LABELS.install_removal_only,
  none: "",
};

// Fulfillment wording mirrors the live portal projection (entry.ts renders
// fulfillment_state with underscores stripped, preferring it over the status
// label). Title-cased customer-safe labels; "none" is intentionally absent.
export const FULFILLMENT_STATE_LABELS = {
  awaiting_pickup: "Awaiting pickup",
  awaiting_installation: "Awaiting installation",
  awaiting_shipping: "Awaiting shipping",
  awaiting_delivery: "Awaiting delivery",
  picked_up: "Picked up",
  installed: "Installed",
  shipped: "Shipped",
  delivered: "Delivered",
};

// Fulfillment states that mean the customer already has the product.
const FULFILLED_STATES = new Set(["picked_up", "installed", "shipped", "delivered"]);

// proof_status → customer-safe proof_state key. "draft"/"sent" are staff-side
// steps — the customer sees preparation until a decision is actually pending.
// Unknown non-empty values fold to in_preparation so a stray status never
// implies a customer action that is not real.
const PROOF_STATUS_TO_STATE = {
  none: "none",
  draft: "in_preparation",
  sent: "awaiting_approval",
  awaiting_approval: "awaiting_approval",
  approved: "approved",
  revision_requested: "changes_requested",
};

export const PROOF_STATE_LABELS = {
  none: "",
  in_preparation: "Proof in preparation",
  awaiting_approval: "Awaiting your approval",
  approved: "Proof approved",
  changes_requested: "Changes requested",
};

function proofState(proofStatus) {
  const v = norm(proofStatus);
  if (!v) return "none";
  return PROOF_STATUS_TO_STATE[v] || "in_preparation";
}

// Summary buckets. APPROVED = the proof is signed off or the product has
// moved past that point entirely; PRODUCTION = released to the shop through
// QC (built/install/repair sit downstream and count as approved, not WIP).
const APPROVED_STATUSES = new Set([
  "proof_approved",
  "in_production",
  "quality_control",
  "install_removal_only",
  "service_repair",
  "built",
  "completed",
]);
const PRODUCTION_STATUSES = new Set(["proof_approved", "in_production", "quality_control"]);
const ACTION_STATUSES = new Set(["awaiting_customer_action", "awaiting_proof_approval"]);

// Rows the customer may see: not deleted, and never internal-only statuses
// (voided stays staff bookkeeping per productStatusModel.INTERNAL_STATUSES).
function visibleProducts(workOrder) {
  return (Array.isArray(workOrder?.products) ? workOrder.products : []).filter(
    (p) => p && p.deleted !== true && !isInternalStatus(p.operational_status),
  );
}

// [{position, total, product_name, qty, customer_label, status_key, due_date,
//   proof_state, ...}] — one row per customer-visible product, in WO order.
// Extra fields (id, proof_file_url, proof_file_name, fulfillment_state) ride
// along so the panel can key rows, gate proof actions, and tone chips without
// re-deriving anything.
export function customerFacingProducts(workOrder = {}) {
  const rows = visibleProducts(workOrder);
  const total = rows.length;
  return rows.map((p, index) => {
    const status_key = canonicalProductStatus(p.operational_status);
    const fulfillment = norm(p.fulfillment_state) === "none" ? "" : norm(p.fulfillment_state);
    const customer_label =
      FULFILLMENT_STATE_LABELS[fulfillment] ||
      customerFacingLabel(status_key) ||
      firstNonBlank(p.customer_facing_status);
    return {
      id: firstNonBlank(p.id, `product-${index + 1}`),
      position: index + 1,
      total,
      product_name: firstNonBlank(p.description, p.customer_description, `Item ${index + 1}`),
      qty: Math.max(0, num(p.quantity, 1)),
      customer_label,
      status_key,
      due_date: firstNonBlank(p.product_due_date, p.design_due_date),
      proof_state: proofState(p.proof_status),
      fulfillment_state: fulfillment,
      proof_file_url: String(p.proof_file_url || "").trim(),
      proof_file_name: String(p.proof_file_name || "").trim(),
    };
  });
}

// {total_products, approved_count, in_production_count, fulfilled_count,
//  overall_label} — the "3 of 5 approved" header rollup. Action-needed wins
// over every other state because it is the one thing the customer must do.
export function portalOrderSummary(workOrder = {}) {
  const rows = visibleProducts(workOrder);
  let approved_count = 0;
  let in_production_count = 0;
  let fulfilled_count = 0;
  let action_count = 0;
  for (const p of rows) {
    const status = canonicalProductStatus(p.operational_status);
    const fulfillment = norm(p.fulfillment_state);
    if (APPROVED_STATUSES.has(status) || norm(p.proof_status) === "approved") approved_count += 1;
    if (PRODUCTION_STATUSES.has(status)) in_production_count += 1;
    if (FULFILLED_STATES.has(fulfillment) || status === "completed") fulfilled_count += 1;
    if (ACTION_STATUSES.has(status)) action_count += 1;
  }
  const total_products = rows.length;
  const overall_label =
    total_products === 0
      ? "No items on this order"
      : action_count > 0
        ? "Action needed"
        : fulfilled_count === total_products
          ? "Order complete"
          : in_production_count > 0
            ? "In production"
            : "In progress";
  return { total_products, approved_count, in_production_count, fulfilled_count, overall_label };
}

// Can the customer act on the proof right now? Only while the product is
// parked at awaiting_proof_approval AND a proof file exists to review.
// Accepts a projected row (status_key) or a raw WO product (operational_status).
export function proofActionable(product) {
  const row = product || {};
  const status = canonicalProductStatus(row.status_key ?? row.operational_status);
  if (status !== "awaiting_proof_approval") return false;
  return Boolean(String(row.proof_file_url || "").trim());
}
