// AR Aging report suite — ESTIMATOR_MASTERPLAN WS-J / item J-03.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Four report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   ar_aging_summary        — one row per bucket (count / balance / share)
//   ar_aging_detail         — one row per open invoice
//   ar_aging_by_customer    — customer rollup with per-bucket columns
//   ar_aging_by_salesperson — rep rollup with per-bucket columns
//
// AR_AGING_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads
// data.invoices / data.customers only — the engine owns data injection.
//
// ── Bucket semantics (replicated EXACTLY — see sources) ──────────────────
// Days past due_date at the as-of date:
//   ≤0 or undated → 'current'   1–30 → '1-30'   31–60 → '31-60'
//   61–90 → '61-90'             >90  → '90+'
// Sources (all four in-repo AR agings agree on these boundaries — key names
// follow the w-63 export):
//   • src/components/jobs/completedVsPaidModel.js  arBucket()        (w-63/E-06)
//   • base44/shared/statementBatchModel.ts         aging{} buckets   (H-08)
//   • base44/functions/invoicingAction/entry.ts    agingSummary()
//   • base44/functions/opportunityWorkspaceAction/entry.ts (customer360 aging)
// There is NO '120+' bucket anywhere in the app — the 5-bucket 30/60/90
// scheme above is the canonical one.
//
// Open-AR membership (matches the sibling invoice-level implementations):
//   • status NOT in {draft, void, refunded, cancelled, canceled} — a draft
//     has not billed the customer (completedVsPaidModel + statementBatch);
//     void-ish rows never existed for AR purposes.
//   • no void-ish flags (void/voided/is_void/deleted, voided_date) —
//     reportEngine.isVoidRow alias set.
//   • remaining balance > 0 — balance_due/balance/amount_due authoritative,
//     else total − paid (the w-63 invoiceBalanceCents chain).
//   • issue date (issue_date → sent_date → created_date) on or before the
//     as-of date when parseable; undated rows stay (dropping them would
//     silently erase owed money).
// Completed jobs with open balances DO age — completed is a production
// state, not a financial one (w-63 semantic).
//
// Money: the MODEL layer is integer cents end-to-end (toCents → int sums →
// no float dust, statementBatch convention). run() converts cents → dollars
// once at the report boundary because engine column format 'money' expects
// dollar values. Report rows keep *_cents extras — the engine preserves
// extra row keys for drilldowns.
//
// Days are computed in UTC ('YYYY-MM-DD' → Date.UTC) so DST can never shift
// a bucket boundary (completedVsPaidModel.toUtcDay / statementBatch.toDay
// convention).
//
// As-of param: reportEngine has no bare 'date' param type (PARAM_TYPES =
// date_range|date_basis|select|multiselect|boolean|text|number), so `as_of`
// is a text param taking 'YYYY-MM-DD' (blank = today). run() parses it
// leniently — full ISO stamps and Date-parseable strings also work.
//
// API:
//   AR_AGING_BUCKETS / AR_AGING_BUCKET_LABELS   — canonical keys + labels
//   arAgingBucket(daysPastDue)                  — bucket classifier
//   agingRows(invoices, {asOf, customersById})  — per-invoice aging rows
//   bucketTotals(rows)                          — summary aggregate + totals
//   groupByCustomer(rows) / groupBySalesperson(rows) — rollups + totals
//   AR_AGING_REPORTS                            — 4 engine-ready specs
//   AR_AGING_REPORTS_BY_ID                      — same specs keyed by id

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Dollar-ish field → integer cents. Strips currency decoration so imported
// rows also parse (statementBatchModel.toCents). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones; Date instances and
// parseable strings fall back to their UTC calendar date (statementBatch
// toDay convention — same rule as completedVsPaidModel.toUtcDay).
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

// Whole days from → to on 'YYYY-MM-DD' strings (UTC — DST-immune). Returns
// null when either side is unparseable so callers can distinguish "0 days"
// from "unknown".
const daysBetween = (fromDay: string, toDayStr: string): number | null => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY_MS);
};

// --- open-AR membership ----------------------------------------------------

// Statuses that erase a row's money effect — statementBatchModel.VOIDISH,
// same set the statement/customer-360 layers use.
const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);

// A row counts as void-ish on an explicit flag too — reportEngine.isVoidRow
// alias set (void/voided/is_void/deleted + voided_date stamp).
const isVoidishInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return true;
  if (VOIDISH_STATUSES.has(norm(inv.status))) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
};
const isDraftInvoice = (inv: any): boolean => norm(inv?.status) === 'draft';

// Invoice paid amount in cents — w-63 invoicePaidCents chain: canonical
// amount_paid → paid_amount/total_paid aliases → payments[] row sum (voided
// entries skipped) → total − balance_due when only the snapshot exists.
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

// Invoice balance in cents — w-63 invoiceBalanceCents: server-stamped
// balance_due (or balance/amount_due alias) is authoritative; otherwise
// total − paid, floored at 0 (an overpaid invoice is not AR).
const invoiceBalanceCents = (inv: any): number => {
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, toCents(inv?.total) - invoicePaidCents(inv));
};

// The day the receivable was billed: issue_date → sent_date → created_date
// (statementBatch invoiceDay chain + sent_date — a sent invoice is billed).
const invoiceIssueDay = (inv: any): string =>
  toDay(inv?.issue_date) || toDay(inv?.sent_date) || toDay(inv?.created_date);

// --- buckets ---------------------------------------------------------------

// Canonical bucket keys — the w-63 arBucket() naming.
export const AR_AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type ArAgingBucket = (typeof AR_AGING_BUCKETS)[number];

export const AR_AGING_BUCKET_LABELS: Record<ArAgingBucket, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
};

// Column keys for the per-bucket money columns on rollup reports.
export const AR_AGING_BUCKET_FIELD: Record<ArAgingBucket, string> = {
  current: 'current',
  '1-30': 'b1_30',
  '31-60': 'b31_60',
  '61-90': 'b61_90',
  '90+': 'b90p',
};

/**
 * arAgingBucket — classify whole days past due into the canonical bucket.
 * Boundaries replicated exactly from completedVsPaidModel.arBucket (w-63):
 * ≤0 → current | ≤30 → '1-30' | ≤60 → '31-60' | ≤90 → '61-90' | else '90+'.
 * Non-finite input (undated) → 'current', matching every source.
 */
export function arAgingBucket(daysPastDue: any): ArAgingBucket {
  const days = num(daysPastDue, 0);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

// --- lookups -----------------------------------------------------------------

const normalizeCustomerMap = (input: any): Map<string, any> => {
  if (input instanceof Map) {
    const out = new Map<string, any>();
    for (const [k, v] of input) if (clean(k)) out.set(clean(k), v);
    return out;
  }
  const out = new Map<string, any>();
  if (Array.isArray(input)) {
    for (const c of input) if (isObj(c) && clean(c.id)) out.set(clean(c.id), c);
  } else if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) if (clean(k)) out.set(clean(k), v);
  }
  return out;
};

// Customer display name — statementBatch chain (company_name → name →
// company), then the invoice's frozen customer_display_name, then a stable
// placeholder so unnamed AR is still attributable on the report.
const customerNameFor = (inv: any, customersById: Map<string, any>): string => {
  const cust = customersById.get(clean(inv?.customer_id));
  for (const v of [cust?.company_name, cust?.name, cust?.company, inv?.customer_display_name]) {
    if (clean(v)) return clean(v);
  }
  return '(unassigned)';
};

// --- per-invoice rows ---------------------------------------------------------

/**
 * agingRows — per-open-invoice AR aging rows at an as-of date.
 *
 * @param invoices            Invoice entity rows (any superset is fine —
 *                            every read is defensive).
 * @param opts.asOf           'YYYY-MM-DD' | ISO | Date | epoch. Defaults to
 *                            today (UTC day). Buckets measure days past
 *                            due_date against this date.
 * @param opts.customersById  Customer lookup — Map, plain object keyed by
 *                            id, or Customer[]. opts.customers accepted as
 *                            an alias.
 * @returns [{invoice_id, number, customer_id, customer_name, salesperson,
 *            issue_date, due_date, total_cents, paid_cents, balance_cents,
 *            days_outstanding, days_past_due, bucket}]
 *          days_outstanding = whole days since the invoice was billed
 *          (issue_date→sent_date→created_date) at as-of; days_past_due =
 *          whole days past due_date (≥0; undated → 0) and drives `bucket`.
 *          Sorted days_past_due desc → balance_cents desc → number → id
 *          (the w-63 agingReportRows ordering).
 */
export function agingRows(invoices: any[] = [], opts: any = {}) {
  const asOf = toDay(opts?.asOf) || new Date().toISOString().slice(0, 10);
  const customersById = normalizeCustomerMap(opts?.customersById ?? opts?.customers);

  const rows: any[] = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv)) continue;
    if (isVoidishInvoice(inv) || isDraftInvoice(inv)) continue;
    const balance = invoiceBalanceCents(inv);
    if (balance <= 0) continue;

    const issued = invoiceIssueDay(inv);
    // Not yet billed at the as-of date — statementBatch `d > asOf` guard.
    if (issued && issued > asOf) continue;

    const dueDay = toDay(inv?.due_date);
    const pastDue = dueDay ? daysBetween(dueDay, asOf) : null;
    const daysPastDue = Math.max(0, pastDue ?? 0);
    const outstanding = issued ? daysBetween(issued, asOf) : null;

    rows.push({
      invoice_id: clean(inv.id),
      number: clean(inv.invoice_number) || clean(inv.number) || clean(inv.id),
      customer_id: clean(inv.customer_id),
      customer_name: customerNameFor(inv, customersById),
      salesperson: clean(inv.salesperson),
      issue_date: issued,
      due_date: dueDay,
      total_cents: toCents(inv.total),
      paid_cents: invoicePaidCents(inv),
      balance_cents: balance,
      days_outstanding: Math.max(0, outstanding ?? 0),
      days_past_due: daysPastDue,
      bucket: arAgingBucket(daysPastDue),
    });
  }
  rows.sort(
    (a, b) =>
      b.days_past_due - a.days_past_due ||
      b.balance_cents - a.balance_cents ||
      a.number.localeCompare(b.number) ||
      a.invoice_id.localeCompare(b.invoice_id)
  );
  return rows;
}

// --- aggregates ------------------------------------------------------------------

const emptyBucketSums = (): Record<ArAgingBucket, number> => ({
  current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
});

/**
 * bucketTotals — one report row per bucket (canonical order) + a totals
 * row. share_of_total is a 0–1 fraction (engine 'percent' column).
 * All money integer cents.
 */
export function bucketTotals(rows: any[] = []) {
  const list = Array.isArray(rows) ? rows : [];
  const sums = emptyBucketSums();
  const counts: Record<ArAgingBucket, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const r of list) {
    const b: ArAgingBucket = AR_AGING_BUCKETS.includes(r?.bucket) ? r.bucket : 'current';
    sums[b] += Math.round(num(r?.balance_cents));
    counts[b] += 1;
  }
  const total = AR_AGING_BUCKETS.reduce((s, b) => s + sums[b], 0);
  const outRows = AR_AGING_BUCKETS.map((b) => ({
    bucket: b,
    bucket_label: AR_AGING_BUCKET_LABELS[b],
    invoice_count: counts[b],
    balance_cents: sums[b],
    share_of_total: total > 0 ? sums[b] / total : 0,
  }));
  return {
    rows: outRows,
    totals: {
      bucket: 'total',
      bucket_label: 'Total',
      invoice_count: list.length,
      balance_cents: total,
      share_of_total: total > 0 ? 1 : 0,
    },
  };
}

// Shared rollup core: group rows by a key fn, sum per-bucket cents, keep
// the oldest days_past_due + invoice count. Returns {groups, totals} sorted
// total_cents desc → label asc → key asc (deterministic).
const rollup = (rows: any[], keyFn: (r: any) => string, labelFn: (r: any) => string) => {
  const groups = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const key = clean(keyFn(r)) || '(unassigned)';
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: clean(labelFn(r)) || key,
        invoice_count: 0,
        balance_cents: 0,
        buckets: emptyBucketSums(),
        oldest_days_past_due: 0,
        customer_ids: new Set<string>(),
      };
      groups.set(key, g);
    }
    const b: ArAgingBucket = AR_AGING_BUCKETS.includes(r?.bucket) ? r.bucket : 'current';
    const balance = Math.round(num(r?.balance_cents));
    g.buckets[b] += balance;
    g.balance_cents += balance;
    g.invoice_count += 1;
    g.oldest_days_past_due = Math.max(g.oldest_days_past_due, num(r?.days_past_due));
    if (clean(r?.customer_id)) g.customer_ids.add(clean(r.customer_id));
  }
  const list = [...groups.values()].sort(
    (a, b) =>
      b.balance_cents - a.balance_cents ||
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.key.localeCompare(b.key)
  );
  const grand = {
    invoice_count: 0,
    balance_cents: 0,
    buckets: emptyBucketSums(),
    oldest_days_past_due: 0,
    customer_ids: new Set<string>(),
  };
  for (const g of list) {
    grand.invoice_count += g.invoice_count;
    grand.balance_cents += g.balance_cents;
    grand.oldest_days_past_due = Math.max(grand.oldest_days_past_due, g.oldest_days_past_due);
    for (const b of AR_AGING_BUCKETS) grand.buckets[b] += g.buckets[b];
    for (const id of g.customer_ids) grand.customer_ids.add(id);
  }
  return { groups: list, grand };
};

/**
 * groupByCustomer — per-customer rollup of agingRows output.
 * Rows: {customer_id, customer_name, invoice_count, current, b1_30, b31_60,
 * b61_90, b90p (each integer cents), total_cents, share_of_total,
 * oldest_days_past_due}. Totals row mirrors the same shape with
 * customer_name 'Total'.
 */
export function groupByCustomer(rows: any[] = []) {
  const { groups, grand } = rollup(
    rows,
    (r) => clean(r?.customer_id) || clean(r?.customer_name),
    (r) => clean(r?.customer_name)
  );
  const shape = (g: any) => ({
    customer_id: g.key === '(unassigned)' ? '' : g.key,
    customer_name: g.label,
    invoice_count: g.invoice_count,
    current: g.buckets.current,
    b1_30: g.buckets['1-30'],
    b31_60: g.buckets['31-60'],
    b61_90: g.buckets['61-90'],
    b90p: g.buckets['90+'],
    total_cents: g.balance_cents,
    share_of_total: grand.balance_cents > 0 ? g.balance_cents / grand.balance_cents : 0,
    oldest_days_past_due: g.oldest_days_past_due,
  });
  return {
    rows: groups.map(shape),
    totals: {
      ...shape({
        key: '',
        label: 'Total',
        invoice_count: grand.invoice_count,
        balance_cents: grand.balance_cents,
        buckets: grand.buckets,
        oldest_days_past_due: grand.oldest_days_past_due,
      }),
      customer_id: '',
      customer_name: 'Total',
      share_of_total: grand.balance_cents > 0 ? 1 : 0,
    },
  };
}

/**
 * groupBySalesperson — per-rep rollup of agingRows output. Rows carry
 * customer_count alongside the by-customer shape; reps sort by total_cents
 * desc. Invoices with no salesperson group under '(unassigned)'.
 */
export function groupBySalesperson(rows: any[] = []) {
  const { groups, grand } = rollup(
    rows,
    (r) => clean(r?.salesperson),
    (r) => clean(r?.salesperson)
  );
  const shape = (g: any) => ({
    salesperson: g.label === '(unassigned)' ? '(unassigned)' : g.label,
    customer_count: g.customer_ids instanceof Set ? g.customer_ids.size : num(g.customer_count),
    customer_ids: g.customer_ids instanceof Set ? [...g.customer_ids] : [],
    invoice_count: g.invoice_count,
    current: g.buckets.current,
    b1_30: g.buckets['1-30'],
    b31_60: g.buckets['31-60'],
    b61_90: g.buckets['61-90'],
    b90p: g.buckets['90+'],
    total_cents: g.balance_cents,
    share_of_total: grand.balance_cents > 0 ? g.balance_cents / grand.balance_cents : 0,
    oldest_days_past_due: g.oldest_days_past_due,
  });
  return {
    rows: groups.map(shape),
    totals: {
      ...shape({
        key: '',
        label: 'Total',
        invoice_count: grand.invoice_count,
        balance_cents: grand.balance_cents,
        buckets: grand.buckets,
        oldest_days_past_due: grand.oldest_days_past_due,
        customer_count: grand.customer_ids.size,
      }),
      salesperson: 'Total',
      share_of_total: grand.balance_cents > 0 ? 1 : 0,
    },
  };
}

// --- report specs ---------------------------------------------------------------

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const pctCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'percent' });

const BUCKET_MONEY_COLUMNS = [
  moneyCol('current', 'Current'),
  moneyCol('b1_30', '1–30 Days'),
  moneyCol('b31_60', '31–60 Days'),
  moneyCol('b61_90', '61–90 Days'),
  moneyCol('b90p', 'Over 90 Days'),
];

// Param specs (engine types only — no bare 'date' type exists; as_of is a
// YYYY-MM-DD text param, blank = today).
const AS_OF_PARAM = {
  key: 'as_of',
  type: 'text',
  label: 'As-of Date',
  default: '',
};
const SALESPERSON_PARAM = {
  key: 'salesperson',
  type: 'text',
  label: 'Salesperson',
  default: '',
};
const CUSTOMER_PARAM = {
  key: 'customer',
  type: 'text',
  label: 'Customer',
  default: '',
};
const BUCKET_PARAM = {
  key: 'buckets',
  type: 'multiselect',
  label: 'Buckets',
  options: AR_AGING_BUCKETS.map((b) => ({ value: b, label: AR_AGING_BUCKET_LABELS[b] })),
  default: [] as string[],
};

// Resolved shared context for a run(): parsed as-of + filtered aging rows.
// data.invoices + data.customers are injected by the engine caller.
const agingContext = (params: any, data: any) => {
  const asOf = toDay(params?.as_of) || new Date().toISOString().slice(0, 10);
  const rows = agingRows(data?.invoices, {
    asOf,
    customersById: data?.customersById ?? data?.customers,
  });
  const rep = norm(params?.salesperson);
  const cust = norm(params?.customer);
  const wanted = new Set(
    (Array.isArray(params?.buckets) ? params.buckets : []).map(norm).filter((b: string) => b)
  );
  const filtered = rows.filter((r) => {
    if (rep && !norm(r.salesperson).includes(rep)) return false;
    if (cust && !(norm(r.customer_name).includes(cust) || norm(r.customer_id) === cust)) return false;
    if (wanted.size && !wanted.has(norm(r.bucket))) return false;
    return true;
  });
  return { asOf, rows, filtered };
};

const AR_AGING_DESCRIPTIONS: Record<string, string> = {
  ar_aging_summary:
    'Open AR bucketed by days past due at an as-of date — one row per bucket with invoice count, balance and share of total.',
  ar_aging_detail:
    'Every open-balance invoice with its billed date, due date, outstanding/past-due days and aging bucket.',
  ar_aging_by_customer:
    'Per-customer AR rollup — open balance split across the five aging buckets plus share of total AR.',
  ar_aging_by_salesperson:
    'Per-salesperson AR rollup — open balance split across the five aging buckets with customer and invoice counts.',
};

// run() adapters: model rows (integer cents) → report rows (money columns
// in dollars — engine format 'money'; *_cents keys preserved as extras).
const centsToMoneyCols = (obj: any, centsKeys: string[], outKey?: (k: string) => string) => {
  const out: any = { ...obj };
  for (const k of centsKeys) out[outKey ? outKey(k) : k.replace(/_cents$/, '')] = fromCents(obj[k]);
  return out;
};
// Rollup rows carry bucket sums under the report's own column keys
// (current/b1_30/b31_60/b61_90/b90p) in cents — convert those in place plus
// total_cents → total.
const BUCKET_COL_KEYS = ['current', 'b1_30', 'b31_60', 'b61_90', 'b90p'];
const rollupRowToDollars = (r: any) => {
  const out = centsToMoneyCols(r, ['total_cents'], () => 'total');
  for (const k of BUCKET_COL_KEYS) out[k] = fromCents(r[k]);
  return out;
};

export const AR_AGING_REPORTS = [
  {
    id: 'ar_aging_summary',
    name: 'AR Aging Summary',
    category: 'financial',
    description: AR_AGING_DESCRIPTIONS.ar_aging_summary,
    params: [AS_OF_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM],
    columns: [
      textCol('bucket_label', 'Bucket'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('balance', 'Balance'),
      pctCol('share_of_total', '% of Total'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = agingContext(params, data);
      const { rows } = bucketTotals(filtered);
      return {
        rows: rows.map((r) => ({
          ...centsToMoneyCols(r, ['balance_cents']),
          bucket: r.bucket,
        })),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        bucket_label: 'Total',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        balance: Math.round(rows.reduce((s, r) => s + num(r.balance), 0) * 100) / 100,
        share_of_total: rows.some((r) => num(r.balance) > 0) ? 1 : 0,
      },
    }),
  },
  {
    id: 'ar_aging_detail',
    name: 'AR Aging Detail',
    category: 'financial',
    description: AR_AGING_DESCRIPTIONS.ar_aging_detail,
    params: [AS_OF_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM, BUCKET_PARAM],
    columns: [
      textCol('number', 'Invoice'),
      textCol('customer_name', 'Customer'),
      textCol('salesperson', 'Salesperson'),
      dateCol('issue_date', 'Issued'),
      dateCol('due_date', 'Due'),
      moneyCol('total', 'Total'),
      moneyCol('balance', 'Balance'),
      intCol('days_outstanding', 'Days Outstanding'),
      intCol('days_past_due', 'Days Past Due'),
      textCol('bucket', 'Bucket'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = agingContext(params, data);
      return {
        rows: filtered.map((r) => ({
          ...centsToMoneyCols(r, ['total_cents', 'balance_cents']),
          bucket: r.bucket,
        })),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        number: `${rows.length} invoice${rows.length === 1 ? '' : 's'}`,
        total: Math.round(rows.reduce((s, r) => s + num(r.total), 0) * 100) / 100,
        balance: Math.round(rows.reduce((s, r) => s + num(r.balance), 0) * 100) / 100,
      },
    }),
  },
  {
    id: 'ar_aging_by_customer',
    name: 'AR Aging by Customer',
    category: 'financial',
    description: AR_AGING_DESCRIPTIONS.ar_aging_by_customer,
    params: [AS_OF_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      intCol('invoice_count', 'Invoices'),
      ...BUCKET_MONEY_COLUMNS,
      moneyCol('total', 'Total'),
      pctCol('share_of_total', '% of Total'),
      intCol('oldest_days_past_due', 'Oldest (Days)'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = agingContext(params, data);
      const { rows } = groupByCustomer(filtered);
      return {
        rows: rows.map((r) => ({
          ...rollupRowToDollars(r),
          customer_id: r.customer_id,
        })),
      };
    },
    summarize: (rows: any[]) => {
      const sum = (k: string) => Math.round(rows.reduce((s, r) => s + num(r[k]), 0) * 100) / 100;
      return {
        totals: {
          customer_name: 'Total',
          invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
          current: sum('current'),
          b1_30: sum('b1_30'),
          b31_60: sum('b31_60'),
          b61_90: sum('b61_90'),
          b90p: sum('b90p'),
          total: sum('total'),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
          oldest_days_past_due: rows.reduce((m, r) => Math.max(m, num(r.oldest_days_past_due)), 0),
        },
      };
    },
  },
  {
    id: 'ar_aging_by_salesperson',
    name: 'AR Aging by Salesperson',
    category: 'financial',
    description: AR_AGING_DESCRIPTIONS.ar_aging_by_salesperson,
    params: [AS_OF_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM],
    columns: [
      textCol('salesperson', 'Salesperson'),
      intCol('customer_count', 'Customers'),
      intCol('invoice_count', 'Invoices'),
      ...BUCKET_MONEY_COLUMNS,
      moneyCol('total', 'Total'),
      pctCol('share_of_total', '% of Total'),
      intCol('oldest_days_past_due', 'Oldest (Days)'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = agingContext(params, data);
      const { rows } = groupBySalesperson(filtered);
      return {
        rows: rows.map((r) => rollupRowToDollars(r)),
      };
    },
    summarize: (rows: any[]) => {
      const sum = (k: string) => Math.round(rows.reduce((s, r) => s + num(r[k]), 0) * 100) / 100;
      // Totals must count DISTINCT customers — summing per-rep counts
      // double-counts a customer who owes under two reps. Rollup rows carry
      // their customer_ids Set as a preserved extra for exactly this.
      const distinct = new Set<string>();
      for (const r of rows) {
        const ids = r?.customer_ids instanceof Set ? [...r.customer_ids]
          : Array.isArray(r?.customer_ids) ? r.customer_ids : [];
        for (const id of ids) if (clean(id)) distinct.add(clean(id));
      }
      const customerCount = distinct.size || rows.reduce((s, r) => s + num(r.customer_count), 0);
      return {
        totals: {
          salesperson: 'Total',
          customer_count: customerCount,
          invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
          current: sum('current'),
          b1_30: sum('b1_30'),
          b31_60: sum('b31_60'),
          b61_90: sum('b61_90'),
          b90p: sum('b90p'),
          total: sum('total'),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
          oldest_days_past_due: rows.reduce((m, r) => Math.max(m, num(r.oldest_days_past_due)), 0),
        },
      };
    },
  },
];

export const AR_AGING_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  AR_AGING_REPORTS.map((spec) => [spec.id, spec])
);
