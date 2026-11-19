// Payments register — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*) and frontend modules.
//
// I-05 (BACKLOG_MASTERPLAN): the register lists every Payment ledger row
// newest-first with search (customer / invoice / check-number memo), method,
// date-range, customer and cash-close batch filters, plus builders for the
// invoicingAction `record_payment` and `refund_payment` payloads. Page wiring
// is a later item — this module is the pure model.
//
// LEDGER MODEL (mirrors invoicingAction/entry.ts + refundMath.js): every money
// movement is a Payment row — payments are positive "recorded" rows, refunds
// are negative "refunded" rows linked by refund_of_payment_id, credit memos
// are negative "recorded" rows with method "credit_memo", voids flip status to
// "void". Invoice amount_paid is the NET sum of counted rows so credits and
// refunds reopen balance_due without destroying the trail.
//
// PAYMENT SOURCE: Payment rows are backend-only (RLS __payment_backend_only__)
// — the page obtains them through the session-authenticated invoicingAction
// gateway (get_invoice.payments / export_ar payments / a later list action),
// never via staffEntityWrite. Customers and invoices arrive as id-keyed lookup
// maps (plain object, array of rows, or Map — all accepted).
//
// STATUS MAPPING: entity statuses map to register statuses —
//   recorded → 'posted'    refunded → 'refunded'    void → 'void'
// Anything missing or unrecognized lands on 'pending' so a future pre-ledger
// state has a bucket and no row is silently dropped.
//
// BATCH / DEPOSIT: a payment swept into a ReconciliationBatch at cash close
// carries reconciliation_batch_id (set only by manageReconciliation). The
// register treats that as deposited. filterRegister batch_status accepts:
//   'deposited'|'batched'|'closed'|'reconciled'|'in_batch'  → batched rows
//   'undeposited'|'unbatched'|'open'|'pending'|'unreconciled'|'none' → unbatched
//   '' / 'all' / '*'                                      → no batch filter
//   any other value                                       → exact batch_id match
//
// MONEY: entity `amount` is signed DOLLARS; register rows and builder inputs
// use signed integer CENTS (amount_cents) so display math is penny-exact.
// Builders convert back to dollars for the wire payloads.

export type RegisterStatus = 'posted' | 'pending' | 'refunded' | 'void';

// Canonical record_payment method allowlist — mirrors invoicingAction/entry.ts
// PAYMENT_METHODS verbatim (order preserved). `credit_memo` is deliberately
// absent: record_payment rejects it; the backend stamps it on credit-memo
// rows via issue_credit_memo only.
export const PAYMENT_METHODS: readonly string[] = [
  'cash', 'check', 'card', 'ach', 'financing', 'other',
];

// Payment.jsonc enum order — the full method set a register can DISPLAY or
// filter by (credit-memo rows appear in the ledger even though staff cannot
// record one through record_payment).
export const PAYMENT_METHODS_ALL: readonly string[] = [
  ...PAYMENT_METHODS, 'credit_memo',
];

// Invoice statuses the backend accepts a payment against
// (invoicingAction OPEN_AR_STATUSES).
export const OPEN_AR_STATUSES: readonly string[] = ['sent', 'partially_paid'];

// Dropdown order for the register batch filter.
export const REGISTER_BATCH_STATUSES: readonly string[] = [
  'all', 'deposited', 'undeposited',
];

const DEPOSITED_WORDS = new Set(['deposited', 'batched', 'closed', 'reconciled', 'in_batch']);
const UNDEPOSITED_WORDS = new Set(['undeposited', 'unbatched', 'open', 'pending', 'unreconciled', 'none']);

const clean = (v: any): string => String(v ?? '').trim();
const lower = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fb = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
// Dollars → signed integer cents (entity amounts are dollar numbers).
const toCents = (v: any): number => Math.sign(num(v)) * Math.round(Math.abs(num(v)) * 100 + 1e-9);
const toDollars = (cents: number): number => Math.round(cents) / 100;
const usd = (cents: number): string => `$${(toDollars(cents)).toFixed(2)}`;

// First-10-chars of an ISO date/datetime — '' when unusable. paid_date and
// created_date both normalize through this so string compares stay YYYY-MM-DD.
const dateOnly = (v: any): string => {
  const s = clean(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

const today = (): string => new Date().toISOString().slice(0, 10);

const ENTITY_STATUS_TO_REGISTER: Record<string, RegisterStatus> = {
  recorded: 'posted',
  refunded: 'refunded',
  void: 'void',
};

/** One display row in the payments register. */
export interface RegisterRow {
  payment_id: string;
  /** YYYY-MM-DD — paid_date, falling back to the row's created_date. */
  date: string;
  /** Raw entity created_date ISO — retained for same-day ordering. */
  created_date: string;
  customer_id: string;
  customer_name: string;
  invoice_id: string;
  invoice_number: string;
  method: string;
  /** Signed integer cents — payments positive, refunds/credits negative. */
  amount_cents: number;
  status: RegisterStatus;
  /** ReconciliationBatch id once swept at cash close; '' = still unbatched. */
  batch_id: string;
  deposited: boolean;
  /** Check number / card auth / ACH trace — part of the search haystack. */
  reference_number: string;
  /** Staff note / memo — part of the search haystack. */
  notes: string;
  /** Original payment id on refund rows; '' on originals. */
  refund_of_payment_id: string;
  /** True on negative refund/credit rows. */
  is_refund: boolean;
  creation_request_key: string;
}

export interface RegisterLookups {
  customersById?: Record<string, any> | any[] | Map<string, any> | null;
  invoicesById?: Record<string, any> | any[] | Map<string, any> | null;
}

export interface RegisterFilters {
  /** Free text — matched against customer, invoice number, check/reference number and notes. */
  q?: string;
  /** Exact method ('cash'|'check'|'card'|'ach'|'financing'|'other'|'credit_memo'); ''/'all'/'*' = all. */
  method?: string;
  /** Inclusive YYYY-MM-DD lower bound on the payment date. */
  from?: string;
  /** Inclusive YYYY-MM-DD upper bound on the payment date. */
  to?: string;
  /** 'deposited'|'undeposited' (+ aliases), a concrete batch_id, or ''/'all'/'*'. */
  batch_status?: string;
  customer_id?: string;
}

export interface RegisterBucket {
  count: number;
  total_cents: number;
}

export interface RegisterTotals {
  count: number;
  /** Signed net cents across all shown rows (refunds/credits subtract). */
  total_cents: number;
  by_method: Record<string, RegisterBucket>;
  by_status: Record<string, RegisterBucket>;
  /** Net cents on rows swept into a reconciliation batch (non-void). */
  deposited_cents: number;
  /** Net cents on counted rows not yet batched — the pending cash-close pool. */
  undeposited_cents: number;
}

export interface ActionPayloadResult {
  ok: boolean;
  error?: string;
  /** Exact invoicingAction invoke body — caller merges session_token. */
  payload?: Record<string, any>;
}

// Accepts an id-keyed object map, a row array, or a Map; returns a lookup fn.
const lookupFrom = (src: RegisterLookups['customersById']): ((id: string) => any) => {
  if (!src) return () => null;
  if (src instanceof Map) return (id: string) => src.get(id) || null;
  if (Array.isArray(src)) {
    const m = new Map<string, any>();
    for (const r of src) if (clean(r?.id)) m.set(clean(r.id), r);
    return (id: string) => m.get(id) || null;
  }
  return (id: string) => (src as Record<string, any>)[id] || null;
};

const customerNameOf = (cust: any, inv: any): string =>
  clean(cust?.company_name)
  || clean(cust?.name)
  || clean(cust?.customer_name)
  || clean(cust?.display_name)
  || clean(inv?.customer_display_name)
  || clean(inv?.customer_name)
  || clean(cust?.billing_name);

// ── registerRows ──────────────────────────────────────────────────────────
// Reshape raw Payment entity rows into register rows, newest-first
// (paid_date desc → created_date desc → payment_id desc for a stable order).
export function registerRows(payments: any[] | null | undefined, lookups: RegisterLookups = {}): RegisterRow[] {
  const customerOf = lookupFrom(lookups?.customersById);
  const invoiceOf = lookupFrom(lookups?.invoicesById);
  const rows = (Array.isArray(payments) ? payments : []).map((p: any): RegisterRow => {
    const customerId = clean(p?.customer_id);
    const invoiceId = clean(p?.invoice_id);
    const inv = invoiceOf(invoiceId);
    const cust = customerOf(customerId);
    const batchId = clean(p?.reconciliation_batch_id);
    const amountCents = toCents(p?.amount);
    const status = ENTITY_STATUS_TO_REGISTER[clean(p?.status)] || 'pending';
    return {
      payment_id: clean(p?.id),
      date: dateOnly(p?.paid_date) || dateOnly(p?.created_date),
      created_date: clean(p?.created_date),
      customer_id: customerId,
      customer_name: customerNameOf(cust, inv),
      invoice_id: invoiceId,
      invoice_number: clean(inv?.invoice_number),
      method: clean(p?.method) || 'other',
      amount_cents: amountCents,
      status,
      batch_id: batchId,
      deposited: batchId !== '',
      reference_number: clean(p?.reference_number),
      notes: clean(p?.notes),
      refund_of_payment_id: clean(p?.refund_of_payment_id),
      is_refund: amountCents < 0 || clean(p?.refund_of_payment_id) !== '',
      creation_request_key: clean(p?.creation_request_key),
    };
  });
  rows.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
    || (b.created_date || '').localeCompare(a.created_date || '')
    || (b.payment_id || '').localeCompare(a.payment_id || ''));
  return rows;
}

// ── filterRegister ────────────────────────────────────────────────────────
// Apply the register's filter bar. Every whitespace-separated q token must
// hit the row's haystack (customer, invoice number, reference/check number,
// notes, method, batch id) so "acme 1042" narrows correctly.
export function filterRegister(rows: RegisterRow[] | null | undefined, filters: RegisterFilters = {}): RegisterRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const q = lower(filters?.q);
  const tokens = q.split(/\s+/).filter(Boolean);
  const method = lower(filters?.method);
  const methodOn = method !== '' && method !== 'all' && method !== '*';
  const from = dateOnly(filters?.from);
  const to = dateOnly(filters?.to);
  const batchRaw = lower(filters?.batch_status);
  const customerId = clean(filters?.customer_id);
  const batchMode = batchRaw === '' || batchRaw === 'all' || batchRaw === '*'
    ? 'all'
    : DEPOSITED_WORDS.has(batchRaw) ? 'deposited'
      : UNDEPOSITED_WORDS.has(batchRaw) ? 'unbatched'
        : 'batch_id';
  return list.filter((r) => {
    if (customerId && r.customer_id !== customerId) return false;
    if (methodOn && lower(r.method) !== method) return false;
    if (from || to) {
      if (!r.date) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
    }
    if (batchMode === 'deposited' && !r.deposited) return false;
    if (batchMode === 'unbatched' && r.deposited) return false;
    if (batchMode === 'batch_id' && lower(r.batch_id) !== batchRaw) return false;
    if (tokens.length) {
      const hay = lower([
        r.customer_name, r.customer_id, r.invoice_number, r.invoice_id,
        r.reference_number, r.notes, r.method, r.batch_id,
      ].join(' '));
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

// ── registerTotals ────────────────────────────────────────────────────────
// Footer aggregates over the (already filtered) visible rows.
export function registerTotals(rows: RegisterRow[] | null | undefined): RegisterTotals {
  const totals: RegisterTotals = {
    count: 0,
    total_cents: 0,
    by_method: {},
    by_status: {},
    deposited_cents: 0,
    undeposited_cents: 0,
  };
  for (const r of Array.isArray(rows) ? rows : []) {
    totals.count += 1;
    totals.total_cents += r.amount_cents;
    const bump = (bag: Record<string, RegisterBucket>, key: string) => {
      const k = key || 'other';
      if (!bag[k]) bag[k] = { count: 0, total_cents: 0 };
      bag[k].count += 1;
      bag[k].total_cents += r.amount_cents;
    };
    bump(totals.by_method, r.method);
    bump(totals.by_status, r.status);
    if (r.status !== 'void') {
      if (r.deposited) totals.deposited_cents += r.amount_cents;
      else totals.undeposited_cents += r.amount_cents;
    }
  }
  return totals;
}

// ── request keys ──────────────────────────────────────────────────────────
// Deterministic creation_request_keys: re-invoking with the SAME logical
// inputs dedupes server-side via findByCreationKey (double-click / retry
// safe), while genuinely different entries produce different keys. Callers
// running a per-attempt UUID (payKeyRef/refundKeyRef pattern) can pass an
// explicit creation_request_key to override.
const keySlug = (v: any): string => clean(v).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 48);
const keyCap = (s: string): string => s.slice(0, 256);

export function paymentRequestKey(invoiceId: string, amountCents: number, method: string, ref: string, paidDate: string, actorId = ''): string {
  return keyCap(['payment', keySlug(invoiceId), String(Math.round(amountCents)), keySlug(method), keySlug(ref), keySlug(paidDate), keySlug(actorId)].filter(Boolean).join(':'));
}

export function refundRequestKey(paymentId: string, amountCents: number, reason: string, actorId = ''): string {
  return keyCap(['refund', keySlug(paymentId), String(Math.round(amountCents)), keySlug(reason), keySlug(actorId)].filter(Boolean).join(':'));
}

// ── receivePaymentPatch ───────────────────────────────────────────────────
// Preflight + build the exact invoicingAction record_payment body
// (entry.ts:863). `patch` mirrors the server arg names verbatim — merge
// session_token at the invoke site:
//   invoke('invoicingAction', { session_token, ...res.payload })
//
// `ref` accepts either the check/card/ACH reference string or an options bag
// {reference_number, notes, paid_date, creation_request_key}. `now` defaults
// paid_date (money-received date); `actor_id` rides the request key only —
// the server stamps created_by from the authenticated session.
//
// Guards mirror the server checks in order so the dialog can show the same
// message the backend would return instead of eating a 409.
export function receivePaymentPatch(args: {
  invoice: any;
  amount_cents: number;
  method?: string;
  ref?: string | { reference_number?: string; notes?: string; paid_date?: string; creation_request_key?: string };
  actor_id?: string;
  now?: Date | string | number;
}): ActionPayloadResult {
  const { invoice } = args || ({} as any);
  const ref = typeof args?.ref === 'object' && args.ref !== null ? args.ref : { reference_number: args?.ref };
  const invoiceId = clean(invoice?.id);
  if (!invoiceId) return { ok: false, error: 'Invoice is required.' };
  if (!OPEN_AR_STATUSES.includes(clean(invoice?.status))) {
    return { ok: false, error: 'Payments can only be recorded on sent or partially paid invoices.' };
  }
  const amountCents = Math.round(num(args?.amount_cents, NaN));
  if (!(amountCents > 0)) return { ok: false, error: 'Payment amount must be positive.' };
  const balanceCents = toCents(invoice?.balance_due);
  if (amountCents - balanceCents > 0) {
    return { ok: false, error: `Payment exceeds the open balance of ${usd(balanceCents)}.` };
  }
  const method = lower(args?.method) || 'other';
  if (!PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: `method must be one of ${PAYMENT_METHODS.join(', ')}.` };
  }
  const paidDate = dateOnly(ref?.paid_date) || dateOnly(args?.now) || today();
  const reference = clean(ref?.reference_number);
  const requestKey = clean(ref?.creation_request_key)
    || paymentRequestKey(invoiceId, amountCents, method, reference, paidDate, clean(args?.actor_id));
  return {
    ok: true,
    payload: {
      action: 'record_payment',
      invoice_id: invoiceId,
      creation_request_key: requestKey,
      amount: toDollars(amountCents),
      method,
      paid_date: paidDate,
      reference_number: reference,
      notes: clean(ref?.notes),
    },
  };
}

// ── refundPatch ───────────────────────────────────────────────────────────
// Guard + build the exact invoicingAction refund_payment body
// (entry.ts:994). A refund is a negative "refunded" Payment row linked to the
// original via refund_of_payment_id; the original's refunded_amount
// accumulates and it flips to "refunded" only when fully returned.
//
// `reason` accepts the reason string or an options bag {reason, restock,
// creation_request_key, payments} — pass `payments` (the invoice's sibling
// Payment rows) for full server parity on the refundable cap (net-collected
// check); without it the cap is the payment's own un-refunded remainder.
//
// Guards (server order): payment must be a positive 'recorded' row; the
// request must be positive and not exceed the refundable remainder.
export function refundPatch(args: {
  payment: any;
  amount_cents?: number;
  reason?: string | { reason?: string; restock?: boolean; creation_request_key?: string; payments?: any[] };
  actor_id?: string;
  now?: Date | string | number;
}): ActionPayloadResult {
  const { payment } = args || ({} as any);
  const opts = typeof args?.reason === 'object' && args.reason !== null ? args.reason : { reason: args?.reason };
  const paymentId = clean(payment?.id);
  if (!paymentId) return { ok: false, error: 'Payment not found.' };
  if (clean(payment?.status) !== 'recorded' || !(toCents(payment?.amount) > 0)) {
    return { ok: false, error: 'Only recorded payments can be refunded.' };
  }
  const originalCents = toCents(payment?.amount);
  const markedRefunded = toCents(payment?.refunded_amount);
  // Prefer the server's accounting: sum live refund rows pointing at this
  // payment when the caller supplies the sibling set — refunded_amount is a
  // maintained marker and can lag while refund rows are the source of truth.
  let alreadyRefunded = Math.max(0, markedRefunded);
  let netHeldCents: number | null = null;
  if (Array.isArray(opts?.payments)) {
    const counted = (opts.payments as any[]).filter((p) => ['recorded', 'refunded'].includes(clean(p?.status)));
    const rowSum = counted
      .filter((p) => clean(p?.refund_of_payment_id) === paymentId)
      .reduce((s, p) => s + Math.abs(toCents(p?.amount)), 0);
    alreadyRefunded = Math.max(alreadyRefunded, rowSum);
    netHeldCents = counted.reduce((s, p) => s + toCents(p?.amount), 0);
  }
  const remainingCents = Math.max(0, originalCents - alreadyRefunded);
  const refundableCents = netHeldCents === null
    ? remainingCents
    : Math.min(remainingCents, Math.max(0, netHeldCents));
  if (!(refundableCents > 0)) {
    return { ok: false, error: 'This payment is already fully refunded or credited.' };
  }
  const rawAmount = args?.amount_cents;
  const amountCents = rawAmount === undefined || rawAmount === null
    ? refundableCents
    : Math.round(num(rawAmount, NaN));
  if (!(amountCents > 0)) return { ok: false, error: 'Refund amount must be positive.' };
  if (amountCents - refundableCents > 0) {
    return { ok: false, error: `Refund exceeds the refundable amount of ${usd(refundableCents)}.` };
  }
  const reason = clean(opts?.reason);
  const requestKey = clean(opts?.creation_request_key)
    || refundRequestKey(paymentId, amountCents, reason, clean(args?.actor_id));
  return {
    ok: true,
    payload: {
      action: 'refund_payment',
      payment_id: paymentId,
      creation_request_key: requestKey,
      amount: toDollars(amountCents),
      reason,
      restock: opts?.restock === true,
    },
  };
}
