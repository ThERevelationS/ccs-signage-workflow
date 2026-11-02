// Locked operational-status vocabulary for WorkOrder.products[] and
// BuilderProduct.operational_status — frozen to the CoreBridge WIP set plus
// the built/completed/voided wrapper states (masterplan B-01/B-02).
//
// Pure and import-free on purpose: Deno-style base44 functions import this as
// "../../shared/productStatusModel.ts" and the frontend imports it by relative
// path like the other shared modules — so keep it dependency-free and side-
// effect-free.
//
// NOTE: this is the canonical vocabulary going forward. The entity enums and
// legacy helpers (e.g. OPERATIONAL_STATUS_VALUES in
// src/components/estimator/workOrderConversion.js, PRODUCT_TO_STAGE in
// src/components/estimator/productStageSync.js) still carry retired values
// (in_design, vended, none, install_or_removal_only); consumers migrate to
// this module in the integration pass and legacy values are mapped onto the
// locked set there.

const norm = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// ---------------------------------------------------------------------------
// B-01 — operational-status enum lock
// ---------------------------------------------------------------------------

// The 11 CoreBridge WIP statuses plus the three wrapper states that close the
// product lifecycle. Order matters: this is display/picklist order and the
// canonical declaration order — append nothing here without a schema change.
export const OPERATIONAL_STATUS_SET = [
  "order_review",
  "site_survey",
  "awaiting_customer_action",
  "awaiting_proof_approval",
  "permitting",
  "proof_approved",
  "in_production",
  "install_removal_only",
  "quality_control",
  "design_review",
  "service_repair",
  "built",
  "completed",
  "voided",
] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUS_SET)[number];

// WIP split: the eleven open statuses a product cycles through while work is
// in progress. built/completed/voided are the terminal wrappers — once a
// product lands in one of those it leaves the WIP queues (fulfillment_state
// takes over for built, matching how "vended" behaved in the legacy model).
export const WIP_STATUSES = [
  "order_review",
  "site_survey",
  "awaiting_customer_action",
  "awaiting_proof_approval",
  "permitting",
  "proof_approved",
  "in_production",
  "install_removal_only",
  "quality_control",
  "design_review",
  "service_repair",
] as const;

export const TERMINAL_STATUSES = ["built", "completed", "voided"] as const;

// WorkOrder.current_stage enum this vocabulary hints at (the stage board).
// Kept inline — WorkOrder.jsonc is the schema source; these are the eight
// values it declares today.
export const WORK_ORDER_STAGE_SET = [
  "estimating",
  "sales",
  "permitting",
  "design",
  "production",
  "fabrication",
  "installation",
  "completed",
] as const;

export type WorkOrderStageHint = (typeof WORK_ORDER_STAGE_SET)[number];

// status → order stage hint. Deliberately mirrors PRODUCT_TO_STAGE in
// src/components/estimator/productStageSync.js (least-advanced-wins rollup):
// a low mapping is always the conservative choice because the stage rollup
// follows the least-advanced open product.
//  - order_review / awaiting_customer_action can hold at any point; they map
//    to "sales" and never drag a suggestion forward.
//  - proof_approved means design is finished and the product is released to
//    production.
//  - built products are produced and awaiting fulfillment — the same
//    "installation"-phase slot "vended" held in the legacy map.
//  - completed/voided collapse to the terminal "completed" stage bucket.
export const STATUS_STAGE_MAP: Record<OperationalStatus, WorkOrderStageHint> = {
  order_review: "sales",
  site_survey: "design",
  awaiting_customer_action: "sales",
  awaiting_proof_approval: "design",
  permitting: "permitting",
  proof_approved: "production",
  design_review: "design",
  in_production: "production",
  quality_control: "fabrication",
  service_repair: "installation",
  install_removal_only: "installation",
  built: "installation",
  completed: "completed",
  voided: "completed",
};

// Membership check with the same normalization the existing patch builder
// uses (trim/lowercase, spaces & hyphens fold to underscores), so
// "Awaiting_Proof_Approval" and "awaiting proof approval" both validate.
export function isOperationalStatus(s: unknown): s is OperationalStatus {
  return (OPERATIONAL_STATUS_SET as readonly string[]).includes(norm(s));
}

export function isWipStatus(s: unknown): boolean {
  return (WIP_STATUSES as readonly string[]).includes(norm(s));
}

export function isTerminalStatus(s: unknown): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(norm(s));
}

// Stage hint for a status; "" for values outside the locked set.
export function stageHintForStatus(s: unknown): WorkOrderStageHint | "" {
  const v = norm(s);
  return isOperationalStatus(v) ? STATUS_STAGE_MAP[v as OperationalStatus] : "";
}

// ---------------------------------------------------------------------------
// B-02 — customer_facing_status label map
// ---------------------------------------------------------------------------

// Per-status customer-safe display text. Portal/customer surfaces render this
// label, never the raw operational_status value.
export const CUSTOMER_FACING_LABELS: Record<OperationalStatus, string> = {
  order_review: "Order Review",
  site_survey: "Site Survey Scheduled",
  awaiting_customer_action: "Action Required",
  awaiting_proof_approval: "Requires Proof Approval",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "Design Review",
  in_production: "In Production",
  install_removal_only: "Install/Removal Only",
  quality_control: "Quality Control",
  service_repair: "Service/Repair",
  built: "Built",
  completed: "Completed",
  voided: "Voided",
};

// Statuses that must never surface on customer-facing views at all. A voided
// product is internal bookkeeping — portals filter it out of product lists
// instead of rendering the label (the label exists only so internal surfaces
// keep one vocabulary). Consumers check this BEFORE rendering a label.
export const INTERNAL_STATUSES = ["voided"] as const;

export function isInternalStatus(s: unknown): boolean {
  return (INTERNAL_STATUSES as readonly string[]).includes(norm(s));
}

// Label lookup with the same input normalization as isOperationalStatus.
// Returns "" for anything outside the locked set so callers can fall back to
// an explicit customer_facing_status already stored on the product.
export function customerFacingLabel(status: unknown): string {
  const v = norm(status);
  return isOperationalStatus(v) ? CUSTOMER_FACING_LABELS[v as OperationalStatus] : "";
}
