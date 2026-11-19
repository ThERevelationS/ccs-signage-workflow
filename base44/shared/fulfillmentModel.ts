// Locked fulfillment vocabulary for WorkOrder.products[].fulfillment_state
// (masterplan E-05/E-07/E-08). A product's operational lifecycle ends at
// `built`; fulfillment_state then tracks how the finished product reaches the
// customer — awaiting_* while it waits, and the completed-by-method terminal
// state once it leaves the shop.
//
// Pure and import-free on purpose: Deno-style base44 functions import this as
// "../../shared/fulfillmentModel.ts" and the frontend imports it by relative
// path like the other shared modules — so keep it dependency-free and
// side-effect-free.
//
// The state strings mirror the WorkOrder.jsonc products[].fulfillment_state
// enum exactly (none + 4 awaiting + 4 terminal). workOrderConversion.js
// FULFILLMENT_STATE_VALUES and productQueueModel.js FULFILLED_STATES carry the
// same values today; consumers migrate to this module in the integration
// pass.

const norm = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// ---------------------------------------------------------------------------
// E-05 — fulfillment-state vocabulary
// ---------------------------------------------------------------------------

// The four ways a built product reaches the customer. Order is display order.
export const FULFILLMENT_METHODS = [
  "pickup",
  "installation",
  "shipping",
  "delivery",
] as const;

export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

// "none" = no fulfillment tracked yet; then each awaiting state, then the
// completed-by-method terminal states. Same order the entity enum declares.
export const FULFILLMENT_STATES = [
  "none",
  "awaiting_pickup",
  "awaiting_installation",
  "awaiting_shipping",
  "awaiting_delivery",
  "picked_up",
  "installed",
  "shipped",
  "delivered",
] as const;

export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

// States a built product sits in while it waits to leave the shop.
export const FULFILLMENT_AWAITING = [
  "awaiting_pickup",
  "awaiting_installation",
  "awaiting_shipping",
  "awaiting_delivery",
] as const;

// awaiting state → the terminal state it completes to. Each row is the only
// legal fulfillment transition for that method (a product awaiting_pickup
// completes as picked_up, never as shipped).
export const FULFILLMENT_COMPLETED: Record<string, string> = {
  awaiting_pickup: "picked_up",
  awaiting_installation: "installed",
  awaiting_shipping: "shipped",
  awaiting_delivery: "delivered",
};

export const FULFILLMENT_TERMINAL = [
  "picked_up",
  "installed",
  "shipped",
  "delivered",
] as const;

// method → its awaiting / completed state (the two halves of the same map).
export const METHOD_AWAITING_STATE: Record<FulfillmentMethod, string> = {
  pickup: "awaiting_pickup",
  installation: "awaiting_installation",
  shipping: "awaiting_shipping",
  delivery: "awaiting_delivery",
};

export const METHOD_COMPLETED_STATE: Record<FulfillmentMethod, string> = {
  pickup: "picked_up",
  installation: "installed",
  shipping: "shipped",
  delivery: "delivered",
};

// Every tracked state (awaiting or terminal) → the method it belongs to.
export const STATE_METHOD: Record<string, FulfillmentMethod> = {
  awaiting_pickup: "pickup",
  awaiting_installation: "installation",
  awaiting_shipping: "shipping",
  awaiting_delivery: "delivery",
  picked_up: "pickup",
  installed: "installation",
  shipped: "shipping",
  delivered: "delivery",
};

// Accepted spellings → canonical method. Kept deliberately tight: conversion
// writes these from picklists, and aliases exist only for values legacy rows
// or imports plausibly carry ("install", "ship", "deliver", "will_call").
// Unknown values (e.g. an estimate quote-delivery channel like "email") never
// resolve — callers get "" and leave fulfillment_method unset.
const METHOD_ALIASES: Record<string, FulfillmentMethod> = {
  pickup: "pickup",
  pick_up: "pickup",
  customer_pickup: "pickup",
  will_call: "pickup",
  willcall: "pickup",
  install: "installation",
  installation: "installation",
  ship: "shipping",
  shipping: "shipping",
  shipment: "shipping",
  deliver: "delivery",
  delivery: "delivery",
};

// Normalize any captured spelling to a canonical method; "" when unrecognized.
export function fulfillmentMethodFrom(value: unknown): FulfillmentMethod | "" {
  return METHOD_ALIASES[norm(value)] ?? "";
}

export function isFulfillmentState(s: unknown): s is FulfillmentState {
  return (FULFILLMENT_STATES as readonly string[]).includes(norm(s));
}

export function isFulfillmentAwaiting(s: unknown): boolean {
  return (FULFILLMENT_AWAITING as readonly string[]).includes(norm(s));
}

// Terminal = the product has left the shop by its method. "none" and the
// awaiting_* states are all non-terminal.
export function isFulfillmentTerminal(s: unknown): boolean {
  return (FULFILLMENT_TERMINAL as readonly string[]).includes(norm(s));
}

// The awaiting state a freshly-built product enters for a method
// ("install" → awaiting_installation). "" when the method is unrecognized.
export function awaitingStateFor(method: unknown): string {
  const m = fulfillmentMethodFrom(method);
  return m ? METHOD_AWAITING_STATE[m] : "";
}

// The terminal state a method completes to ("ship" → shipped). "" when the
// method is unrecognized.
export function completedStateFor(method: unknown): string {
  const m = fulfillmentMethodFrom(method);
  return m ? METHOD_COMPLETED_STATE[m] : "";
}

// The method a tracked state belongs to; "" for "none"/unknown.
export function methodForState(state: unknown): FulfillmentMethod | "" {
  return STATE_METHOD[norm(state)] ?? "";
}

// Customer-facing wording for each fulfillment state — portal/status surfaces
// render this, never the raw enum. "none" and unknown values carry no label.
export const FULFILLMENT_CUSTOMER_LABELS: Record<string, string> = {
  awaiting_pickup: "Ready for Pickup",
  awaiting_installation: "Awaiting Installation",
  awaiting_shipping: "Awaiting Shipment",
  awaiting_delivery: "Awaiting Delivery",
  picked_up: "Picked Up",
  installed: "Installed",
  shipped: "Shipped",
  delivered: "Delivered",
};

// Label lookup with the same normalization as isFulfillmentState. Returns ""
// for "none" and anything outside the tracked states so callers can fall back
// to the product's stored customer_facing_status.
export function customerLabelFor(state: unknown): string {
  return FULFILLMENT_CUSTOMER_LABELS[norm(state)] ?? "";
}

// ---------------------------------------------------------------------------
// E-07 — completed substatuses (CB COMPLETED set: on_account / past_due)
// ---------------------------------------------------------------------------

export const COMPLETED_SUBSTATUSES = ["on_account", "past_due"] as const;

export type CompletedSubstatus = (typeof COMPLETED_SUBSTATUSES)[number];

// "YYYY-MM-DD" means that calendar day in local time, not UTC midnight — same
// convention as productQueueModel.parseLocalDate.
const parseLocalDate = (v: unknown): Date | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Open collectible balance: balance_due is the server-maintained truth; fall
// back to total − amount_paid when a row predates the field. Never negative.
function openBalance(invoice: any): number {
  const balance = Number(invoice?.balance_due);
  if (Number.isFinite(balance)) return balance;
  const total = Number(invoice?.total);
  const paid = Number(invoice?.amount_paid);
  if (Number.isFinite(total) || Number.isFinite(paid)) {
    return (Number.isFinite(total) ? total : 0) - (Number.isFinite(paid) ? paid : 0);
  }
  return 0;
}

// Invoice-driven substatus mirrored onto completed products/orders:
//   paid-in-full (status paid/void, or no open balance) → null
//   open balance + due_date before today                  → "past_due"
//   open balance + due today / future / undated           → "on_account"
// `today` is injectable for tests; a due date equal to today is NOT past due.
export function completedSubstatus(
  invoice: any,
  today: Date | string | number = new Date(),
): CompletedSubstatus | null {
  if (!invoice || typeof invoice !== "object") return null;
  const status = norm(invoice.status);
  if (status === "paid" || status === "void") return null;
  if (openBalance(invoice) <= 0) return null;
  const due = parseLocalDate(invoice.due_date);
  const now = parseLocalDate(today) ?? new Date(today);
  if (!due || Number.isNaN(now.getTime())) return "on_account";
  return startOfDay(due) < startOfDay(now) ? "past_due" : "on_account";
}

// Badge descriptor for a completed substatus. Empty label for null/unknown —
// a paid-in-full order shows no AR badge.
export function completedSubstatusBadge(
  state: unknown,
): { label: string; tone: string } {
  switch (norm(state)) {
    case "on_account":
      return { label: "On Account", tone: "info" };
    case "past_due":
      return { label: "Past Due", tone: "danger" };
    default:
      return { label: "", tone: "neutral" };
  }
}

// ---------------------------------------------------------------------------
// E-08 — fulfillment-method capture
// ---------------------------------------------------------------------------

// Where the method was captured, most-specific first. A product-level choice
// (set on the order line or product edit) always beats the order-level
// default, which beats the estimate's delivery intent. First value that
// resolves to a known method wins — unrecognized values are skipped rather
// than blocking a valid lower-precedence capture.
export const FULFILLMENT_METHOD_PRECEDENCE = [
  "product.fulfillment_method",
  "workOrder.fulfillment_method",
  "estimate.delivery_method",
] as const;

// estimate.delivery_method carries loose spellings from quote/order intake
// (install|installation → installation, ship|shipping|shipment → shipping,
// deliver|delivery → delivery, pickup|pick_up|will_call → pickup); the same
// alias table governs product/workOrder fields so all three layers speak one
// vocabulary. Note this field is distinct from the quote-delivery channel
// ("email"/"print" on EstimateQuoteDelivery) — those never resolve to a
// fulfillment method.
export function resolveFulfillmentMethod({
  product,
  workOrder,
  estimate,
}: {
  product?: any;
  workOrder?: any;
  estimate?: any;
} = {}): FulfillmentMethod | "" {
  const candidates = [
    product?.fulfillment_method,
    workOrder?.fulfillment_method,
    estimate?.delivery_method,
  ];
  for (const candidate of candidates) {
    const method = fulfillmentMethodFrom(candidate);
    if (method) return method;
  }
  return "";
}

// Display label for a method; "" for unrecognized.
export function methodLabel(method: unknown): string {
  switch (fulfillmentMethodFrom(method)) {
    case "pickup":
      return "Pickup";
    case "installation":
      return "Installation";
    case "shipping":
      return "Shipping";
    case "delivery":
      return "Delivery";
    default:
      return "";
  }
}

// Queue group key for a product: its captured fulfillment_method first, then
// the method implied by fulfillment_state (a built product already in
// awaiting_shipping belongs to the shipping queue even before the method
// field is stamped), then the caller-provided fallback (e.g. the resolved
// work-order/estimate method). "" = no queue bucket.
export function queueBucketFor(product: any, fallbackMethod?: unknown): string {
  const explicit = fulfillmentMethodFrom(product?.fulfillment_method);
  if (explicit) return explicit;
  const fromState = methodForState(product?.fulfillment_state);
  if (fromState) return fromState;
  return fulfillmentMethodFrom(fallbackMethod) || "";
}
