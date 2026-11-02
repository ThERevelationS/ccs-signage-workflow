// Accounting Home alerts feed — pure TS, ZERO imports. Safe to bundle into
// Deno functions (base44/functions/*), frontend modules, and Node test
// harnesses. No I/O anywhere: callers load Payment / Invoice /
// AllInOneEstimate / ReconciliationBatch rows through the staff gateways and
// pass plain arrays in (attentionComputedModel.js convention — the sibling
// computed-attention model the /MainWorkflow strip uses).
//
// I-07 (ESTIMATOR_MASTERPLAN WS-I): surface accounting events on the
// Financials home — payments received/refunded, estimate→order conversions,
// reconciliation batch variances, unbatched (undeposited) payments, invoices
// posting to the unmapped GL bucket, overdue invoices, and large invoices.
//
// ITEM SHAPE — reuses the attention-feed / persisted-Notification shape
// (base44/entities/Notification.jsonc + notificationModel.mjs):
//   {kind, title, message, deep_link, severity, created_at}
// plus bookkeeping extras: `id` is the deterministic dedupe key
// `acctalert:<kind>:<source-id>` (Notification.dedupe_key convention),
// `source_id` carries the underlying record id for drilldowns, and grouped
// alerts (unbatched_payments) add `count`/`total_cents`. severity reuses the
// NOTIFICATION_CATEGORIES ladder: info | warning | critical | celebration.
//
// DATA CONTRACT (base44/entities/*.jsonc):
//   Payment      — signed `amount` dollars (positive receipt, negative
//                  refund/credit-memo), status recorded|void|refunded,
//                  paid_date, invoice_id, refund_of_payment_id,
//                  reconciliation_batch_id (empty = not yet swept into a
//                  cash-close batch = "undeposited"), method,
//                  reference_number. Void rows never alert.
//   ReconciliationBatch — variance = collected_total + cash_adjustment −
//                  expected_total (stored `variance` wins; recomputed from
//                  the parts when absent), batch_number, location, closed_at.
//                  'open' status rows are skipped (variance not final).
//   Invoice      — status posted = sent|partially_paid|paid (+ partial|
//                  issued import aliases, accountingExportModel parity);
//                  draft/void never alert. income_account_splits[] rows post
//                  to income_account_code; '' / 'unmapped' = the unmapped GL
//                  bucket (glSplitModel semantics — unresolved lines land on
//                  '', never dropped). balance_due + due_date drive
//                  overdue_invoice (same predicate as
//                  attentionComputedModel.overdueInvoices).
//   AllInOneEstimate — conversion restates estimateReports.conversionInfo
//                  precedence, minus ctx-only sources (revisions, work-order
//                  lookup): converted_at → converted_to_work_order|
//                  converted_to_order flag → status converted|won →
//                  approved + work_order_id → sales_stage won → bare
//                  work_order_id link. archived/cancelled rows are excluded
//                  (a cancelled estimate that kept a stale WO link is not a
//                  fresh conversion). The event stamp ladders converted_at →
//                  sales_stage_changed_at (won) → updated_date →
//                  created_date; templates never alert.
//
// TIME: `now` accepts Date | epoch-ms | parseable string. Event stamps read
// paid_date → created_date → created_at → updated_date (payments),
// converted_at → … → created_date (estimates), closed_at (batches),
// due_date / issue_date → sent_date → created_date (invoices). Date-only
// 'YYYY-MM-DD' values parse as UTC midnight — consistent across zones.
// Windows are inclusive [now − window_hours, now]; future-stamped rows do
// not alert (clock-skewed data never pretends to be new).

// ---------------------------------------------------------------------------

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

/** Dollar-ish field → integer cents (float-safe money compares). */
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Any date-ish value → epoch ms; NaN-safe (0 = unparseable). */
const toMs = (v: any): number => {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = clean(v);
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** Any date-ish value → ISO stamp ('' when unparseable). */
const toIso = (v: any): string => {
  const t = toMs(v);
  return t > 0 ? new Date(t).toISOString() : '';
};

/** Any date-ish value → 'YYYY-MM-DD' (UTC day — '' when unparseable). */
const toDay = (v: any): string => {
  if (typeof v === 'string') {
    const m = clean(v).match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return toIso(v).slice(0, 10);
};

const firstStr = (row: any, keys: string[]): string => {
  if (!isObj(row)) return '';
  for (const key of keys) {
    const v = clean((row as Record<string, unknown>)[key]);
    if (v) return v;
  }
  return '';
};

/** Money display — feedMoney convention (attentionFeedCategories.js). */
const money = (dollars: any): string =>
  `$${Number(dollars || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyFromCents = (cents: any): string => money(Math.round(num(cents)) / 100);

// ---------------------------------------------------------------------------

export const ACCOUNTING_ALERT_KINDS = [
  'payment_received',
  'payment_refunded',
  'estimate_converted',
  'batch_variance',
  'unbatched_payments',
  'gl_unmapped',
  'overdue_invoice',
  'large_invoice',
] as const;

export type AccountingAlertKind = (typeof ACCOUNTING_ALERT_KINDS)[number];
export type AccountingAlertSeverity = 'info' | 'warning' | 'critical' | 'celebration';

export interface AccountingAlert {
  /** One of ACCOUNTING_ALERT_KINDS. */
  kind: AccountingAlertKind;
  /** Deterministic dedupe key — `acctalert:<kind>:<source-id>`. */
  id: string;
  /** Underlying record id ('open' on the grouped unbatched alert). */
  source_id: string;
  /** Headline — notification `title` slot. */
  title: string;
  /** Secondary detail line — notification `body` slot. */
  message: string;
  /** In-app route the alert navigates to on click. */
  deep_link: string;
  /** info | warning | critical | celebration (notificationModel ladder). */
  severity: AccountingAlertSeverity;
  /** ISO timestamp of the underlying event (drives newest-first sort). */
  created_at: string;
  /** Grouped alerts only: rows folded into this one alert. */
  count?: number;
  /** Grouped alerts only: summed signed cents behind the group. */
  total_cents?: number;
}

/** Kind → default severity (notificationModel severity ladder). */
export const ACCOUNTING_ALERT_SEVERITY: Record<AccountingAlertKind, AccountingAlertSeverity> = {
  payment_received: 'info',
  payment_refunded: 'warning',
  estimate_converted: 'celebration',
  batch_variance: 'warning',
  unbatched_payments: 'warning',
  gl_unmapped: 'warning',
  overdue_invoice: 'critical',
  large_invoice: 'info',
};

/** Kind → display label for section headers / badges. */
export const ACCOUNTING_ALERT_LABELS: Record<AccountingAlertKind, string> = {
  payment_received: 'Payments received',
  payment_refunded: 'Refunds',
  estimate_converted: 'Conversions',
  batch_variance: 'Batch variance',
  unbatched_payments: 'Unbatched payments',
  gl_unmapped: 'Unmapped GL',
  overdue_invoice: 'Overdue invoices',
  large_invoice: 'Large invoices',
};

/** Deterministic dedupe key — `acctalert:<kind>:<source-id>`. */
export const alertDedupeKey = (kind: any, sourceId: any): string =>
  `acctalert:${clean(kind) || 'alert'}:${clean(sourceId) || 'row'}`;

const makeAlert = (
  kind: AccountingAlertKind,
  sourceId: any,
  fields: { title?: any; message?: any; deep_link?: any; severity?: AccountingAlertSeverity; created_at?: any; count?: number; total_cents?: number },
): AccountingAlert => {
  const severity = fields.severity || ACCOUNTING_ALERT_SEVERITY[kind];
  const alert: AccountingAlert = {
    kind,
    id: alertDedupeKey(kind, sourceId),
    source_id: clean(sourceId),
    title: clean(fields.title),
    message: clean(fields.message),
    deep_link: clean(fields.deep_link),
    severity,
    created_at: toIso(fields.created_at),
  };
  if (Number.isFinite(fields.count)) alert.count = Math.round(num(fields.count));
  if (Number.isFinite(fields.total_cents)) alert.total_cents = Math.round(num(fields.total_cents));
  return alert;
};

// --- shared row predicates ----------------------------------------------------

const PAYMENT_NAME_KEYS = [
  'customer_name', 'customer_display_name', 'customer_label', 'company_name',
  'billing_name', 'customer',
];

const paymentCustomer = (p: any): string =>
  firstStr(p, PAYMENT_NAME_KEYS) || firstStr(p, ['customer_id']) || 'Customer';

/** Event stamp: paid_date → created_date → created_at → updated_date. */
const paymentWhen = (p: any): number =>
  toMs(p?.paid_date) || toMs(p?.created_date) || toMs(p?.created_at) || toMs(p?.updated_date);

/** Live row? void/refunded-status originals are out; everything else posts. */
const paymentVoid = (p: any): boolean => norm(p?.status) === 'void';

/** Refund-ish row — refund_of_payment_id link, status 'refunded', or any
 * negative row (refund row or credit memo; the message keeps the method). */
const paymentIsRefund = (p: any): boolean =>
  !!clean(p?.refund_of_payment_id) || norm(p?.status) === 'refunded' || num(p?.amount) < 0;

const invoiceLink = (invoiceId: any): string =>
  clean(invoiceId) ? `/Invoices?invoice=${encodeURIComponent(clean(invoiceId))}` : '/Invoices';

/** Posted (billed) invoice statuses — accountingExportModel parity. */
const POSTED_INVOICE_STATUSES = new Set(['sent', 'partially_paid', 'paid', 'partial', 'issued']);
const invoicePosted = (inv: any): boolean => POSTED_INVOICE_STATUSES.has(norm(inv?.status));

const withinWindow = (t: number, nowMs: number, windowHours: number): boolean =>
  t > 0 && t >= nowMs - Math.max(0, num(windowHours, 0)) * HOUR_MS && t <= nowMs;

// ---------------------------------------------------------------------------
// paymentAlerts — payments received (or refunded) inside the window.
// ---------------------------------------------------------------------------

export interface PaymentAlertOptions {
  now?: any;
  window_hours?: number;
}

export function paymentAlerts(payments: any[] = [], opts: PaymentAlertOptions = {}): AccountingAlert[] {
  const o = isObj(opts) ? opts : {};
  const nowMs = toMs(o.now) || Date.now();
  const windowHours = num(o.window_hours, 24);
  const out: AccountingAlert[] = [];
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p) || paymentVoid(p)) continue;
    if (num(p.amount) === 0) continue; // a $0 row moved nothing — never an event
    const t = paymentWhen(p);
    if (!withinWindow(t, nowMs, windowHours)) continue;
    const refund = paymentIsRefund(p);
    const amount = Math.abs(num(p.amount));
    const customer = paymentCustomer(p);
    const parts: string[] = [];
    const method = firstStr(p, ['method']);
    const ref = firstStr(p, ['reference_number', 'reference']);
    if (method) parts.push(method === 'credit_memo' ? 'credit memo' : method);
    if (ref) parts.push(`ref ${ref}`);
    const invNum = firstStr(p, ['invoice_number']);
    if (invNum) parts.push(invNum);
    const day = toDay(t);
    if (day) parts.push(refund ? `refunded ${day}` : `paid ${day}`);
    out.push(makeAlert(
      refund ? 'payment_refunded' : 'payment_received',
      firstStr(p, ['id', 'payment_id', 'creation_request_key']) || `${customer}:${t}`,
      {
        title: refund ? `Refund of ${money(amount)} to ${customer}` : `${money(amount)} from ${customer}`,
        message: parts.join(' · ') || (refund ? 'payment refunded' : 'payment recorded'),
        deep_link: invoiceLink(p.invoice_id),
        created_at: t,
      },
    ));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// conversionAlerts — estimates that converted to orders inside the window.
// Restates estimateReports.conversionInfo precedence (no ctx sources).
// ---------------------------------------------------------------------------

export interface ConversionAlertOptions {
  now?: any;
  window_hours?: number;
}

const conversionVia = (est: any): string => {
  if (!isObj(est) || est.is_template === true) return '';
  const status = norm(est.status);
  if (status === 'cancelled' || status === 'archived') return '';
  const woId = clean(est.work_order_id);
  if (toMs(est.converted_at) || toDay(est.converted_at)) return 'converted_at';
  if (est.converted_to_work_order === true || est.converted_to_order === true) return 'converted_flag';
  if (status === 'converted' || status === 'won') return 'status';
  if (status === 'approved' && woId) return 'approved+wo';
  if (norm(est.sales_stage) === 'won') return 'sales_stage_won';
  if (woId) return 'work_order_link';
  return '';
};

const conversionWhen = (est: any): number =>
  toMs(est?.converted_at) ||
  (norm(est?.sales_stage) === 'won' ? toMs(est?.sales_stage_changed_at) : 0) ||
  toMs(est?.accepted_at) ||
  toMs(est?.updated_date) ||
  toMs(est?.created_date) ||
  toMs(est?.created_at);

export function conversionAlerts(estimates: any[] = [], opts: ConversionAlertOptions = {}): AccountingAlert[] {
  const o = isObj(opts) ? opts : {};
  const nowMs = toMs(o.now) || Date.now();
  const windowHours = num(o.window_hours, 24);
  const out: AccountingAlert[] = [];
  for (const est of Array.isArray(estimates) ? estimates : []) {
    const via = conversionVia(est);
    if (!via) continue;
    const t = conversionWhen(est);
    if (!withinWindow(t, nowMs, windowHours)) continue;
    const name = firstStr(est, ['project_name', 'name', 'title']) || 'Estimate';
    const estNum = firstStr(est, ['estimate_number']);
    const customer = firstStr(est, ['client_name', 'customer_name', 'customer_display_name', 'company_name']);
    const totalCents = toCents(est.quote_total ?? est.total ?? est.grand_total);
    const parts: string[] = [];
    if (estNum) parts.push(`#${estNum}`);
    if (customer) parts.push(customer);
    if (totalCents > 0) parts.push(moneyFromCents(totalCents));
    parts.push('converted to order');
    const id = firstStr(est, ['id', 'estimate_id']);
    out.push(makeAlert('estimate_converted', id || `${name}:${t}`, {
      title: `${name} converted`,
      message: parts.join(' · '),
      deep_link: id ? `/EstimateDetail?id=${encodeURIComponent(id)}` : '/Estimates',
      created_at: t,
    }));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// varianceAlerts — reconciliation batches closed with |variance| ≥ threshold.
// threshold_cents default 1 ⇒ ANY non-zero variance flags (integer cents, so
// ≥1 is "any variance"; raise the param to only surface material ones).
// ---------------------------------------------------------------------------

export interface VarianceAlertOptions {
  threshold_cents?: number;
}

const batchVarianceCents = (b: any): number => {
  if (b?.variance !== undefined && b?.variance !== null && clean(b.variance) !== '') {
    return toCents(b.variance);
  }
  return toCents(b?.collected_total) + toCents(b?.cash_adjustment) - toCents(b?.expected_total);
};

export function varianceAlerts(batches: any[] = [], opts: VarianceAlertOptions = {}): AccountingAlert[] {
  const o = isObj(opts) ? opts : {};
  const threshold = num(o.threshold_cents, 1);
  const out: AccountingAlert[] = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    if (!isObj(b) || norm(b.status) === 'open') continue;
    const vc = batchVarianceCents(b);
    if (Math.abs(vc) < threshold) continue;
    const label = firstStr(b, ['batch_number']) || 'Batch';
    const location = firstStr(b, ['location']);
    const dir = vc > 0 ? 'over' : 'short';
    const closedDay = toDay(b.closed_at) || toDay(b.created_date) || '';
    const parts = [`${dir} ${moneyFromCents(Math.abs(vc))}`];
    if (location) parts.push(location);
    if (closedDay) parts.push(`closed ${closedDay}`);
    const expected = toCents(b.expected_total);
    const collected = toCents(b.collected_total);
    if (expected || collected) parts.push(`expected ${moneyFromCents(expected)} vs collected ${moneyFromCents(collected)}`);
    out.push(makeAlert('batch_variance', firstStr(b, ['id', 'batch_id', 'creation_request_key']) || label, {
      title: `${label} ${dir} ${moneyFromCents(Math.abs(vc))}`,
      message: parts.join(' · '),
      deep_link: '/Reconciliation',
      created_at: toMs(b.closed_at) || toMs(b.created_date) || toMs(b.created_at),
    }));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// unbatchedAlert — undeposited payments older than `age_days`, folded into
// ONE alert (the backlog is the event, not each row). Undeposited = status
// 'recorded' + positive amount + no reconciliation_batch_id. Rows with no
// parseable paid/created stamp count as stale (can't prove they're fresh).
// ---------------------------------------------------------------------------

export interface UnbatchedAlertOptions {
  now?: any;
  age_days?: number;
}

export function unbatchedAlert(payments: any[] = [], opts: UnbatchedAlertOptions = {}): AccountingAlert | null {
  const o = isObj(opts) ? opts : {};
  const nowMs = toMs(o.now) || Date.now();
  const ageDays = num(o.age_days, 2);
  const cutoff = nowMs - Math.max(0, ageDays) * DAY_MS;
  const rows = (Array.isArray(payments) ? payments : []).filter((p) => {
    if (!isObj(p) || paymentVoid(p) || paymentIsRefund(p)) return false;
    if (num(p.amount) <= 0) return false;
    if (clean(p.reconciliation_batch_id)) return false;
    const t = paymentWhen(p);
    return t === 0 || t <= cutoff;
  });
  if (!rows.length) return null;
  const totalCents = rows.reduce((s, p) => s + toCents(p.amount), 0);
  const stamps = rows.map(paymentWhen).filter((t) => t > 0);
  const oldest = stamps.length ? Math.min(...stamps) : 0;
  const oldestDay = oldest ? toDay(oldest) : '';
  return makeAlert('unbatched_payments', 'open', {
    title: `${rows.length} payment${rows.length === 1 ? '' : 's'} not yet batched`,
    message: `${moneyFromCents(totalCents)} awaiting deposit${oldestDay ? ` · oldest ${oldestDay}` : ''} · over ${Math.max(0, ageDays)}d old`,
    deep_link: '/Reconciliation',
    created_at: oldest || nowMs,
    count: rows.length,
    total_cents: totalCents,
  });
}

// ---------------------------------------------------------------------------
// unmappedAlert — posted invoices whose income_account_splits post a non-zero
// share to the unmapped bucket ('' / 'unmapped' — glSplitModel semantics).
// Missing income_account_splits means "not computed", NOT unmapped → skipped.
// ---------------------------------------------------------------------------

const splitUnmapped = (row: any): boolean => {
  const code = firstStr(row, ['income_account_code', 'account_id', 'gl_account_code', 'account_code']);
  return !code || norm(code) === 'unmapped';
};

export function unmappedAlert(invoices: any[] = []): AccountingAlert[] {
  const out: AccountingAlert[] = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !invoicePosted(inv)) continue;
    const splits = Array.isArray(inv.income_account_splits) ? inv.income_account_splits : null;
    if (!splits || !splits.length) continue;
    const unmappedRows = splits.filter((s: any) => isObj(s) && splitUnmapped(s));
    if (!unmappedRows.length) continue;
    const unmappedCents = unmappedRows.reduce((s: number, r: any) => s + toCents(r?.amount), 0);
    const invNum = firstStr(inv, ['invoice_number']) || 'Invoice';
    const customer = firstStr(inv, ['customer_display_name', 'customer_name', 'customer']);
    const parts = [`${moneyFromCents(Math.abs(unmappedCents))} posting to unmapped GL`];
    if (customer) parts.push(customer);
    out.push(makeAlert('gl_unmapped', firstStr(inv, ['id', 'invoice_id']) || invNum, {
      title: `${invNum} has unmapped GL splits`,
      message: parts.join(' · '),
      deep_link: invoiceLink(firstStr(inv, ['id', 'invoice_id'])),
      created_at: toMs(inv.issue_date) || toMs(inv.sent_date) || toMs(inv.created_date) || toMs(inv.created_at),
      total_cents: unmappedCents,
    }));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// invoiceAlerts — overdue_invoice (same predicate as
// attentionComputedModel.overdueInvoices: positive balance on a sent|
// partially_paid invoice whose due_date passed) + large_invoice (posted
// invoice total ≥ threshold, issued inside the window).
// ---------------------------------------------------------------------------

export interface InvoiceAlertOptions {
  now?: any;
  window_hours?: number;
  /** Flag posted invoices with total ≥ this many cents (default $10,000). */
  large_invoice_cents?: number;
}

export function invoiceAlerts(invoices: any[] = [], opts: InvoiceAlertOptions = {}): AccountingAlert[] {
  const o = isObj(opts) ? opts : {};
  const nowMs = toMs(o.now) || Date.now();
  const today = toDay(nowMs);
  const windowHours = num(o.window_hours, 24);
  const largeCents = num(o.large_invoice_cents, 1000000);
  const out: AccountingAlert[] = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv)) continue;
    const id = firstStr(inv, ['id', 'invoice_id']);
    const invNum = firstStr(inv, ['invoice_number']) || 'Invoice';
    const customer = firstStr(inv, ['customer_display_name', 'customer_name', 'customer']);
    const status = norm(inv.status);
    const dueDay = toDay(inv.due_date);
    const balanceCents = toCents(inv.balance_due);

    // overdue_invoice — attentionComputedModel.overdueInvoices predicate.
    if (balanceCents > 0 && (status === 'sent' || status === 'partially_paid') && dueDay && dueDay < today) {
      const daysLate = Math.floor((toMs(`${today}T00:00:00Z`) - toMs(`${dueDay}T00:00:00Z`)) / DAY_MS);
      const parts = [`due ${dueDay}`, `${moneyFromCents(balanceCents)} open`];
      if (daysLate > 0) parts.push(`${daysLate}d late`);
      if (customer) parts.push(customer);
      out.push(makeAlert('overdue_invoice', id || invNum, {
        title: `${invNum} overdue`,
        message: parts.join(' · '),
        deep_link: invoiceLink(id),
        created_at: toMs(`${dueDay}T00:00:00Z`) || nowMs,
      }));
    }

    // large_invoice — posted invoice over threshold, issued inside window.
    if (invoicePosted(inv)) {
      const totalCents = toCents(inv.total);
      const issued = toMs(inv.issue_date) || toMs(inv.sent_date) || toMs(inv.created_date) || toMs(inv.created_at);
      if (totalCents >= largeCents && withinWindow(issued, nowMs, windowHours)) {
        const parts = [moneyFromCents(totalCents)];
        if (customer) parts.push(customer);
        const issuedDay = toDay(issued);
        if (issuedDay) parts.push(`issued ${issuedDay}`);
        out.push(makeAlert('large_invoice', id || invNum, {
          title: `${invNum} · ${moneyFromCents(totalCents)}`,
          message: parts.join(' · '),
          deep_link: invoiceLink(id),
          created_at: issued,
        }));
      }
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// accountingAlertFeed — merged feed: every generator's rows deduped on
// `acctalert:<kind>:<id>` (first wins) and sorted newest-first (created_at
// desc, id asc on ties — deterministic for the test harness).
// ---------------------------------------------------------------------------

export interface AccountingAlertFeedOptions {
  now?: any;
  /** Shared window for payment/conversion/large_invoice alerts (hours). */
  window_hours?: number;
  /** Per-generator window overrides (fall back to window_hours). */
  payment_window_hours?: number;
  conversion_window_hours?: number;
  /** Unbatched-payments staleness (days). */
  age_days?: number;
  /** |variance| threshold in integer cents (default 1 = any variance). */
  variance_threshold_cents?: number;
  /** Posted-invoice total threshold for large_invoice (cents). */
  large_invoice_cents?: number;
  /** Cap on merged rows after sort (0/absent = no cap). */
  limit?: number;
}

export function accountingAlertFeed(
  data: { payments?: any[]; invoices?: any[]; estimates?: any[]; batches?: any[] } = {},
  opts: AccountingAlertFeedOptions = {},
): AccountingAlert[] {
  const d = isObj(data) ? data : {};
  const o = isObj(opts) ? opts : {};
  const now = o.now;
  const merged: AccountingAlert[] = [
    ...paymentAlerts(d.payments || [], { now, window_hours: o.payment_window_hours ?? o.window_hours ?? 24 }),
    ...conversionAlerts(d.estimates || [], { now, window_hours: o.conversion_window_hours ?? o.window_hours ?? 24 }),
    ...varianceAlerts(d.batches || [], { threshold_cents: o.variance_threshold_cents }),
    ...invoiceAlerts(d.invoices || [], {
      now,
      window_hours: o.window_hours,
      large_invoice_cents: o.large_invoice_cents,
    }),
  ];
  const unbatched = unbatchedAlert(d.payments || [], { now, age_days: o.age_days });
  if (unbatched) merged.push(unbatched);
  merged.push(...unmappedAlert(d.invoices || []));

  const seen = new Set<string>();
  const deduped = merged.filter((a) => {
    const key = clean(a?.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => {
    const ta = toMs(a.created_at);
    const tb = toMs(b.created_at);
    if (tb !== ta) return tb - ta;
    return clean(a.id).localeCompare(clean(b.id));
  });
  const cap = num(o.limit, 0);
  return cap > 0 ? deduped.slice(0, cap) : deduped;
}
