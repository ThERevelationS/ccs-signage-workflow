// Pure "Completed ≠ paid" order-lifecycle model (masterplan item E-06).
// Kept React/base44-free so the reconciliation + state machine is
// unit-testable under Node (scripts/test-completed-vs-paid.mjs).
//
// The CoreBridge rule this encodes: a WorkOrder can reach production-complete
// while the customer still owes money. `completed` is a PRODUCTION state, not
// a financial one — the order remains open AR until the balance is settled or
// an admin force-closes it. `closed` is the only terminal "fully resolved"
// state; `voided` kills the order entirely. Aging keeps running after
// completion — a finished job with an open balance still ages buckets.
//
// Lifecycle (ORDER_LIFECYCLE):
//   open        — order exists, no production motion yet (or unmigrated).
//   in_progress — work is moving through stages.
//   completed   — production done (WorkOrder.completed===true or
//                 current_stage==='completed'); balance may still be open.
//   closed      — terminal: paid in full, or admin force-close with a
//                 stamped reason. Reopen requires admin.
//   voided      — terminal: cancelled/deleted; requires a reason.
//
// Data contract (entity fields read here — all defensive, all optional):
//   WorkOrder: id, estimate_id, customer_id, estimate_amount, total /
//              grand_total / order_total, products[].quoted_total,
//              completed, current_stage, lifecycle_state / order_state /
//              order_status / status, closed, closed_reason, voided /
//              voided_reason, deleted, due_date, balance_due / open_balance /
//              amount_due, paid_in_full.
//   Invoice:   work_order_id / estimate_id linkage, status (void + draft are
//              excluded — a draft has not billed the customer), deleted,
//              total, amount_paid / paid_amount / total_paid, payments[] sum
//              fallback, balance_due / balance / amount_due.
//   ctx (canTransition): invoices, admin_close, admin_reopen, reason,
//              actor, now.

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();

// Cent-safe money: every amount is converted to integer cents once, summed as
// integers, then converted back — 0.1 + 0.2 never leaks float dust into a
// balance. Math.round is round-half-up (toward +∞), matching the brief.
const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};
const fromCents = (c) => c / 100;

export const ORDER_LIFECYCLE = ["open", "in_progress", "completed", "closed", "voided"];
const TERMINAL_STATES = new Set(["closed", "voided"]);
const isLifecycleState = (v) => ORDER_LIFECYCLE.includes(v);

// --- state derivation ---------------------------------------------------------

// orderLifecycleState(workOrder) → ORDER_LIFECYCLE member. Explicit lifecycle
// fields win (lifecycle_state / order_state / order_status / status, incl.
// camelCase + 'cancelled'/'void' aliases); otherwise derived from flags —
// deleted/voided → 'voided', closed → 'closed', completed flag or
// current_stage==='completed' → 'completed', any other real stage →
// 'in_progress', bare rows → 'open'.
export function orderLifecycleState(workOrder) {
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  for (const raw of [wo.lifecycle_state, wo.order_state, wo.order_status, wo.status]) {
    const key = norm(raw).replace(/[\s-]+/g, "_");
    if (!key) continue;
    if (isLifecycleState(key)) return key;
    if (["void", "cancelled", "canceled"].includes(key)) return "voided";
  }
  if (wo.deleted === true || wo.voided === true || wo.voided_date) return "voided";
  if (wo.closed === true || wo.closed_date || wo.closed_at) return "closed";
  if (wo.completed === true || norm(wo.current_stage) === "completed") return "completed";
  if (clean(wo.current_stage)) return "in_progress";
  return "open";
}

// --- invoice roll-up ----------------------------------------------------------

// An invoice attaches to the order by work_order_id, or by the estimate this
// work order converted from (invoicingAction only stamps work_order_id when
// the estimate already carried one) — same convention as
// jobWorkspaceModel.recordLinksWorkOrder.
export function invoiceLinksWorkOrder(invoice, workOrder) {
  if (!invoice || invoice.deleted === true) return false;
  const woId = clean(workOrder?.id);
  const estId = clean(workOrder?.estimate_id);
  if (woId && clean(invoice?.work_order_id) === woId) return true;
  if (estId && clean(invoice?.estimate_id) === estId) return true;
  return false;
}

// Live, BILLED invoices: non-deleted, not void, not draft. Drafts are
// deliberately out — a draft has not billed the customer, so a WO with only
// drafts is still 'uninvoiced'.
const billedInvoices = (invoices, workOrder) =>
  (Array.isArray(invoices) ? invoices : []).filter(
    (inv) =>
      invoiceLinksWorkOrder(inv, workOrder) &&
      !["void", "draft"].includes(norm(inv?.status)),
  );

// Invoice paid amount in cents. Resolution order: canonical amount_paid →
// paid_amount / total_paid aliases → payments[] row sum (voided entries
// skipped) → total − balance_due when only the balance snapshot exists.
const invoicePaidCents = (inv) => {
  for (const v of [inv?.amount_paid, inv?.paid_amount, inv?.total_paid]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  if (Array.isArray(inv?.payments) && inv.payments.length) {
    return inv.payments
      .filter((p) => p && !["void", "refunded"].includes(norm(p.status)))
      .reduce((sum, p) => sum + toCents(p.amount ?? p.value ?? p.total ?? p.paid_amount), 0);
  }
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance)) && inv?.total != null) {
    return Math.max(0, toCents(inv.total) - toCents(balance));
  }
  return 0;
};

// Invoice balance in cents: server-stamped balance_due is authoritative;
// otherwise total − paid.
const invoiceBalanceCents = (inv) => {
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, toCents(inv?.total) - invoicePaidCents(inv));
};

// Order total in cents — the WO's own price basis. products[].quoted_total
// sum when products exist (jobWorkspaceModel convention), else
// estimate_amount, else generic total aliases. null when the WO carries no
// money at all, so callers can fall back to the invoiced basis.
const woTotalCents = (wo) => {
  const products = Array.isArray(wo?.products) ? wo.products.filter(Boolean) : [];
  if (products.length) {
    const cents = products.reduce(
      (sum, p) => sum + toCents(p.quoted_total ?? p.total ?? num(p.quoted_unit_price) * num(p.quantity, 1)),
      0,
    );
    if (cents > 0) return cents;
  }
  for (const v of [wo?.estimate_amount, wo?.total, wo?.grand_total, wo?.order_total, wo?.total_amount]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return null;
};

// orderFinancialState(workOrder, invoices) →
//   { balance_due, paid_total, invoiced_total, state }
// Reconciles the WORK ORDER total against payments recorded on its billed
// invoices. balance_due = max(wo_total, invoiced_total) − paid_total, so
// progress billing (invoice < WO total) still reports the unbilled remainder
// and overpayment goes negative. state ladder:
//   'uninvoiced' — no billed invoices (drafts/voids don't count).
//   'overpaid'   — paid_total > invoiced_total (money held beyond billing).
//   'paid'       — balance_due ≤ 0.
//   'partial'    — billed, any open balance (covers sent-unpaid AND part-paid).
export function orderFinancialState(workOrder, invoices = []) {
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  const billed = billedInvoices(invoices, wo);
  const invoicedCents = billed.reduce((sum, inv) => sum + toCents(inv?.total), 0);
  const paidCents = billed.reduce((sum, inv) => sum + invoicePaidCents(inv), 0);
  const woCents = woTotalCents(wo);
  const basisCents = Math.max(woCents ?? 0, invoicedCents);
  const balanceCents = basisCents - paidCents;

  let state;
  if (!billed.length) state = "uninvoiced";
  else if (paidCents > invoicedCents) state = "overpaid";
  else if (balanceCents <= 0) state = "paid";
  else state = "partial";

  return {
    balance_due: fromCents(balanceCents),
    paid_total: fromCents(paidCents),
    invoiced_total: fromCents(invoicedCents),
    state,
  };
}

// --- transitions ----------------------------------------------------------------

// canTransition(workOrder, to, ctx) → { ok, error?, patch? }
// ctx: { invoices, admin_close, admin_reopen, reason, actor, now }.
// Rules:
//   → 'completed' — ALWAYS allowed from non-terminal states, open balance
//     notwithstanding. Completed ≠ paid is the whole point: production done
//     must never be gated on collection.
//   → 'closed' — requires balance_due ≤ 0 (paid in full) OR
//     ctx.admin_close===true; a successful close stamps patch.closed_reason
//     ('paid_in_full', the admin reason, or 'admin_close').
//   → 'voided' — requires a non-empty ctx.reason (stamped voided_reason).
//   'closed'/'voided' — terminal; exit only via ctx.admin_reopen===true.
// Successful results carry `patch` — the fields the caller should write.
export function canTransition(workOrder, to, ctx = {}) {
  const target = norm(to).replace(/[\s-]+/g, "_");
  if (!isLifecycleState(target)) {
    return { ok: false, error: "unknown_state", message: `Unknown lifecycle state "${to}".` };
  }
  const from = orderLifecycleState(workOrder);
  if (from === target) {
    return { ok: false, error: "already_in_state", message: `Order is already ${target}.` };
  }

  const patch = { lifecycle_state: target };
  const stampMeta = (prefix) => {
    if (ctx?.now != null) patch[`${prefix}_at`] = ctx.now instanceof Date ? ctx.now.toISOString() : clean(ctx.now);
    if (clean(ctx?.actor)) patch[`${prefix}_by`] = clean(ctx.actor);
  };

  // Terminal exits — admin reopen only.
  if (TERMINAL_STATES.has(from)) {
    if (ctx?.admin_reopen !== true) {
      return {
        ok: false,
        error: "terminal_state",
        message: `"${from}" is terminal; reopening requires admin_reopen.`,
      };
    }
    if (clean(ctx?.reason)) patch.reopen_reason = clean(ctx.reason);
  }

  if (target === "closed") {
    const fin = orderFinancialState(workOrder, ctx?.invoices);
    if (fin.balance_due > 0 && ctx?.admin_close !== true) {
      return {
        ok: false,
        error: "open_balance",
        message: `Cannot close with an open balance of ${fin.balance_due.toFixed(2)} — needs payment in full or admin_close.`,
      };
    }
    patch.closed_reason = clean(ctx?.reason) || (fin.balance_due > 0 ? "admin_close" : "paid_in_full");
    stampMeta("closed");
  } else if (target === "voided") {
    if (!clean(ctx?.reason)) {
      return { ok: false, error: "reason_required", message: "Voiding an order requires ctx.reason." };
    }
    patch.voided_reason = clean(ctx.reason);
    stampMeta("voided");
  }

  return { ok: true, from, to: target, patch };
}

// --- aging ----------------------------------------------------------------------

// Parses a date-ish value into a UTC-midnight epoch so day math is DST-proof.
// 'YYYY-MM-DD' literals are taken literally; ISO datetimes and Dates give
// their UTC calendar date; bare epoch numbers also accepted. NaN when junk.
const toUtcDay = (v) => {
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return NaN;
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = clean(v);
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(epoch);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
      ? epoch
      : NaN;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return NaN;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const dueDay = (wo) => toUtcDay(wo?.due_date ?? wo?.due ?? wo?.date_due);

// Whole days the order is past its due_date as of `now` (Date | ISO | epoch;
// defaults to today). 0 when not past due, when undated, or when the order is
// closed/voided — those never age. 'completed' deliberately does NOT count
// as terminal here: a completed job with an open balance still accrues days.
export function pastDueDays(workOrder, now = new Date()) {
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  if (TERMINAL_STATES.has(orderLifecycleState(wo))) return 0;
  const due = dueDay(wo);
  const at = toUtcDay(now);
  if (!Number.isFinite(due) || !Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((at - due) / 86400000));
}

// Explicit "no open balance" markers on the WO row itself — when present, an
// order can't be AR-past-due no matter what the calendar says. Absent fields
// mean "unknown", and unknown balances still flag (the report layer filters
// on the reconciled balance anyway).
const explicitZeroBalance = (wo) => {
  if (wo?.paid_in_full === true) return true;
  for (const v of [wo?.balance_due, wo?.open_balance, wo?.amount_due]) {
    if (v != null && Number.isFinite(Number(v))) return num(v) <= 0;
  }
  return false;
};

// isPastDue(workOrder, now) — due_date strictly before today, lifecycle not
// closed/voided, and no explicit zero-balance marker. A 'completed' order
// WITH open balance is exactly the case this exists to catch.
export function isPastDue(workOrder, now = new Date()) {
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  if (TERMINAL_STATES.has(orderLifecycleState(wo))) return false;
  if (explicitZeroBalance(wo)) return false;
  return pastDueDays(wo, now) > 0;
}

// arBucket(workOrder, now) → 'current' | '1-30' | '31-60' | '61-90' | '90+'.
// Bucketed by days past due_date: ≤0 or undated → 'current'; closed/voided
// and explicitly-settled orders always report 'current' (they are not AR).
// Independent of the completed flag — completed jobs age like any other.
export function arBucket(workOrder, now = new Date()) {
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  if (TERMINAL_STATES.has(orderLifecycleState(wo))) return "current";
  if (explicitZeroBalance(wo)) return "current";
  const days = pastDueDays(wo, now);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

// agingReportRows(workOrders, invoicesByWo, now) →
//   [{ wo_id, customer_id, balance, bucket, days_past_due, completed, state }]
// `invoicesByWo` may be a Map (wo_id → [invoices]), a plain object keyed by
// wo_id, or a flat Invoice[] (grouped internally via invoiceLinksWorkOrder,
// which also honours estimate_id linkage).
// A row lands in the report when the order is collectible AR: reconciled
// balance > 0 AND (something was billed OR the job is completed — a finished
// never-invoiced job is still money owed, the gap this module exists to
// expose). Deleted and closed/voided orders are excluded. Sorted
// days_past_due desc, then balance desc, then wo_id for determinism.
export function agingReportRows(workOrders = [], invoicesByWo = {}, now = new Date()) {
  const list = Array.isArray(workOrders) ? workOrders : [];
  const flat = Array.isArray(invoicesByWo) ? invoicesByWo : null;
  const forWo = (wo) => {
    if (flat) return flat.filter((inv) => invoiceLinksWorkOrder(inv, wo));
    if (invoicesByWo instanceof Map) return invoicesByWo.get(clean(wo?.id)) || [];
    const bucket = invoicesByWo && typeof invoicesByWo === "object" ? invoicesByWo[clean(wo?.id)] : null;
    return Array.isArray(bucket) ? bucket : [];
  };

  const rows = [];
  for (const wo of list) {
    if (!wo || wo.deleted === true) continue;
    const lifecycle = orderLifecycleState(wo);
    if (TERMINAL_STATES.has(lifecycle)) continue;
    const fin = orderFinancialState(wo, forWo(wo));
    if (fin.balance_due <= 0) continue;
    if (fin.invoiced_total <= 0 && lifecycle !== "completed") continue;
    rows.push({
      wo_id: clean(wo.id),
      customer_id: clean(wo.customer_id),
      balance: fin.balance_due,
      bucket: arBucket(wo, now),
      days_past_due: pastDueDays(wo, now),
      completed: lifecycle === "completed",
      state: fin.state,
    });
  }
  rows.sort(
    (a, b) => b.days_past_due - a.days_past_due || b.balance - a.balance || a.wo_id.localeCompare(b.wo_id),
  );
  return rows;
}
