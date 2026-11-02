// Sales Home funnel model — ESTIMATOR_MASTERPLAN WS-J / item J-11.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*), the SalesHome frontend tile strip, and Node test
// harnesses alike. No I/O anywhere — the wiring layer loads the entity
// lists and funnelCounts() produces the company funnel tile counts.
//
// Ten company funnel tiles (CoreBridge company-dashboard parity):
//
//   new_customers           — live customers created in the period
//   estimates_created       — live estimates created in the period
//   estimates_cancelled     — estimates cancelled in the period
//   estimates_converted     — estimates converted to work in the period
//   orders_placed           — orders placed (created) in the period
//   orders_built            — orders that reached built in the period
//   orders_completed        — orders that reached completed in the period
//   orders_closed           — orders that reached closed in the period
//   voided_pre_completion   — orders voided before built/completed evidence
//   voided_post_completion  — orders voided after reaching built/completed
//
// ── Event-sourced semantics (the one rule that matters) ──────────────────
//   This funnel is EVENT-sourced, not state-sourced: a row counts on a tile
//   when that milestone's DAY lands inside [from,to] — regardless of where
//   the row sits today. A voided order still counts in orders_placed on its
//   booking day and in orders_built on its built day when the evidence
//   exists; it ALSO lands in a void tile on its void day. This diverges
//   deliberately from the current-state reports (J-06/J-07 liveRows drop
//   deleted rows entirely): a deleted-flag WorkOrder is a VOIDED order
//   under the E-06 lifecycle (there is no hard delete — the flag IS the
//   cancel mechanism), and the funnel is the one place its void event is
//   still visible. Estimates keep the stricter J-07 rule — a deleted/void
//   estimate "never existed for reporting purposes" and counts on no tile.
//
// ── Order-side eligibility (customerAnalyticsModel.order book parity) ────
//   sales_status 'lost' WorkOrders never became orders — excluded from
//   every order tile. sales_neutral_closed_at pipeline rows (the explicit
//   "Closed - Did not Lose" archive stamp) are likewise excluded UNLESS the
//   row also went sales_status 'won' — a won order archived later is still
//   an order. Every other WorkOrder participates, voided included.
//
// ── Order lifecycle (E-06 completedVsPaidModel replica — verbatim) ───────
//   orderLifecycleState: explicit lifecycle_state/order_state/order_status/
//   status (incl. void/cancelled/canceled aliases → voided) →
//   deleted/voided flag/voided_date → 'voided' → closed flag/stamps →
//   'closed' → completed flag | current_stage 'completed' → 'completed' →
//   any other current_stage → 'in_progress' → 'open'.
//   `completed` is a PRODUCTION state; `closed` is the only fully-resolved
//   terminal. `voided` kills the order.
//
// ── Period basis per tile (the day each tile filters on) ─────────────────
//   new_customers        customerCreatedDay — created_date → created_at →
//                        date_created (no updated_date fallback — every edit
//                        stamps it and old customers would read "new").
//   estimates_created    estimateCreatedDay — created_date → created_at →
//                        updated_date (J-07 ladder).
//   estimates_cancelled  estimateCancelledDay — cancelled_at →
//                        cancelled_date → canceled_at → earliest
//                        status_history transition to cancelled/canceled →
//                        (currently cancelled ⇒ updated_date lower bound,
//                        same pattern as J-07's sent_day fallback).
//                        'lost'/'declined'/'archived' are NOT cancelled —
//                        they are distinct terminal spellings J-07 reports
//                        separately.
//   estimates_converted  J-07 conversionInfo precedence, verbatim:
//                        converted_at → converted_to_work_order/_to_order
//                        flag → status converted|won → approved +
//                        work_order_id → sales_stage won → bare
//                        work_order_id link. Day ladder: converted_at →
//                        conversion-revision completed_at → linked
//                        WorkOrder.created_date → accepted_at →
//                        sales_stage_changed_at → updated_date →
//                        created_date.
//   orders_placed        orderPlacedDay — date_order_created → order_date
//                        → created_date → date → start_date
//                        (customerAnalyticsModel.orderCreatedDay ladder).
//   orders_built         orderBuiltDay — built_at → built_date → date_built
//                        → latest per-product builtDay (the J-06 four-step
//                        product chain: status_history→built stamp, else
//                        changed_at when currently built, else earliest
//                        fulfillment stamp, else changed_at when fulfillment
//                        is past 'none') → orderCompletedDay (completion
//                        implies built — its day bounds the build).
//   orders_completed     orderCompletedDay — completed_at → completed_date
//                        → date_completed → order status_history→'completed'
//                        → product completed evidence → closed_at →
//                        closed_date (close implies completed on/before) →
//                        (currently completed/closed ⇒ updated_date →
//                        created_date). The updated/created rung is gated on
//                        the CURRENT lifecycle being completed|closed — a
//                        voided order's updated_date is its void edit, not
//                        a completion bound.
//   orders_closed        orderClosedDay — closed_at → closed_date →
//                        date_closed → order status_history→'closed' →
//                        updated_date (gated on lifecycle 'closed').
//   voided_*             orderVoidedDay — voided_at → voided_date →
//                        cancelled_at → cancelled_date → deleted_at →
//                        status_history→void-ish → updated_date (gated on
//                        lifecycle 'voided').
//
// ── Void split boundary (the J-11 brief's pre/post rule) ─────────────────
//   A voided order counts PRE-completion when orderReachedBuilt() finds no
//   evidence it ever entered the built+ phase, POST otherwise.
//   orderReachedBuilt = explicit built stamp | any product with canonical
//   status built|completed, fulfillment_state past 'none', or a
//   status_history→built/completed entry | orderReachedCompleted
//   (completed stamps, completed flag, current_stage 'completed', closed
//   stamps, lifecycle completed|closed, product 'completed' evidence).
//   Completion implies built — a completed-then-voided order is always
//   post-completion.
//
// ── Money ────────────────────────────────────────────────────────────────
//   Integer cents end-to-end (toCents → int sums — the statementBatch /
//   J-03/J-06/J-07 convention). Estimate tiles sum estimateTotalCents
//   (quote_total → total → grand_total → total_cost); order tiles sum
//   orderValueCents (total → grand_total → order_total → estimate_amount →
//   Σ products quoted_total/quoted_price/unit×qty). new_customers carries
//   count only (no money dim on a created customer).
//
// ── Rates / deltas ───────────────────────────────────────────────────────
//   funnelConversionRates: est_to_order_rate = converted ÷ created;
//   order_completion_rate = completed ÷ placed; void_rate_pre/post =
//   pre/post voided ÷ placed. Numerator and denominator are measured on
//   their own event days inside the same window (J-07 convention), so a
//   slow backlog can push a rate over 1.0 — reported honestly, never
//   clamped; division by zero → 0.
//   funnelDelta: per-tile {count_delta, pct_delta, total_cents_delta};
//   pct_delta is null when the prior count is 0 (no meaningful percent vs
//   an empty baseline — render as 'new', not ∞).
//   funnelTileRows: display-ready [{key,label,icon,count,total_cents?,
//   total?,delta?,tone}] in FUNNEL_TILES declaration order.
//
// Days are 'YYYY-MM-DD' UTC-day strings (ISO-prefix wins so timestamps
// never shift days — the toDay convention shared by every J-suite model).
// Date bounds passed as Date objects resolve to their LOCAL calendar day
// (engine-resolved date_range bounds are local startOfDay/endOfDay).
// Unbounded runs keep undated rows; any bound drops them (dayInRange) —
// BUT every tile first gates on the milestone having actually occurred
// (cancelled evidence / reached built / lifecycle closed), so an undated
// non-event never counts no matter how loose the window.
//
// API:
//   FUNNEL_TILES / FUNNEL_TILE_KEYS / FUNNEL_TONES
//   funnelCounts / funnelConversionRates / funnelDelta / funnelTileRows
//   ORDER_LIFECYCLE_STATES / orderLifecycleState / isOrderRecord
//   orderReachedBuilt / orderReachedCompleted / orderEventDays
//   orderPlacedDay / orderBuiltDay / orderCompletedDay / orderClosedDay /
//   orderVoidedDay / orderValueCents
//   isLiveEstimate / conversionInfo / estimateCancelledDay /
//   estimateCreatedDay / estimateTotalCents
//   isLiveCustomer / customerCreatedDay

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase().replace(/[\s-]+/g, '_');
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const pad2 = (n: number): string => String(n).padStart(2, '0');
const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Loose numeric parse — numbers and plain/decorated numeric strings parse;
// letter-laden strings don't (customerAnalyticsModel.looseNum).
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?$/;
const looseNum = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = clean(v);
  if (!s || !MONEYISH.test(s)) return NaN;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const firstFinite = (...vals: any[]): number => {
  for (const v of vals) {
    const n = looseNum(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

// Dollar-ish field → integer cents. Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;

// Any date-ish → 'YYYY-MM-DD' UTC day. '' when unparseable.
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

// LOCAL calendar day of a Date — engine-resolved range bounds are local
// startOfDay/endOfDay Dates, so their intended day is the local one.
const localDay = (d: any): string => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// One range bound: Date → local day; anything else → toDay.
const boundDay = (v: any): string => (v instanceof Date ? localDay(v) : toDay(v));

// Period normalizer — accepts {from,to} in any date-ish shape, a resolved
// engine range {preset,from,to}, or a bare 'YYYY-MM-DD' (same-day window).
const funnelPeriod = (period: any): { from: string; to: string } => {
  if (isObj(period)) {
    return { from: boundDay(period.from), to: boundDay(period.to) };
  }
  const d = toDay(period);
  return d ? { from: d, to: d } : { from: '', to: '' };
};

// Day ∈ [from,to]; unbounded keeps everything (undated included), any bound
// drops undated rows (the reportEngine filterByDateRange convention).
const dayInRange = (day: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

const rows = (v: any): any[] => (Array.isArray(v) ? v : []).filter(isObj);

const indexById = (list: any): Map<string, any> => {
  const map = new Map<string, any>();
  const arr = list instanceof Map ? [...list.values()] : rows(list);
  for (const r of arr) {
    if (isObj(r) && clean(r.id)) map.set(clean(r.id), r);
  }
  return map;
};

// ---------------------------------------------------------------------------
// Tile vocabulary
// ---------------------------------------------------------------------------

export const FUNNEL_TONES = ['info', 'positive', 'negative'] as const;
export type FunnelTone = (typeof FUNNEL_TONES)[number];

// Declaration order IS tile-strip order. `icon` is a lucide-react icon NAME
// (string — this module can't import the library); `tone` drives the tile's
// accent: info = neutral pipeline step, positive = desired outcome,
// negative = loss/void outcome.
export const FUNNEL_TILES = [
  { key: 'new_customers', label: 'New Customers', icon: 'UserPlus', tone: 'info' },
  { key: 'estimates_created', label: 'Estimates Created', icon: 'FilePlus', tone: 'info' },
  { key: 'estimates_cancelled', label: 'Estimates Cancelled', icon: 'FileX', tone: 'negative' },
  { key: 'estimates_converted', label: 'Estimates Converted', icon: 'FileCheck', tone: 'positive' },
  { key: 'orders_placed', label: 'Orders Placed', icon: 'ShoppingCart', tone: 'info' },
  { key: 'orders_built', label: 'Orders Built', icon: 'Hammer', tone: 'info' },
  { key: 'orders_completed', label: 'Orders Completed', icon: 'CheckCircle', tone: 'positive' },
  { key: 'orders_closed', label: 'Orders Closed', icon: 'Lock', tone: 'positive' },
  { key: 'voided_pre_completion', label: 'Voided Pre-Completion', icon: 'Ban', tone: 'negative' },
  { key: 'voided_post_completion', label: 'Voided Post-Completion', icon: 'AlertTriangle', tone: 'negative' },
] as const;

export type FunnelTileKey = (typeof FUNNEL_TILES)[number]['key'];
export const FUNNEL_TILE_KEYS = FUNNEL_TILES.map((t) => t.key) as FunnelTileKey[];

// ---------------------------------------------------------------------------
// Customer side
// ---------------------------------------------------------------------------

/** isLiveCustomer — J-04 rule: real object, not deleted, not a merge stub. */
export function isLiveCustomer(c: any): boolean {
  return isObj(c) && c.deleted !== true && !clean(c.merged_into_customer_id);
}

/** customerCreatedDay — system creation stamps only (no updated_date — an
 *  edit is not a creation). */
export function customerCreatedDay(c: any): string {
  return toDay(firstText(c?.created_date, c?.created_at, c?.date_created));
}

// ---------------------------------------------------------------------------
// Estimate side (J-07 estimateReports replicas)
// ---------------------------------------------------------------------------

// Void-ish rows never existed for reporting purposes (J-07 isVoidishEstimate).
const isVoidishEstimate = (est: any): boolean => {
  if (!isObj(est)) return true;
  if (norm(est.status) === 'void') return true;
  if (est.void === true || est.voided === true || est.is_void === true || est.deleted === true) return true;
  return Boolean(clean(est.voided_date) || clean(est.deleted_at));
};

/** isLiveEstimate — reportable row: object, not void-ish, not a template. */
export function isLiveEstimate(est: any): boolean {
  if (!isObj(est)) return false;
  if (isVoidishEstimate(est)) return false;
  if (est.is_template === true) return false;
  return true;
}

/** estimateTotalCents — quote_total (customer-facing waterfall) wins;
 *  total → grand_total → total_cost fallbacks (J-07 ladder). */
export function estimateTotalCents(est: any): number {
  for (const v of [est?.quote_total, est?.total, est?.grand_total, est?.total_cost]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return 0;
}

/** estimateCreatedDay — created_date → created_at → updated_date (J-07). */
export function estimateCreatedDay(est: any): string {
  return toDay(est?.created_date) || toDay(est?.created_at) || toDay(est?.updated_date);
}

// Normalized estimate status_history entries — workOrderConversion shape
// {at,field,from,to,by} plus tolerant aliases (J-07 historyEntries).
const estimateStatusDays = (est: any, targets: Set<string>): string[] => {
  const raw = Array.isArray(est?.status_history) ? est.status_history : [];
  const days: string[] = [];
  for (const h of raw) {
    if (!isObj(h)) continue;
    const field = firstText(h.field, h.key);
    if (field && norm(field) !== 'status') continue;
    const to = firstText(h.to, h.new_status, h.status, h.value);
    if (!targets.has(norm(to))) continue;
    const day = toDay(h.at ?? h.date ?? h.at_iso ?? h.created_date);
    if (day) days.push(day);
  }
  return days.sort();
};

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

/** estimateCancelledDay — when the estimate was cancelled. Ladder:
 *  cancelled_at → cancelled_date → canceled_at → earliest status_history
 *  transition to cancelled/canceled → (current status cancelled or an
 *  explicit cancelled flag ⇒ updated_date lower bound) → ''. */
export function estimateCancelledDay(est: any): string {
  if (!isObj(est)) return '';
  for (const v of [est.cancelled_at, est.cancelled_date, est.canceled_at]) {
    const d = toDay(v);
    if (d) return d;
  }
  const hist = estimateStatusDays(est, CANCELLED_STATUSES);
  if (hist.length) return hist[0];
  if (CANCELLED_STATUSES.has(norm(est.status)) || est.cancelled === true || est.canceled === true) {
    return toDay(est.updated_date);
  }
  return '';
}

// First completed EstimateRevision of a type for this estimate (J-07
// revisionDayFor — completed_at → started_at → created_date; earliest wins).
const revisionDayFor = (revisions: any[] | undefined, type: string): string => {
  const days = (Array.isArray(revisions) ? revisions : [])
    .filter((r) => isObj(r) && norm(r.revision_type) === type)
    .map((r) => toDay(r.completed_at) || toDay(r.started_at) || toDay(r.created_date))
    .filter(Boolean)
    .sort();
  return days[0] || '';
};

/**
 * conversionInfo — J-07 parity, verbatim precedence (first match wins):
 *   'converted_at' stamp → converted_to_work_order/_to_order flag →
 *   status converted|won → approved+work_order_id → sales_stage won →
 *   bare work_order_id link.
 * Day ladder: converted_at → revision(conversion).completed_at → linked
 * WorkOrder.created_date → accepted_at → sales_stage_changed_at →
 * updated_date → created_date.
 * ctx: {revisions?: EstimateRevision[] for THIS estimate, workOrdersById:
 *        Map | {id:row} | WorkOrder[] }.
 */
export function conversionInfo(
  est: any,
  ctx: any = {},
): { converted: boolean; via: string; day: string } {
  if (!isObj(est)) return { converted: false, via: '', day: '' };
  const status = norm(est.status);
  const woId = firstText(est.work_order_id, est.workOrderId);
  const revisions = Array.isArray(ctx?.revisions) ? ctx.revisions : [];
  const workOrders = ctx?.workOrdersById instanceof Map
    ? ctx.workOrdersById
    : indexById(ctx?.workOrdersById ?? ctx?.work_orders);

  let via = '';
  if (toDay(est.converted_at)) via = 'converted_at';
  else if (est.converted_to_work_order === true || est.converted_to_order === true) via = 'converted_flag';
  else if (status === 'converted' || status === 'won') via = 'status';
  else if (status === 'approved' && woId) via = 'approved+wo';
  else if (norm(est.sales_stage) === 'won') via = 'sales_stage_won';
  else if (woId) via = 'work_order_link';
  if (!via) return { converted: false, via: '', day: '' };

  const wo = woId ? workOrders.get(woId) : null;
  const day =
    toDay(est.converted_at) ||
    revisionDayFor(revisions, 'conversion') ||
    toDay(wo?.created_date) ||
    toDay(est.accepted_at) ||
    (norm(est.sales_stage) === 'won' ? toDay(est.sales_stage_changed_at) : '') ||
    toDay(est.updated_date) ||
    estimateCreatedDay(est);
  return { converted: true, via, day };
}

// ---------------------------------------------------------------------------
// Order side — lifecycle (E-06 completedVsPaidModel replica, verbatim)
// ---------------------------------------------------------------------------

export const ORDER_LIFECYCLE_STATES = ['open', 'in_progress', 'completed', 'closed', 'voided'] as const;

/** orderLifecycleState — E-06 precedence: explicit lifecycle fields →
 *  deleted/voided → 'voided' → closed flag/stamps → 'closed' → completed
 *  flag | current_stage 'completed' → 'completed' → any other stage →
 *  'in_progress' → 'open'. */
export function orderLifecycleState(workOrder: any): string {
  const wo = isObj(workOrder) ? workOrder : {};
  for (const raw of [wo.lifecycle_state, wo.order_state, wo.order_status, wo.status]) {
    const key = norm(raw);
    if (!key) continue;
    if ((ORDER_LIFECYCLE_STATES as readonly string[]).includes(key)) return key;
    if (['void', 'cancelled', 'canceled'].includes(key)) return 'voided';
  }
  if (wo.deleted === true || wo.voided === true || clean(wo.voided_date)) return 'voided';
  if (wo.closed === true || clean(wo.closed_date) || clean(wo.closed_at)) return 'closed';
  if (wo.completed === true || norm(wo.current_stage) === 'completed') return 'completed';
  if (clean(wo.current_stage)) return 'in_progress';
  return 'open';
}

// sales_status 'lost' = dead deal — it never became an order
// (customerAnalyticsModel.isSalesLost). Neutral-closed pipeline rows
// ("Closed - Did not Lose") are likewise not orders unless the row also
// reached 'won'.
const isSalesLost = (wo: any): boolean => norm(wo?.sales_status) === 'lost';
const isNeutralClosed = (wo: any): boolean =>
  Boolean(clean(wo?.sales_neutral_closed_at)) && norm(wo?.sales_status) !== 'won';

/** isOrderRecord — participates in order tiles: a real WorkOrder that
 *  became work (not sales-lost, not a neutrally-archived pipeline row).
 *  Voided orders stay in — their events and void split are the point. */
export function isOrderRecord(wo: any): boolean {
  if (!isObj(wo)) return false;
  if (isSalesLost(wo)) return false;
  if (isNeutralClosed(wo)) return false;
  return true;
}

/** orderValueCents — WO price basis: total → grand_total → order_total →
 *  estimate_amount → Σ products quoted_total/quoted_price/unit×qty
 *  (customerAnalyticsModel.orderEstimatedCents ladder). */
export function orderValueCents(wo: any): number {
  const v = firstFinite(wo?.total, wo?.grand_total, wo?.order_total, wo?.estimate_amount);
  if (Number.isFinite(v)) return toCents(v);
  const products = Array.isArray(wo?.products) ? wo.products : [];
  let cents = 0;
  for (const p of products) {
    if (!isObj(p)) continue;
    const line = firstFinite(p?.quoted_total, p?.quoted_price, num(p?.quoted_unit_price) * num(p?.quantity));
    if (Number.isFinite(line)) cents += toCents(line);
  }
  return cents;
}

// ---------------------------------------------------------------------------
// Product status vocabulary (J-06 productionReports replicas — zero-import
// rule → inline copies of the same locked sets)
// ---------------------------------------------------------------------------

const LEGACY_STATUS_ALIASES: Record<string, string> = {
  in_design: 'design_review',
  install_or_removal_only: 'install_removal_only',
  vended: 'built',
};

// Normalized + legacy-folded canonical product operational_status.
const canonicalStatus = (s: any): string => {
  const v = norm(s);
  if (!v) return '';
  return LEGACY_STATUS_ALIASES[v] ?? v;
};

const FULFILLMENT_AWAITING = new Set([
  'awaiting_pickup', 'awaiting_installation', 'awaiting_shipping', 'awaiting_delivery',
]);
const FULFILLMENT_TERMINAL = new Set(['picked_up', 'installed', 'shipped', 'delivered']);
const fulfillmentPastNone = (v: any): boolean => {
  const s = norm(v);
  return Boolean(s) && s !== 'none';
};

// Product status_history entries normalized to {day, at, field, to} —
// workOrderConversion shape {at,field,from,to,by} with tolerant aliases.
const productHistory = (p: any): any[] => {
  const raw = Array.isArray(p?.status_history) ? p.status_history : [];
  const out: any[] = [];
  for (const h of raw) {
    if (!isObj(h)) continue;
    out.push({
      at: clean(h.at ?? h.date ?? h.at_iso),
      day: toDay(h.at ?? h.date ?? h.at_iso ?? h.created_date),
      field: norm(firstText(h.field, h.key)),
      to: firstText(h.to, h.new_status, h.status, h.value),
    });
  }
  return out;
};

/** productBuiltDay — J-06 builtDay four-step evidence chain:
 *  1. latest status_history {operational_status→built} stamp;
 *  2. currently built → operational_status_changed_at;
 *  3. earliest fulfillment awaiting/terminal stamp (entering fulfillment
 *     implies built);
 *  4. current fulfillment past 'none' → operational_status_changed_at. */
const productBuiltDay = (p: any): string => {
  if (!isObj(p)) return '';
  const history = productHistory(p);
  let builtAt = '';
  for (const h of history) {
    if (h.field !== 'operational_status' && h.field !== '') continue;
    if (canonicalStatus(h.to) !== 'built') continue;
    if (h.at > builtAt) builtAt = h.at;
  }
  let day = toDay(builtAt);
  if (day) return day;
  if (canonicalStatus(p.operational_status) === 'built') {
    day = toDay(p.operational_status_changed_at);
    if (day) return day;
  }
  let firstFulfill = '';
  for (const h of history) {
    if (h.field !== 'fulfillment_state') continue;
    const to = norm(h.to);
    if (!FULFILLMENT_AWAITING.has(to) && !FULFILLMENT_TERMINAL.has(to)) continue;
    if (h.at && (!firstFulfill || h.at < firstFulfill)) firstFulfill = h.at;
  }
  day = toDay(firstFulfill);
  if (day) return day;
  if (fulfillmentPastNone(p.fulfillment_state)) return toDay(p.operational_status_changed_at);
  return '';
};

// Product reached the built+ phase at some point (history counts even when
// the product was later voided — it entered the built phase first).
const productReachedBuilt = (p: any): boolean => {
  if (!isObj(p)) return false;
  const st = canonicalStatus(p.operational_status);
  if (st === 'built' || st === 'completed') return true;
  if (fulfillmentPastNone(p.fulfillment_state)) return true;
  for (const h of productHistory(p)) {
    if (h.field === 'fulfillment_state' &&
        (FULFILLMENT_AWAITING.has(norm(h.to)) || FULFILLMENT_TERMINAL.has(norm(h.to)))) return true;
    if (h.field !== 'operational_status' && h.field !== '') continue;
    const to = canonicalStatus(h.to);
    if (to === 'built' || to === 'completed') return true;
  }
  return false;
};

// Product reached completed (canonical 'completed' status or a recorded
// transition to it).
const productReachedCompleted = (p: any): boolean => {
  if (!isObj(p)) return false;
  if (canonicalStatus(p.operational_status) === 'completed') return true;
  return productHistory(p).some(
    (h) => (h.field === 'operational_status' || h.field === '') &&
           canonicalStatus(h.to) === 'completed',
  );
};

// Latest day a product reached 'completed' (history stamp → changed_at
// when currently completed). '' when no dated evidence.
const productCompletedDay = (p: any): string => {
  if (!isObj(p)) return '';
  let day = '';
  for (const h of productHistory(p)) {
    if (h.field !== 'operational_status' && h.field !== '') continue;
    if (canonicalStatus(h.to) !== 'completed' || !h.day) continue;
    if (h.day > day) day = h.day;
  }
  if (day) return day;
  if (canonicalStatus(p.operational_status) === 'completed') {
    return toDay(p.operational_status_changed_at);
  }
  return '';
};

// Order-level status_history — not declared on the entity but tolerated:
// some lifecycle writers may stamp {field:'current_stage'|'status'|
// 'lifecycle_state',to,at} on the WO itself. Field-less entries count as
// status entries (a WO history IS a state trail).
const orderHistoryTargets = (wo: any, targets: Set<string>): string[] => {
  const raw = Array.isArray(wo?.status_history) ? wo.status_history : [];
  const days: string[] = [];
  for (const h of raw) {
    if (!isObj(h)) continue;
    const field = norm(firstText(h.field, h.key));
    if (field && !['status', 'current_stage', 'lifecycle_state', 'order_status', 'order_state'].includes(field)) {
      continue;
    }
    const to = firstText(h.to, h.new_status, h.status, h.value);
    if (!targets.has(norm(to))) continue;
    const day = toDay(h.at ?? h.date ?? h.at_iso ?? h.created_date);
    if (day) days.push(day);
  }
  return days.sort();
};

// ---------------------------------------------------------------------------
// Order milestone reach + day ladders
// ---------------------------------------------------------------------------

/** orderPlacedDay — the order's booking day: date_order_created →
 *  order_date → created_date → date → start_date
 *  (customerAnalyticsModel.orderCreatedDay ladder). */
export function orderPlacedDay(wo: any): string {
  return toDay(firstText(wo?.date_order_created, wo?.order_date, wo?.created_date, wo?.date, wo?.start_date));
}

const orderProducts = (wo: any): any[] =>
  (Array.isArray(wo?.products) ? wo.products : []).filter(isObj);

// Stamps proving the order finished production (implies built).
const orderCompletedStamps = (wo: any): string =>
  toDay(firstText(wo?.completed_at, wo?.completed_date, wo?.date_completed, wo?.finished_at));

// Stamps proving the order fully resolved (implies completed).
const orderClosedStamps = (wo: any): string =>
  toDay(firstText(wo?.closed_at, wo?.closed_date, wo?.date_closed));

/** orderReachedCompleted — evidence the order hit production-complete:
 *  completed stamps | lifecycle completed|closed | completed flag |
 *  current_stage 'completed' | closed stamps | order history→completed |
 *  any product 'completed'. */
export function orderReachedCompleted(wo: any): boolean {
  if (!isObj(wo)) return false;
  if (orderCompletedStamps(wo)) return true;
  const lifecycle = orderLifecycleState(wo);
  if (lifecycle === 'completed' || lifecycle === 'closed') return true;
  if (wo.completed === true || norm(wo.current_stage) === 'completed') return true;
  if (orderClosedStamps(wo)) return true;
  if (orderHistoryTargets(wo, new Set(['completed'])).length) return true;
  return orderProducts(wo).some(productReachedCompleted);
}

/** orderReachedBuilt — evidence the order entered the built+ phase:
 *  built stamps | any product reached built | reached completed
 *  (completion implies built). This is the void-split boundary: a voided
 *  order without it is a pre-completion void. */
export function orderReachedBuilt(wo: any): boolean {
  if (!isObj(wo)) return false;
  if (toDay(firstText(wo.built_at, wo.built_date, wo.date_built))) return true;
  if (orderProducts(wo).some(productReachedBuilt)) return true;
  return orderReachedCompleted(wo);
}

/** orderBuiltDay — when the order finished building. built_at →
 *  built_date → date_built → latest per-product builtDay (J-06 chain —
 *  the order is built when its last product is) → orderCompletedDay
 *  (completion implies built; its day bounds the build) → ''. */
export function orderBuiltDay(wo: any): string {
  if (!isObj(wo)) return '';
  const stamped = toDay(firstText(wo.built_at, wo.built_date, wo.date_built));
  if (stamped) return stamped;
  let latest = '';
  for (const p of orderProducts(wo)) {
    const d = productBuiltDay(p);
    if (d && d > latest) latest = d;
  }
  if (latest) return latest;
  return orderCompletedDay(wo);
}

/** orderCompletedDay — completed_at → completed_date → date_completed →
 *  finished_at → order history→'completed' (latest) → latest product
 *  completed evidence → closed_at → closed_date (close implies completed
 *  on/before) → [currently completed|closed ⇒ updated_date → created_date]
 *  → ''. The final rung is gated on the CURRENT lifecycle so a voided
 *  order's updated_date never masquerades as a completion bound. */
export function orderCompletedDay(wo: any): string {
  if (!isObj(wo) || !orderReachedCompleted(wo)) return '';
  const stamped = orderCompletedStamps(wo);
  if (stamped) return stamped;
  const hist = orderHistoryTargets(wo, new Set(['completed']));
  if (hist.length) return hist[hist.length - 1];
  let prodDay = '';
  for (const p of orderProducts(wo)) {
    const d = productCompletedDay(p);
    if (d && d > prodDay) prodDay = d;
  }
  if (prodDay) return prodDay;
  const closed = orderClosedStamps(wo);
  if (closed) return closed;
  const lifecycle = orderLifecycleState(wo);
  if (lifecycle === 'completed' || lifecycle === 'closed') {
    return toDay(firstText(wo.updated_date, wo.created_date));
  }
  return '';
}

/** orderClosedDay — closed_at → closed_date → date_closed → order
 *  history→'closed' (latest) → updated_date (gated on lifecycle 'closed')
 *  → ''. */
export function orderClosedDay(wo: any): string {
  if (!isObj(wo) || orderLifecycleState(wo) !== 'closed') return '';
  const stamped = orderClosedStamps(wo);
  if (stamped) return stamped;
  const hist = orderHistoryTargets(wo, new Set(['closed']));
  if (hist.length) return hist[hist.length - 1];
  return toDay(wo.updated_date);
}

const VOID_TARGETS = new Set(['voided', 'void', 'cancelled', 'canceled', 'deleted']);

/** orderVoidedDay — voided_at → voided_date → cancelled_at →
 *  cancelled_date → deleted_at → order history→void-ish (latest) →
 *  updated_date (the delete/void edit stamps it) → ''. Only meaningful on
 *  lifecycle-'voided' rows. */
export function orderVoidedDay(wo: any): string {
  if (!isObj(wo) || orderLifecycleState(wo) !== 'voided') return '';
  const stamped = toDay(firstText(wo.voided_at, wo.voided_date, wo.cancelled_at, wo.cancelled_date, wo.deleted_at));
  if (stamped) return stamped;
  const hist = orderHistoryTargets(wo, VOID_TARGETS);
  if (hist.length) return hist[hist.length - 1];
  return toDay(wo.updated_date);
}

/** orderEventDays — every order milestone in one pass:
 *  {placed, built, completed, closed, voided, reached_built,
 *   reached_completed, lifecycle}. Day is '' when the milestone has no
 *  dated evidence (or was never reached). */
export function orderEventDays(wo: any): {
  placed: string; built: string; completed: string; closed: string; voided: string;
  reached_built: boolean; reached_completed: boolean; lifecycle: string;
} {
  const lifecycle = orderLifecycleState(wo);
  const reachedBuilt = orderReachedBuilt(wo);
  const reachedCompleted = orderReachedCompleted(wo);
  return {
    placed: orderPlacedDay(wo),
    built: reachedBuilt ? orderBuiltDay(wo) : '',
    completed: reachedCompleted ? orderCompletedDay(wo) : '',
    closed: lifecycle === 'closed' ? orderClosedDay(wo) : '',
    voided: lifecycle === 'voided' ? orderVoidedDay(wo) : '',
    reached_built: reachedBuilt,
    reached_completed: reachedCompleted,
    lifecycle,
  };
}

// ---------------------------------------------------------------------------
// funnelCounts — the tile counter
// ---------------------------------------------------------------------------

const emptyTile = (): { count: number; total_cents?: number } => ({ count: 0 });

const tileOf = (counts: any, key: string): { count: number; total_cents?: number } => {
  const t = counts?.[key];
  const out = emptyTile();
  if (isObj(t)) {
    out.count = num(t.count, 0);
    if (Number.isFinite(Number(t.total_cents))) out.total_cents = Math.round(Number(t.total_cents));
  }
  return out;
};

/**
 * funnelCounts({customers, estimates, workOrders, revisions?}, {from, to})
 *   → {tile_key: {count, total_cents?}} — every FUNNEL_TILES key is always
 *   present. Each row counts on a tile when that milestone's EVENT day is
 *   inside [from,to]; unbounded windows keep undated rows.
 *
 *   data.customers    Customer[] — live (not deleted, not merge-stub).
 *   data.estimates    AllInOneEstimate[] — live (not void-ish, not
 *                     template). conversionInfo runs per row; the linked
 *                     WorkOrder.created_date rung resolves through the
 *                     injected workOrders list.
 *   data.workOrders   WorkOrder[] (data.work_orders alias tolerated).
 *   data.revisions    EstimateRevision[] — optional; feeds the conversion
 *                     day's revision rung (grouped by estimate_id).
 */
export function funnelCounts(data: any = {}, period: any = {}): Record<string, { count: number; total_cents?: number }> {
  const { from, to } = funnelPeriod(period);
  const counts: Record<string, { count: number; total_cents?: number }> = {};
  for (const t of FUNNEL_TILES) counts[t.key] = emptyTile();

  const bump = (key: string, cents: number) => {
    const tile = counts[key];
    if (!tile) return;
    tile.count += 1;
    if (cents) tile.total_cents = (tile.total_cents ?? 0) + cents;
  };

  const workOrders = rows(data?.workOrders ?? data?.work_orders);
  const woById = indexById(workOrders);

  // Revisions grouped per estimate for the conversion-day ladder.
  const revsByEstimate = new Map<string, any[]>();
  for (const r of rows(data?.revisions)) {
    const estId = firstText(r.estimate_id, r.estimateId);
    if (!estId) continue;
    const list = revsByEstimate.get(estId) || [];
    list.push(r);
    revsByEstimate.set(estId, list);
  }

  for (const c of rows(data?.customers)) {
    if (!isLiveCustomer(c)) continue;
    if (!dayInRange(customerCreatedDay(c), from, to)) continue;
    bump('new_customers', 0);
  }

  for (const e of rows(data?.estimates)) {
    if (!isLiveEstimate(e)) continue;
    const cents = estimateTotalCents(e);
    if (dayInRange(estimateCreatedDay(e), from, to)) bump('estimates_created', cents);
    const conv = conversionInfo(e, {
      revisions: revsByEstimate.get(clean(e.id)) || [],
      workOrdersById: woById,
    });
    if (conv.converted && dayInRange(conv.day, from, to)) bump('estimates_converted', cents);
    // The cancelled EVENT must have evidence — an empty day means the
    // estimate was never cancelled, and unbounded dayInRange would count it.
    const cDay = estimateCancelledDay(e);
    if (cDay && dayInRange(cDay, from, to)) bump('estimates_cancelled', cents);
  }

  for (const wo of workOrders) {
    if (!isOrderRecord(wo)) continue;
    const ev = orderEventDays(wo);
    const cents = orderValueCents(wo);
    if (dayInRange(ev.placed, from, to)) bump('orders_placed', cents);
    // Membership gates: the milestone must have been REACHED — an empty day
    // under unbounded dayInRange must not fabricate a built/completed/closed
    // event (a reached-but-undated milestone still counts unbounded).
    if (ev.reached_built && dayInRange(ev.built, from, to)) bump('orders_built', cents);
    if (ev.reached_completed && dayInRange(ev.completed, from, to)) bump('orders_completed', cents);
    if (ev.lifecycle === 'closed' && dayInRange(ev.closed, from, to)) bump('orders_closed', cents);
    if (ev.lifecycle === 'voided' && dayInRange(ev.voided, from, to)) {
      bump(ev.reached_built ? 'voided_post_completion' : 'voided_pre_completion', cents);
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Rates / deltas / display rows
// ---------------------------------------------------------------------------

const safeRate = (n: number, d: number): number => (d > 0 ? round4(n / d) : 0);

/**
 * funnelConversionRates(counts) → guarded rates on the SAME window.
 *   est_to_order_rate      estimates_converted ÷ estimates_created
 *   order_completion_rate  orders_completed ÷ orders_placed
 *   void_rate_pre          voided_pre_completion ÷ orders_placed
 *   void_rate_post         voided_post_completion ÷ orders_placed
 * Independent event-day measurement can exceed 1.0 — reported honestly,
 * never clamped; div-zero → 0 (J-07 convention).
 */
export function funnelConversionRates(counts: any = {}): {
  est_to_order_rate: number;
  order_completion_rate: number;
  void_rate_pre: number;
  void_rate_post: number;
} {
  const c = (k: string): number => tileOf(counts, k).count;
  const placed = c('orders_placed');
  return {
    est_to_order_rate: safeRate(c('estimates_converted'), c('estimates_created')),
    order_completion_rate: safeRate(c('orders_completed'), placed),
    void_rate_pre: safeRate(c('voided_pre_completion'), placed),
    void_rate_post: safeRate(c('voided_post_completion'), placed),
  };
}

/**
 * funnelDelta(current, prior) → per-tile {count_delta, pct_delta,
 * total_cents_delta} for period-over-period arrows. pct_delta is a round4
 * ratio (0.25 = +25%); null when the prior count is 0 — a fresh baseline
 * has no meaningful percent (render 'new', not ∞).
 */
export function funnelDelta(current: any = {}, prior: any = {}): Record<string, {
  count_delta: number; pct_delta: number | null; total_cents_delta: number;
}> {
  const out: Record<string, { count_delta: number; pct_delta: number | null; total_cents_delta: number }> = {};
  for (const { key } of FUNNEL_TILES) {
    const cur = tileOf(current, key);
    const pre = tileOf(prior, key);
    const cd = cur.count - pre.count;
    out[key] = {
      count_delta: cd,
      pct_delta: pre.count > 0 ? round4(cd / pre.count) : null,
      total_cents_delta: (cur.total_cents ?? 0) - (pre.total_cents ?? 0),
    };
  }
  return out;
}

/**
 * funnelTileRows(counts, {prior?}) → display rows in FUNNEL_TILES order:
 *   [{key, label, icon, count, total_cents?, total?, delta?, tone}]
 * `total` is dollars (fromCents) for direct display; `total_cents` stays
 * on the row for drilldowns. `delta` attaches only when opts.prior is
 * supplied — it is the funnelDelta() entry for that tile.
 */
export function funnelTileRows(counts: any = {}, opts: any = {}): any[] {
  const deltas = opts?.prior ? funnelDelta(counts, opts.prior) : null;
  return FUNNEL_TILES.map((t) => {
    const c = tileOf(counts, t.key);
    const row: any = { key: t.key, label: t.label, icon: t.icon, count: c.count, tone: t.tone };
    if (c.total_cents != null) {
      row.total_cents = c.total_cents;
      row.total = fromCents(c.total_cents);
    }
    if (deltas) row.delta = deltas[t.key];
    return row;
  });
}
