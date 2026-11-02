// Customer report pack — ESTIMATOR_MASTERPLAN WS-J / item J-04.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Nine report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   customer_payments      — payments received, per customer, in a period
//   customer_balance       — open-balance rollup per customer (open AR)
//   instore_credit         — in-store credit ledger balances per customer
//   credit_terms_usage     — credit limit vs used vs available, with terms
//   tax_exemption_status   — exemption registry: status + certificate + expiry
//   customers_by_created   — created-date cohort for a period
//   customers_by_master    — master-account rollup with children
//   dormant_customers      — no invoice/activity within N days
//   phone_address_list     — phone/address directory export
//
// CUSTOMER_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads
// data.customers / data.invoices / data.payments / data.credit_ledger /
// data.work_orders / data.opportunities only — the engine owns data
// injection.
//
// ── Semantics replicated from sibling models (zero-import → inline copies) ──
//
// Open-AR membership (customer_balance / master rollup balance column):
// same rules as arAgingReports (J-03) — status NOT in
// {draft,void,refunded,cancelled,canceled}, no void-ish flags
// (void/voided/is_void/deleted, voided_date), remaining balance > 0
// (balance_due/balance/amount_due authoritative else total − paid), and the
// issue day (issue_date → sent_date → created_date) on or before the as-of
// day. Drafts never billed → excluded.
//
// Credit-limit usage (credit_terms_usage): mirrors w-63
// creditTermsModel.creditUsage EXACTLY — live (non-deleted) invoices for the
// customer whose status is NOT 'void'/'paid' and whose balance_due > 0 are
// summed. Drafts DO count there: the limit check measures credit exposure,
// not billed AR — that divergence from open-AR is intentional (w-63
// contract). Severity ladder mirrors creditLimitCheck: used > limit →
// 'exceeded'; used == limit → 'at_limit' (the model's 'warn' at zero new
// amount); limit ≤ 0 → 'no_limit' (unconfigured limits never warn).
//
// In-store credit (instore_credit): mirrors G-09 storeCreditModel —
// Customer.in_store_credit_balance → in_store_credit is the authoritative
// stored cache when present (finite, incl. 0); only when NEITHER field is
// present does the balance fall back to summing the ledger. Entity ledger
// rows (StoreCreditLedger.jsonc) carry amount_cents as canonical integer
// cents with amount as a dollar display mirror — amount_cents wins, then
// amount. Balances are RAW: negative = the customer net-owes the store.
// Kinds restricted to the four CREDIT_LEDGER_KINDS; deleted rows dead.
//
// Tax exemption (tax_exemption_status): mirrors G-08 taxExemptModel —
// canonical Customer.tax_exemption object first, legacy flat aliases
// (tax_exempt flag, tax_exempt_id, tax_exempt_expires/expiration,
// tax_exempt_reason/exempt_reason, tax_id_number as last-resort cert) fill
// per-field. Status ladder: 'none' (no record) → 'revoked' (always wins) →
// 'expired' (stored status or expires_on before the as-of day — a cert is
// valid THROUGH its expires_on) → 'active'. Perpetual = no parseable
// expiry. Report lists every customer WITH a record (status != 'none').
//
// Dormant (dormant_customers): activity vocabulary mirrors G-03
// customerLifecycleRules — customer {last_contacted_at, created_date},
// invoice {created_date, issue_date, sent_date, paid_date}, work order
// {created_date, date_order_created, sales_last_activity_at, completed_date,
// close_date}, opportunity {last_activity_at, updated_date, created_date};
// payments {created_date, paid_date} added — money received is activity.
// A customer is dormant when the NEWEST activity of any kind is strictly
// older than `days` (default 90) before the as-of day — activity exactly
// `days` ago is inside the window and NOT dormant. Customers with zero
// parseable activity are dormant too (param include_never, default true —
// the ultimate dormant case on real data is rare: created_date always
// stamps). Merged stubs (merged_into_customer_id) and deleted rows are
// skipped everywhere.
//
// Money: the MODEL layer is integer cents end-to-end (toCents → int sums →
// no float dust, statementBatch/arAging convention). run() converts cents →
// dollars once at the report boundary because engine column format 'money'
// expects dollar values. Report rows keep *_cents extras — the engine
// preserves extra row keys for drilldowns.
//
// Days are 'YYYY-MM-DD' UTC-day strings ('YYYY-MM-DD' prefix wins so ISO
// timestamps never shift days — statementBatch/toDay convention). Engine-
// resolved date_range bounds are LOCAL Date objects; localDay() extracts
// their local calendar day so stored day-strings compare the way a shop
// expects.
//
// API:
//   paymentRows / customerBalanceRows / instoreCreditRows /
//   creditTermsUsageRows / taxExemptionRows / customersByCreatedRows /
//   masterAccountRows / dormantCustomerRows / phoneAddressRows
//   customerTaxExemption / lifecycleStatus / ledgerSumCents /
//   creditBalanceCents / creditUsageCents (exported model helpers)
//   CUSTOMER_REPORTS / CUSTOMER_REPORTS_BY_ID  — 9 engine-ready specs
//   CREDIT_USAGE_STATUSES / TAX_EXEMPTION_STATUSES / LIFECYCLE_STATUSES

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const pad2 = (n: number): string => String(n).padStart(2, '0');

// Dollar-ish field → integer cents (strips currency decoration — import
// rows parse too, statementBatchModel.toCents). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones; Date instances and
// epoch millis contribute their UTC calendar date.
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

// LOCAL calendar day of a Date — the engine resolves date_range params into
// local startOfDay/endOfDay Date objects, so their intended day is the
// local one (toDay would report the UTC day, which can differ).
const localDay = (d: any): string => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Whole days from → to on 'YYYY-MM-DD' strings (UTC — DST-immune). null
// when either side is unparseable.
const daysBetween = (fromDay: string, toDayStr: string): number | null => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY_MS);
};

// Resolved date_range param → {from,to} 'YYYY-MM-DD' bounds (either may be
// ''). Engine-resolved values arrive as {preset, from:Date, to:Date}; raw
// 'YYYY-MM-DD' strings / {from:'YYYY-MM-DD'} shapes are tolerated for
// direct run() callers. A bare preset string that reaches run() unresolved
// is treated as unbounded — param resolution is the engine's job.
const rangeBounds = (p: any): { from: string; to: string } => {
  if (isObj(p)) {
    const from = localDay(p.from) || toDay(p.from);
    const to = localDay(p.to) || toDay(p.to);
    return { from, to };
  }
  const d = toDay(p);
  return d ? { from: d, to: d } : { from: '', to: '' };
};

// Day ∈ [from,to] with the engine convention: unbounded keeps everything
// (undated rows included); any bound drops undated rows — a row that can't
// be dated can't be attributed to the period.
const dayInRange = (day: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

const asOfDay = (v: any): string => toDay(v) || new Date().toISOString().slice(0, 10);

// --- lookups -----------------------------------------------------------------

// Map | {id:row} object | row[] → Map keyed by clean id (arAging
// normalizeCustomerMap, generalized — same keying rules).
const indexById = (input: any): Map<string, any> => {
  if (input instanceof Map) {
    const out = new Map<string, any>();
    for (const [k, v] of input) if (clean(k)) out.set(clean(k), v);
    return out;
  }
  const out = new Map<string, any>();
  if (Array.isArray(input)) {
    for (const r of input) if (isObj(r) && clean(r.id)) out.set(clean(r.id), r);
  } else if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) if (clean(k)) out.set(clean(k), v);
  }
  return out;
};

// Live customer rows: non-deleted and not a merge stub (merged_into rows are
// audit shells — sweepPlan skips them the same way).
const isLiveCustomer = (c: any): boolean =>
  isObj(c) && c.deleted !== true && !clean(c.merged_into_customer_id);

// Customer display name — statementBatch chain (company_name → name →
// company), then a contact name, then '(unnamed)'.
const customerDisplayName = (c: any): string => {
  for (const v of [c?.company_name, c?.name, c?.company]) {
    if (clean(v)) return clean(v);
  }
  const contact = [clean(c?.contact_first_name), clean(c?.contact_last_name)]
    .filter(Boolean)
    .join(' ');
  return contact || '(unnamed)';
};

const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Text `customer` param: name substring (case-insensitive) OR exact id —
// the arAgingReports agingContext rule.
const matchesCustomer = (
  text: string,
  { id, name }: { id: string; name: string },
): boolean => {
  const t = norm(text);
  if (!t) return true;
  return norm(name).includes(t) || norm(id) === t;
};

// --- open-AR membership (replicated from arAgingReports — J-03 rules) ---------

const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);

const isVoidishInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return true;
  if (VOIDISH_STATUSES.has(norm(inv.status))) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
};
const isDraftInvoice = (inv: any): boolean => norm(inv?.status) === 'draft';

// w-63 invoicePaidCents chain: amount_paid → paid_amount/total_paid →
// live payments[] sum → total − balance snapshot.
const invoicePaidCents = (inv: any): number => {
  for (const v of [inv?.amount_paid, inv?.paid_amount, inv?.total_paid]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  if (Array.isArray(inv?.payments) && inv.payments.length) {
    return inv.payments
      .filter((p: any) => p && !VOIDISH_STATUSES.has(norm(p.status)))
      .reduce((sum: number, p: any) => sum + toCents(p.amount ?? p.value ?? p.total ?? p.paid_amount), 0);
  }
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance)) && inv?.total != null) {
    return Math.max(0, toCents(inv.total) - toCents(balance));
  }
  return 0;
};

// w-63 invoiceBalanceCents: balance_due (or balance/amount_due alias)
// authoritative; else total − paid, floored at 0.
const invoiceBalanceCents = (inv: any): number => {
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, toCents(inv?.total) - invoicePaidCents(inv));
};

const invoiceIssueDay = (inv: any): string =>
  toDay(inv?.issue_date) || toDay(inv?.sent_date) || toDay(inv?.created_date);

// Open-AR membership at an as-of day (arAgingRules): billed on/before as-of,
// live status, balance > 0.
const isOpenArInvoice = (inv: any, asOf: string): boolean => {
  if (!isObj(inv)) return false;
  if (isVoidishInvoice(inv) || isDraftInvoice(inv)) return false;
  if (invoiceBalanceCents(inv) <= 0) return false;
  const issued = invoiceIssueDay(inv);
  if (issued && issued > asOf) return false;
  return true;
};

// --- credit-limit usage (replicated from w-63 creditTermsModel) ---------------

// creditUsageCents — w-63 creditUsage: live invoices for the customer whose
// status is NOT void/paid with balance_due > 0. Drafts count — credit
// exposure, not billed AR. (portalPending has no entity source here.)
export function creditUsageCents(customerId: any, invoices: any[] = []): number {
  const cid = clean(customerId);
  if (!cid) return 0;
  let cents = 0;
  for (const i of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(i) || i.deleted === true) continue;
    if (clean(i.customer_id) !== cid) continue;
    if (['void', 'paid'].includes(norm(i.status))) continue;
    const b = toCents(i.balance_due);
    if (b > 0) cents += b;
  }
  return cents;
}

// Credit usage severity at zero new amount — w-63 creditLimitCheck ladder.
// 'no_limit' | 'within_limit' | 'at_limit' | 'exceeded'.
export const CREDIT_USAGE_STATUSES = ['no_limit', 'within_limit', 'at_limit', 'exceeded'] as const;

const creditUsageStatus = (usedCents: number, limitCents: number): string => {
  if (limitCents <= 0) return 'no_limit';
  if (usedCents > limitCents) return 'exceeded';
  if (usedCents === limitCents) return 'at_limit';
  return 'within_limit';
};

// --- in-store credit (replicated from G-09 storeCreditModel) ------------------

export const CREDIT_LEDGER_KINDS = ['credit_issued', 'credit_applied', 'credit_expired', 'credit_voided'] as const;
const LEDGER_KINDS = new Set<string>(CREDIT_LEDGER_KINDS);

const liveLedgerRows = (rows: any): any[] =>
  (Array.isArray(rows) ? rows : []).filter(
    (r: any) => isObj(r) && r.deleted !== true && LEDGER_KINDS.has(clean(r.kind)),
  );

// Entity rows carry amount_cents as canonical (integer cents) and amount as
// a dollar display mirror — amount_cents wins; a bare amount is dollars and
// converts once via toCents.
const ledgerAmountCents = (r: any): number => {
  if (r?.amount_cents != null && Number.isFinite(Number(r.amount_cents))) {
    return Math.round(Number(r.amount_cents));
  }
  return toCents(r?.amount);
};

// Stored credit balance in cents, or null when neither customer field is
// present (a present-but-zero field is authoritative).
const storedCreditCents = (customer: any): number | null => {
  for (const v of [customer?.in_store_credit_balance, customer?.in_store_credit]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return null;
};

// ledgerSumCents(ledgerRows, customerId?) → raw signed-cent balance across
// live rows of the four ledger kinds (optionally one customer only).
export function ledgerSumCents(ledgerRows: any, customerId?: any): number {
  const cid = customerId === undefined ? null : clean(customerId);
  return liveLedgerRows(ledgerRows).reduce(
    (s: number, r: any) =>
      cid !== null && clean(r.customer_id) !== cid ? s : s + ledgerAmountCents(r),
    0,
  );
}

// creditBalanceCents(customer, ledgerRows) → integer cents. Stored field
// wins when present; otherwise the ledger sum. Raw — negatives surface.
export function creditBalanceCents(customer: any, ledgerRows: any): number {
  const stored = storedCreditCents(customer);
  return stored != null ? stored : ledgerSumCents(ledgerRows, clean(customer?.id));
}

// Per-customer ledger rollup: signed sums per kind + last activity day.
const ledgerByCustomer = (ledgerRows: any): Map<string, any> => {
  const map = new Map<string, any>();
  for (const r of liveLedgerRows(ledgerRows)) {
    const cid = clean(r.customer_id);
    if (!cid) continue;
    let g = map.get(cid);
    if (!g) {
      g = {
        issued_cents: 0,
        applied_cents: 0,
        expired_cents: 0,
        voided_cents: 0,
        net_cents: 0,
        entry_count: 0,
        last_activity: '',
      };
      map.set(cid, g);
    }
    const amt = ledgerAmountCents(r);
    const kind = clean(r.kind);
    if (kind === 'credit_issued') g.issued_cents += amt;
    else if (kind === 'credit_applied') g.applied_cents += amt;
    else if (kind === 'credit_expired') g.expired_cents += amt;
    else g.voided_cents += amt;
    g.net_cents += amt;
    g.entry_count += 1;
    const day = toDay(r.occurred_at) || toDay(r.created_date);
    if (day && day > g.last_activity) g.last_activity = day;
  }
  return map;
};

// --- tax exemption (replicated from G-08 taxExemptModel) ----------------------

export const TAX_EXEMPTION_STATUSES = ['active', 'expired', 'revoked'] as const;

// customerTaxExemption(customer, {asOf}) →
//   { status: 'none'|'active'|'expired'|'revoked',
//     record: null | {reason, certificate_id, expires_on, issued_by,
//                      stored_status, perpetual, source},
//     days_until_expiry: number | null } — negative when expired.
// Exact replica of taxExemptModel.taxExemption on day strings: a cert is
// valid THROUGH expires_on and expires the next day.
export function customerTaxExemption(customer: any, opts: any = {}) {
  const c = isObj(customer) ? customer : {};
  const reg = isObj(c.tax_exemption) ? c.tax_exemption : {};

  const reason = firstText(reg.reason, c.tax_exempt_reason, c.exempt_reason);
  const certificate_id = firstText(reg.certificate_id, reg.id, c.tax_exempt_id, c.tax_id_number);
  const expires_on = firstText(reg.expires_on, reg.expires, c.tax_exempt_expires, c.tax_exempt_expiration);
  const issued_by = firstText(reg.issued_by, reg.issuer, c.tax_exempt_issued_by);
  const stored_status = firstText(reg.status, c.tax_exempt_status).toLowerCase();

  const hasObjectContent = [reg.reason, reg.certificate_id, reg.id, reg.expires_on,
    reg.expires, reg.issued_by, reg.issuer, reg.status].some((v) => clean(v) !== '');
  const hasFlatContent = [c.tax_exempt_id, c.tax_exempt_expires,
    c.tax_exempt_expiration, c.tax_exempt_reason, c.exempt_reason,
    c.tax_exempt_status].some((v) => clean(v) !== '');
  const legacyFlag = c.tax_exempt === true;

  if (!hasObjectContent && !hasFlatContent && !legacyFlag) {
    return { status: 'none', record: null, days_until_expiry: null };
  }

  const source = hasObjectContent ? (hasFlatContent || legacyFlag ? 'mixed' : 'tax_exemption') : 'legacy';
  const today = asOfDay(opts?.asOf ?? opts?.now);
  const expiryDay = toDay(expires_on);
  const perpetual = !expiryDay;
  const days_until_expiry = perpetual ? null : daysBetween(today, expiryDay);

  const revoked = stored_status === 'revoked' || reg.revoked === true || c.tax_exempt_revoked === true;
  const expired = !revoked && (stored_status === 'expired' || Boolean(expiryDay && expiryDay < today));
  const status = revoked ? 'revoked' : expired ? 'expired' : 'active';

  return {
    status,
    record: { reason, certificate_id, expires_on, issued_by, stored_status, perpetual, source },
    days_until_expiry,
  };
}

// --- lifecycle + activity vocabulary (replicated from G-03) -------------------

export const LIFECYCLE_STATUSES = ['Lead', 'Prospect', 'Active', 'Inactive'] as const;

// Canonical title-case lifecycle status — normalizeLifecycle replica:
// customer_status (stored enum) → lifecycle_status → status aliases, blank
// or unrecognized → 'Lead'.
export function lifecycleStatus(customer: any): string {
  const key = norm(customer?.customer_status ?? customer?.lifecycle_status ?? customer?.status);
  if (key === 'active') return 'Active';
  if (key === 'inactive') return 'Inactive';
  if (key === 'prospect') return 'Prospect';
  return 'Lead';
}
const lifecycleKey = (customer: any): string => norm(lifecycleStatus(customer));

const CUSTOMER_ACTIVITY_FIELDS = ['last_contacted_at', 'created_date'];
const INVOICE_ACTIVITY_FIELDS = ['created_date', 'issue_date', 'sent_date', 'paid_date'];
const WORK_ORDER_ACTIVITY_FIELDS = [
  'created_date', 'date_order_created', 'sales_last_activity_at', 'completed_date', 'close_date',
];
const OPPORTUNITY_ACTIVITY_FIELDS = ['last_activity_at', 'updated_date', 'created_date'];
// G-03 has no payment source — money received is activity for a dormancy
// report, so paid/created dates count here.
const PAYMENT_ACTIVITY_FIELDS = ['created_date', 'paid_date'];

const maxDay = (a: string, b: string): string => (b && (!a || b > a) ? b : a);

// Map customer_id → {last_day, last_invoice_day} across every activity
// source; the customer row's own fields fold in under its id.
const activityIndex = ({
  customers = [],
  invoices = [],
  workOrders = [],
  opportunities = [],
  payments = [],
}: any = {}): Map<string, any> => {
  const map = new Map<string, any>();
  const stamp = (cid: any, day: string, isInvoice: boolean) => {
    const id = clean(cid);
    if (!id || !day) return;
    let g = map.get(id);
    if (!g) {
      g = { last_day: '', last_invoice_day: '' };
      map.set(id, g);
    }
    g.last_day = maxDay(g.last_day, day);
    if (isInvoice) g.last_invoice_day = maxDay(g.last_invoice_day, day);
  };
  const fold = (rows: any, fields: string[], isInvoice = false) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!isObj(row)) continue;
      let newest = '';
      for (const f of fields) newest = maxDay(newest, toDay(row[f]));
      stamp(row.customer_id, newest, isInvoice);
    }
  };
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isObj(c)) continue;
    let newest = '';
    for (const f of CUSTOMER_ACTIVITY_FIELDS) newest = maxDay(newest, toDay(c[f]));
    stamp(c.id, newest, false);
  }
  fold(invoices, INVOICE_ACTIVITY_FIELDS, true);
  fold(workOrders, WORK_ORDER_ACTIVITY_FIELDS);
  fold(opportunities, OPPORTUNITY_ACTIVITY_FIELDS);
  fold(payments, PAYMENT_ACTIVITY_FIELDS);
  return map;
};

// === model rows ===============================================================

/**
 * paymentRows — payments received, one row per live payment in the window.
 * Money movement = status 'recorded' + 'refunded' rows (refunds are negative
 * money); 'void' rows were reversed → handled by voidPolicy
 * ('exclude'|'include'|'only' — same ladder as engine VOID_POLICIES on the
 * payment's own void-ish flags: status 'void', voided_date, deleted).
 * Date field: paid_date → created_date. Sorted paid day desc → customer → id.
 */
export function paymentRows(payments: any[] = [], opts: any = {}) {
  const customersById = indexById(opts?.customersById ?? opts?.customers);
  const invoicesById = indexById(opts?.invoicesById ?? opts?.invoices);
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const voidPolicy = norm(opts?.voidPolicy ?? opts?.void_policy) || 'exclude';
  const methods = new Set(
    (Array.isArray(opts?.methods) ? opts.methods : []).map(norm).filter(Boolean),
  );

  const isVoidPayment = (p: any): boolean =>
    norm(p?.status) === 'void' || Boolean(clean(p?.voided_date)) || p?.deleted === true;

  const rows: any[] = [];
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p)) continue;
    const voidish = isVoidPayment(p);
    if (voidPolicy === 'exclude' && voidish) continue;
    if (voidPolicy === 'only' && !voidish) continue;

    const inv = invoicesById.get(clean(p.invoice_id)) || null;
    const cid = clean(p.customer_id) || clean(inv?.customer_id);
    const cust = customersById.get(cid) || null;
    const day = toDay(p.paid_date) || toDay(p.created_date);
    if (!dayInRange(day, from, to)) continue;

    const method = norm(p.method) || 'other';
    if (methods.size && !methods.has(method)) continue;

    rows.push({
      payment_id: clean(p.id),
      paid_date: day,
      customer_id: cid,
      customer_name: cust ? customerDisplayName(cust) : clean(p.customer_display_name) || '(unassigned)',
      invoice_id: clean(p.invoice_id),
      invoice_number: firstText(inv?.invoice_number, inv?.number, p.invoice_number),
      method,
      reference_number: clean(p.reference_number),
      amount_cents: toCents(p.amount),
      status: norm(p.status) || 'recorded',
      payment_kind: toCents(p.amount) < 0 ? 'refund' : 'payment',
      created_by: clean(p.created_by),
      portal_source: clean(p.portal_source),
    });
  }
  rows.sort(
    (a, b) =>
      b.paid_date.localeCompare(a.paid_date) ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.payment_id.localeCompare(b.payment_id),
  );
  return rows;
}

/**
 * customerBalanceRows — one row per customer carrying open AR at the as-of
 * day: {customer_id, customer_name, salesperson, invoice_count,
 * open_balance_cents, oldest_issue_day, in_store_credit_cents}. Sorted
 * open_balance desc → name. Invoices for an unknown/missing customer roll
 * under '(unassigned)'.
 */
export function customerBalanceRows(invoices: any[] = [], opts: any = {}) {
  const asOf = asOfDay(opts?.asOf);
  const customersById = indexById(opts?.customersById ?? opts?.customers);
  const ledgerRows = opts?.creditLedgerRows ?? opts?.ledgerRows ?? opts?.credit_ledger ?? [];

  const groups = new Map<string, any>();
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isOpenArInvoice(inv, asOf)) continue;
    const cid = clean(inv.customer_id);
    const key = cid || '(unassigned)';
    let g = groups.get(key);
    if (!g) {
      const cust = customersById.get(cid) || null;
      g = {
        key,
        customer_id: cust ? cid : '',
        customer_name: cust
          ? customerDisplayName(cust)
          : clean(inv.customer_display_name) || '(unassigned)',
        salesperson: clean(cust?.salesperson) || clean(inv.salesperson),
        customer: cust,
        invoice_count: 0,
        open_balance_cents: 0,
        oldest_issue_day: '',
      };
      groups.set(key, g);
    }
    g.invoice_count += 1;
    g.open_balance_cents += invoiceBalanceCents(inv);
    const issued = invoiceIssueDay(inv);
    if (issued && (!g.oldest_issue_day || issued < g.oldest_issue_day)) {
      g.oldest_issue_day = issued;
    }
  }
  const rows = [...groups.values()].map((g) => ({
    customer_id: g.customer_id,
    customer_name: g.customer_name,
    salesperson: g.salesperson,
    invoice_count: g.invoice_count,
    open_balance_cents: g.open_balance_cents,
    oldest_issue_day: g.oldest_issue_day,
    in_store_credit_cents: g.customer ? creditBalanceCents(g.customer, ledgerRows) : 0,
  }));
  rows.sort(
    (a, b) =>
      b.open_balance_cents - a.open_balance_cents ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id),
  );
  return rows;
}

/**
 * instoreCreditRows — in-store credit position per customer:
 * {customer_id, customer_name, balance_cents, issued_cents, applied_cents,
 * expired_cents, voided_cents, entry_count, last_activity, source}
 * source = 'stored' (customer cache authoritative) | 'ledger' (summed) |
 * 'none'. Default membership: nonzero balance OR any ledger rows;
 * opts.includeZero lists every live customer. Sorted |balance| desc → name.
 */
export function instoreCreditRows(customers: any[] = [], ledgerRows: any = [], opts: any = {}) {
  const byCust = ledgerByCustomer(ledgerRows);
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const cid = clean(c.id);
    const g = byCust.get(cid) || {
      issued_cents: 0, applied_cents: 0, expired_cents: 0, voided_cents: 0,
      net_cents: 0, entry_count: 0, last_activity: '',
    };
    const stored = storedCreditCents(c);
    const balance = stored != null ? stored : g.net_cents;
    const source = stored != null ? 'stored' : g.entry_count ? 'ledger' : 'none';
    if (!opts?.includeZero && balance === 0 && g.entry_count === 0) continue;
    rows.push({
      customer_id: cid,
      customer_name: customerDisplayName(c),
      balance_cents: balance,
      issued_cents: g.issued_cents,
      applied_cents: g.applied_cents,
      expired_cents: g.expired_cents,
      voided_cents: g.voided_cents,
      entry_count: g.entry_count,
      last_activity: g.last_activity,
      source,
    });
  }
  rows.sort(
    (a, b) =>
      Math.abs(b.balance_cents) - Math.abs(a.balance_cents) ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id),
  );
  return rows;
}

/**
 * creditTermsUsageRows — credit limit vs used vs available per customer:
 * {customer_id, customer_name, terms, credit_terms_days, credit_limit_cents,
 * used_cents, available_cents, usage_pct (0–1 fraction | null), status}.
 * Default membership: customers "w/ terms" — a configured limit, positive
 * terms days, or nonzero usage; opts.includeAll lists every live customer.
 * Sorted usage_pct desc (no-limit last) → used desc → name.
 */
export function creditTermsUsageRows(customers: any[] = [], invoices: any[] = [], opts: any = {}) {
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const cid = clean(c.id);
    const limit = Math.max(0, toCents(c.credit_limit));
    const days = Math.max(0, num(c.credit_terms_days));
    const used = creditUsageCents(cid, invoices);
    if (!opts?.includeAll && limit <= 0 && days <= 0 && used <= 0) continue;
    const status = creditUsageStatus(used, limit);
    const available = limit > 0 ? Math.max(0, limit - used) : null;
    rows.push({
      customer_id: cid,
      customer_name: customerDisplayName(c),
      terms: firstText(c.terms, days > 0 ? `Net ${days}` : '', 'Due on receipt'),
      credit_terms_days: days,
      credit_limit_cents: limit,
      used_cents: used,
      available_cents: available,
      usage_pct: limit > 0 ? used / limit : null,
      status,
    });
  }
  rows.sort(
    (a, b) =>
      (b.usage_pct ?? -1) - (a.usage_pct ?? -1) ||
      b.used_cents - a.used_cents ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id),
  );
  return rows;
}

/**
 * taxExemptionRows — registry listing, one row per customer WITH an
 * exemption record (status != 'none'): {customer_id, customer_name, status,
 * reason, certificate_id, issued_by, expires_on, days_until_expiry,
 * perpetual}. Sorted expires_on asc, perpetual last, then name — the G-08
 * exemptCustomersReport ordering.
 */
export function taxExemptionRows(customers: any[] = [], opts: any = {}) {
  const asOf = asOfDay(opts?.asOf);
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const { status, record, days_until_expiry } = customerTaxExemption(c, { asOf });
    if (status === 'none' || !record) continue;
    rows.push({
      customer_id: clean(c.id),
      customer_name: customerDisplayName(c),
      status,
      reason: clean(record.reason),
      certificate_id: clean(record.certificate_id),
      issued_by: clean(record.issued_by),
      expires_on: clean(record.expires_on) || '',
      days_until_expiry,
      perpetual: record.perpetual === true,
    });
  }
  rows.sort((a, b) => {
    if (a.perpetual !== b.perpetual) return a.perpetual ? 1 : -1; // perpetual last
    const byDate = !a.expires_on && !b.expires_on ? 0
      : !a.expires_on ? 1
      : !b.expires_on ? -1
      : a.expires_on.localeCompare(b.expires_on);
    return byDate ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id);
  });
  return rows;
}

/**
 * customersByCreatedRows — created-date cohort for a period:
 * {customer_id, customer_name, created_date, customer_status, customer_type,
 * salesperson, customer_origination}. Bounded ranges drop undated rows;
 * unbounded keeps all. Sorted created day desc → name.
 */
export function customersByCreatedRows(customers: any[] = [], opts: any = {}) {
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const created = toDay(c.created_date);
    if (!dayInRange(created, from, to)) continue;
    rows.push({
      customer_id: clean(c.id),
      customer_name: customerDisplayName(c),
      created_date: created,
      customer_status: lifecycleStatus(c),
      customer_type: clean(c.customer_type),
      salesperson: clean(c.salesperson),
      customer_origination: firstText(c.customer_origination, c.origination_path),
    });
  }
  rows.sort(
    (a, b) =>
      b.created_date.localeCompare(a.created_date) ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id),
  );
  return rows;
}

/**
 * masterAccountRows — one row per master account with its children:
 * {master_id, master_name, customer_count, customer_names (' | ' joined),
 * children [{id,name}], open_balance_cents}. Group key is the master
 * customer's id when master_account_id resolves OR when a stored
 * master_account label matches a known customer's name — the two spellings
 * of the same master land in ONE group. Unresolvable refs keep their own
 * group (label or raw id shown). Sorted children count desc → master name.
 */
export function masterAccountRows(customers: any[] = [], opts: any = {}) {
  const customersById = indexById(opts?.customersById ?? customers);
  const byNormName = new Map<string, any>();
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isObj(c) || !clean(c.id)) continue;
    const n = norm(customerDisplayName(c));
    if (n && !byNormName.has(n)) byNormName.set(n, c);
  }

  const groups = new Map<string, any>();
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const masterId = clean(c.master_account_id);
    const masterLabel = clean(c.master_account);
    if (!masterId && !masterLabel) continue;

    // Resolve the group key: explicit id ref → that id; a label that names a
    // known customer → that customer's id (merges 'id:'/'name:' spellings);
    // else the raw label / raw id as its own group.
    const labelHit = masterLabel ? byNormName.get(norm(masterLabel)) : null;
    const resolvedId = masterId || clean(labelHit?.id);
    const key = resolvedId ? `id:${resolvedId}` : `name:${norm(masterLabel)}`;
    const master = resolvedId ? customersById.get(resolvedId) : null;
    const masterName = master
      ? customerDisplayName(master)
      : masterLabel || '(unknown master)';

    let g = groups.get(key);
    if (!g) {
      g = {
        master_id: master ? clean(master.id) : resolvedId || '',
        master_name: masterName,
        children: [] as any[],
      };
      groups.set(key, g);
    }
    g.children.push({ id: clean(c.id), name: customerDisplayName(c) });
  }

  const asOf = asOfDay(opts?.asOf);
  const invoices = Array.isArray(opts?.invoices) ? opts.invoices : [];
  const rows = [...groups.values()].map((g) => {
    g.children.sort((a: any, b: any) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    let open = 0;
    if (invoices.length) {
      const childIds = new Set(g.children.map((ch: any) => ch.id));
      for (const inv of invoices) {
        if (childIds.has(clean(inv?.customer_id)) && isOpenArInvoice(inv, asOf)) {
          open += invoiceBalanceCents(inv);
        }
      }
    }
    return {
      master_id: g.master_id,
      master_name: g.master_name,
      customer_count: g.children.length,
      customer_names: g.children.map((ch: any) => ch.name).join(' | '),
      children: g.children,
      open_balance_cents: open,
    };
  });
  rows.sort(
    (a, b) =>
      b.customer_count - a.customer_count ||
      a.master_name.toLowerCase().localeCompare(b.master_name.toLowerCase()) ||
      a.master_id.localeCompare(b.master_id),
  );
  return rows;
}

/**
 * dormantCustomerRows — customers with no invoice/activity within `days`
 * (default 90) of the as-of day: {customer_id, customer_name,
 * customer_status, salesperson, phone, last_activity, days_inactive,
 * last_invoice_date, never_active}. Boundary: days_inactive > days is
 * dormant; exactly `days` is inside the window. never_active rows (zero
 * parseable activity) are dormant; opts.includeNever===false drops them.
 * Sorted never-active first → days_inactive desc → name.
 */
export function dormantCustomerRows(customers: any[] = [], opts: any = {}) {
  const asOf = asOfDay(opts?.asOf);
  const days = Math.max(0, num(opts?.days, 90));
  const includeNever = opts?.includeNever !== false;
  const activity = activityIndex({
    customers,
    invoices: opts?.invoices,
    workOrders: opts?.workOrders ?? opts?.work_orders,
    opportunities: opts?.opportunities,
    payments: opts?.payments,
  });
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const cid = clean(c.id);
    const hit = activity.get(cid) || { last_day: '', last_invoice_day: '' };
    const lastDay = hit.last_day || '';
    const daysInactive = lastDay ? daysBetween(lastDay, asOf) : null;
    const neverActive = daysInactive === null;
    if (neverActive && !includeNever) continue;
    if (!neverActive && !(daysInactive > days)) continue;
    rows.push({
      customer_id: cid,
      customer_name: customerDisplayName(c),
      customer_status: lifecycleStatus(c),
      salesperson: clean(c.salesperson),
      phone: firstText(c.company_phone, c.contact_office_phone, c.contact_cell_phone),
      last_activity: lastDay,
      days_inactive: daysInactive,
      last_invoice_date: hit.last_invoice_day || '',
      never_active: neverActive,
    });
  }
  rows.sort((a, b) => {
    if (a.never_active !== b.never_active) return a.never_active ? -1 : 1;
    const byDays = (b.days_inactive ?? Number.MAX_SAFE_INTEGER) -
      (a.days_inactive ?? Number.MAX_SAFE_INTEGER);
    return byDays ||
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id);
  });
  return rows;
}

/**
 * phoneAddressRows — directory export, one row per live customer:
 * {customer_id, customer_name, contact_name, phone, alt_phone, email,
 * address_1, address_2, city, state, postal_code, country}. Billing address
 * is canonical; when billing has no street the location address fills in
 * (location_same_as_billing means location mirrors billing — the fallback
 * only fires on genuinely-populated location fields). Sorted by name.
 */
export function phoneAddressRows(customers: any[] = [], _opts: any = {}) {
  const addr = (c: any) => {
    const billingStreet = firstText(c.billing_address_1);
    const useLocation = !billingStreet;
    const pick = (prefix: string, field: string) =>
      useLocation ? clean(c[`${prefix}${field}`]) : '';
    const street1 = billingStreet || pick('location_', 'address_1');
    const postalCode = useLocation
      ? clean(c.location_postal_code)
      : [clean(c.billing_postal_code), clean(c.billing_postal_ext)].filter(Boolean).join('-');
    return {
      address_1: street1,
      address_2: useLocation ? clean(c.location_address_2) : clean(c.billing_address_2),
      city: useLocation ? clean(c.location_city) : clean(c.billing_city),
      state: useLocation ? clean(c.location_state) : clean(c.billing_state),
      postal_code: postalCode,
      country: useLocation
        ? firstText(c.location_country, c.billing_country)
        : clean(c.billing_country),
    };
  };
  const rows: any[] = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (!isLiveCustomer(c)) continue;
    const contactName = [clean(c.contact_first_name), clean(c.contact_last_name)]
      .filter(Boolean)
      .join(' ') || clean(c.billing_contact_name);
    rows.push({
      customer_id: clean(c.id),
      customer_name: customerDisplayName(c),
      customer_status: lifecycleStatus(c),
      contact_name: contactName,
      phone: firstText(c.company_phone, c.contact_office_phone),
      alt_phone: firstText(c.contact_cell_phone, c.additional_phone),
      email: firstText(c.contact_email, c.billing_contact_email),
      ...addr(c),
    });
  }
  rows.sort(
    (a, b) =>
      a.customer_name.toLowerCase().localeCompare(b.customer_name.toLowerCase()) ||
      a.customer_id.localeCompare(b.customer_id),
  );
  return rows;
}

// === report specs =============================================================

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const pctCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'percent' });

// Param specs (engine types only — PARAM_TYPES =
// date_range|date_basis|select|multiselect|boolean|text|number; as_of is a
// 'YYYY-MM-DD' text param, blank = today).
const AS_OF_PARAM = {
  key: 'as_of',
  type: 'text',
  label: 'As-of Date',
  default: '',
};
const CUSTOMER_PARAM = {
  key: 'customer',
  type: 'text',
  label: 'Customer',
  default: '',
};
const SALESPERSON_PARAM = {
  key: 'salesperson',
  type: 'text',
  label: 'Salesperson',
  default: '',
};
const DATE_RANGE_PARAM = {
  key: 'date_range',
  type: 'date_range',
  label: 'Date Range',
  default: 'this_month',
};
const VOID_PARAM = {
  key: 'void_policy',
  type: 'select',
  label: 'Void Handling',
  options: ['exclude', 'include', 'only'],
  default: 'exclude',
};
const METHOD_PARAM = {
  key: 'methods',
  type: 'multiselect',
  label: 'Payment Methods',
  options: ['cash', 'check', 'card', 'ach', 'financing', 'other', 'credit_memo'],
  default: [] as string[],
};
const LIFECYCLE_PARAM = {
  key: 'statuses',
  type: 'multiselect',
  label: 'Customer Status',
  options: ['lead', 'prospect', 'active', 'inactive'],
  default: [] as string[],
};
const EXEMPT_STATUS_PARAM = {
  key: 'statuses',
  type: 'multiselect',
  label: 'Exemption Status',
  options: [...TAX_EXEMPTION_STATUSES],
  default: [] as string[],
};
const USAGE_STATUS_PARAM = {
  key: 'statuses',
  type: 'multiselect',
  label: 'Usage Status',
  options: [...CREDIT_USAGE_STATUSES],
  default: [] as string[],
};
const DAYS_PARAM = {
  key: 'days',
  type: 'number',
  label: 'Inactive Days',
  default: 90,
};
const INCLUDE_ZERO_PARAM = {
  key: 'include_zero',
  type: 'boolean',
  label: 'Include Zero Balances',
  default: false,
};
const INCLUDE_ALL_PARAM = {
  key: 'include_all',
  type: 'boolean',
  label: 'Include All Customers',
  default: false,
};
const INCLUDE_NEVER_PARAM = {
  key: 'include_never',
  type: 'boolean',
  label: 'Include Never-Active',
  default: true,
};

// Resolved shared context pieces.
const customerFilter = (params: any) => clean(params?.customer);
const statusSet = (params: any): Set<string> =>
  new Set((Array.isArray(params?.statuses) ? params.statuses : []).map(norm).filter(Boolean));

// run() adapters: model rows (integer cents) → report rows (money columns
// in dollars — engine format 'money'; *_cents keys preserved as extras).
const centsToMoneyCols = (obj: any, centsKeys: string[], outKey?: (k: string) => string) => {
  const out: any = { ...obj };
  for (const k of centsKeys) out[outKey ? outKey(k) : k.replace(/_cents$/, '')] = fromCents(obj[k]);
  return out;
};

const sumMoney = (rows: any[], key: string) =>
  Math.round(rows.reduce((s, r) => s + num(r[key]), 0) * 100) / 100;

const CUSTOMER_REPORT_DESCRIPTIONS: Record<string, string> = {
  customer_payments:
    'Payments received per customer for the period — one row per payment with method, reference and invoice, refunds shown as negative amounts.',
  customer_balance:
    'Open-balance rollup per customer at an as-of date — open invoice count, total balance, and in-store credit on account.',
  instore_credit:
    'In-store credit position per customer — ledger issue/apply/expire/void activity plus the current balance (stored cache wins, ledger-sum fallback).',
  credit_terms_usage:
    'Credit limit usage per customer with terms — limit vs open-balance used vs available, utilization share, and over/at-limit status.',
  tax_exemption_status:
    'Tax-exemption registry — every customer with an exemption record, its certificate, status (active/expired/revoked) and days until expiry.',
  customers_by_created:
    'Customer cohort by created date for the period — new accounts with status, type, salesperson and origination.',
  customers_by_master:
    'Master-account rollup — each master account with its linked child customers and their combined open balance.',
  dormant_customers:
    'Dormant customers — no invoices or activity of any kind within the inactive-days window (default 90) of the as-of date.',
  phone_address_list:
    'Customer phone & address directory — contact name, phones, email and billing (or location) address, ready for export.',
};

export const CUSTOMER_REPORTS = [
  {
    id: 'customer_payments',
    name: 'Customer Payments',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.customer_payments,
    params: [DATE_RANGE_PARAM, CUSTOMER_PARAM, METHOD_PARAM, VOID_PARAM],
    columns: [
      dateCol('paid_date', 'Paid'),
      textCol('customer_name', 'Customer'),
      textCol('invoice_number', 'Invoice'),
      textCol('method', 'Method'),
      textCol('reference_number', 'Reference'),
      moneyCol('amount', 'Amount'),
      textCol('status', 'Status'),
      textCol('created_by', 'Entered By'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rows = paymentRows(data?.payments, {
        from,
        to,
        voidPolicy: params?.void_policy,
        methods: params?.methods,
        customersById: data?.customersById ?? data?.customers,
        invoicesById: data?.invoicesById ?? data?.invoices,
      });
      const cust = customerFilter(params);
      const filtered = rows.filter((r) =>
        matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }),
      );
      return { rows: filtered.map((r) => centsToMoneyCols(r, ['amount_cents'])) };
    },
    summarize: (rows: any[]) => {
      const received = rows.reduce((s, r) => s + (num(r.amount) > 0 ? num(r.amount) : 0), 0);
      const refunded = rows.reduce((s, r) => s + (num(r.amount) < 0 ? num(r.amount) : 0), 0);
      return {
        totals: {
          paid_date: '',
          customer_name: 'Total',
          invoice_number: '',
          method: '',
          reference_number: `${rows.length} payment${rows.length === 1 ? '' : 's'}`,
          amount: Math.round((received + refunded) * 100) / 100,
          status: '',
          created_by: '',
          payments_received: Math.round(received * 100) / 100,
          refunds_issued: Math.round(refunded * 100) / 100,
        },
      };
    },
  },
  {
    id: 'customer_balance',
    name: 'Customer Balance',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.customer_balance,
    params: [AS_OF_PARAM, CUSTOMER_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('salesperson', 'Salesperson'),
      intCol('invoice_count', 'Open Invoices'),
      moneyCol('open_balance', 'Open Balance'),
      moneyCol('in_store_credit', 'In-Store Credit'),
      dateCol('oldest_issue_day', 'Oldest Invoice'),
    ],
    run: (params: any, data: any) => {
      const rows = customerBalanceRows(data?.invoices, {
        asOf: params?.as_of,
        customersById: data?.customersById ?? data?.customers,
        credit_ledger: data?.credit_ledger ?? data?.store_credit_ledger ?? data?.ledger_rows,
      });
      const cust = customerFilter(params);
      const filtered = rows.filter((r) =>
        matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }),
      );
      return {
        rows: filtered.map((r) =>
          centsToMoneyCols(r, ['open_balance_cents', 'in_store_credit_cents']),
        ),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: 'Total',
        salesperson: '',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        open_balance: sumMoney(rows, 'open_balance'),
        in_store_credit: sumMoney(rows, 'in_store_credit'),
        oldest_issue_day: '',
      },
    }),
  },
  {
    id: 'instore_credit',
    name: 'In-Store Credit',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.instore_credit,
    params: [CUSTOMER_PARAM, INCLUDE_ZERO_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      moneyCol('balance', 'Balance'),
      moneyCol('issued', 'Issued'),
      moneyCol('applied', 'Applied'),
      moneyCol('expired', 'Expired'),
      moneyCol('voided', 'Voided'),
      intCol('entry_count', 'Entries'),
      dateCol('last_activity', 'Last Activity'),
      textCol('source', 'Balance Source'),
    ],
    run: (params: any, data: any) => {
      const rows = instoreCreditRows(
        data?.customers,
        data?.credit_ledger ?? data?.store_credit_ledger ?? data?.ledger_rows,
        { includeZero: params?.include_zero === true },
      );
      const cust = customerFilter(params);
      const filtered = rows.filter((r) =>
        matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }),
      );
      return {
        rows: filtered.map((r) =>
          centsToMoneyCols(r, [
            'balance_cents',
            'issued_cents',
            'applied_cents',
            'expired_cents',
            'voided_cents',
          ]),
        ),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: 'Total',
        balance: sumMoney(rows, 'balance'),
        issued: sumMoney(rows, 'issued'),
        applied: sumMoney(rows, 'applied'),
        expired: sumMoney(rows, 'expired'),
        voided: sumMoney(rows, 'voided'),
        entry_count: rows.reduce((s, r) => s + num(r.entry_count), 0),
        last_activity: '',
        source: '',
      },
    }),
  },
  {
    id: 'credit_terms_usage',
    name: 'Credit Terms, Limits & Usage',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.credit_terms_usage,
    params: [CUSTOMER_PARAM, USAGE_STATUS_PARAM, INCLUDE_ALL_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('terms', 'Terms'),
      intCol('credit_terms_days', 'Terms (Days)'),
      moneyCol('credit_limit', 'Credit Limit'),
      moneyCol('used', 'Used'),
      moneyCol('available', 'Available'),
      pctCol('usage_pct', '% Used'),
      textCol('status', 'Status'),
    ],
    run: (params: any, data: any) => {
      const rows = creditTermsUsageRows(data?.customers, data?.invoices, {
        includeAll: params?.include_all === true,
      });
      const cust = customerFilter(params);
      const wanted = statusSet(params);
      const filtered = rows.filter(
        (r) =>
          matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }) &&
          (!wanted.size || wanted.has(r.status)),
      );
      return {
        rows: filtered.map((r) => ({
          ...centsToMoneyCols(r, ['credit_limit_cents', 'used_cents', 'available_cents'], (k) =>
            k === 'credit_limit_cents' ? 'credit_limit' : k.replace(/_cents$/, ''),
          ),
          available: r.available_cents == null ? null : fromCents(r.available_cents),
        })),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: 'Total',
        terms: '',
        credit_terms_days: null,
        credit_limit: sumMoney(rows, 'credit_limit'),
        used: sumMoney(rows, 'used'),
        available: sumMoney(rows, 'available'),
        usage_pct: (() => {
          const limit = rows.reduce((s, r) => s + num(r.credit_limit), 0);
          const used = rows.reduce((s, r) => s + num(r.used), 0);
          return limit > 0 ? used / limit : null;
        })(),
        status: `${rows.length} customer${rows.length === 1 ? '' : 's'}`,
      },
    }),
  },
  {
    id: 'tax_exemption_status',
    name: 'Tax Exemption Status',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.tax_exemption_status,
    params: [AS_OF_PARAM, CUSTOMER_PARAM, EXEMPT_STATUS_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('status', 'Status'),
      textCol('reason', 'Reason'),
      textCol('certificate_id', 'Certificate'),
      textCol('issued_by', 'Issued By'),
      dateCol('expires_on', 'Expires'),
      intCol('days_until_expiry', 'Days Until Expiry'),
    ],
    run: (params: any, data: any) => {
      const rows = taxExemptionRows(data?.customers, { asOf: params?.as_of });
      const cust = customerFilter(params);
      const wanted = statusSet(params);
      const filtered = rows.filter(
        (r) =>
          matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }) &&
          (!wanted.size || wanted.has(r.status)),
      );
      return {
        rows: filtered.map((r) => ({
          ...r,
          expires_on: r.expires_on || null,
          days_until_expiry: r.days_until_expiry,
        })),
      };
    },
    summarize: (rows: any[]) => {
      const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
      return {
        totals: {
          customer_name: 'Total',
          status: `${rows.length} exempt record${rows.length === 1 ? '' : 's'}`,
          reason: '',
          certificate_id: '',
          issued_by: '',
          expires_on: '',
          days_until_expiry: null,
          active: byStatus('active'),
          expired: byStatus('expired'),
          revoked: byStatus('revoked'),
        },
      };
    },
  },
  {
    id: 'customers_by_created',
    name: 'Customers by Created Date',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.customers_by_created,
    params: [DATE_RANGE_PARAM, LIFECYCLE_PARAM, SALESPERSON_PARAM],
    columns: [
      dateCol('created_date', 'Created'),
      textCol('customer_name', 'Customer'),
      textCol('customer_status', 'Status'),
      textCol('customer_type', 'Type'),
      textCol('salesperson', 'Salesperson'),
      textCol('customer_origination', 'Origination'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rows = customersByCreatedRows(data?.customers, { from, to });
      const rep = norm(params?.salesperson);
      const wanted = statusSet(params);
      const filtered = rows.filter(
        (r) =>
          (!wanted.size || wanted.has(norm(r.customer_status))) &&
          (!rep || norm(r.salesperson).includes(rep)),
      );
      return { rows: filtered };
    },
    summarize: (rows: any[]) => ({
      totals: {
        created_date: '',
        customer_name: `${rows.length} customer${rows.length === 1 ? '' : 's'}`,
        customer_status: '',
        customer_type: '',
        salesperson: '',
        customer_origination: '',
      },
    }),
  },
  {
    id: 'customers_by_master',
    name: 'Customers by Master Account',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.customers_by_master,
    params: [AS_OF_PARAM, CUSTOMER_PARAM],
    columns: [
      textCol('master_name', 'Master Account'),
      intCol('customer_count', 'Customers'),
      textCol('customer_names', 'Child Accounts'),
      moneyCol('open_balance', 'Open Balance'),
    ],
    run: (params: any, data: any) => {
      const rows = masterAccountRows(data?.customers, {
        asOf: params?.as_of,
        invoices: data?.invoices,
        customersById: data?.customersById,
      });
      const cust = customerFilter(params);
      const filtered = rows.filter(
        (r) =>
          matchesCustomer(cust, { id: r.master_id, name: r.master_name }) ||
          (cust && norm(r.customer_names).includes(norm(cust))),
      );
      return { rows: filtered.map((r) => centsToMoneyCols(r, ['open_balance_cents'])) };
    },
    summarize: (rows: any[]) => ({
      totals: {
        master_name: 'Total',
        customer_count: rows.reduce((s, r) => s + num(r.customer_count), 0),
        customer_names: `${rows.length} master account${rows.length === 1 ? '' : 's'}`,
        open_balance: sumMoney(rows, 'open_balance'),
      },
    }),
  },
  {
    id: 'dormant_customers',
    name: 'Dormant Customers',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.dormant_customers,
    params: [DAYS_PARAM, AS_OF_PARAM, LIFECYCLE_PARAM, INCLUDE_NEVER_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('customer_status', 'Status'),
      textCol('salesperson', 'Salesperson'),
      textCol('phone', 'Phone'),
      dateCol('last_activity', 'Last Activity'),
      intCol('days_inactive', 'Days Inactive'),
      dateCol('last_invoice_date', 'Last Invoice'),
    ],
    run: (params: any, data: any) => {
      const rows = dormantCustomerRows(data?.customers, {
        asOf: params?.as_of,
        days: params?.days,
        includeNever: params?.include_never !== false,
        invoices: data?.invoices,
        workOrders: data?.work_orders ?? data?.workOrders,
        opportunities: data?.opportunities,
        payments: data?.payments,
      });
      const wanted = statusSet(params);
      const filtered = rows.filter(
        (r) => !wanted.size || wanted.has(norm(r.customer_status)),
      );
      return {
        rows: filtered.map((r) => ({
          ...r,
          last_activity: r.last_activity || null,
          last_invoice_date: r.last_invoice_date || null,
        })),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: `${rows.length} dormant customer${rows.length === 1 ? '' : 's'}`,
        customer_status: '',
        salesperson: '',
        phone: '',
        last_activity: '',
        days_inactive: rows.reduce(
          (m, r) => Math.max(m, num(r.days_inactive)),
          0,
        ),
        last_invoice_date: '',
      },
    }),
  },
  {
    id: 'phone_address_list',
    name: 'Phone & Address List',
    category: 'customers',
    description: CUSTOMER_REPORT_DESCRIPTIONS.phone_address_list,
    params: [CUSTOMER_PARAM, LIFECYCLE_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('contact_name', 'Contact'),
      textCol('phone', 'Phone'),
      textCol('alt_phone', 'Alt Phone'),
      textCol('email', 'Email'),
      textCol('address_1', 'Address'),
      textCol('address_2', 'Address 2'),
      textCol('city', 'City'),
      textCol('state', 'State'),
      textCol('postal_code', 'Postal Code'),
      textCol('country', 'Country'),
    ],
    run: (params: any, data: any) => {
      const rows = phoneAddressRows(data?.customers);
      const cust = customerFilter(params);
      const wanted = statusSet(params);
      const filtered = rows.filter(
        (r) =>
          matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }) &&
          (!wanted.size || wanted.has(norm(r.customer_status))),
      );
      return { rows: filtered };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: `${rows.length} customer${rows.length === 1 ? '' : 's'}`,
        contact_name: '',
        phone: '',
        alt_phone: '',
        email: '',
        address_1: '',
        address_2: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
      },
    }),
  },
];

export const CUSTOMER_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  CUSTOMER_REPORTS.map((spec) => [spec.id, spec]),
);
