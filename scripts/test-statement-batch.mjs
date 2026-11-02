import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-statement-batch.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/statementBatchModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  statementPeriod,
  customerStatementContext,
  statementCandidates,
  statementDedupeKey,
  statementBatchPlan,
  renderStatementSummary,
  centsToMoney,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// Fixtures — October 2026 statement period.
// Customer 1 carries carryover AR + in-period activity exercising every path:
// paid-in-full history, voided invoice, refunded payment, unapplied credit,
// drafts, post-period rows, foreign rows. All expected values in cents.
// ---------------------------------------------------------------------------
const PERIOD = { period_start: '2026-10-01', period_end: '2026-10-31', label: 'October 2026' };

const CUST1 = { id: 'c1', company_name: 'Acme Sign Co', billing_email: 'ap@acme.test' };
const CUST2 = { id: 'c2', company_name: 'Beta Works', email: 'pay@beta.test' }; // generic email fallback
const CUST3 = { id: 'c3', company_name: 'NoEmail LLC' };                        // no email at all
const CUST4 = { id: 'c4', company_name: 'Zero Bal Inc', billing_email: 'z@zero.test' };
const CUST5 = { id: 'c5', company_name: 'Credit Memo Co', billing_email: 'cm@credit.test' };
const CUST6 = { id: 'c6', company_name: 'Empty Corp', billing_email: 'e@empty.test' }; // no activity

const inv = (over = {}) => ({
  id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
  issue_date: '2026-10-01', due_date: '', total: 0, ...over,
});
const pay = (over = {}) => ({
  id: 'p?', invoice_id: '', invoice_number: '', customer_id: 'c1', status: 'recorded',
  paid_date: '2026-10-01', amount: 0, method: 'check', ...over,
});

const INVOICES = [
  // C1 carryover open items (issued before the period)
  inv({ id: 'a-mid',  invoice_number: 'INV-A-MID',  issue_date: '2026-07-01', due_date: '2026-08-01', total: 300 }),
  inv({ id: 'a-mid3', invoice_number: 'INV-A-MID3', issue_date: '2026-07-20', due_date: '2026-08-20', total: 150 }),
  inv({ id: 'a-mid2', invoice_number: 'INV-A-MID2', issue_date: '2026-08-10', due_date: '2026-09-15', total: 200 }),
  inv({ id: 'a-old',  invoice_number: 'INV-A-OLD',  issue_date: '2026-09-10', due_date: '2026-10-01', total: 1000 }),
  inv({ id: 'a-paid', invoice_number: 'INV-A-PAID', issue_date: '2026-09-01', due_date: '2026-09-15', total: 80 }),
  // C1 in-period activity
  inv({ id: 'a-oct',  invoice_number: 'INV-A-OCT',  issue_date: '2026-10-05', due_date: '2026-11-01', total: 500 }),
  inv({ id: 'a-void', invoice_number: 'INV-A-VOID', issue_date: '2026-10-07', due_date: '2026-10-09', total: 200, status: 'void' }),
  inv({ id: 'a-drft', invoice_number: 'INV-A-DRFT', issue_date: '2026-10-08', total: 9999, status: 'draft' }),
  inv({ id: 'a-nov',  invoice_number: 'INV-A-NOV',  issue_date: '2026-11-02', total: 777 }),
  // Other customers
  inv({ id: 'b-oct',  invoice_number: 'INV-B-OCT',  customer_id: 'c2', issue_date: '2026-10-10', due_date: '2026-11-01', total: 40 }),
  inv({ id: 'n-oct',  invoice_number: 'INV-N-OCT',  customer_id: 'c3', issue_date: '2026-10-11', due_date: '2026-10-15', total: 75.50 }),
  inv({ id: 'z-oct',  invoice_number: 'INV-Z-OCT',  customer_id: 'c4', issue_date: '2026-10-02', due_date: '2026-10-20', total: 100 }),
  inv({ id: 'm-oct',  invoice_number: 'INV-M-OCT',  customer_id: 'c5', issue_date: '2026-10-03', due_date: '2026-10-20', total: 100 }),
  inv({ id: 'x-oct',  invoice_number: 'INV-X-OCT',  customer_id: 'cx', issue_date: '2026-10-04', total: 500 }), // unknown customer
];

const PAYMENTS = [
  // C1 pre-period payments (opening balance side)
  pay({ id: 'p-old',  invoice_id: 'a-old',  paid_date: '2026-09-20', amount: 600 }),
  pay({ id: 'p-paid', invoice_id: 'a-paid', paid_date: '2026-09-25', amount: 80 }),
  // C1 in-period payments
  pay({ id: 'p-oct',  invoice_number: 'INV-A-OCT', paid_date: '2026-10-12', amount: 250 }), // number link, no id
  pay({ id: 'p-ref',  invoice_id: 'a-oct',  paid_date: '2026-10-15', amount: 100, status: 'refunded' }),
  pay({ id: 'p-cred', paid_date: '2026-10-20', amount: 50 }),                              // unapplied credit
  pay({ id: 'p-nov',  invoice_id: 'a-oct',  paid_date: '2026-11-03', amount: 5 }),         // post-period
  // Other customers
  pay({ id: 'z-pay',  invoice_id: 'z-oct', customer_id: 'c4', paid_date: '2026-10-20', amount: 100 }),
  pay({ id: 'm-pay',  invoice_id: 'm-oct', customer_id: 'c5', paid_date: '2026-10-21', amount: 120 }),
  pay({ id: 'x-pay',  invoice_id: 'x-oct', customer_id: 'cx', paid_date: '2026-10-05', amount: 10 }),
];

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const deep = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

// --- statementPeriod: default = prior calendar month -------------------------
{
  deep(statementPeriod({ now: '2026-11-02' }),
    { period_start: '2026-10-01', period_end: '2026-10-31', label: 'October 2026' });
  n += 1;
  eq(statementPeriod({ now: '2026-11-01' }).period_start, '2026-10-01', 'generated on the 1st');
  eq(statementPeriod({ now: '2026-10-15' }).label, 'September 2026', 'mid-month still covers prior month');
  // Year rollover: a January run covers December of the prior year.
  deep(statementPeriod({ now: '2027-01-05' }),
    { period_start: '2026-12-01', period_end: '2026-12-31', label: 'December 2026' });
  n += 1;
  // Date instances + ISO timestamps resolve to their UTC day.
  eq(statementPeriod({ now: new Date('2026-11-15T12:00:00Z') }).period_start, '2026-10-01');
  eq(statementPeriod({ now: '2026-11-15T23:59:59.999Z' }).period_start, '2026-10-01');
}

// --- statementPeriod: configurable generation day -----------------------------
{
  // Before the generation day the latest completed run was last month → M−2.
  eq(statementPeriod({ now: '2026-03-02', day_of_month: 5 }).label, 'January 2026',
    'before gen day → month before last');
  eq(statementPeriod({ now: '2026-03-05', day_of_month: 5 }).label, 'February 2026',
    'on gen day → prior month');
  // day_of_month clamps to the month's last day: 31 in February → the 28th.
  eq(statementPeriod({ now: '2026-02-20', day_of_month: 31 }).label, 'December 2025',
    'Feb 20 < effective 28 → month before last');
  eq(statementPeriod({ now: '2026-02-28', day_of_month: 31 }).label, 'January 2026',
    'Feb 28 = effective gen day → prior month');
  eq(statementPeriod({ now: '2024-02-29', day_of_month: 31 }).label, 'January 2024',
    'leap-year Feb 29 fires on day 29');
  // Out-of-range / junk day_of_month falls back to 1.
  eq(statementPeriod({ now: '2026-11-02', day_of_month: 0 }).period_start, '2026-10-01');
  eq(statementPeriod({ now: '2026-11-02', day_of_month: 'abc' }).period_start, '2026-10-01');
  eq(statementPeriod({ now: '2026-04-30', day_of_month: 31 }).label, 'March 2026',
    'Apr 30 = clamped gen day → prior month');
}

// --- customerStatementContext: cent-exact roll-forward ------------------------
{
  const ctx = customerStatementContext({
    customer: CUST1, invoices: INVOICES, payments: PAYMENTS, period: PERIOD,
  });
  eq(ctx.customer_id, 'c1');
  eq(ctx.company_name, 'Acme Sign Co');
  eq(ctx.billing_email, 'ap@acme.test');
  eq(ctx.period_start, '2026-10-01');
  eq(ctx.period_end, '2026-10-31');
  eq(ctx.period_label, 'October 2026');
  // opening = live issued < Oct (30000+15000+20000+100000+8000) − live paid < Oct (60000+8000)
  eq(ctx.opening_balance, 105000, 'opening: carryover invoices minus pre-period payments');
  // invoiced = gross non-draft issued in Oct (50000 + 20000 void) — drafts + Nov excluded
  eq(ctx.invoiced, 70000, 'invoiced gross includes the voided invoice');
  // paid = gross received in Oct (25000 + 10000 refunded + 5000 unapplied)
  eq(ctx.paid, 40000, 'paid gross includes refunded + unapplied payments');
  // adjustments = voided/refunded payments (10000) − voided invoices (20000)
  eq(ctx.adjustments, -10000, 'adjustments back out voided + refunded rows');
  eq(ctx.closing_balance, 125000, 'closing = opening + invoiced − paid + adjustments');
  eq(ctx.closing_balance, ctx.opening_balance + ctx.invoiced - ctx.paid + ctx.adjustments,
    'roll-forward identity holds');
}

// --- line_items: open items only, cent-exact, date-sorted ---------------------
{
  const ctx = customerStatementContext({
    customer: CUST1, invoices: INVOICES, payments: PAYMENTS, period: PERIOD,
  });
  eq(ctx.line_items.length, 5, 'voided/draft/post-period/fully-paid/foreign rows excluded');
  deep(ctx.line_items.map((l) => l.invoice_number),
    ['INV-A-MID', 'INV-A-MID3', 'INV-A-MID2', 'INV-A-OLD', 'INV-A-OCT'],
    'sorted by issue date');
  const oct = ctx.line_items.find((l) => l.invoice_number === 'INV-A-OCT');
  eq(oct.total, 50000);
  eq(oct.paid, 25000, 'refunded payment not applied; number-linked payment applied');
  eq(oct.balance, 25000);
  const old = ctx.line_items.find((l) => l.invoice_number === 'INV-A-OLD');
  eq(old.paid, 60000);
  eq(old.balance, 40000);
  const sumOpen = ctx.line_items.reduce((s, l) => s + l.balance, 0);
  eq(sumOpen, 130000, 'Σ open items');
  eq(sumOpen - ctx.closing_balance, 5000, 'closing = open items − unapplied credit');
}

// --- aging buckets -------------------------------------------------------------
{
  const ctx = customerStatementContext({
    customer: CUST1, invoices: INVOICES, payments: PAYMENTS, period: PERIOD,
  });
  deep(ctx.aging, {
    current: 25000,  // INV-A-OCT due 11-01 (not yet due)
    b1_30: 40000,    // INV-A-OLD due 10-01 → exactly 30 days
    b31_60: 20000,   // INV-A-MID2 due 09-15 → 46 days
    b61_90: 15000,   // INV-A-MID3 due 08-20 → 72 days
    b90p: 30000,     // INV-A-MID due 08-01 → 91 days
  });
  const bucketSum = Object.values(ctx.aging).reduce((s, v) => s + v, 0);
  eq(bucketSum, 130000, 'aging totals Σ open items');
  // Invoice with no due_date ages current; boundary 31 → b31_60.
  const ctx2 = customerStatementContext({
    customer: CUST2,
    invoices: [
      inv({ id: 'nb1', customer_id: 'c2', invoice_number: 'NB-1', issue_date: '2026-10-01', due_date: '', total: 10 }),
      inv({ id: 'nb2', customer_id: 'c2', invoice_number: 'NB-2', issue_date: '2026-08-01', due_date: '2026-09-30', total: 20 }),
    ],
    payments: [],
    period: PERIOD,
  });
  eq(ctx2.aging.current, 1000, 'no due_date → current');
  eq(ctx2.aging.b31_60, 2000, '31 days past due → b31_60');
}

// --- Cent-exact parsing --------------------------------------------------------
{
  const ctx = customerStatementContext({
    customer: CUST3,
    invoices: [inv({ id: 'ce1', customer_id: 'c3', invoice_number: 'CE-1', issue_date: '2026-10-01', total: '75.55' })],
    payments: [pay({ id: 'ce-p', customer_id: 'c3', paid_date: '2026-10-02', amount: '1,250.50' })],
    period: PERIOD,
  });
  eq(ctx.invoiced, 7555, 'string total parses to cents');
  eq(ctx.paid, 125050, 'comma-formatted amount parses to cents');
  eq(ctx.closing_balance, 7555 - 125050, 'negative (credit) closing allowed');
}

// --- As-of mode (no period bounds → whole history to `now`) --------------------
{
  const ctx = customerStatementContext({
    customer: CUST1, invoices: INVOICES, payments: PAYMENTS, period: {}, now: '2026-11-15',
  });
  eq(ctx.opening_balance, 0, 'no period start → nothing opens');
  // gross invoiced: all non-draft ≤ 11-15 = 173000+8000+50000+20000+77700 = 320700
  eq(ctx.invoiced, 320700, 'as-of invoiced covers full history incl. voided + November rows');
  // gross paid: 60000+8000+25000+10000+5000+500 = 108500
  eq(ctx.paid, 108500);
  eq(ctx.adjustments, -10000);
  eq(ctx.closing_balance, 202200, 'as-of closing = net balance at now');
}

// --- statementCandidates: filtering + flags ------------------------------------
{
  const candidates = statementCandidates({
    customers: [CUST1, CUST2, CUST3, CUST4, CUST5, CUST6, { company_name: 'NoId Co' }],
    invoices: INVOICES, payments: PAYMENTS, period: PERIOD, now: '2026-11-02',
  });
  eq(candidates.length, 3, 'zero-balance, credit-balance, activity-free, and id-less customers skipped');
  deep(candidates.map((c) => c.customer.id), ['c1', 'c2', 'c3'], 'sorted by company name');
  eq(candidates[0].context.closing_balance, 125000);
  eq(candidates[1].context.closing_balance, 4000);
  eq(candidates[2].context.closing_balance, 7550, 'decimal-dollar invoice is cent-exact');
  eq(candidates[0].missing_email, false);
  eq(candidates[1].missing_email, false, 'generic email column satisfies the billing lane');
  eq(candidates[2].missing_email, true, 'no email → flagged, not excluded');
  // Foreign rows never leak into a customer's context.
  eq(candidates[0].context.invoiced, 70000, 'foreign invoices excluded');
}

// --- Dedupe + batch plan ---------------------------------------------------------
{
  eq(statementDedupeKey(CUST1, PERIOD), 'stmt:c1:2026-10-01');
  eq(statementDedupeKey(CUST2, { period_start: '2026-10-01' }), 'stmt:c2:2026-10-01');

  const candidates = statementCandidates({
    customers: [CUST1, CUST2, CUST3], invoices: INVOICES, payments: PAYMENTS,
    period: PERIOD, now: '2026-11-02',
  });
  const plan = statementBatchPlan(candidates, { existingKeys: ['stmt:c1:2026-10-01'] });
  eq(plan.length, 2, 'already-generated statement skipped');
  deep(plan.map((r) => r.customer_id), ['c2', 'c3']);
  eq(plan[1].dedupe_key, 'stmt:c3:2026-10-01');
  eq(plan[1].missing_email, true, 'missing_email carried into the plan row');
  ok(plan.every((r) => r.context && r.context.customer_id), 'plan rows carry the context');

  // Set-shaped existingKeys + in-batch duplicate suppression.
  const dup = statementBatchPlan([...candidates, ...candidates],
    { existingKeys: new Set(['stmt:c2:2026-10-01']) });
  eq(dup.length, 2, 'Set existingKeys + duplicate candidates dedupe');
  // Unkeyable candidate (no period bound) is skipped rather than keyed on ''.
  const loose = statementBatchPlan([{ customer: CUST1, context: { customer_id: 'c1' } }], {});
  eq(loose.length, 0, 'context without period_start cannot dedupe → skipped');
}

// --- renderStatementSummary ------------------------------------------------------
{
  const ctx = customerStatementContext({
    customer: CUST1, invoices: INVOICES, payments: PAYMENTS, period: PERIOD,
  });
  const line = renderStatementSummary(ctx);
  ok(!line.includes('\n'), 'summary is one line');
  ok(line.includes('Acme Sign Co'), 'summary carries company');
  ok(line.includes('October 2026'), 'summary carries period label');
  ok(line.includes('5 open invoices'), 'summary carries open count');
  ok(line.includes('$1,250.00 due'), 'summary carries closing as dollars');
  ok(line.includes('31-60d $200.00'), 'summary carries non-zero aging buckets');
  const fallback = renderStatementSummary({ company_name: 'X Co', as_of: '2026-11-15', line_items: [], closing_balance: 0, aging: {} });
  ok(fallback.includes('as of 2026-11-15'), 'no period_label → as-of fallback');
}

// --- centsToMoney -----------------------------------------------------------------
eq(centsToMoney(125000), '$1,250.00');
eq(centsToMoney(-500), '-$5.00');
eq(centsToMoney(0), '$0.00');

rmSync(out);
console.log(`PASS statement-batch (${n} assertions)`);
