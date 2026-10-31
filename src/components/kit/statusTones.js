// Shared status -> tone model for the kit primitives.
//
// One flat status -> tone map covers the app's real enums so every surface
// (queues, invoices, POs, estimates, CRM, work-order stages) renders the same
// color for the same status word. Pure and import-free on purpose: StatusChip
// and PageHeader read it, and scripts/test-uikit.mjs bundles it under Node --
// same convention as components/queues/productQueueModel.js.
//
// Tone semantics (locked for the kit):
//   sky     = in-progress work (production stages, sent/issued docs)
//   emerald = done / approved / paid / terminal fulfillment
//   amber   = attention / pending / partial / queued
//   red     = blocked / overdue / cancelled / void
//   slate   = muted / none / draft / archived
//   violet  = waiting on the customer (explicit awaiting_* statuses)

export const STATUS_TONES = {
  // Product operational statuses -- keep in sync with
  // OPERATIONAL_STATUS_CUSTOMER_LABELS in components/estimator/workOrderConversion.js.
  order_review: "sky",
  site_survey: "sky",
  awaiting_customer_action: "violet",
  awaiting_proof_approval: "violet",
  permitting: "amber",
  proof_approved: "sky", // released to production -- still in progress
  design_review: "sky",
  in_design: "sky",
  in_production: "sky",
  quality_control: "sky",
  service_repair: "sky",
  install_or_removal_only: "sky",
  vended: "emerald",
  none: "slate",

  // Proof statuses -- PROOF_STATUS_VALUES (none/draft/sent shared with docs).
  awaiting_approval: "violet",
  approved: "emerald",
  revision_requested: "amber",

  // Fulfillment states -- FULFILLMENT_STATE_VALUES.
  awaiting_pickup: "amber",
  awaiting_installation: "amber",
  awaiting_shipping: "amber",
  awaiting_delivery: "amber",
  picked_up: "emerald",
  installed: "emerald",
  shipped: "emerald",
  delivered: "emerald",

  // Work-order stages -- WO_STAGE_ORDER in components/estimator/productStageSync.js.
  estimating: "slate",
  sales: "sky",
  design: "sky",
  production: "sky",
  fabrication: "sky",
  installation: "sky",
  completed: "emerald",

  // Estimate statuses -- estimateStatusTransitions.js.
  draft: "slate",
  calculated: "amber",
  sent: "sky", // issued doc matches the blue chips in Invoices/PurchaseOrders
  archived: "slate",
  cancelled: "red",

  // Invoice statuses -- src/pages/Invoices.jsx STATUS_LABELS.
  partially_paid: "amber",
  paid: "emerald",
  overdue: "red", // derived display state, not a stored status
  void: "red",

  // Purchase-order statuses -- src/pages/PurchaseOrders.jsx STATUS_LABELS.
  partially_received: "amber",
  received: "emerald",

  // CRM event outcomes -- components/crm/crmEventsModel.js CRM_EVENT_OUTCOMES.
  no_answer: "amber",
  left_message: "amber",
  rescheduled: "sky",

  // Sales / opportunity outcomes -- customer360 work_order.sales_status and
  // opportunity stage columns (CLOSED_OPPORTUNITY_STAGES = won/lost).
  won: "emerald",
  lost: "red",
  quoted: "sky", // issued quote matches the sent/sky doc tone
  applied: "emerald", // payment applications are terminal

  // Payment rollup states -- components/jobs/JobWorkspace.jsx PAYMENT_TONE.
  uninvoiced: "slate",
  invoiced_unpaid: "amber",
  partial: "amber",
  overpaid: "violet",

  // Generic statuses that show up across lists and details.
  open: "sky",
  active: "sky",
  in_progress: "sky",
  pending: "amber",
  queued: "amber",
  on_hold: "amber",
  hold: "amber",
  ready: "emerald",
  done: "emerald",
  closed: "slate",
  blocked: "red",
  failed: "red",
  error: "red",
  rejected: "red",
  declined: "red",
};

export const TONE_NAMES = ["sky", "emerald", "amber", "red", "slate", "violet"];

// Display labels for statuses whose raw slug is not already human-friendly.
// Anything absent falls back to a title-cased slug in statusLabel().
const STATUS_LABEL_OVERRIDES = {
  order_review: "Order review",
  site_survey: "Site survey",
  awaiting_customer_action: "Customer action needed",
  awaiting_proof_approval: "Proof approval needed",
  proof_approved: "Proof approved",
  design_review: "Design review",
  in_design: "In design",
  in_production: "In production",
  quality_control: "Quality control",
  service_repair: "Service / repair",
  install_or_removal_only: "Install / removal only",
  vended: "Vended",
  none: "None",
  awaiting_approval: "Awaiting approval",
  revision_requested: "Revision requested",
  awaiting_pickup: "Awaiting pickup",
  awaiting_installation: "Awaiting installation",
  awaiting_shipping: "Awaiting shipping",
  awaiting_delivery: "Awaiting delivery",
  picked_up: "Picked up",
  installed: "Installed",
  shipped: "Shipped",
  delivered: "Delivered",
  partially_paid: "Partially paid",
  partially_received: "Partially received",
  no_answer: "No answer",
  left_message: "Left message",
  invoiced_unpaid: "Invoiced unpaid",
  on_hold: "On hold",
  in_progress: "In progress",
};

const normStatus = (v) => String(v || "").trim().toLowerCase();

// status -> one of TONE_NAMES. Unknown / blank statuses fall back to "slate"
// so a never-before-seen enum value degrades to a quiet chip instead of red.
export function statusTone(status) {
  return STATUS_TONES[normStatus(status)] || "slate";
}

// status -> human label. snake_case slugs title-case cleanly; the override
// table covers statuses whose natural wording differs (e.g. no_answer).
export function statusLabel(status) {
  const s = normStatus(status);
  if (!s) return "\u2014";
  if (STATUS_LABEL_OVERRIDES[s]) return STATUS_LABEL_OVERRIDES[s];
  return s
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Chip (pill with dot), dot, and plain-text class sets per tone. Dark-mode
// variants mirror the slate/dark vocabulary used by PurchaseOrders/Invoices.
export const TONE_CHIP_CLASSES = {
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-300",
};

export const TONE_DOT_CLASSES = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
  violet: "bg-violet-500",
};

// Plain colored text (KPI values, emphasis) -- no background.
export const TONE_TEXT_CLASSES = {
  sky: "text-sky-700 dark:text-sky-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-red-700 dark:text-red-300",
  slate: "text-slate-600 dark:text-slate-300",
  violet: "text-violet-700 dark:text-violet-300",
};
