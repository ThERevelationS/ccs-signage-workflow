// Customer analytics model — masterplan G-12. Pure TS, zero imports:
// bundle-safe for Deno functions (base44/functions/*), the Customer 360
// frontend, and Node test harnesses alike. No I/O anywhere — the wiring
// layer loads the customer-scoped lists and these functions produce the
// analytics block the page renders.
//
// Extends Customer 360 (src/pages/Customer360.jsx + customer360Model.js)
// with the metrics its KPI strip does not carry: average order value,
// closed/completed order totals+counts, all-time vs calendar-year splits,
// discounts given, and the estimates conversion block.
//
// ── Data contract (base44/entities/*.jsonc — read before writing) ──────
//   Invoice.status   — draft|sent|partially_paid|paid|void. POSTED
//                      (revenue-carrying) = sent|partially_paid|paid plus
//                      the partial/issued import aliases — the exact set
//                      taxLiabilityModel uses. Drafts never billed, voids
//                      were reversed, unknown/blank fails closed.
//   Invoice money    — total / amount_paid / balance_due dollars, server-
//                      stamped by invoicingAction. Aliases tolerated:
//                      grand_total/amount, paid_amount/total_paid,
//                      balance/amount_due.
//   Invoice date     — invoice_date → issue_date → date → created_date
//                      (same ladder as taxLiabilityModel.invoiceDate).
//   Invoice discounts— discount_amount (order-level), line_items[].
//                      discount_amount|discount_total|discount|
//                      line_discount (line-level), fee_lines[] kind
//                      'discount' (signed, discounts negative — orderFees).
//   Invoice.credit_applied — dollars of store credit consumed on the bill
//                      (storeCreditModel mirror of ledger credit_applied).
//   WorkOrder        — completed flag | current_stage 'completed' =
//                      production-complete (NOT paid — E-06). Terminal
//                      'closed' = closed flag/closed_date/closed_at or
//                      explicit lifecycle field 'closed'. 'voided' =
//                      deleted/voided/voided_date/cancelled. sales_status
//                      'lost' = dead deal — excluded from the order book
//                      entirely (it never became an order).
//   WorkOrder value  — total → grand_total → order_total →
//                      estimate_amount → Σ products[].quoted_total
//                      (completedVsPaidModel/financialReports ladder).
//   WorkOrder day    — date_order_created → order_date → created_date →
//                      date → start_date.
//   Payment          — status void = reversed (excluded); recorded +
//                      refunded rows both count with SIGNED amount
//                      (refund rows are negative → net collected). Day =
//                      paid_date → date → created_date.
//   StoreCreditLedger— kind credit_issued|credit_applied|credit_expired|
//                      credit_voided; amount_cents is the canonical
//                      signed-cent value (amount dollars is the display
//                      mirror; the pre-persist model row stores cents in
//                      `amount` — when amount_cents is absent, amount is
//                      read as dollars: the entity is the canonical store).
//                      Day = occurred_at → created_at → created_date.
//   AllInOneEstimate — status draft|calculated|sent|approved|archived|
//                      cancelled (+ legacy converted|won|lost|declined).
//                      Open pipeline = draft|calculated|sent. There is NO
//                      'converted' status — conversion follows
//                      estimateReports.conversionInfo precedence:
//                      converted_at → converted_to_work_order/_to_order
//                      flag → status converted|won → approved +
//                      work_order_id → sales_stage won → bare
//                      work_order_id link.
//
// ── What counts as an ORDER ────────────────────────────────────────────
//   The order book = live WorkOrders (not voided, not sales-lost) PLUS
//   standalone posted invoices — posted bills whose work_order_id/
//   estimate_id does not resolve to a live work order (billing-only
//   customers, imported history, capped WO lists). A posted invoice that
//   DOES link contributes its total to that order's invoiced_cents;
//   unposted invoices never create orders and never bill. Progress
//   billing (deposit/progress/final invoices on one WO) counts ONE order.
//
//   completed_order_count — order-book members fully done: WO lifecycle
//     ∈ {completed, closed} (E-06 precedence) or standalone invoice paid
//     in full (status 'paid' or balance_due ≤ 0).
//   closed_order_count    — terminal-closed subset: WO lifecycle 'closed'
//     or standalone invoice paid.
//   order_count           — order-book size.
//   avg_order_cents       — invoiced_cents ÷ order_count: revenue per
//     order on a BILLED basis (progress-billed orders don't deflate it).
//   completed_invoiced_cents — posted-invoice totals billed on orders that
//     are completed (in a year scope: the in-year-dated slice of those
//     bills — "how much of the year's invoicing was on orders now done").
//   unbilled_order_value_cents — Σ WO quoted value (estimate ladder) over
//     booked orders with NO posted invoice yet — the unbilled-revenue line.
//
// ── Metric definitions ─────────────────────────────────────────────────
//   invoiced_cents      Σ posted invoice totals.
//   paid_cents          Σ posted invoice amount_paid (server-maintained,
//                       includes credit applied; a 'paid'-status row with
//                       no stamped amount reports its full total). Fallback
//                       when every amount_paid is 0 AND payment/ledger rows
//                       exist: Σ non-void payments + Σ credit_applied ledger
//                       (the payments-only degraded path, same convention
//                       as customer360Model.computeTotals). In a YEAR scope
//                       amount_paid can't be attributed (it's cumulative),
//                       so paid = payments + credit applied dated in-year;
//                       with neither supplied, invoices whose paid day
//                       (paid_date → invoice day) lands in-year.
//   open_balance_cents  Σ posted invoice balance_due (raw — an overpaid
//                       invoice's negative balance offsets, matching the
//                       workspace totals semantics).
//   first_order_at / last_order_at — earliest/latest ORDER day
//                       ('YYYY-MM-DD'; '' when no order carries a day).
//   avg_days_between_orders — (last − first) ÷ (dated orders − 1), 1dp;
//                       null under 2 dated orders.
//   estimates.total     live estimates (not voidish, not templates).
//   estimates.sent      live estimates that reached the customer
//                       (sent-day stamp, sent-like status, or converted).
//   estimates.converted conversionInfo-precedence conversions.
//   estimates.conversion_rate = converted ÷ sent (the J-07 verify
//                       formula), 0 when nothing was sent.
//   estimates.open_pipeline_cents = Σ quote_total over open estimates that
//                       are NOT converted (decided work left the pipeline).
//
// ── Year scoping ({now, year?}) ────────────────────────────────────────
//   `year` block carries the same metric keys restricted to the calendar
//   year (UTC): invoices/payments/ledger rows bucket by their own day;
//   orders count by booking day; completed/closed counts bucket by the
//   order's COMPLETED day; open_balance is balances-as-of-now on bills
//   dated in-year; completed_invoiced_cents is in-year bills on completed
//   orders. Undated rows drop out of bounded scopes (the taxLiabilityRows
//   convention). `by_year` maps every observed year → its bucket (the
//   requested year and year−1 are always present) so yearComparison can
//   reach arbitrary yearsBack without a second pass.
//
// Money: integer cents end-to-end — dollar inputs convert exactly once
// via toCents, sums stay integers, *_pct/rate outputs are round4.
//
// API:
//   POSTED_INVOICE_STATUSES / ORDER_LIFECYCLE_STATES / ANALYTICS_TONES
//   isPostedInvoice / invoiceDate / orderLifecycleState / isOrderInBook
//   isCompletedOrder / isClosedOrder / isLiveEstimate / estimateConverted
//   customerAnalytics / analyticsBadges / yearComparison / centsToMoney

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const round1 = (n: number): number => Math.round(n * 10) / 10;

// Loose numeric parse (same rule as taxLiabilityModel): numbers and plain/
// decorated numeric strings ('1,234.56', '$5.00', '-2.5') parse; letter-
// laden strings like 'INV-001' don't — a naive strip would read those -1.
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?\s*$/;
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
const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Dollar field → integer cents. Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// Any date-ish → 'YYYY-MM-DD' UTC day (leading-ISO-prefix rule first so
// timestamps never shift days across timezones). '' when unparseable.
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
const dayYear = (day: string): number => {
  const s = clean(day);
  if (s.length < 4) return NaN; // '' → NaN (Number('') is 0, not NaN — guard)
  const y = Number(s.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : NaN;
};
const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);

const liveRows = (rows: any): any[] =>
  (Array.isArray(rows) ? rows : []).filter((r) => isObj(r) && r.deleted !== true);

// --- invoices ---------------------------------------------------------------

export const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid'];
const POSTED = new Set([...POSTED_INVOICE_STATUSES, 'partial', 'issued']);

/** isPostedInvoice — revenue-carrying statuses only (draft/void/blank fail
 *  closed — same set as taxLiabilityModel.POSTED). */
export function isPostedInvoice(inv: any): boolean {
  return isObj(inv) && inv.deleted !== true && POSTED.has(norm(inv?.status));
}

/** invoiceDate — the invoice's billing day: invoice_date → issue_date →
 *  date → created_date (taxLiabilityModel.invoiceDate ladder). */
export function invoiceDate(inv: any): string {
  return toDay(firstText(inv?.invoice_date, inv?.issue_date, inv?.date, inv?.created_date));
}

const invoiceTotalCents = (inv: any): number => {
  const v = firstFinite(inv?.total, inv?.grand_total, inv?.amount, inv?.invoice_total);
  return Number.isFinite(v) ? toCents(v) : 0;
};

// Paid applied on the invoice: server-stamped amount_paid → aliases →
// payments[] row sum → total − balance. Never negative.
const invoicePaidCents = (inv: any): number => {
  for (const v of [inv?.amount_paid, inv?.paid_amount, inv?.total_paid]) {
    if (v != null && Number.isFinite(looseNum(v))) return Math.max(0, toCents(v));
  }
  if (Array.isArray(inv?.payments) && inv.payments.length) {
    const sum = inv.payments
      .filter((p: any) => isObj(p) && !['void'].includes(norm(p.status)))
      .reduce((s: number, p: any) => s + toCents(firstFinite(p?.amount, p?.value, p?.paid_amount) || 0), 0);
    return Math.max(0, sum); // a net-refunded invoice reports 0 paid, not negative
  }
  const balance = firstFinite(inv?.balance_due, inv?.balance, inv?.amount_due);
  const total = firstFinite(inv?.total, inv?.grand_total);
  if (Number.isFinite(balance) && Number.isFinite(total)) {
    return Math.max(0, toCents(total) - toCents(balance));
  }
  return 0;
};

// Open AR on the invoice: server-stamped balance_due → aliases →
// total − amount_paid. Raw (a credit-balance invoice reports negative).
const invoiceBalanceCents = (inv: any): number => {
  const v = firstFinite(inv?.balance_due, inv?.balance, inv?.amount_due);
  if (Number.isFinite(v)) return toCents(v);
  const total = firstFinite(inv?.total, inv?.grand_total);
  const paid = firstFinite(inv?.amount_paid, inv?.paid_amount, inv?.total_paid);
  if (Number.isFinite(total)) return toCents(total) - (Number.isFinite(paid) ? toCents(paid) : 0);
  return 0;
};

const invoicePaidInFull = (inv: any): boolean => {
  if (norm(inv?.status) === 'paid') return true;
  if (inv?.paid_in_full === true) return true;
  const total = invoiceTotalCents(inv);
  return total > 0 && invoiceBalanceCents(inv) <= 0;
};

// --- invoice ↔ work order linkage ----------------------------------------------
const invoiceWorkOrderId = (inv: any): string => firstText(inv?.work_order_id, inv?.workOrderId, inv?.order_id);
const invoiceEstimateId = (inv: any): string => firstText(inv?.estimate_id, inv?.estimateId);

// --- work orders ----------------------------------------------------------------

// E-06 lifecycle vocabulary (completedVsPaidModel.ORDER_LIFECYCLE) — kept
// as the exported constant so callers can label states identically.
export const ORDER_LIFECYCLE_STATES = ['open', 'in_progress', 'completed', 'closed', 'voided'];
const CLOSED_COMPLETED_STATES = new Set(['completed', 'closed']);

/**
 * orderLifecycleState — mirrors completedVsPaidModel.orderLifecycleState
 * precedence exactly (E-06):
 *   explicit lifecycle_state/order_state/order_status/status (incl.
 *   camelCase keys + cancelled/canceled/void aliases → voided) →
 *   deleted/voided flag → closed flag/stamp → completed flag or
 *   current_stage 'completed' → any other current_stage → 'open'.
 * `completed` is a PRODUCTION state — the order can complete with open
 * AR; `closed` is the only terminal "fully resolved" state.
 */
export function orderLifecycleState(workOrder: any): string {
  const wo = isObj(workOrder) ? workOrder : {};
  for (const raw of [wo.lifecycle_state, wo.order_state, wo.order_status, wo.status]) {
    const key = norm(raw).replace(/[\s-]+/g, '_');
    if (!key) continue;
    if ((ORDER_LIFECYCLE_STATES as string[]).includes(key)) return key;
    if (['void', 'cancelled', 'canceled'].includes(key)) return 'voided';
  }
  if (wo.deleted === true || wo.voided === true || clean(wo.voided_date)) return 'voided';
  if (wo.closed === true || clean(wo.closed_date) || clean(wo.closed_at)) return 'closed';
  if (wo.completed === true || norm(wo.current_stage) === 'completed') return 'completed';
  if (clean(wo.current_stage)) return 'in_progress';
  return 'open';
}

// Sales-lost rows never became orders — the deal is dead, not a job.
const isSalesLost = (wo: any): boolean => norm(wo?.sales_status) === 'lost';

/** isOrderInBook — a live order-book member: real object, not deleted,
 *  lifecycle not 'voided', sales not lost. Terminal 'closed' orders stay
 *  IN the book (they're history, not pending). */
export function isOrderInBook(wo: any): boolean {
  if (!isObj(wo) || wo.deleted === true) return false;
  const state = orderLifecycleState(wo);
  if (state === 'voided') return false;
  if (isSalesLost(wo)) return false;
  return true;
}

/** isCompletedOrder — production finished: lifecycle completed OR the
 *  terminal closed state (a closed order passed through completed). */
export function isCompletedOrder(wo: any): boolean {
  return isObj(wo) && CLOSED_COMPLETED_STATES.has(orderLifecycleState(wo));
}

/** isClosedOrder — terminally resolved (paid in full or admin close). */
export function isClosedOrder(wo: any): boolean {
  return isObj(wo) && orderLifecycleState(wo) === 'closed';
}

// The order's booking day: explicit order-date stamps → created_date →
// date → start_date.
const orderCreatedDay = (wo: any): string =>
  toDay(firstText(wo?.date_order_created, wo?.order_date, wo?.created_date, wo?.date, wo?.start_date));

// The day the order finished: close stamps → completion stamps →
// updated/created fallback (only meaningful on completed/closed rows —
// callers gate on isCompletedOrder first).
const orderCompletedDay = (wo: any): string => {
  const stamped = toDay(firstText(wo?.closed_date, wo?.closed_at, wo?.completed_date, wo?.completed_at));
  if (stamped) return stamped;
  return toDay(firstText(wo?.updated_date, wo?.created_date));
};

// WO quoted value ladder (completedVsPaidModel/financialReports):
// total → grand_total → order_total → estimate_amount → Σ products quoted.
const orderEstimatedCents = (wo: any): number => {
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
};

// --- payments -------------------------------------------------------------------

const isLivePayment = (p: any): boolean =>
  isObj(p) && p.deleted !== true && norm(p?.status) !== 'void';
const paymentDay = (p: any): string =>
  toDay(firstText(p?.paid_date, p?.date, p?.payment_date, p?.created_date));
// Signed cents — recorded positive, credit-memo/refund rows negative.
const paymentAmountCents = (p: any): number => {
  const v = firstFinite(p?.amount, p?.value, p?.paid_amount, p?.total);
  return Number.isFinite(v) ? toCents(v) : 0;
};

// --- store credit ledger ----------------------------------------------------------

const LEDGER_KINDS = new Set(['credit_issued', 'credit_applied', 'credit_expired', 'credit_voided']);
const isLedgerRow = (r: any): boolean =>
  isObj(r) && r.deleted !== true && LEDGER_KINDS.has(norm(r?.kind));
const ledgerDay = (r: any): string =>
  toDay(firstText(r?.occurred_at, r?.created_at, r?.created_date));
// Canonical signed cents: amount_cents wins; a bare `amount` is read as
// dollars (the ENTITY stores dollars in amount; pre-persist model rows
// are a caller detail, not the canonical store).
const ledgerAmountCents = (r: any): number => {
  if (r?.amount_cents != null && Number.isFinite(Number(r.amount_cents))) return Math.round(Number(r.amount_cents));
  return toCents(r?.amount);
};

// --- estimates --------------------------------------------------------------------

const ESTIMATE_OPEN_STATUSES = new Set(['draft', 'calculated', 'sent']);
const SENT_LIKE_STATUSES = new Set(['sent', 'approved', 'converted', 'won', 'declined']);

const isVoidishEstimate = (est: any): boolean => {
  if (!isObj(est)) return true;
  if (norm(est.status) === 'void') return true;
  if (est.void === true || est.voided === true || est.is_void === true || est.deleted === true) return true;
  return Boolean(clean(est.voided_date) || clean(est.deleted_at));
};

/** isLiveEstimate — reportable estimate row: object, not void-ish, not a
 *  reusable template (estimateReports.isLiveEstimate parity). */
export function isLiveEstimate(est: any): boolean {
  return isObj(est) && !isVoidishEstimate(est) && est.is_template !== true;
}

const estimateTotalCents = (est: any): number => {
  const v = firstFinite(est?.quote_total, est?.total, est?.grand_total, est?.total_cost);
  return Number.isFinite(v) ? toCents(v) : 0;
};

// sent-day ladder (estimateReports.estimateSentDay, status_history arm
// included — the workOrderConversion {at,field,from,to,by} shape).
const estimateSentDay = (est: any): string => {
  for (const v of [est?.quote_issue_date, est?.sent_at, est?.sent_date, est?.quote_sent_at, est?.issued_at]) {
    const d = toDay(v);
    if (d) return d;
  }
  const hist = (Array.isArray(est?.status_history) ? est.status_history : [])
    .filter((h: any) => isObj(h) && (!clean(h.field) || norm(h.field) === 'status') && norm(h.to ?? h.new_status ?? h.status) === 'sent')
    .map((h: any) => toDay(h.at ?? h.date ?? h.at_iso ?? h.created_date))
    .filter(Boolean)
    .sort();
  if (hist.length) return hist[0];
  const anchor = toDay(est?.follow_up_state?.anchor_at ?? est?.follow_up_anchor_at);
  if (anchor) return anchor;
  if (SENT_LIKE_STATUSES.has(norm(est?.status))) return toDay(est?.updated_date);
  return '';
};

/**
 * estimateConverted — estimateReports.conversionInfo precedence, boolean
 * only (the analytics block needs the count, not the via/day):
 *   converted_at stamp → converted_to_work_order / converted_to_order flag
 *   → status converted|won → approved + work_order_id → sales_stage won
 *   → bare work_order_id link.
 */
export function estimateConverted(est: any): boolean {
  if (!isObj(est)) return false;
  const status = norm(est.status);
  const woId = clean(est.work_order_id);
  if (toDay(est.converted_at)) return true;
  if (est.converted_to_work_order === true || est.converted_to_order === true) return true;
  if (status === 'converted' || status === 'won') return true;
  if (status === 'approved' && woId) return true;
  if (norm(est.sales_stage) === 'won') return true;
  if (woId) return true;
  return false;
}

// --- discounts ----------------------------------------------------------------------

// Order-level markdown: discount_amount (canonical) → tolerated aliases.
// abs() — a discount stored negative still means money off.
const invoiceDiscountCents = (inv: any): number => {
  const v = firstFinite(inv?.discount_amount, inv?.discount_total, inv?.discount);
  return Number.isFinite(v) ? Math.abs(toCents(v)) : 0;
};

// Line-level markdowns on line_items[].
const lineDiscountCents = (inv: any): number => {
  const items = Array.isArray(inv?.line_items) ? inv.line_items : [];
  let cents = 0;
  for (const li of items) {
    if (!isObj(li)) continue;
    const v = firstFinite(li?.discount_amount, li?.discount_total, li?.line_discount, li?.discount);
    if (Number.isFinite(v)) cents += Math.abs(toCents(v));
  }
  return cents;
};

// OrderFee discount lines: fee_lines[] kind 'discount', signed negative.
const feeDiscountCents = (inv: any): number => {
  const fees = Array.isArray(inv?.fee_lines) ? inv.fee_lines : [];
  let cents = 0;
  for (const f of fees) {
    if (!isObj(f) || norm(f?.kind) !== 'discount') continue;
    const v = firstFinite(f?.amount);
    if (Number.isFinite(v)) cents += Math.abs(toCents(v));
  }
  return cents;
};

const invoiceMarkdownCents = (inv: any): number =>
  invoiceDiscountCents(inv) + lineDiscountCents(inv) + feeDiscountCents(inv);

// Pre-discount sales base for pct-of-sales: stored subtotal wins; else
// total − tax + every markdown (order-level + line + fee discounts all
// already reduced the total) reconstructs it.
const invoiceGrossSalesCents = (inv: any): number => {
  const sub = firstFinite(inv?.subtotal, inv?.sub_total, inv?.merchandise_total);
  if (Number.isFinite(sub)) return Math.max(0, toCents(sub));
  const total = firstFinite(inv?.total, inv?.grand_total);
  if (!Number.isFinite(total)) return 0;
  const tax = firstFinite(inv?.tax_amount, inv?.tax, inv?.tax_total);
  return Math.max(0, toCents(total) - (Number.isFinite(tax) ? toCents(tax) : 0) + invoiceMarkdownCents(inv));
};

const invoiceCreditAppliedCents = (inv: any): number => {
  const v = firstFinite(inv?.credit_applied, inv?.store_credit_applied, inv?.credit_used);
  return Number.isFinite(v) ? Math.abs(toCents(v)) : 0;
};

// --- order book ----------------------------------------------------------------------

type Order = {
  kind: 'work_order' | 'invoice';
  id: string;
  day: string;            // booking day ('' undated)
  completed_day: string;  // '' undated
  completed: boolean;
  closed: boolean;
  invoiced_cents: number; // posted invoice totals linked to this order
  estimated_cents: number;// WO quoted value fallback (0 on invoice orders)
};

// buildOrderBook → {orders, orderOf}. `orders` = every order-book member;
// `orderOf` maps EVERY posted invoice object to the order it belongs to —
// linked ones to their WO order, standalone ones to their own invoice-kind
// order — so completed_invoiced can ask "was this bill's order finished?"
// for any invoice without re-running the linkage.
const buildOrderBook = (invoices: any[], workOrders: any[]) => {
  const orders: Order[] = [];
  const orderOf = new Map<any, Order>();
  const byId = new Map<string, Order>();
  const byEstimate = new Map<string, Order>();

  for (const wo of workOrders) {
    if (!isOrderInBook(wo)) continue;
    const completed = isCompletedOrder(wo);
    const order: Order = {
      kind: 'work_order',
      id: clean(wo.id),
      day: orderCreatedDay(wo),
      completed_day: completed ? orderCompletedDay(wo) : '',
      completed,
      closed: isClosedOrder(wo),
      invoiced_cents: 0,
      estimated_cents: orderEstimatedCents(wo),
    };
    orders.push(order);
    if (order.id) byId.set(order.id, order);
    const estId = firstText(wo?.estimate_id, wo?.estimateId);
    if (estId && !byEstimate.has(estId)) byEstimate.set(estId, order);
  }

  for (const inv of invoices) {
    if (!isPostedInvoice(inv)) continue;
    const linked = byId.get(invoiceWorkOrderId(inv)) || byEstimate.get(invoiceEstimateId(inv)) || null;
    const cents = invoiceTotalCents(inv);
    if (linked) {
      linked.invoiced_cents += cents;
      orderOf.set(inv, linked);
      continue;
    }
    // Standalone posted bill = an order of its own (billing-only history,
    // capped WO list, or a WO that left the book).
    const paid = invoicePaidInFull(inv);
    const order: Order = {
      kind: 'invoice',
      id: clean(inv.id) || clean(inv.invoice_number),
      day: invoiceDate(inv),
      completed_day: paid ? (toDay(firstText(inv?.paid_date)) || invoiceDate(inv)) : '',
      completed: paid,
      closed: paid,
      invoiced_cents: cents,
      estimated_cents: 0,
    };
    orders.push(order);
    orderOf.set(inv, order);
  }
  return { orders, orderOf };
};

// --- metrics --------------------------------------------------------------------------

const EMPTY_METRICS = () => ({
  invoiced_cents: 0,
  paid_cents: 0,
  open_balance_cents: 0,
  order_count: 0,
  completed_order_count: 0,
  closed_order_count: 0,
  completed_invoiced_cents: 0,
  unbilled_order_value_cents: 0,
  avg_order_cents: 0,
});

const finalizeMetrics = (m: any): any => {
  m.avg_order_cents = m.order_count > 0 ? Math.round(m.invoiced_cents / m.order_count) : 0;
  for (const k of Object.keys(m)) if (k.endsWith('_cents')) m[k] = Math.round(num(m[k]));
  return m;
};

// Effective paid on one invoice: server-stamped amount_paid (aliases ok)
// → a 'paid'-status invoice with no stamped amount reports its full total
// (legacy rows never backfilled the field).
const invoiceEffectivePaidCents = (inv: any): number => {
  const paid = invoicePaidCents(inv);
  if (paid > 0) return paid;
  return norm(inv?.status) === 'paid' ? invoiceTotalCents(inv) : 0;
};

// Accumulate a scoped bucket: every row list is already filtered to the
// scope by the caller. `orderOf` marks invoices on completed orders.
const accumulate = (scope: any, rows: any) => {
  for (const inv of rows.postedInvoices) {
    scope.m.invoiced_cents += invoiceTotalCents(inv);
    scope.m.open_balance_cents += invoiceBalanceCents(inv);
    scope._paidFromInvoices += invoiceEffectivePaidCents(inv);
    if (rows.orderOf?.get(inv)?.completed === true) {
      scope.m.completed_invoiced_cents += invoiceTotalCents(inv);
    }
  }
  for (const p of rows.livePayments) scope._paidFromPayments += paymentAmountCents(p);
  for (const r of rows.creditApplied) scope._paidFromLedger += Math.abs(ledgerAmountCents(r));
  for (const o of rows.orders) {
    scope.m.order_count += 1;
    if (o.completedInScope) scope.m.completed_order_count += 1;
    if (o.closedInScope) scope.m.closed_order_count += 1;
    // Booked-but-unbilled work: WO orders with no posted invoice yet carry
    // their quoted value (incomplete only — a completed+unbilled job is
    // still unbilled revenue, so no completed check here).
    if (o.kind === 'work_order' && o.invoiced_cents === 0) {
      scope.m.unbilled_order_value_cents += o.estimated_cents;
    }
  }
};

/**
 * customerAnalytics — the G-12 analytics block for one customer.
 *
 * @param input.invoices    customer-scoped Invoice rows (any status).
 * @param input.workOrders  customer-scoped WorkOrder rows.
 * @param input.estimates   customer-scoped AllInOneEstimate rows.
 * @param input.payments    customer-scoped Payment rows (optional — the
 *                          degraded path; invoice.amount_paid is canonical).
 * @param input.creditLedger customer-scoped StoreCreditLedger rows (optional).
 * @param opts.now          ISO/Date/ms anchor (year default + as-of day).
 * @param opts.year         calendar year override for the `year` block.
 */
export function customerAnalytics(input: any = {}, opts: any = {}) {
  const src = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const invoices = liveRows(src.invoices);
  const workOrders = liveRows(src.workOrders ?? src.work_orders);
  const estimates = (Array.isArray(src.estimates) ? src.estimates : []).filter(isLiveEstimate);
  const payments = liveRows(src.payments).filter(isLivePayment);
  const ledger = liveRows(src.creditLedger ?? src.credit_ledger).filter(isLedgerRow);

  const nowDay = toDay(o.now) || new Date().toISOString().slice(0, 10);
  const yearNum = Number.isFinite(num(o.year, NaN)) ? num(o.year, NaN) : dayYear(nowDay);

  const posted = invoices.filter(isPostedInvoice);
  const creditApplied = ledger.filter((r) => norm(r.kind) === 'credit_applied');

  // Order book + per-invoice order resolution.
  const { orders, orderOf } = buildOrderBook(invoices, workOrders);
  const paymentEvidenceSupplied = payments.length > 0 || creditApplied.length > 0;

  // --- lifetime scope -----------------------------------------------------------
  const lifetimeScope = { m: EMPTY_METRICS(), _paidFromInvoices: 0, _paidFromPayments: 0, _paidFromLedger: 0 };
  accumulate(lifetimeScope, {
    postedInvoices: posted,
    livePayments: payments,
    creditApplied,
    orderOf,
    orders: orders.map((o) => ({ ...o, completedInScope: o.completed, closedInScope: o.closed })),
  });
  // Canonical paid = Σ stamped amount_paid (includes credit applied — the
  // applyCredit patch adds to amount_paid). Degraded path: when every
  // invoice reports 0 paid AND payment/ledger evidence exists, sum those
  // instead (customer360Model.computeTotals convention).
  lifetimeScope.m.paid_cents = lifetimeScope._paidFromInvoices > 0 || !paymentEvidenceSupplied
    ? lifetimeScope._paidFromInvoices
    : lifetimeScope._paidFromPayments + lifetimeScope._paidFromLedger;
  const lifetime = finalizeMetrics(lifetimeScope.m);

  // --- per-year buckets -----------------------------------------------------------
  const yearsObserved = new Set<number>([yearNum, yearNum - 1]);
  for (const inv of posted) { const y = dayYear(invoiceDate(inv)); if (Number.isFinite(y)) yearsObserved.add(y); }
  for (const p of payments) { const y = dayYear(paymentDay(p)); if (Number.isFinite(y)) yearsObserved.add(y); }
  for (const o of orders) {
    for (const d of [o.day, o.completed_day]) {
      const y = dayYear(d);
      if (Number.isFinite(y)) yearsObserved.add(y);
    }
  }
  for (const r of creditApplied) { const y = dayYear(ledgerDay(r)); if (Number.isFinite(y)) yearsObserved.add(y); }

  const byYear: Record<string, any> = {};
  for (const y of [...yearsObserved].sort((a, b) => a - b)) {
    const inYear = (day: string) => dayYear(day) === y;
    const scope = { m: EMPTY_METRICS(), _paidFromInvoices: 0, _paidFromPayments: 0, _paidFromLedger: 0 };
    const scopedInvoices = posted.filter((i) => inYear(invoiceDate(i)));
    const scopedOrders = orders
      .filter((ord) => inYear(ord.day))
      .map((ord) => ({
        ...ord,
        completedInScope: inYear(ord.completed_day),
        closedInScope: ord.closed ? inYear(ord.completed_day) : false,
      }));
    accumulate(scope, {
      postedInvoices: scopedInvoices,
      livePayments: payments.filter((p) => inYear(paymentDay(p))),
      creditApplied: creditApplied.filter((r) => inYear(ledgerDay(r))),
      orderOf,
      orders: scopedOrders,
    });
    // Year paid: invoice.amount_paid is CUMULATIVE and can't be scoped —
    // when the wiring layer supplied payment/ledger rows, only the rows
    // dated in-year count. With neither supplied (degraded mode), fall
    // back to 'paid'-status invoices whose PAID day (paid_date → invoice
    // day) lands in-year — the scan runs over ALL posted rows, not just
    // in-year bills, so a prior-year invoice settled in-year still counts
    // here. Partial amounts on still-open bills can't be dated reliably
    // and drop out, same as any undated row.
    scope.m.paid_cents = paymentEvidenceSupplied
      ? scope._paidFromPayments + scope._paidFromLedger
      : posted.reduce((s, i) => s + (norm(i.status) === 'paid' && inYear(toDay(firstText(i?.paid_date)) || invoiceDate(i)) ? invoiceEffectivePaidCents(i) : 0), 0);
    byYear[String(y)] = finalizeMetrics(scope.m);
    byYear[String(y)].year = y;
  }

  // --- order timing -----------------------------------------------------------------
  const orderDays = orders.map((o) => o.day).filter(Boolean).sort();
  const first_order_at = orderDays[0] || '';
  const last_order_at = orderDays[orderDays.length - 1] || '';
  const avg_days_between_orders = orderDays.length >= 2
    ? round1((dayMs(last_order_at) - dayMs(first_order_at)) / DAY_MS / (orderDays.length - 1))
    : null;

  // --- discounts (lifetime) ------------------------------------------------------------
  const invoice_discount_cents = posted.reduce((s, i) => s + invoiceDiscountCents(i), 0);
  const line_discount_cents = posted.reduce((s, i) => s + lineDiscountCents(i), 0);
  const fee_discount_cents = posted.reduce((s, i) => s + feeDiscountCents(i), 0);
  // Credit applied: the ledger is canonical; invoice.credit_applied is the
  // mirror — use it only when no ledger rows were supplied (degraded mode).
  const credit_applied_cents = creditApplied.length
    ? creditApplied.reduce((s, r) => s + Math.abs(ledgerAmountCents(r)), 0)
    : posted.reduce((s, i) => s + invoiceCreditAppliedCents(i), 0);
  const creditAppliedInvoiceIds = new Set(
    creditApplied.map((r) => clean(r?.invoice_id)).filter(Boolean),
  );
  const discounted = posted.filter((i) => invoiceMarkdownCents(i) > 0);
  const discount_given_cents = invoice_discount_cents + line_discount_cents + fee_discount_cents;
  const gross_sales_cents = posted.reduce((s, i) => s + invoiceGrossSalesCents(i), 0);

  // --- estimates (lifetime) -------------------------------------------------------------
  const sentCount = estimates.filter((e) => SENT_LIKE_STATUSES.has(norm(e?.status)) || estimateSentDay(e) || estimateConverted(e)).length;
  const convertedCount = estimates.filter(estimateConverted).length;

  return {
    lifetime,
    year: { ...byYear[String(yearNum)] || finalizeMetrics(EMPTY_METRICS()), year: yearNum },
    by_year: byYear,
    discounts: {
      discount_given_cents: Math.round(discount_given_cents),
      discount_pct_of_sales: gross_sales_cents > 0 ? round4((discount_given_cents / gross_sales_cents) * 100) : 0,
      discounted_invoice_count: discounted.length,
      invoice_discount_cents: Math.round(invoice_discount_cents),
      line_discount_cents: Math.round(line_discount_cents),
      fee_discount_cents: Math.round(fee_discount_cents),
      credit_applied_cents: Math.round(credit_applied_cents),
      credit_applied_invoice_count: creditAppliedInvoiceIds.size || posted.filter((i) => invoiceCreditAppliedCents(i) > 0).length,
    },
    first_order_at,
    last_order_at,
    avg_days_between_orders,
    estimates: {
      total: estimates.length,
      sent: sentCount,
      converted: convertedCount,
      conversion_rate: sentCount > 0 ? round4(convertedCount / sentCount) : 0,
      // Open pipeline = undecided work still in play: open status AND not
      // converted (a converted 'sent' row is decided — it became an order).
      open_pipeline_cents: Math.round(
        estimates.filter((e) => ESTIMATE_OPEN_STATUSES.has(norm(e?.status)) && !estimateConverted(e))
          .reduce((s, e) => s + estimateTotalCents(e), 0),
      ),
    },
  };
}

// --- display helpers ---------------------------------------------------------------------

export const ANALYTICS_TONES = ['neutral', 'good', 'warn', 'bad'] as const;

/** centsToMoney — integer cents → '$1,234.56' (negative → '-$5.00'). */
export function centsToMoney(cents: any): string {
  const c = Math.round(num(cents));
  const sign = c < 0 ? '-' : '';
  return `${sign}$${(Math.abs(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const pctText = (fraction: any): string => {
  const n = num(fraction, NaN);
  if (!Number.isFinite(n)) return '—';
  return `${round1(n * 100)}%`;
};

/**
 * analyticsBadges — the header-strip tile list in the Customer360 KpiStrip
 * items vocabulary: [{label, value, hint?, tone?}] with tone drawn from
 * 'warn' | 'bad' (amber/red through the page adapter). Top metrics per the
 * brief: avg order, lifetime invoiced, open balance, conversion rate.
 */
export function analyticsBadges(analytics: any): Array<{ label: string; value: string; hint?: string; tone?: string }> {
  const a = isObj(analytics) ? analytics : {};
  const life = isObj(a.lifetime) ? a.lifetime : {};
  const est = isObj(a.estimates) ? a.estimates : {};
  const openBalance = num(life.open_balance_cents);
  return [
    {
      label: 'Avg order',
      value: centsToMoney(life.avg_order_cents),
      hint: `${num(life.order_count)} orders · ${num(life.completed_order_count)} completed`,
    },
    {
      label: 'Lifetime invoiced',
      value: centsToMoney(life.invoiced_cents),
      hint: `collected ${centsToMoney(life.paid_cents)}`,
    },
    {
      label: 'Open balance',
      value: centsToMoney(openBalance),
      hint: 'open AR',
      tone: openBalance > 0 ? 'warn' : undefined,
    },
    {
      label: 'Estimate conversion',
      value: pctText(est.conversion_rate),
      hint: `${num(est.converted)} of ${num(est.sent)} sent converted`,
    },
  ];
}

/**
 * yearComparison — the YoY line: this year vs N years back on invoiced
 * volume. delta_pct is null when the prior year had no invoiced base
 * (division by zero is reported, not hidden).
 */
export function yearComparison(analytics: any, opts: any = {}) {
  const a = isObj(analytics) ? analytics : {};
  const back = Math.max(0, Math.round(num(opts.yearsBack ?? opts.years_back, 1)));
  const thisYearNum = num(a.year?.year, dayYear(toDay(new Date())));
  const priorYearNum = thisYearNum - back;
  const byYear = isObj(a.by_year) ? a.by_year : {};
  const zeroYear = (y: number) => ({ ...finalizeMetrics(EMPTY_METRICS()), year: y });
  const thisYear = isObj(a.year) && num(a.year.year) === thisYearNum ? a.year : byYear[String(thisYearNum)] || zeroYear(thisYearNum);
  const priorYear = byYear[String(priorYearNum)] || zeroYear(priorYearNum);
  const priorBase = num(priorYear.invoiced_cents);
  return {
    this_year: thisYear,
    prior_year: { ...priorYear, year: priorYearNum },
    years_back: back,
    metric: 'invoiced_cents',
    delta_pct: priorBase > 0 ? round1(((num(thisYear.invoiced_cents) - priorBase) / priorBase) * 100) : null,
  };
}
