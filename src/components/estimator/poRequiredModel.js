// PO-required gating for customer quotes (G-10).
//
// Customer.po_required means every order for the account must carry the
// customer's purchase-order number before a quote may be emailed to the
// customer or approved. This module is the shared vocabulary for that gate:
// which customers require a PO, whether an estimate already satisfies the
// requirement, and the user-facing block message. Pure and dependency-free
// on purpose so it stays unit-testable under Node
// (scripts/test-po-required.mjs) and reusable on both the frontend
// (CustomerQuotePanel send dialog, EstimateDetail acceptance flow) and
// inside deployed backend functions (recordEstimateQuoteDelivery,
// recordEstimateAcceptance, customerPortalAction).

const clean = (v) => String(v ?? "").trim();

// A PO number only counts when it is a non-blank primitive — a nested object
// or array in one of these slots is never "the customer gave us a PO".
const isPoText = (v) => (typeof v === "string" || typeof v === "number") && clean(v) !== "";

// Estimate fields that satisfy the PO requirement, checked in this order.
// po_number is the declared schema field (A-18, AllInOneEstimate.po_number);
// po and customer_po are legacy aliases that appear on older rows and on the
// CSV import mapping (importEstimates.js). show_po_number is a display
// toggle, not a value, and is deliberately NOT in this list.
export const ESTIMATE_PO_FIELDS = ["po_number", "po", "customer_po"];

// The single machine-readable reason code assertPoAllowed reports and
// poBlockReason returns.
export const PO_BLOCK_REASON = "po_required";

// First non-blank PO number on the estimate, or "". Useful for pre-filling
// acceptance evidence and for surfacing which alias satisfied the gate.
export function estimatePoNumber(estimate) {
  if (!estimate || typeof estimate !== "object") return "";
  for (const key of ESTIMATE_PO_FIELDS) {
    if (isPoText(estimate[key])) return clean(estimate[key]);
  }
  return "";
}

// Does this customer require a PO number? False-safe for a missing/null
// customer (rows loaded before the customer resolves must not block).
// po_required is the canonical flag; require_purchase_order is the older
// CoreBridge-import field the entity documents as its parallel — a customer
// flagged either way must not slip quotes through without a PO.
export function poRequirement(customer) {
  if (!customer || typeof customer !== "object") {
    return { required: false, reason: "no_customer" };
  }
  if (customer.po_required === true) {
    return { required: true, reason: "po_required" };
  }
  if (customer.require_purchase_order === true) {
    return { required: true, reason: "require_purchase_order" };
  }
  return { required: false, reason: "" };
}

// null when the action may proceed; PO_BLOCK_REASON when it must block.
// Blocks iff the customer requires a PO AND the estimate carries no PO
// number in any of the recognized fields (blank/whitespace does not count).
export function poBlockReason({ customer, estimate } = {}) {
  if (!poRequirement(customer).required) return null;
  if (estimatePoNumber(estimate)) return null;
  return PO_BLOCK_REASON;
}

// Gate helper for send/approve call sites. action is the gerund phrase used
// in the user-facing message ('sending a quote' | 'approving'); it defaults
// to the send wording since that is the primary call site.
export function assertPoAllowed({ customer, estimate, action } = {}) {
  const reason = poBlockReason({ customer, estimate });
  if (!reason) return { ok: true };
  const doing = clean(action) || "sending a quote";
  return {
    ok: false,
    error: reason,
    message: `This customer requires a PO number before ${doing}.`,
  };
}
