// Customer lifecycle rules — canonical pure logic (masterplan G-03).
//
// SINGLE SOURCE OF TRUTH: the frontend model
// (src/components/customer360/customerLifecycleModel.js) is a thin re-export
// of this file via the frontend-shared-modules Vite allowlist, and the Deno
// function base44/functions/manageCustomerLifecycle/entry.ts imports it via
// "../../shared/customerLifecycleRules.ts". Keep this module dependency-free
// and side-effect-free — it is bundled into both the browser and function
// runtimes.
//
// Canonical vocabulary is title-case: 'Lead' | 'Prospect' | 'Active' |
// 'Inactive'. The stored Customer field is `customer_status`, whose entity
// enum is lowercase ('prospect' | 'active' | 'inactive' — 'lead' is a
// lifecycle-only state, not a stored enum value). normalizeLifecycle()
// bridges the two: every consumer compares canonical values, only the write
// path (manageCustomerLifecycle) down-cases for storage.
//
// Auto-inactive window resolution:
//   months = customer.auto_inactive_months || customer.auto_inactive_after_months
//            || defaultMonths
//   — a positive per-customer window wins; an absent/zero customer value
//     falls through to the shop default (`auto_inactive_after_months` is the
//     entity-declared field, `auto_inactive_months` is the masterplan name —
//     both are honored, masterplan name first).
//   — per-customer opt-out is the `auto_inactive_disabled` flag, NOT a zero:
//     an explicit 0 still falls through to the default; flag the customer to
//     exempt it from a default-driven sweep.
//   — a resolved window of 0/absent means the automation is off → never.

export const LIFECYCLE_STATUSES = ["Lead", "Prospect", "Active", "Inactive"] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

const clean = (value: unknown): string => String(value ?? "").trim();

// Any parseable date input → epoch ms; NaN when it does not parse.
const parseMs = (value: unknown): number => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = clean(value);
  if (!raw) return NaN;
  // Bare "YYYY-MM-DD" is local midnight (repo convention — bare new Date(str)
  // would be UTC); everything else parses via Date.
  const t = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`).getTime()
    : Date.parse(raw);
  return Number.isFinite(t) ? t : NaN;
};

const finiteNumber = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// First finite number across candidate fields; undefined when none parse.
const firstFinite = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n !== undefined) return n;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------

// normalizeLifecycle(status) → canonical lifecycle status, or 'Lead' when the
// input is absent/unrecognized. Case-insensitive so stored lowercase
// `customer_status` values map onto the canonical set.
export function normalizeLifecycle(status: unknown): LifecycleStatus {
  const key = clean(status).toLowerCase();
  if (key === "active") return "Active";
  if (key === "inactive") return "Inactive";
  if (key === "prospect") return "Prospect";
  if (key === "lead") return "Lead";
  return "Lead";
}

// The stored status value on a Customer row: `customer_status` is the entity
// field; `status`/`lifecycle_status` are accepted aliases for callers holding
// denormalized rows.
export function customerLifecycleStatus(customer: any): LifecycleStatus {
  return normalizeLifecycle(
    customer?.customer_status ?? customer?.lifecycle_status ?? customer?.status,
  );
}

// ---------------------------------------------------------------------------
// Last-activity derivation
// ---------------------------------------------------------------------------

// Activity signals per record kind. Dates are chosen so bookkeeping edits
// can't mask true inactivity — Customer.updated_date is deliberately absent
// (the sweep itself writes the customer), while created_date counts because a
// brand-new customer is not stale.
export const CUSTOMER_ACTIVITY_FIELDS = [
  "last_contacted_at",
  "created_date",
] as const;
export const WORK_ORDER_ACTIVITY_FIELDS = [
  "created_date",
  "date_order_created",
  "sales_last_activity_at",
  "completed_date",
  "close_date",
] as const;
export const INVOICE_ACTIVITY_FIELDS = [
  "created_date",
  "issue_date",
  "sent_date",
  "paid_date",
] as const;
export const OPPORTUNITY_ACTIVITY_FIELDS = [
  "last_activity_at",
  "updated_date",
  "created_date",
] as const;

export type ActivityHit = {
  at: string; // ISO timestamp of the hit
  ms: number; // epoch ms (sort key)
  kind: "customer" | "work_order" | "invoice" | "opportunity";
  id: string;
  field: string;
};

const hitsFrom = (
  row: any,
  kind: ActivityHit["kind"],
  fields: readonly string[],
  out: ActivityHit[],
) => {
  if (!row || typeof row !== "object") return;
  const id = clean(row?.id);
  for (const field of fields) {
    const ms = parseMs(row?.[field]);
    if (!Number.isFinite(ms)) continue;
    out.push({ at: new Date(ms).toISOString(), ms, kind, id, field });
  }
};

// Every parseable activity signal across the customer and its linked records,
// sorted newest-first.
export function activityHits({
  customer,
  workOrders = [],
  invoices = [],
  opportunities = [],
}: any = {}): ActivityHit[] {
  const hits: ActivityHit[] = [];
  hitsFrom(customer, "customer", CUSTOMER_ACTIVITY_FIELDS, hits);
  for (const row of Array.isArray(workOrders) ? workOrders : []) {
    hitsFrom(row, "work_order", WORK_ORDER_ACTIVITY_FIELDS, hits);
  }
  for (const row of Array.isArray(invoices) ? invoices : []) {
    hitsFrom(row, "invoice", INVOICE_ACTIVITY_FIELDS, hits);
  }
  for (const row of Array.isArray(opportunities) ? opportunities : []) {
    hitsFrom(row, "opportunity", OPPORTUNITY_ACTIVITY_FIELDS, hits);
  }
  hits.sort((a, b) => b.ms - a.ms);
  return hits;
}

// lastActivityAt({customer, workOrders, invoices, opportunities}) → ISO
// timestamp of the most recent relevant date — work-order creation/close,
// invoice issue/send/payment, opportunity activity — or null when nothing
// parses.
export function lastActivityAt(input: any = {}): string | null {
  const hits = activityHits(input);
  return hits.length ? hits[0].at : null;
}

// Per-source breakdown for the get_lifecycle response: newest hit per record
// kind plus the overall winner.
export function lastActivitySummary(input: any = {}) {
  const hits = activityHits(input);
  const byKind: Record<string, ActivityHit | null> = {
    customer: null,
    work_order: null,
    invoice: null,
    opportunity: null,
  };
  for (const hit of hits) {
    if (!byKind[hit.kind]) byKind[hit.kind] = hit;
  }
  return {
    last_activity_at: hits.length ? hits[0].at : null,
    winner: hits.length ? hits[0] : null,
    sources: byKind,
  };
}

// Newest activity epoch-ms for one row under a kind's field list; NaN when
// none of the fields parse.
function rowActivityMs(row: any, fields: readonly string[]): number {
  let best = NaN;
  for (const field of fields) {
    const ms = parseMs(row?.[field]);
    if (Number.isFinite(ms) && (!Number.isFinite(best) || ms > best)) best = ms;
  }
  return best;
}

// activityMapByCustomerId({workOrders, invoices, opportunities}) →
// Record<customer_id, epochMs> — the per-customer newest activity across all
// linked record kinds, ready to feed sweepPlan's `activityById`. Customer-row
// signals (created_date, last_contacted_at) are folded in under the
// customer's own id when `customers` is passed.
export function activityMapByCustomerId({
  customers = [],
  workOrders = [],
  invoices = [],
  opportunities = [],
}: any = {}): Record<string, number> {
  const map: Record<string, number> = {};
  const stamp = (customerId: unknown, ms: number) => {
    const id = clean(customerId);
    if (!id || !Number.isFinite(ms)) return;
    if (!Number.isFinite(map[id]) || ms > map[id]) map[id] = ms;
  };
  const fold = (rows: any, fields: readonly string[]) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      stamp(row?.customer_id, rowActivityMs(row, fields));
    }
  };
  for (const row of Array.isArray(customers) ? customers : []) {
    stamp(row?.id, rowActivityMs(row, CUSTOMER_ACTIVITY_FIELDS));
  }
  fold(workOrders, WORK_ORDER_ACTIVITY_FIELDS);
  fold(invoices, INVOICE_ACTIVITY_FIELDS);
  fold(opportunities, OPPORTUNITY_ACTIVITY_FIELDS);
  return map;
}

// ---------------------------------------------------------------------------
// Auto-inactivate verdict
// ---------------------------------------------------------------------------

export const AUTO_INACTIVE_REASONS = {
  DISABLED_FLAG: "auto_inactive_disabled",
  NO_WINDOW: "no_window",
  NO_ACTIVITY: "no_activity",
  WITHIN_WINDOW: "within_window",
  PAST_WINDOW: "past_inactivity_window",
} as const;

// Resolved inactivity window in months for one customer:
//   customer.auto_inactive_months (masterplan field, first)
//   → customer.auto_inactive_after_months (entity-declared field)
//   → defaultMonths (shop default).
// A positive per-customer value wins outright; an absent/zero customer value
// falls through to the default. The per-customer opt-out is the
// `auto_inactive_disabled` flag — an explicit 0 does NOT exempt the customer
// from a shop-default window.
export function resolveAutoInactiveMonths(customer: any, defaultMonths: unknown): number {
  const customerMonths = firstFinite(
    customer?.auto_inactive_months,
    customer?.auto_inactive_after_months,
  );
  if (customerMonths !== undefined && customerMonths > 0) return customerMonths;
  const fallback = finiteNumber(defaultMonths);
  return fallback !== undefined && fallback > 0 ? fallback : 0;
}

// Calendar-month subtraction clamped to month-end: 2026-01-31 minus 1 month
// lands on 2025-12-31, not a rolled-over 2026-01-03. Returns null when `now`
// does not parse.
export function monthsAgo(now: unknown, months: number): Date | null {
  const ms = parseMs(now);
  if (!Number.isFinite(ms)) return null;
  const span = Math.max(0, Math.floor(finiteNumber(months) ?? 0));
  const base = new Date(ms);
  const day = base.getDate();
  const out = new Date(base.getTime());
  out.setMonth(out.getMonth() - span);
  if (out.getDate() !== day) out.setDate(0); // month-end rollover → clamp back
  return out;
}

// shouldAutoInactivate({customer, lastActivity, now, defaultMonths}) →
//   { inactivate, months, reason }
// `lastActivity` is any parseable date input (usually lastActivityAt()'s ISO
// output); `now` defaults to the current instant. A customer is past the
// window when its last activity is at-or-older-than `now - months` (the full
// window has elapsed at the boundary).
export function shouldAutoInactivate({
  customer,
  lastActivity,
  now,
  defaultMonths,
}: any = {}): { inactivate: boolean; months: number; reason: string } {
  if (customer?.auto_inactive_disabled === true) {
    return { inactivate: false, months: 0, reason: AUTO_INACTIVE_REASONS.DISABLED_FLAG };
  }
  const months = resolveAutoInactiveMonths(customer, defaultMonths);
  if (!(months > 0)) {
    return { inactivate: false, months: 0, reason: AUTO_INACTIVE_REASONS.NO_WINDOW };
  }
  const lastMs = parseMs(lastActivity);
  if (!Number.isFinite(lastMs)) {
    return { inactivate: false, months, reason: AUTO_INACTIVE_REASONS.NO_ACTIVITY };
  }
  const cutoff = monthsAgo(now ?? new Date(), months);
  if (!cutoff) {
    return { inactivate: false, months, reason: AUTO_INACTIVE_REASONS.WITHIN_WINDOW };
  }
  if (lastMs <= cutoff.getTime()) {
    return { inactivate: true, months, reason: AUTO_INACTIVE_REASONS.PAST_WINDOW };
  }
  return { inactivate: false, months, reason: AUTO_INACTIVE_REASONS.WITHIN_WINDOW };
}

// ---------------------------------------------------------------------------
// Sweep planning
// ---------------------------------------------------------------------------

export type SweepPlanItem = {
  customer_id: string;
  from_status: LifecycleStatus;
  reason: string;
  months: number;
  last_activity_at: string | null;
};

// sweepPlan(customers, {activityById, now, defaultMonths}) → one entry per
// ACTIVE customer whose inactivity window has elapsed. `activityById` maps
// customer_id → last-activity date input (ISO string / Date / epoch ms);
// customers absent from the map fall back to their own customer-level dates
// via lastActivityAt. Merged stubs (merged_into_customer_id) and non-Active
// rows are skipped — the sweep only ever moves Active → Inactive.
export function sweepPlan(
  customers: any,
  { activityById, now, defaultMonths }: any = {},
): SweepPlanItem[] {
  const map = activityById && typeof activityById === "object" ? activityById : {};
  const plan: SweepPlanItem[] = [];
  for (const customer of Array.isArray(customers) ? customers : []) {
    const id = clean(customer?.id);
    if (!id || clean(customer?.merged_into_customer_id)) continue;
    const fromStatus = customerLifecycleStatus(customer);
    if (fromStatus !== "Active") continue;
    const provided = map[id] ?? map[clean(customer?.customer_id)];
    const lastActivity = provided !== undefined && provided !== null && clean(provided)
      ? provided
      : lastActivityAt({ customer });
    const verdict = shouldAutoInactivate({ customer, lastActivity, now, defaultMonths });
    if (!verdict.inactivate) continue;
    const lastMs = parseMs(lastActivity);
    plan.push({
      customer_id: id,
      from_status: fromStatus,
      reason: verdict.reason,
      months: verdict.months,
      last_activity_at: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
    });
  }
  return plan;
}
