// Monthly statement batch model — ESTIMATOR_MASTERPLAN WS-H / item H-08.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// The scheduled statement job works in three pure steps (no I/O anywhere in
// this module — the wiring layer loads rows, delivers, and persists):
//
//   1. statementPeriod({now, day_of_month}) → which month this run covers.
//   2. statementCandidates({customers, invoices, payments, period, now})
//      → per-customer contexts for every customer whose closing balance is
//        positive (completed/open AR). Zero-balance and credit-balance
//        customers are skipped — a statement with nothing owed is noise.
//   3. statementBatchPlan(candidates, {existingKeys}) → dedupe-checked rows
//      {customer_id, dedupe_key, context} ready for the delivery adapter
//      (H-01 delivery.ts) + Notification/statement-record writes.
//
// Period semantics — the "prior completed calendar month" convention from
// the spec ("statement for last month generated on the 1st"):
//   Generations run once a month on `day_of_month` (default 1; clamped to
//   the month's last day, so 31 still fires in February). A generation on
//   day N of month M covers calendar month M−1. statementPeriod returns the
//   period covered by the MOST RECENT scheduled generation at or before
//   `now`:
//     now.day_of_month >= effective generation day → month M−1
//     now.day_of_month <  effective generation day → month M−2 (the run
//       stamped for M−1 hasn't happened yet; nothing new is due — combined
//       with dedupe keys this makes a nightly sweep naturally idempotent).
//
// Money: all monetary outputs are INTEGER CENTS (12345 = $123.45). Inputs
// are dollar-denominated entity fields (Invoice.total, Payment.amount) and
// are converted exactly once via toCents — no float arithmetic ever touches
// the totals.
//
// Roll-forward identity (always exact):
//   closing_balance = opening_balance + invoiced − paid + adjustments
//   opening_balance — net AR before period_start (live invoices issued
//       < start minus live payments dated < start).
//   invoiced        — GROSS billed in period (all non-draft invoices issued
//       [start,end], including rows later voided/refunded).
//   paid            — GROSS received in period (all payments dated
//       [start,end], including rows later voided/refunded).
//   adjustments     — voided/refunded payment amounts minus voided/refunded
//       invoice totals inside the period. Signed; usually ≤ 0.
//   closing_balance — net AR at period end (equals Σ line_items − any
//       unapplied payment credit still on the account).
//
// Line items: every non-draft, non-void invoice with a remaining balance
// at the period end (carryover AR + new billings), sorted by issue date.
// Aging buckets days-past-due against the period end (as_of), matching the
// 5-bucket spec shape {current, b1_30, b31_60, b61_90, b90p}; invoices with
// no due_date are always current.
//
// Status conventions mirror src/components/statements/statementModel.js and
// invoicingAction: invoice statuses draft/sent/partially_paid/paid plus the
// VOIDISH set (void, refunded, cancelled, canceled); payment statuses
// recorded plus VOIDISH. Drafts never bill; voidish rows appear only inside
// gross components + adjustments — they never touch balances or line items.
//
// API:
//   statementPeriod({now, day_of_month?})            → {period_start, period_end, label}
//   customerStatementContext({customer, invoices, payments, period, now?})
//                                                    → per-customer statement context (cents)
//   statementCandidates({customers, invoices, payments, period, now})
//                                                    → [{customer, context, missing_email}]
//   statementDedupeKey(customer, period)             → 'stmt:<customer_id>:<period_start>'
//   statementBatchPlan(candidates, {existingKeys})   → [{customer_id, dedupe_key, context, missing_email}]
//   renderStatementSummary(context)                  → one-line internal-row summary
//   centsToMoney(cents)                              → '$1,234.56' formatter (shared w/ summary)

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Dollar field → integer cents. Strips currency decoration ('$', commas)
// defensively so imported CSV-shaped rows also parse. Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const DAY_MS = 86400000;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones (same rule as the
// statement model). Date instances and parseable strings fall back to UTC.
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

const daysInMonth = (year: number, monthIdx: number): number =>
  new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

const monthLabel = (year: number, monthIdx: number): string =>
  `${MONTH_NAMES[monthIdx]} ${year}`;

// Whole days between two 'YYYY-MM-DD' strings (UTC — DST-immune).
const daysBetween = (fromDay: string, toDayStr: string): number => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / DAY_MS);
};

// Statuses that erase a row's money effect (same set as statementModel):
// voided / refunded / cancelled invoices were never really billed; voided /
// refunded payments were never really received.
const VOIDISH = new Set(['void', 'refunded', 'cancelled', 'canceled']);
const isVoidish = (status: any) => VOIDISH.has(clean(status).toLowerCase());
const isDraft = (status: any) => clean(status).toLowerCase() === 'draft';

const invoiceDay = (inv: any) => toDay(inv?.issue_date || inv?.created_date);
const paymentDay = (p: any) => toDay(p?.paid_date || p?.created_date);
const paymentBelongsToInvoice = (p: any, inv: any) => {
  const pid = clean(p?.invoice_id);
  if (pid && clean(inv?.id) === pid) return true;
  const pnum = clean(p?.invoice_number);
  return Boolean(pnum) && clean(inv?.invoice_number) === pnum;
};

// Billing email resolution for statement delivery: billing-specific columns
// first (the statement is an AR document), then the customer's generic
// contact columns — same fallback set as invoicingAction.email_statement.
const resolveBillingEmail = (customer: any): string => {
  for (const k of ['billing_email', 'billing_contact_email', 'email', 'contact_email', 'primary_email']) {
    const v = clean(customer?.[k]);
    if (v) return v;
  }
  return '';
};

/**
 * statementPeriod — which calendar month the most recent scheduled
 * generation at or before `now` covers.
 *
 * @param arg.now           Date | 'YYYY-MM-DD' | ISO timestamp (defaults to
 *                          the current UTC day — callers pass it anyway).
 * @param arg.day_of_month  Scheduled generation day (default 1). Clamped to
 *                          [1,31] and to the length of `now`'s month, so a
 *                          configured '31' still fires on Feb 28/29.
 * @returns {period_start, period_end} 'YYYY-MM-DD' inclusive bounds +
 *          label 'October 2026' (matches the monthly_statement template's
 *          {{statement.period}} placeholder).
 */
export function statementPeriod({ now, day_of_month }: any = {}) {
  const day = toDay(now) || new Date().toISOString().slice(0, 10);
  const year = Number(day.slice(0, 4));
  const monthIdx = Number(day.slice(5, 7)) - 1; // 0-based
  const dayOfMonth = Number(day.slice(8, 10));

  const requested = Math.floor(num(day_of_month, 1));
  const clamped = Math.min(31, Math.max(1, requested));
  const effective = Math.min(clamped, daysInMonth(year, monthIdx));

  // The generation due this month has already fired → it covered month-1.
  // Otherwise the latest completed generation ran last month → month-2.
  const back = dayOfMonth >= effective ? 1 : 2;
  const total = year * 12 + monthIdx - back;
  const py = Math.floor(total / 12);
  const pm = total - py * 12;
  const start = `${String(py).padStart(4, '0')}-${String(pm + 1).padStart(2, '0')}-01`;
  const end = `${start.slice(0, 8)}${String(daysInMonth(py, pm)).padStart(2, '0')}`;
  return { period_start: start, period_end: end, label: monthLabel(py, pm) };
}

/**
 * customerStatementContext — the full per-customer statement payload.
 *
 * @param arg.customer  Customer entity row (id, company_name/name, *_email).
 * @param arg.invoices  Invoice rows for this customer (pre-filtered or not —
 *                      rows belonging to other customers are ignored).
 * @param arg.payments  Payment rows (applied to invoices by invoice_id or
 *                      invoice_number; unapplied rows still credit the acct).
 * @param arg.period    {period_start, period_end} from statementPeriod, or
 *                      a bare 'YYYY-MM-DD' as-of date. Missing start → the
 *                      statement covers the customer's whole history
 *                      (opening_balance 0); missing end → `now`/today.
 * @param arg.now       As-of fallback when period_end is absent.
 * @returns context object (see header). Every *_balance/invoiced/paid/
 *          adjustments/aging/line_items money field is INTEGER CENTS.
 */
export function customerStatementContext({ customer, invoices, payments, period, now }: any = {}) {
  const cust = isObj(customer) ? customer : {};
  const custId = clean(cust.id);
  const p = isObj(period) ? period : { period_end: toDay(period) };
  const start = toDay(p.period_start) || '0000-01-01';
  const asOf = toDay(p.period_end) || toDay(now) || new Date().toISOString().slice(0, 10);
  const label = clean(p.label);

  // Scope rows to this customer. Invoices need an exact customer_id (a row
  // with no owner is never attributed to a batch customer — attributing it
  // everywhere would duplicate charges). Payments qualify either by their
  // own customer_id or by linking to one of the customer's invoices.
  const belongs = (row: any) => Boolean(custId) && clean(row?.customer_id) === custId;
  const custInvoices = (Array.isArray(invoices) ? invoices : []).filter((r) => r && belongs(r));
  const byId = new Map(custInvoices.map((i) => [clean(i.id), i]).filter(([k]) => k));
  const byNumber = new Map(custInvoices.map((i) => [clean(i.invoice_number), i]).filter(([k]) => k));
  const custPayments = (Array.isArray(payments) ? payments : []).filter(
    (r) =>
      r &&
      (belongs(r) ||
        byId.has(clean(r?.invoice_id)) ||
        byNumber.has(clean(r?.invoice_number)))
  );

  // Opening balance: live (non-draft, non-voidish) issued < start minus
  // live payments dated < start. Voidish rows never exist for AR purposes.
  let opening = 0;
  for (const inv of custInvoices) {
    const d = invoiceDay(inv);
    if (!d || d >= start) continue;
    if (isDraft(inv.status) || isVoidish(inv.status)) continue;
    opening += toCents(inv.total);
  }
  for (const pay of custPayments) {
    const d = paymentDay(pay);
    if (!d || d >= start) continue;
    if (isVoidish(pay.status)) continue;
    opening -= toCents(pay.amount);
  }

  // In-period gross components + the adjustment back-out. Voidish rows are
  // counted in gross then reversed through `adjustments`, so the
  // roll-forward identity stays exact and corrections stay visible.
  let invoiced = 0;
  let paid = 0;
  let adjustments = 0;
  for (const inv of custInvoices) {
    const d = invoiceDay(inv);
    if (!d || d < start || d > asOf) continue;
    if (isDraft(inv.status)) continue;
    const cents = toCents(inv.total);
    invoiced += cents;
    if (isVoidish(inv.status)) adjustments -= cents;
  }
  for (const pay of custPayments) {
    const d = paymentDay(pay);
    if (!d || d < start || d > asOf) continue;
    const cents = toCents(pay.amount);
    paid += cents;
    if (isVoidish(pay.status)) adjustments += cents;
  }
  const closing = opening + invoiced - paid + adjustments;

  // Open items at as-of: every live invoice issued ≤ as-of with a positive
  // remainder after linked live payments ≤ as-of.
  const line_items: any[] = [];
  for (const inv of custInvoices) {
    const d = invoiceDay(inv);
    if (!d || d > asOf) continue;
    if (isDraft(inv.status) || isVoidish(inv.status)) continue;
    const total = toCents(inv.total);
    const applied = custPayments
      .filter((pay) => !isVoidish(pay.status))
      .filter((pay) => {
        const pd = paymentDay(pay);
        return pd && pd <= asOf;
      })
      .filter((pay) => paymentBelongsToInvoice(pay, inv))
      .reduce((s, pay) => s + toCents(pay.amount), 0);
    const balance = total - applied;
    if (balance <= 0) continue;
    line_items.push({
      invoice_id: clean(inv.id),
      invoice_number: clean(inv.invoice_number),
      date: d,
      due_date: toDay(inv.due_date),
      total,
      paid: applied,
      balance,
    });
  }
  line_items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.invoice_number.localeCompare(b.invoice_number) ||
      a.invoice_id.localeCompare(b.invoice_id)
  );

  // Aging: days past due_date relative to as-of. No due date → current.
  const aging = { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
  for (const item of line_items) {
    const daysPastDue = item.due_date ? Math.max(0, daysBetween(item.due_date, asOf)) : 0;
    const bucket =
      daysPastDue <= 0 ? 'current'
      : daysPastDue <= 30 ? 'b1_30'
      : daysPastDue <= 60 ? 'b31_60'
      : daysPastDue <= 90 ? 'b61_90'
      : 'b90p';
    aging[bucket as keyof typeof aging] += item.balance;
  }

  return {
    customer_id: custId,
    company_name: clean(cust.company_name) || clean(cust.name) || clean(cust.company) || 'Customer',
    billing_email: resolveBillingEmail(cust),
    period_start: p.period_start ? start : '',
    period_end: asOf,
    period_label: label,
    as_of: asOf,
    opening_balance: opening,
    invoiced,
    paid,
    adjustments,
    closing_balance: closing,
    line_items,
    aging,
  };
}

/**
 * statementCandidates — the customers a batch run should generate
 * statements for.
 *
 * Filters (spec): closing_balance > 0 keeps only customers with a
 * completed/open balance — zero-balance and credit-balance customers are
 * skipped. A customer with no billing email is NOT excluded: the delivery
 * adapter may still route the statement to the smartsheet/internal lane, so
 * the row stays with `missing_email: true` for the report/skip decision.
 *
 * @returns [{customer, context, missing_email}] sorted by company name
 *          (then customer_id) so batch output order is deterministic.
 */
export function statementCandidates({ customers, invoices, payments, period, now }: any = {}) {
  const rows = Array.isArray(customers) ? customers : [];
  const out: any[] = [];
  for (const cust of rows) {
    if (!isObj(cust) || !clean(cust.id)) continue; // unkeyable — can't dedupe or address
    const context = customerStatementContext({ customer: cust, invoices, payments, period, now });
    if (context.closing_balance <= 0) continue; // zero-balance skipped (spec)
    out.push({
      customer: cust,
      context,
      missing_email: !context.billing_email.includes('@'),
    });
  }
  out.sort(
    (a, b) =>
      a.context.company_name.toLowerCase().localeCompare(b.context.company_name.toLowerCase()) ||
      a.context.customer_id.localeCompare(b.context.customer_id)
  );
  return out;
}

/**
 * statementDedupeKey — idempotency key stamped on generated statement
 * records (Notification rows / Statement entities / sent-log entries) so a
 * rerun of the same period can never double-deliver.
 */
export function statementDedupeKey(customer: any, period: any): string {
  const custId = clean(customer?.id ?? customer);
  const start = toDay(period?.period_start ?? period);
  return `stmt:${custId}:${start}`;
}

/**
 * statementBatchPlan — dedupe-checked generation rows.
 *
 * @param candidates         statementCandidates() output.
 * @param opts.existingKeys  dedupe keys already generated for this period —
 *                           Set, array, or object map (from previously
 *                           persisted statement rows).
 * @returns [{customer_id, dedupe_key, context, missing_email}] — rows to
 *          render + deliver. Keys already in existingKeys, or emitted
 *          earlier in this same plan (duplicate customer rows), are skipped.
 */
export function statementBatchPlan(candidates: any, { existingKeys }: any = {}) {
  const seen = new Set<string>();
  if (existingKeys instanceof Set) {
    for (const k of existingKeys) seen.add(clean(k));
  } else if (Array.isArray(existingKeys)) {
    for (const k of existingKeys) seen.add(clean(k));
  } else if (isObj(existingKeys)) {
    for (const k of Object.keys(existingKeys)) if (existingKeys[k]) seen.add(clean(k));
  }

  const plan: any[] = [];
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    if (!isObj(cand)) continue;
    const context = isObj(cand.context) ? cand.context : {};
    const dedupe_key = statementDedupeKey(cand.customer, {
      period_start: context.period_start,
    });
    // Skip unkeyable rows (no customer id or no period bound) and keys
    // already generated — in the persisted set or earlier in this plan.
    if (dedupe_key.endsWith(':') || seen.has(dedupe_key)) continue;
    seen.add(dedupe_key);
    plan.push({
      customer_id: context.customer_id || clean(cand.customer?.id),
      dedupe_key,
      context,
      missing_email: cand.missing_email === true,
    });
  }
  return plan;
}

// Integer cents → '$1,234.56' (negative → '-$1,234.56').
export function centsToMoney(cents: any): string {
  const c = Math.round(num(cents));
  const sign = c < 0 ? '-' : '';
  const dollars = Math.abs(c) / 100;
  return `${sign}$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const AGING_LABELS: [string, string][] = [
  ['current', 'current'],
  ['b1_30', '1-30d'],
  ['b31_60', '31-60d'],
  ['b61_90', '61-90d'],
  ['b90p', '>90d'],
];

/**
 * renderStatementSummary — one-line text summary of a statement context,
 * used for the internal Notification/activity row (the `message` field the
 * delivery adapter writes so staff see what went out):
 *   "Acme Sign Co — October 2026 statement: 3 open invoices · $1,234.56 due
 *    (invoiced $2,000.00, paid $765.44) — aging current $1,000.00 / 31-60d $234.56"
 */
export function renderStatementSummary(context: any): string {
  const ctx = isObj(context) ? context : {};
  const company = clean(ctx.company_name) || 'Customer';
  const period = clean(ctx.period_label) || (clean(ctx.as_of) ? `as of ${clean(ctx.as_of)}` : 'account');
  const items = Array.isArray(ctx.line_items) ? ctx.line_items : [];
  const count = items.length;
  const parts = [
    `${company} — ${period} statement: ${count} open invoice${count === 1 ? '' : 's'}`,
    `${centsToMoney(ctx.closing_balance)} due`,
    `(invoiced ${centsToMoney(ctx.invoiced)}, paid ${centsToMoney(ctx.paid)}${num(ctx.adjustments) ? `, adjustments ${centsToMoney(ctx.adjustments)}` : ''})`,
  ];
  const aging = isObj(ctx.aging) ? ctx.aging : {};
  const buckets = AGING_LABELS.filter(([k]) => num(aging[k]) > 0).map(
    ([k, lbl]) => `${lbl} ${centsToMoney(aging[k])}`
  );
  if (buckets.length) parts.push(`— aging ${buckets.join(' / ')}`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
