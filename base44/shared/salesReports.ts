// Sales report pack — ESTIMATOR_MASTERPLAN WS-J / item J-05 (w-106 slice).
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Six report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   sales_by_customer          — billed-invoice totals per customer + contacts
//   billing_locale             — billed-invoice totals per billing city/state/zip
//   sales_by_salesperson       — per-rep totals + count + avg; optional month /
//                                month×year crosstab columns (param monthly)
//   sales_by_entered_by        — per-clerk totals (entered_by chain)
//   sales_by_income_account    — GL income rollup over income_account_splits
//   sales_by_product_category  — line_items category rollup
//
// SALES_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads
// data.invoices / data.customers / data.contacts / data.income_accounts
// only — the engine owns data injection.
//
// ── Basis semantics ──────────────────────────────────────────────────────
//   'created'   — the invoice was billed inside the period. Basis day chain:
//                 invoice_date → issue_date → date → created_date (the
//                 accountingExportModel.invoiceDateOf chain, I-08).
//   'completed' — the invoice reached paid-in-full / closed inside the
//                 period. Basis day chain: paid_in_full_date → paid_date →
//                 closed_date → completed_date → close_date (invoicingAction
//                 stamps paid_date the day status hits 'paid'). An invoice
//                 with NO completion day never counts on this basis — even
//                 under an unbounded range (it was never completed).
//   The engine's third basis 'built' is a work-order concept — invoices
//   carry no built date, so every spec here restricts the date_basis param
//   to created|completed. A raw 'built' reaching run() directly (param
//   resolution is the engine's job) degrades to 'created'.
//
// ── Membership (which invoices are "sales") ──────────────────────────────
//   • status NOT 'draft' — a draft never billed (arAgingReports convention).
//   • void-ish rows follow the void_policy param (exclude|include|only —
//     same ladder as engine VOID_POLICIES): void-ish = status in
//     {void, refunded, cancelled, canceled} or void-ish flags
//     (void/voided/is_void/deleted, voided_date) — the J-03/J-04 alias set.
//   • basis day ∈ [from,to] — bounded ranges drop undated rows; a fully
//     unbounded range keeps undated rows on 'created' (they exist but
//     attribute to no month — they land in totals, not in month cells),
//     while 'completed' always requires a parseable completion day.
//
// ── Attribution chains ───────────────────────────────────────────────────
//   salesperson : invoice.salesperson → customer.salesperson → '(unassigned)'
//   entered_by  : invoice.entered_by → invoice.created_by → '(unassigned)'
//   customer    : customersById(customer_id) → customer_display_name →
//                 '(unassigned)'
//   contact     : CustomerContact rows for the customer (data.contacts;
//                 lowest id wins = primary) → member invoice's contact_id
//                 row → customer's contact_* flats → billing_contact_* → ''
//   locale      : invoice.billing_{city,state,postal_code[_ext]} block →
//                 customer.billing_* → customer.location_* (block-level
//                 fallback — J-04 phoneAddressRows rule: location only fills
//                 when billing carries nothing)
//   income acct : invoice.income_account_splits[] STORAGE rows
//                 {income_account_code, amount} — amount in signed DOLLARS
//                 (glSplitModel storage contract). An invoice with no usable
//                 splits posts its whole income base to '' (unmapped) so the
//                 report still foots to billed income — the
//                 glSplitModel/accountingExportModel "never dropped" rule.
//   category    : line spellings category → product_category →
//                 part_category → item_category → category_name → group →
//                 '(uncategorized)'
//
// ── Money ────────────────────────────────────────────────────────────────
//   Model layer is integer cents end-to-end (toCents → int sums → no float
//   dust, statementBatch/arAging convention). run() converts cents →
//   dollars once at the report boundary because engine column format
//   'money' expects dollar values. Report rows keep *_cents extras — the
//   engine preserves extra row keys for drilldowns.
//   NOTE: sales_by_income_account and sales_by_product_category foot to the
//   INCOME base (pre-tax splits / line totals), not invoice.total — their
//   grand totals intentionally differ from the invoice-total reports
//   whenever tax or discounts exist. The other four specs reconcile to
//   invoice.total exactly.
//
// ── Crosstab (sales_by_salesperson, param monthly) ──────────────────────
//   'none'       — flat per-rep rollup (default).
//   'month'      — one row per rep; dynamic m01..m12 money columns hold the
//                  rep's basis-day totals per calendar month across the
//                  whole period (all years merged — "just month totals").
//   'month_year' — month×year crosstab: one row per rep PER YEAR (years as
//                  rows inside each rep group); the same m01..m12 columns
//                  split that year's months. Rep groups order by period
//                  total desc, years ascending inside.
//   run() returns {rows, columns} so the engine picks up the dynamic month
//   columns — the J-01 documented crosstab path. `monthly` is a select
//   param; run() also tolerates raw spellings for direct callers
//   (true/'true'/'yes'/'1' → 'month', 'monthyear'/'month-year'/'year' →
//   'month_year').
//
// API:
//   SALES_DATE_BASIS / MONTHLY_MODES / MONTHS / LOCALE_GROUP_LEVELS
//   salesInvoiceRows(invoices, opts)         — per-invoice normalized rows
//   groupByCustomer / groupByLocale / groupBySalesperson / groupByEnteredBy
//   incomeAccountRows / productCategoryRows  — split/line rollups
//   invoiceCreatedDay / invoiceCompletedDay  — basis-day chains
//   incomeBaseCents / monthlyModeOf          — shared helpers
//   SALES_REPORTS / SALES_REPORTS_BY_ID      — 6 engine-ready specs

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
// epoch millis contribute their UTC calendar date (statementBatch/toDay).
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

const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// --- lookups ---------------------------------------------------------------

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

// CustomerContact rows grouped by customer_id — each customer keeps its
// lowest-id contact as the primary (deterministic; a dedicated primary flag
// wins first when a contact carries is_primary/primary === true).
const indexContactsByCustomer = (input: any): Map<string, any> => {
  const rows = input instanceof Map ? [...input.values()]
    : Array.isArray(input) ? input
    : isObj(input) ? Object.values(input)
    : [];
  const live = rows.filter((r: any) => isObj(r) && r.deleted !== true);
  live.sort((a: any, b: any) => clean(a.id).localeCompare(clean(b.id)));
  const out = new Map<string, any>();
  for (const c of live) {
    const cid = clean(c.customer_id);
    if (!cid) continue;
    const cur = out.get(cid);
    if (!cur) out.set(cid, c);
    else if ((c.is_primary === true || c.primary === true) && !(cur.is_primary === true || cur.primary === true)) {
      out.set(cid, c);
    }
  }
  return out;
};

// Customer display name — statementBatch chain (company_name → name →
// company), then a contact name, then the invoice's frozen display name is
// applied by the caller; '(unnamed)' only inside this helper.
const customerDisplayName = (c: any): string => {
  for (const v of [c?.company_name, c?.name, c?.company]) {
    if (clean(v)) return clean(v);
  }
  const contact = [clean(c?.contact_first_name), clean(c?.contact_last_name)]
    .filter(Boolean)
    .join(' ');
  return contact || '(unnamed)';
};

// Text `customer` param: name substring (case-insensitive) OR exact id —
// the customerReports/agingContext rule.
const matchesCustomer = (
  text: string,
  { id, name }: { id: string; name: string },
): boolean => {
  const t = norm(text);
  if (!t) return true;
  return norm(name).includes(t) || norm(id) === t;
};

// --- invoice membership + basis days ----------------------------------------

export const SALES_DATE_BASIS = ['created', 'completed'] as const;
export type SalesDateBasis = (typeof SALES_DATE_BASIS)[number];

// Statuses that erase a row's money effect — statementBatchModel.VOIDISH,
// same set the AR/customer packs use. Fed through the void_policy ladder.
const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);

const isVoidishInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return true;
  if (VOIDISH_STATUSES.has(norm(inv.status))) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
};
const isDraftInvoice = (inv: any): boolean => norm(inv?.status) === 'draft';

/**
 * invoiceCreatedDay — 'created' basis day: the day the invoice was billed.
 * Chain invoice_date → issue_date → date → created_date — the
 * accountingExportModel.invoiceDateOf chain (I-08), restated for zero-import.
 */
export function invoiceCreatedDay(inv: any): string {
  return toDay(inv?.invoice_date) || toDay(inv?.issue_date) || toDay(inv?.date) || toDay(inv?.created_date);
}

/**
 * invoiceCompletedDay — 'completed' basis day: the day the invoice reached
 * paid-in-full / closed. Chain paid_in_full_date → paid_date → closed_date
 * → completed_date → close_date (invoicingAction stamps paid_date when
 * status hits 'paid'; imports carry paid_in_full/closed spellings).
 */
export function invoiceCompletedDay(inv: any): string {
  return (
    toDay(inv?.paid_in_full_date) ||
    toDay(inv?.paid_date) ||
    toDay(inv?.closed_date) ||
    toDay(inv?.completed_date) ||
    toDay(inv?.close_date)
  );
}

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

// --- contact + locale resolution ---------------------------------------------

// Contact display name from a CustomerContact row (display_name →
// first+last → name/email local part is NOT invented — name fields only).
const contactRowName = (c: any): string =>
  firstText(c?.display_name, [clean(c?.first_name), clean(c?.last_name)].filter(Boolean).join(' '), c?.name);

// {contact_name, contact_email, contact_phone} for a customer group.
// Order: customer's primary CustomerContact row → member invoice's
// contact_id row → customer's contact_* flats → billing_contact_* → ''.
const contactFieldsFor = (cust: any, primary: any, invoiceContact: any) => {
  const row = primary || invoiceContact || null;
  const name =
    contactRowName(row) ||
    [clean(cust?.contact_first_name), clean(cust?.contact_last_name)].filter(Boolean).join(' ') ||
    clean(cust?.billing_contact_name);
  const email = firstText(row?.email, cust?.contact_email, cust?.billing_contact_email);
  const phone = firstText(row?.phone, row?.mobile_phone, cust?.company_phone, cust?.contact_office_phone, cust?.contact_cell_phone);
  return { contact_name: name, contact_email: email, contact_phone: phone };
};

// Billing city/state/postal for one invoice. Block-level fallback:
// invoice.billing_* → customer.billing_* → customer.location_* — a block
// only fills when it carries at least one component (J-04 addr() rule).
const BILLING_FIELDS = ['city', 'state', 'postal_code'] as const;

const localeBlock = (row: any, prefix: string) => {
  const city = clean(row?.[`${prefix}city`]);
  const state = clean(row?.[`${prefix}state`]);
  const postal = firstText(
    row?.[`${prefix}postal_code`],
    row?.[`${prefix}zip`],
    row?.[`${prefix}postal`],
  );
  const ext = clean(row?.[`${prefix}postal_ext`]);
  return {
    city,
    state,
    postal_code: ext ? [postal, ext].filter(Boolean).join('-') : postal,
    any: Boolean(city || state || postal),
  };
};

const invoiceLocale = (inv: any, cust: any) => {
  for (const block of [
    localeBlock(inv, 'billing_'),
    localeBlock(cust, 'billing_'),
    localeBlock(cust, 'location_'),
  ]) {
    if (block.any) return { city: block.city, state: block.state, postal_code: block.postal_code };
  }
  return { city: '', state: '', postal_code: '' };
};

// --- income splits (glSplitModel storage contract, restated) -----------------

const firstStr = (row: any, keys: string[]): string => {
  if (!isObj(row)) return '';
  for (const key of keys) {
    const v = clean(row[key]);
    if (v) return v;
  }
  return '';
};

// Signed fee cents: 'discount' kind coerced negative; other kinds keep sign
// (glSplitModel/orderFees parity).
const feeAmountCents = (fee: any): number => {
  const amount = num(fee?.amount, 0);
  const kind = norm(fee?.kind);
  const signed = kind === 'discount' && amount > 0 ? -amount : amount;
  return Math.round(signed * 100);
};

/**
 * incomeBaseCents — the pre-tax income total splits foot to, in integer
 * cents: subtotal − discount_amount + Σ signed fee_lines.amount
 * (glSplitModel.incomeBaseCents parity). tax_amount is a liability, not
 * income; deposit/credit/payment applications are not revenue either.
 */
export function incomeBaseCents(invoice: any): number {
  const inv = isObj(invoice) ? invoice : {};
  let cents = toCents(inv.subtotal) - Math.max(0, toCents(inv.discount_amount));
  if (Array.isArray(inv.fee_lines)) {
    for (const fee of inv.fee_lines) cents += feeAmountCents(fee);
  }
  return cents;
}

const SPLIT_ACCOUNT_KEYS = [
  'income_account_code', 'account_code', 'account_id', 'income_account_id',
  'income_account', 'gl_account_code', 'gl_account', 'code',
];

// Normalize one stored split row → {account_code, amount_cents} — storage
// amount is DOLLARS (glSplitModel.SplitStorageRow); a rich row carrying
// integer amount_cents is tolerated too (accountingExportModel parity).
const normalizeSplitRow = (row: any): { account_code: string; amount_cents: number } | null => {
  if (!isObj(row)) return null;
  const account = firstStr(row, SPLIT_ACCOUNT_KEYS);
  let cents: number;
  if (Number.isFinite(Number(row.amount_cents))) {
    cents = Math.round(Number(row.amount_cents));
  } else {
    cents = toCents(row.amount);
  }
  return { account_code: account, amount_cents: cents };
};

// Splits for one invoice: normalized stored income_account_splits[]; when
// none are usable the whole income base posts to '' (unmapped) — never
// dropped (accountingExportModel splitsForInvoice fallback). A zero-base
// invoice with no splits contributes no rows (nothing to post).
const splitsForInvoice = (inv: any): Array<{ account_code: string; amount_cents: number }> => {
  const stored = (Array.isArray(inv?.income_account_splits) ? inv.income_account_splits : [])
    .map(normalizeSplitRow)
    .filter(Boolean) as Array<{ account_code: string; amount_cents: number }>;
  if (stored.length) return stored;
  const base = incomeBaseCents(inv);
  return base !== 0 ? [{ account_code: '', amount_cents: base }] : [];
};

// --- line-item helpers --------------------------------------------------------

// Line amount in cents: line_total → amount → total → extended_price →
// quantity × unit_price (glSplitModel.lineAmountCents chain).
const LINE_AMOUNT_KEYS = ['line_total', 'amount', 'total', 'extended_price'];
const lineAmountCents = (line: any): number => {
  for (const key of LINE_AMOUNT_KEYS) {
    const n = Number(line?.[key]);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  const qty = Number(line?.quantity);
  const unit = Number(line?.unit_price);
  if (Number.isFinite(qty) && Number.isFinite(unit)) return Math.round(qty * unit * 100);
  return 0;
};

const LINE_CATEGORY_KEYS = [
  'category', 'product_category', 'part_category', 'item_category',
  'category_name', 'line_category', 'group',
];

// --- per-invoice normalized rows ----------------------------------------------

/**
 * salesInvoiceRows — one normalized row per member invoice (membership =
 * non-draft, void_policy applied, basis day in [from,to]).
 *
 * @param invoices  Invoice entity rows (any superset — every read is
 *                  defensive).
 * @param opts.basis        'created'|'completed' (default 'created').
 * @param opts.from/to      'YYYY-MM-DD' inclusive bounds ('' = unbounded).
 * @param opts.voidPolicy   'exclude'|'include'|'only' (default 'exclude').
 * @param opts.customersById Map | {id:row} | Customer[] (alias: customers).
 * @param opts.contactsById  Map | {id:row} | CustomerContact[] used for
 *                           invoice.contact_id resolution; opts.contacts /
 *                           opts.customer_contacts are aliases. The same
 *                           list also seeds the per-customer primary
 *                           contact (lowest id).
 * @returns rows: {invoice_id, number, status, customer_id, customer_name,
 *          contact_name/email/phone, salesperson, entered_by,
 *          city/state/postal_code (billing locale), basis fields
 *          day/created_day/completed_day/month/year/month_num,
 *          subtotal_cents/discount_cents/tax_cents/total_cents/
 *          paid_cents/balance_cents, splits[], line_items[],
 *          customer (row ref), voidish}
 *          Sorted day asc → number → id (deterministic).
 */
export function salesInvoiceRows(invoices: any[] = [], opts: any = {}) {
  const customersById = indexById(opts?.customersById ?? opts?.customers);
  const contactsInput = opts?.contactsById ?? opts?.contacts ?? opts?.customer_contacts;
  const contactsById = indexById(contactsInput);
  const contactsByCustomer = indexContactsByCustomer(contactsInput);
  const basis: SalesDateBasis = norm(opts?.basis) === 'completed' ? 'completed' : 'created';
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const voidPolicy = norm(opts?.voidPolicy ?? opts?.void_policy) || 'exclude';

  const rows: any[] = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv)) continue;
    if (isDraftInvoice(inv)) continue; // a draft never billed — not a sale
    const voidish = isVoidishInvoice(inv);
    if (voidPolicy === 'exclude' && voidish) continue;
    if (voidPolicy === 'only' && !voidish) continue;

    const created = invoiceCreatedDay(inv);
    const completed = invoiceCompletedDay(inv);
    // 'completed' membership REQUIRES a completion day — an invoice that
    // never completed is not a completed sale, even unbounded.
    if (basis === 'completed' && !completed) continue;
    const day = basis === 'completed' ? completed : created;
    if (!dayInRange(day, from, to)) continue;

    const cid = clean(inv.customer_id);
    const cust = cid ? customersById.get(cid) || null : null;
    const invoiceContact = contactsById.get(clean(inv.contact_id)) || null;
    const primary = cust ? contactsByCustomer.get(cid) || null : null;
    const contact = contactFieldsFor(cust, primary, invoiceContact);
    const locale = invoiceLocale(inv, cust);

    rows.push({
      invoice_id: clean(inv.id),
      number: firstText(inv.invoice_number, inv.number, inv.id),
      status: norm(inv.status),
      customer_id: cust ? cid : '',
      customer_name: cust ? customerDisplayName(cust) : firstText(inv.customer_display_name, inv.customer_name, '(unassigned)'),
      ...contact,
      salesperson: firstText(inv.salesperson, cust?.salesperson),
      entered_by: firstText(inv.entered_by, inv.created_by),
      ...locale,
      basis,
      day,
      created_day: created,
      completed_day: completed,
      month: day ? day.slice(0, 7) : '',
      year: day ? day.slice(0, 4) : '',
      month_num: day ? num(day.slice(5, 7)) : 0,
      subtotal_cents: toCents(inv.subtotal),
      discount_cents: Math.max(0, toCents(inv.discount_amount)),
      tax_cents: toCents(inv.tax_amount),
      total_cents: toCents(inv.total),
      paid_cents: invoicePaidCents(inv),
      balance_cents: invoiceBalanceCents(inv),
      splits: splitsForInvoice(inv),
      line_items: Array.isArray(inv.line_items) ? inv.line_items : [],
      fee_lines: Array.isArray(inv.fee_lines) ? inv.fee_lines : [],
      customer: cust,
      contact_row: invoiceContact || primary || null,
      voidish,
    });
  }
  rows.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.number.localeCompare(b.number) ||
      a.invoice_id.localeCompare(b.invoice_id),
  );
  return rows;
}

// --- rollup core ---------------------------------------------------------------

// Shared group-by: {key,label,invoice_count,total_cents,paid_cents,
// customer_ids:Set, month_cents{m01..m12}, years:Map<year,{...}>}.
// Sorted total_cents desc → label asc → key asc (deterministic).
const UNASSIGNED = '(unassigned)';

const emptyMonthCents = (): Record<string, number> => ({
  m01: 0, m02: 0, m03: 0, m04: 0, m05: 0, m06: 0,
  m07: 0, m08: 0, m09: 0, m10: 0, m11: 0, m12: 0,
});

const salesRollup = (rows: any[], keyFn: (r: any) => string, labelFn: (r: any) => string) => {
  const groups = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const key = clean(keyFn(r)) || UNASSIGNED;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: clean(labelFn(r)) || key,
        invoice_count: 0,
        total_cents: 0,
        paid_cents: 0,
        balance_cents: 0,
        customer_ids: new Set<string>(),
        month_cents: emptyMonthCents(),
        years: new Map<string, any>(),
        first_day: '',
        last_day: '',
        _rows: [] as any[],
      };
      groups.set(key, g);
    }
    const total = Math.round(num(r?.total_cents));
    g.invoice_count += 1;
    g.total_cents += total;
    g.paid_cents += Math.round(num(r?.paid_cents));
    g.balance_cents += Math.round(num(r?.balance_cents));
    if (clean(r?.customer_id)) g.customer_ids.add(clean(r.customer_id));
    if (r?.day && (!g.first_day || r.day < g.first_day)) g.first_day = r.day;
    if (r?.day && r.day > g.last_day) g.last_day = r.day;
    g._rows.push(r);

    const mKey = `m${pad2(num(r?.month_num))}`;
    const year = clean(r?.year);
    if (r?.day && mKey in g.month_cents) g.month_cents[mKey] += total;
    if (year) {
      let y = g.years.get(year);
      if (!y) {
        y = { year, invoice_count: 0, total_cents: 0, month_cents: emptyMonthCents(), customer_ids: new Set<string>() };
        g.years.set(year, y);
      }
      y.invoice_count += 1;
      y.total_cents += total;
      if (r?.day && mKey in y.month_cents) y.month_cents[mKey] += total;
      if (clean(r?.customer_id)) y.customer_ids.add(clean(r.customer_id));
    }
  }
  const list = [...groups.values()].sort(
    (a, b) =>
      b.total_cents - a.total_cents ||
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.key.localeCompare(b.key),
  );
  const grand = {
    invoice_count: 0,
    total_cents: 0,
    paid_cents: 0,
    balance_cents: 0,
    customer_ids: new Set<string>(),
    month_cents: emptyMonthCents(),
  };
  for (const g of list) {
    grand.invoice_count += g.invoice_count;
    grand.total_cents += g.total_cents;
    grand.paid_cents += g.paid_cents;
    grand.balance_cents += g.balance_cents;
    for (const k of Object.keys(grand.month_cents)) grand.month_cents[k] += g.month_cents[k];
    for (const id of g.customer_ids) grand.customer_ids.add(id);
  }
  return { groups: list, grand };
};

const shareOf = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

// --- report-level groupings -----------------------------------------------------

/**
 * groupByCustomer — per-customer sales rollup: {customer_id, customer_name,
 * contact_name/email/phone, salesperson, invoice_count, total_cents,
 * avg_invoice_cents, share_of_total, first_invoice_day, last_invoice_day}.
 * Sorted total desc → name.
 */
export function groupByCustomer(rows: any[] = []) {
  const { groups, grand } = salesRollup(
    rows,
    (r) => clean(r?.customer_id) || clean(r?.customer_name),
    (r) => clean(r?.customer_name),
  );
  const shape = (g: any) => {
    // Member invoice rows already carry resolved contact fields — the
    // group's contact = first member row with any contact data (rows are
    // day-asc deterministic), falling back to the customer record itself.
    const custRow = g._rows.map((r: any) => r?.customer).find(Boolean);
    const contactRow = g._rows.map((r: any) => r?.contact_row).find(Boolean);
    const contact = contactFieldsFor(custRow, contactRow, null);
    const firstRow = g._rows.find((r: any) => clean(r?.contact_name) || clean(r?.contact_email) || clean(r?.contact_phone));
    return {
      // Group key may be a name/id fallback — the report's customer_id is
      // the first real member id (blank when no member resolved a customer).
      customer_id: firstText(...g._rows.map((r: any) => r?.customer_id)),
      customer_name: g.label,
      contact_name: clean(firstRow?.contact_name) || contact.contact_name,
      contact_email: clean(firstRow?.contact_email) || contact.contact_email,
      contact_phone: clean(firstRow?.contact_phone) || contact.contact_phone,
      salesperson: firstText(...g._rows.map((r: any) => r?.salesperson)),
      invoice_count: g.invoice_count,
      total_cents: g.total_cents,
      paid_cents: g.paid_cents,
      balance_cents: g.balance_cents,
      avg_invoice_cents: g.invoice_count > 0 ? g.total_cents / g.invoice_count : 0,
      share_of_total: shareOf(g.total_cents, grand.total_cents),
      first_invoice_day: g.first_day,
      last_invoice_day: g.last_day,
      customer_ids: g.customer_ids,
    };
  };
  return { rows: groups.map(shape), grand };
}

export const LOCALE_GROUP_LEVELS = ['state', 'city', 'zip'] as const;
export type LocaleGroupLevel = (typeof LOCALE_GROUP_LEVELS)[number];

// 'City, ST 45202' composite label — '(unknown)' when every component is
// blank (the single un-localed bucket).
const localeLabel = (city: string, state: string, postal: string): string => {
  const cityState = [city, state].filter(Boolean).join(', ');
  const tail = [cityState, postal].filter(Boolean).join(' ');
  return tail || '(unknown)';
};

/**
 * groupByLocale — sales rollup by billing locale.
 *   level 'zip'  → one group per distinct city|state|postal triple
 *   level 'city' → per city|state (zips merged)
 *   level 'state'→ per state (cities/zips merged)
 * Rows: {locale, city, state, postal_code, customer_count, invoice_count,
 * total_cents, avg_invoice_cents, share_of_total}. Blank components within
 * a level collapse into the '(unknown)' bucket.
 */
export function groupByLocale(rows: any[] = [], opts: any = {}) {
  const level: LocaleGroupLevel = (LOCALE_GROUP_LEVELS as readonly string[]).includes(norm(opts?.level ?? opts?.group_by))
    ? (norm(opts?.level ?? opts?.group_by) as LocaleGroupLevel)
    : 'zip';
  const keyFn = (r: any): string => {
    const city = norm(r?.city);
    const state = norm(r?.state);
    const postal = norm(r?.postal_code);
    if (level === 'state') return state;
    if (level === 'city') return `${city}|${state}`;
    return `${city}|${state}|${postal}`;
  };
  const { groups, grand } = salesRollup(rows, keyFn, (r) =>
    localeLabel(clean(r?.city), clean(r?.state), clean(r?.postal_code)),
  );
  const shape = (g: any) => {
    const repRow = g._rows[0] || {};
    const unknown = g.key === '' || g.key === UNASSIGNED;
    return {
      locale: unknown ? '(unknown)' : g.label,
      city: level === 'state' ? '' : unknown ? '' : clean(repRow.city),
      state: unknown ? '' : clean(repRow.state),
      postal_code: level === 'zip' && !unknown ? clean(repRow.postal_code) : '',
      customer_count: g.customer_ids.size,
      customer_ids: g.customer_ids,
      invoice_count: g.invoice_count,
      total_cents: g.total_cents,
      avg_invoice_cents: g.invoice_count > 0 ? g.total_cents / g.invoice_count : 0,
      share_of_total: shareOf(g.total_cents, grand.total_cents),
      level,
    };
  };
  return { rows: groups.map(shape), grand };
}

/**
 * groupBySalesperson — per-rep sales rollup: {salesperson, customer_count,
 * customer_ids:Set, invoice_count, total_cents, avg_invoice_cents,
 * share_of_total, month_cents{m01..m12}, years:Map<year,{invoice_count,
 * total_cents,month_cents,customer_ids}>}. month_cents buckets by the
 * BASIS day; undated rows (unbounded 'created' only) count in totals but
 * no month cell. Sorted total desc → name.
 */
export function groupBySalesperson(rows: any[] = []) {
  const { groups, grand } = salesRollup(
    rows,
    (r) => clean(r?.salesperson),
    (r) => clean(r?.salesperson),
  );
  const shape = (g: any) => ({
    salesperson: g.label === UNASSIGNED ? UNASSIGNED : g.label,
    customer_count: g.customer_ids.size,
    customer_ids: g.customer_ids,
    invoice_count: g.invoice_count,
    total_cents: g.total_cents,
    paid_cents: g.paid_cents,
    balance_cents: g.balance_cents,
    avg_invoice_cents: g.invoice_count > 0 ? g.total_cents / g.invoice_count : 0,
    share_of_total: shareOf(g.total_cents, grand.total_cents),
    month_cents: g.month_cents,
    years: g.years,
    first_invoice_day: g.first_day,
    last_invoice_day: g.last_day,
  });
  return { rows: groups.map(shape), grand };
}

/**
 * groupByEnteredBy — per-clerk rollup on the entered_by chain:
 * {entered_by, customer_count, invoice_count, total_cents,
 * avg_invoice_cents, share_of_total, month_cents, years}.
 */
export function groupByEnteredBy(rows: any[] = []) {
  const { groups, grand } = salesRollup(
    rows,
    (r) => clean(r?.entered_by),
    (r) => clean(r?.entered_by),
  );
  const shape = (g: any) => ({
    entered_by: g.label === UNASSIGNED ? UNASSIGNED : g.label,
    customer_count: g.customer_ids.size,
    customer_ids: g.customer_ids,
    invoice_count: g.invoice_count,
    total_cents: g.total_cents,
    avg_invoice_cents: g.invoice_count > 0 ? g.total_cents / g.invoice_count : 0,
    share_of_total: shareOf(g.total_cents, grand.total_cents),
    month_cents: g.month_cents,
    years: g.years,
  });
  return { rows: groups.map(shape), grand };
}

// Account display-name lookup — {code: row|name} map or IncomeAccount[]
// ({code|id → row, name|account_name|display_name}) — accountingExportModel
// makeAccountNameLookup, restated.
const ACCOUNT_ID_KEYS = ['code', 'id', 'account_code', 'account_id', 'income_account_code'];
const ACCOUNT_NAME_KEYS = ['name', 'account_name', 'display_name', 'label'];
const accountNameLookup = (source: any): ((code: string) => string) => {
  if (!source) return () => '';
  if (isObj(source) && !(source instanceof Map)) {
    const direct = source as Record<string, any>;
    return (code: string) => {
      const v = direct[code];
      if (typeof v === 'string') return clean(v);
      if (isObj(v)) return firstStr(v, ACCOUNT_NAME_KEYS);
      return '';
    };
  }
  const rows = source instanceof Map ? [...source.values()] : Array.isArray(source) ? source : [];
  return (code: string) => {
    for (const row of rows) {
      if (!isObj(row)) continue;
      for (const key of ACCOUNT_ID_KEYS) {
        if (clean(row[key]) === code) return firstStr(row, ACCOUNT_NAME_KEYS);
      }
    }
    return '';
  };
};

/**
 * incomeAccountRows — GL income rollup across member invoices' normalized
 * splits: {account_code ('' shown as '(unmapped)'), account_name,
 * invoice_count (distinct invoices posting to the account), split_count,
 * total_cents, share_of_total}. Foots to Σ splits = billed income base.
 * Sorted total desc → code.
 */
export function incomeAccountRows(invoiceRows: any[] = [], opts: any = {}) {
  const nameFor = accountNameLookup(opts?.accountsByCode ?? opts?.income_accounts ?? opts?.accounts);
  const groups = new Map<string, any>();
  let grand = 0;
  for (const r of Array.isArray(invoiceRows) ? invoiceRows : []) {
    if (!isObj(r)) continue;
    for (const s of Array.isArray(r.splits) ? r.splits : []) {
      const code = clean(s?.account_code);
      const key = code || UNASSIGNED;
      let g = groups.get(key);
      if (!g) {
        g = { key, account_code: code, account_name: '', invoice_ids: new Set<string>(), split_count: 0, total_cents: 0 };
        groups.set(key, g);
      }
      g.total_cents += Math.round(num(s?.amount_cents));
      g.split_count += 1;
      if (clean(r.invoice_id)) g.invoice_ids.add(clean(r.invoice_id));
      grand += Math.round(num(s?.amount_cents));
    }
  }
  const rows = [...groups.values()].map((g) => ({
    account_code: g.account_code,
    account_label: g.account_code || '(unmapped)',
    account_name: nameFor(g.account_code),
    invoice_count: g.invoice_ids.size,
    invoice_ids: g.invoice_ids,
    split_count: g.split_count,
    total_cents: g.total_cents,
    share_of_total: shareOf(g.total_cents, grand),
  }));
  rows.sort(
    (a, b) =>
      b.total_cents - a.total_cents ||
      a.account_label.toLowerCase().localeCompare(b.account_label.toLowerCase()),
  );
  return { rows, grand_total_cents: grand };
}

/**
 * productCategoryRows — line_items category rollup across member invoices:
 * {category, line_count, invoice_count (distinct), quantity, total_cents,
 * share_of_total}. Foots to Σ line totals (pre-tax merchandise revenue —
 * fee_lines and flat discounts live outside line_items by design).
 * Sorted total desc → category.
 */
export function productCategoryRows(invoiceRows: any[] = []) {
  const groups = new Map<string, any>();
  let grand = 0;
  for (const r of Array.isArray(invoiceRows) ? invoiceRows : []) {
    if (!isObj(r)) continue;
    for (const line of Array.isArray(r.line_items) ? r.line_items : []) {
      if (!isObj(line)) continue;
      const cat = firstStr(line, LINE_CATEGORY_KEYS) || '(uncategorized)';
      let g = groups.get(cat);
      if (!g) {
        g = { category: cat, line_count: 0, invoice_ids: new Set<string>(), quantity: 0, total_cents: 0 };
        groups.set(cat, g);
      }
      g.total_cents += lineAmountCents(line);
      g.quantity += num(line.quantity);
      g.line_count += 1;
      if (clean(r.invoice_id)) g.invoice_ids.add(clean(r.invoice_id));
      grand += lineAmountCents(line);
    }
  }
  const rows = [...groups.values()].map((g) => ({
    category: g.category,
    line_count: g.line_count,
    invoice_count: g.invoice_ids.size,
    invoice_ids: g.invoice_ids,
    quantity: Math.round(g.quantity * 100) / 100,
    total_cents: g.total_cents,
    share_of_total: shareOf(g.total_cents, grand),
  }));
  rows.sort(
    (a, b) =>
      b.total_cents - a.total_cents ||
      a.category.toLowerCase().localeCompare(b.category.toLowerCase()),
  );
  return { rows, grand_total_cents: grand };
}

// === report specs =============================================================

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const pctCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'percent' });
const numCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'num1' });

// Param specs (engine types only — PARAM_TYPES =
// date_range|date_basis|select|multiselect|boolean|text|number).
const DATE_BASIS_PARAM = {
  key: 'date_basis',
  type: 'date_basis',
  label: 'Date Basis',
  options: [...SALES_DATE_BASIS],
  default: 'created',
};
const DATE_RANGE_PARAM = {
  key: 'date_range',
  type: 'date_range',
  label: 'Date Range',
  default: 'this_month',
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
const VOID_PARAM = {
  key: 'void_policy',
  type: 'select',
  label: 'Void Handling',
  options: ['exclude', 'include', 'only'],
  default: 'exclude',
};

export const MONTHLY_MODES = ['none', 'month', 'month_year'] as const;
export type MonthlyMode = (typeof MONTHLY_MODES)[number];

const MONTHLY_PARAM = {
  key: 'monthly',
  type: 'select',
  label: 'Monthly View',
  options: [
    { value: 'none', label: 'Totals only' },
    { value: 'month', label: 'By month' },
    { value: 'month_year', label: 'Month × year' },
  ],
  default: 'none',
};

const LOCALE_GROUP_PARAM = {
  key: 'group_by',
  type: 'select',
  label: 'Group By',
  options: [
    { value: 'zip', label: 'City / State / Zip' },
    { value: 'city', label: 'City & State' },
    { value: 'state', label: 'State' },
  ],
  default: 'zip',
};

// Calendar-month crosstab columns — keys m01..m12 so a leading zero never
// collides with numeric-looking keys.
export const MONTHS: Array<[string, string]> = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'],
  ['05', 'May'], ['06', 'Jun'], ['07', 'Jul'], ['08', 'Aug'],
  ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
];
const MONTH_MONEY_COLUMNS = MONTHS.map(([k, label]) => moneyCol(`m${k}`, label));

/**
 * monthlyModeOf — normalize the `monthly` param/flag:
 * 'month_year' spellings (monthyear|month-year|month×year|year) →
 * 'month_year'; 'month'-ish + boolean-ish truthy (true|'true'|'yes'|'1' —
 * the brief's `monthly:true` spelling) → 'month'; everything else → 'none'.
 */
export function monthlyModeOf(v: any): MonthlyMode {
  if (v === true) return 'month';
  const s = norm(v);
  if (['month_year', 'monthyear', 'month-year', 'month×year', 'month_x_year', 'year'].includes(s)) return 'month_year';
  if (['month', 'months', 'monthly', 'true', 'yes', '1', 'on'].includes(s)) return 'month';
  return 'none';
}

// Resolved shared context: filtered member-invoice rows + bounds echo.
const salesContext = (params: any, data: any) => {
  const { from, to } = rangeBounds(params?.date_range);
  const rows = salesInvoiceRows(data?.invoices, {
    basis: params?.date_basis,
    from,
    to,
    voidPolicy: params?.void_policy,
    customersById: data?.customersById ?? data?.customers,
    contactsById: data?.contactsById ?? data?.contacts ?? data?.customer_contacts,
  });
  const rep = norm(params?.salesperson);
  const cust = clean(params?.customer);
  const filtered = rows.filter(
    (r) =>
      (!rep || norm(r.salesperson).includes(rep)) &&
      matchesCustomer(cust, { id: r.customer_id, name: r.customer_name }),
  );
  return { rows, filtered, from, to };
};

// run() adapters: model rows (integer cents) → report rows (money columns
// in dollars — engine format 'money'; *_cents keys preserved as extras).
const centsToMoneyCols = (obj: any, centsKeys: string[], outKey?: (k: string) => string) => {
  const out: any = { ...obj };
  for (const k of centsKeys) out[outKey ? outKey(k) : k.replace(/_cents$/, '')] = fromCents(obj[k]);
  return out;
};

const sumMoney = (rows: any[], key: string) =>
  Math.round(rows.reduce((s, r) => s + num(r[key]), 0) * 100) / 100;

const avgMoney = (rows: any[]) => {
  const total = sumMoney(rows, 'total');
  return rows.length ? Math.round((total / rows.length) * 100) / 100 : 0;
};

const SALES_REPORT_DESCRIPTIONS: Record<string, string> = {
  sales_by_customer:
    'Sales by customer for the period — billed-invoice totals per customer with primary-contact name, email and phone, invoice count, average invoice and share of sales.',
  billing_locale:
    'Sales by billing locale — billed-invoice totals grouped by billing city/state/zip (or rolled up to city or state) taken from the invoice, then customer billing, then customer location address.',
  sales_by_salesperson:
    'Sales by salesperson — billed-invoice totals, count and average per credited rep on a created or completed basis; optional by-month or month×year crosstab columns.',
  sales_by_entered_by:
    'Sales by entered-by — billed-invoice totals, count and average per staff member who entered the originating order.',
  sales_by_income_account:
    'Sales by income account — GL income from invoice income_account_splits grouped per account code (pre-tax revenue; unmapped lines post to (unmapped)).',
  sales_by_product_category:
    'Sales by product category — invoice line_items rolled up per category with line count, quantity, invoice coverage and share of line-total sales.',
};

export const SALES_REPORTS = [
  {
    id: 'sales_by_customer',
    name: 'Sales by Customer',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.sales_by_customer,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM, VOID_PARAM],
    columns: [
      textCol('customer_name', 'Customer'),
      textCol('contact_name', 'Contact'),
      textCol('contact_email', 'Email'),
      textCol('contact_phone', 'Phone'),
      textCol('salesperson', 'Salesperson'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('total', 'Total Sales'),
      moneyCol('avg_invoice', 'Avg Invoice'),
      pctCol('share_of_total', '% of Sales'),
      dateCol('first_invoice_day', 'First Invoice'),
      dateCol('last_invoice_day', 'Last Invoice'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = groupByCustomer(filtered);
      return {
        rows: rows.map((r) => ({
          ...centsToMoneyCols(r, ['total_cents', 'paid_cents', 'balance_cents', 'avg_invoice_cents'], (k) =>
            k === 'avg_invoice_cents' ? 'avg_invoice' : k.replace(/_cents$/, ''),
          ),
          first_invoice_day: r.first_invoice_day || null,
          last_invoice_day: r.last_invoice_day || null,
        })),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        customer_name: 'Total',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        salesperson: '',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        total: sumMoney(rows, 'total'),
        avg_invoice: avgMoney(rows),
        share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
        first_invoice_day: '',
        last_invoice_day: '',
      },
    }),
  },
  {
    id: 'billing_locale',
    name: 'Sales by Billing Locale',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.billing_locale,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, LOCALE_GROUP_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM, VOID_PARAM],
    columns: [
      textCol('locale', 'Locale'),
      textCol('city', 'City'),
      textCol('state', 'State'),
      textCol('postal_code', 'Postal Code'),
      intCol('customer_count', 'Customers'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('total', 'Total Sales'),
      moneyCol('avg_invoice', 'Avg Invoice'),
      pctCol('share_of_total', '% of Sales'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = groupByLocale(filtered, { level: params?.group_by });
      return {
        rows: rows.map((r) => ({
          ...centsToMoneyCols(r, ['total_cents', 'avg_invoice_cents'], (k) =>
            k === 'avg_invoice_cents' ? 'avg_invoice' : k.replace(/_cents$/, ''),
          ),
          postal_code: r.postal_code || null,
          city: r.city || null,
          state: r.state || null,
        })),
      };
    },
    summarize: (rows: any[]) => {
      const distinct = new Set<string>();
      for (const r of rows) {
        const ids = r?.customer_ids instanceof Set ? [...r.customer_ids]
          : Array.isArray(r?.customer_ids) ? r.customer_ids : [];
        for (const id of ids) if (clean(id)) distinct.add(clean(id));
      }
      const customerCount = distinct.size || rows.reduce((s, r) => s + num(r.customer_count), 0);
      return {
        totals: {
          locale: 'Total',
          city: '',
          state: '',
          postal_code: '',
          customer_count: customerCount,
          invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
          total: sumMoney(rows, 'total'),
          avg_invoice: avgMoney(rows),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
        },
      };
    },
  },
  {
    id: 'sales_by_salesperson',
    name: 'Sales by Salesperson',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.sales_by_salesperson,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, MONTHLY_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM, VOID_PARAM],
    columns: [
      textCol('salesperson', 'Salesperson'),
      intCol('customer_count', 'Customers'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('total', 'Total Sales'),
      moneyCol('avg_invoice', 'Avg Invoice'),
      pctCol('share_of_total', '% of Sales'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = groupBySalesperson(filtered);
      const mode = monthlyModeOf(params?.monthly);
      const baseShape = (r: any) =>
        centsToMoneyCols(r, ['total_cents', 'paid_cents', 'balance_cents', 'avg_invoice_cents'], (k) =>
          k === 'avg_invoice_cents' ? 'avg_invoice' : k.replace(/_cents$/, ''),
        );
      const monthDollars = (monthCents: any) => {
        const out: any = {};
        for (const [k] of MONTHS) out[`m${k}`] = fromCents(monthCents?.[`m${k}`]);
        return out;
      };

      if (mode === 'month') {
        return {
          columns: [
            textCol('salesperson', 'Salesperson'),
            intCol('invoice_count', 'Invoices'),
            ...MONTH_MONEY_COLUMNS,
            moneyCol('total', 'Total Sales'),
            moneyCol('avg_invoice', 'Avg Invoice'),
          ],
          rows: rows.map((r) => ({
            ...baseShape(r),
            ...monthDollars(r.month_cents),
          })),
        };
      }

      if (mode === 'month_year') {
        const outRows: any[] = [];
        for (const g of rows) {
          const years = g.years instanceof Map ? [...g.years.values()] : [];
          years.sort((a: any, b: any) => a.year.localeCompare(b.year));
          for (const y of years) {
            outRows.push({
              salesperson: g.salesperson,
              year: y.year,
              customer_count: y.customer_ids instanceof Set ? y.customer_ids.size : 0,
              customer_ids: y.customer_ids,
              invoice_count: y.invoice_count,
              ...monthDollars(y.month_cents),
              total: fromCents(y.total_cents),
              total_cents: y.total_cents,
              avg_invoice: y.invoice_count > 0 ? Math.round(y.total_cents / y.invoice_count) / 100 : 0,
              share_of_total: g.share_of_total,
            });
          }
          // Undated contributions (unbounded 'created' basis) surface as a
          // trailing '(undated)' year row so the crosstab still foots.
          const datedCount = years.reduce((s: number, y: any) => s + y.invoice_count, 0);
          const datedTotal = years.reduce((s: number, y: any) => s + y.total_cents, 0);
          if (g.invoice_count > datedCount) {
            outRows.push({
              salesperson: g.salesperson,
              year: '(undated)',
              customer_count: 0,
              invoice_count: g.invoice_count - datedCount,
              ...monthDollars(null),
              total: fromCents(g.total_cents - datedTotal),
              total_cents: g.total_cents - datedTotal,
              avg_invoice:
                g.invoice_count - datedCount > 0
                  ? Math.round((g.total_cents - datedTotal) / (g.invoice_count - datedCount)) / 100
                  : 0,
              share_of_total: g.share_of_total,
            });
          }
        }
        return {
          columns: [
            textCol('salesperson', 'Salesperson'),
            textCol('year', 'Year'),
            intCol('customer_count', 'Customers'),
            intCol('invoice_count', 'Invoices'),
            ...MONTH_MONEY_COLUMNS,
            moneyCol('total', 'Total Sales'),
            moneyCol('avg_invoice', 'Avg Invoice'),
          ],
          rows: outRows,
        };
      }

      return {
        rows: rows.map((r) => ({
          ...baseShape(r),
          month_cents: r.month_cents,
        })),
      };
    },
    summarize: (rows: any[]) => {
      const totals: any = {
        salesperson: 'Total',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        total: sumMoney(rows, 'total'),
        avg_invoice: avgMoney(rows),
      };
      if (rows.some((r) => r.year !== undefined)) totals.year = '';
      if (rows.some((r) => r.customer_count !== undefined)) {
        const distinct = new Set<string>();
        for (const r of rows) {
          const ids = r?.customer_ids instanceof Set ? [...r.customer_ids]
            : Array.isArray(r?.customer_ids) ? r.customer_ids : [];
          for (const id of ids) if (clean(id)) distinct.add(clean(id));
        }
        totals.customer_count = distinct.size || rows.reduce((s, r) => s + num(r.customer_count), 0);
      }
      if (rows.some((r) => r.m01 !== undefined)) {
        for (const [k] of MONTHS) totals[`m${k}`] = sumMoney(rows, `m${k}`);
      }
      totals.share_of_total = rows.some((r) => num(r.total) > 0) ? 1 : 0;
      return { totals };
    },
  },
  {
    id: 'sales_by_entered_by',
    name: 'Sales by Entered By',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.sales_by_entered_by,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM, VOID_PARAM],
    columns: [
      textCol('entered_by', 'Entered By'),
      intCol('customer_count', 'Customers'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('total', 'Total Sales'),
      moneyCol('avg_invoice', 'Avg Invoice'),
      pctCol('share_of_total', '% of Sales'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = groupByEnteredBy(filtered);
      return {
        rows: rows.map((r) =>
          centsToMoneyCols(r, ['total_cents', 'avg_invoice_cents'], (k) =>
            k === 'avg_invoice_cents' ? 'avg_invoice' : k.replace(/_cents$/, ''),
          ),
        ),
      };
    },
    summarize: (rows: any[]) => {
      const distinct = new Set<string>();
      for (const r of rows) {
        const ids = r?.customer_ids instanceof Set ? [...r.customer_ids]
          : Array.isArray(r?.customer_ids) ? r.customer_ids : [];
        for (const id of ids) if (clean(id)) distinct.add(clean(id));
      }
      return {
        totals: {
          entered_by: 'Total',
          customer_count: distinct.size || rows.reduce((s, r) => s + num(r.customer_count), 0),
          invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
          total: sumMoney(rows, 'total'),
          avg_invoice: avgMoney(rows),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
        },
      };
    },
  },
  {
    id: 'sales_by_income_account',
    name: 'Sales by Income Account',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.sales_by_income_account,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM, VOID_PARAM],
    columns: [
      textCol('account_label', 'Account'),
      textCol('account_name', 'Account Name'),
      intCol('invoice_count', 'Invoices'),
      intCol('split_count', 'Splits'),
      moneyCol('total', 'Income'),
      pctCol('share_of_total', '% of Income'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = incomeAccountRows(filtered, {
        accountsByCode:
          data?.accountsByCode ?? data?.income_accountsByCode ?? data?.income_accounts ?? data?.accounts,
      });
      return {
        rows: rows.map((r) => ({
          ...centsToMoneyCols(r, ['total_cents']),
          account_code: r.account_code || null,
        })),
      };
    },
    summarize: (rows: any[]) => {
      // Distinct invoices — an invoice posting to two accounts counts in
      // both rows but once in the total (same rule as distinct customers).
      const distinct = new Set<string>();
      for (const r of rows) {
        const ids = r?.invoice_ids instanceof Set ? [...r.invoice_ids]
          : Array.isArray(r?.invoice_ids) ? r.invoice_ids : [];
        for (const id of ids) if (clean(id)) distinct.add(clean(id));
      }
      return {
        totals: {
          account_label: 'Total',
          account_name: '',
          invoice_count: distinct.size || rows.reduce((s, r) => s + num(r.invoice_count), 0),
          split_count: rows.reduce((s, r) => s + num(r.split_count), 0),
          total: sumMoney(rows, 'total'),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
        },
      };
    },
  },
  {
    id: 'sales_by_product_category',
    name: 'Sales by Product Category',
    category: 'sales',
    description: SALES_REPORT_DESCRIPTIONS.sales_by_product_category,
    params: [DATE_RANGE_PARAM, DATE_BASIS_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM, VOID_PARAM],
    columns: [
      textCol('category', 'Category'),
      intCol('line_count', 'Lines'),
      numCol('quantity', 'Qty'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('total', 'Sales'),
      pctCol('share_of_total', '% of Sales'),
    ],
    run: (params: any, data: any) => {
      const { filtered } = salesContext(params, data);
      const { rows } = productCategoryRows(filtered);
      return {
        rows: rows.map((r) => centsToMoneyCols(r, ['total_cents'])),
      };
    },
    summarize: (rows: any[]) => {
      const distinct = new Set<string>();
      for (const r of rows) {
        const ids = r?.invoice_ids instanceof Set ? [...r.invoice_ids]
          : Array.isArray(r?.invoice_ids) ? r.invoice_ids : [];
        for (const id of ids) if (clean(id)) distinct.add(clean(id));
      }
      return {
        totals: {
          category: 'Total',
          line_count: rows.reduce((s, r) => s + num(r.line_count), 0),
          quantity: Math.round(rows.reduce((s, r) => s + num(r.quantity), 0) * 100) / 100,
          invoice_count: distinct.size || rows.reduce((s, r) => s + num(r.invoice_count), 0),
          total: sumMoney(rows, 'total'),
          share_of_total: rows.some((r) => num(r.total) > 0) ? 1 : 0,
        },
      };
    },
  },
];

export const SALES_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  SALES_REPORTS.map((spec) => [spec.id, spec]),
);
