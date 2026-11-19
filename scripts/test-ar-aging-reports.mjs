import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-ar-aging-reports.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/arAgingReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  AR_AGING_BUCKETS, AR_AGING_BUCKET_LABELS, AR_AGING_BUCKET_FIELD,
  arAgingBucket, agingRows, bucketTotals, groupByCustomer, groupBySalesperson,
  AR_AGING_REPORTS, AR_AGING_REPORTS_BY_ID,
} = await import(pathToFileURL(out).href);

// The real J-01 engine (w-49) — spec-shape contract is validated by pushing
// every AR spec through defineReport + runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv, formatCellValue } = engine;

const AS_OF = '2026-11-15'; // fixed as-of for every fixture below
const NOW = new Date(2026, 10, 15, 12, 0, 0);

const CUST = {
  c1: { id: 'c1', company_name: 'Acme Sign Co' },
  c2: { id: 'c2', name: 'Beta Works' },
  c3: { id: 'c3', company: 'Cedar LLC' },
};
const inv = (over = {}) => ({
  id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
  issue_date: '2026-10-01', due_date: '', total: 0, balance_due: 0, ...over,
});

// Boundary ladder against AS_OF 2026-11-15 (days past due → bucket).
const FIXTURES = [
  inv({ id: 'i1', invoice_number: 'INV-1001', due_date: '2026-11-15', balance_due: 100, total: 100 }),              // 0d → current
  inv({ id: 'i2', invoice_number: 'INV-1002', due_date: '2026-11-10', balance_due: 50, total: 50 }),                // 5d → 1-30
  inv({ id: 'i3', invoice_number: 'INV-1003', customer_id: 'c2', due_date: '2026-10-16', balance_due: 200, total: 200 }), // 30d → 1-30
  inv({ id: 'i4', invoice_number: 'INV-1004', customer_id: 'c2', due_date: '2026-10-15', balance_due: 75.5, total: 75.5 }), // 31d → 31-60
  inv({ id: 'i5', invoice_number: 'INV-1005', customer_id: 'c3', due_date: '2026-09-16', balance_due: 10, total: 10 }),  // 60d → 31-60
  inv({ id: 'i6', invoice_number: 'INV-1006', customer_id: 'c3', due_date: '2026-09-15', balance_due: 20, total: 20 }),  // 61d → 61-90
  inv({ id: 'i7', invoice_number: 'INV-1007', due_date: '2026-08-17', balance_due: 500.25, total: 500.25, salesperson: 'Sam' }), // 90d → 61-90
  inv({ id: 'i8', invoice_number: 'INV-1008', customer_id: 'c2', due_date: '2026-08-16', balance_due: 33.33, total: 33.33 }), // 91d → 90+
  inv({ id: 'i9', invoice_number: 'INV-1009', balance_due: 40, total: 40 }),                                        // no due → current
  inv({ id: 'i10', invoice_number: 'INV-1010', due_date: '2026-12-01', balance_due: 60, total: 60 }),               // future → current
  // --- exclusions ---
  inv({ id: 'x1', status: 'void', balance_due: 999, total: 999 }),
  inv({ id: 'x2', status: 'draft', balance_due: 999, total: 999 }),
  inv({ id: 'x3', status: 'refunded', balance_due: 999, total: 999 }),
  inv({ id: 'x4', status: 'sent', balance_due: 0, total: 500, amount_paid: 500 }),
  inv({ id: 'x5', status: 'paid', balance_due: 0, total: 500 }),
  inv({ id: 'x6', status: 'sent', deleted: true, balance_due: 999, total: 999 }),
  inv({ id: 'x7', status: 'sent', voided_date: '2026-11-01', balance_due: 999, total: 999 }),
  inv({ id: 'x8', status: 'sent', issue_date: '2026-11-20', balance_due: 999, total: 999 }), // issued after as-of
];

const rows = agingRows(FIXTURES, { asOf: AS_OF, customersById: CUST });

// --- bucket boundaries --------------------------------------------------------
assert.deepEqual(AR_AGING_BUCKETS, ['current', '1-30', '31-60', '61-90', '90+']);
assert.equal(arAgingBucket(-4), 'current');
assert.equal(arAgingBucket(0), 'current');
assert.equal(arAgingBucket(1), '1-30');
assert.equal(arAgingBucket(30), '1-30');
assert.equal(arAgingBucket(31), '31-60');
assert.equal(arAgingBucket(60), '31-60');
assert.equal(arAgingBucket(61), '61-90');
assert.equal(arAgingBucket(90), '61-90');
assert.equal(arAgingBucket(91), '90+');
assert.equal(arAgingBucket(900), '90+');
assert.equal(arAgingBucket(NaN), 'current', 'non-finite days → current (undated rule)');
assert.equal(arAgingBucket(undefined), 'current');

// --- agingRows: membership + per-row fields --------------------------------------
assert.equal(rows.length, 10, 'only the 10 open-balance non-voidish non-draft rows survive');
const byId = Object.fromEntries(rows.map((r) => [r.invoice_id, r]));
assert.equal(byId.i1.bucket, 'current');
assert.equal(byId.i2.bucket, '1-30');
assert.equal(byId.i3.bucket, '1-30', 'day 30 is still 1-30');
assert.equal(byId.i4.bucket, '31-60', 'day 31 rolls to 31-60');
assert.equal(byId.i5.bucket, '31-60', 'day 60 is still 31-60');
assert.equal(byId.i6.bucket, '61-90', 'day 61 rolls to 61-90');
assert.equal(byId.i7.bucket, '61-90', 'day 90 is still 61-90');
assert.equal(byId.i8.bucket, '90+', 'day 91 rolls to 90+');
assert.equal(byId.i9.bucket, 'current', 'no due_date is always current');
assert.equal(byId.i10.bucket, 'current', 'future due_date never ages');

assert.equal(byId.i3.days_past_due, 30, 'days_past_due measured on due_date');
assert.equal(byId.i1.days_outstanding, 45, 'days_outstanding measured on issue_date (Oct 1 → Nov 15)');
assert.equal(byId.i9.days_past_due, 0, 'undated due → 0 past-due days');
assert.equal(byId.i1.balance_cents, 10000, 'balance_due → integer cents');
assert.equal(byId.i1.customer_name, 'Acme Sign Co', 'company_name lookup');
assert.equal(byId.i3.customer_name, 'Beta Works', 'name fallback');
assert.equal(byId.i5.customer_name, 'Cedar LLC', 'company fallback');
assert.equal(byId.i7.salesperson, 'Sam');
assert.equal(byId.i8.salesperson, '', 'no salesperson → empty');
// sort: days_past_due desc → i8 (91d) first
assert.equal(rows[0].invoice_id, 'i8', 'sorted oldest-past-due first');
assert.equal(rows[rows.length - 1].days_past_due, 0);

// --- as-of dating ------------------------------------------------------------------
{
  // same invoice, different as-of → different bucket
  const slide = [inv({ id: 's1', invoice_number: 'INV-S', due_date: '2026-10-16', balance_due: 10, total: 10 })];
  assert.equal(agingRows(slide, { asOf: '2026-11-15' })[0].bucket, '1-30');
  assert.equal(agingRows(slide, { asOf: '2026-11-16' })[0].bucket, '31-60', 'as-of +1 day rolls the bucket');
  assert.equal(agingRows(slide, { asOf: '2026-10-16' })[0].bucket, 'current', 'as-of == due date → current');
  // a row excluded at an early as-of reappears at a later one (issued-after-as-of guard)
  const future = [inv({ id: 'f1', invoice_number: 'INV-F', issue_date: '2026-11-20', due_date: '2026-11-25', balance_due: 10, total: 10 })];
  assert.equal(agingRows(future, { asOf: '2026-11-15' }).length, 0, 'issued after as-of excluded');
  assert.equal(agingRows(future, { asOf: '2026-12-31' })[0].bucket, '31-60', 'visible once billed (36d past due)');
  // ISO timestamp + Date forms of asOf parse to the same day
  assert.equal(agingRows(slide, { asOf: '2026-11-16T23:30:00Z' })[0].bucket, '31-60');
  assert.equal(agingRows(slide, { asOf: new Date(Date.UTC(2026, 10, 16)) })[0].bucket, '31-60');
}

// --- balance fallbacks (w-63 invoiceBalanceCents chain) -----------------------------
{
  const fallbacks = agingRows([
    inv({ id: 'b1', invoice_number: 'B1', total: 100, amount_paid: 30, balance_due: undefined }), // total − amount_paid
    inv({ id: 'b2', invoice_number: 'B2', total: 100, balance_due: undefined, payments: [{ amount: 25 }, { amount: 15, status: 'void' }] }), // payments[]
    inv({ id: 'b3', invoice_number: 'B3', total: 100, balance_due: 0, balance: 42 }),        // balance_due authoritative (0 wins → dropped)
    inv({ id: 'b4', invoice_number: 'B4', balance: 12.34, balance_due: undefined }),          // balance alias
    inv({ id: 'b5', invoice_number: 'B5', total: 50, paid_amount: 20, balance_due: undefined }), // paid_amount alias
  ], { asOf: AS_OF });
  const m = Object.fromEntries(fallbacks.map((r) => [r.invoice_id, r]));
  assert.equal(m.b1.balance_cents, 7000, 'total − amount_paid');
  assert.equal(m.b2.balance_cents, 7500, 'payments[] live rows only (void skipped)');
  assert.equal(m.b3, undefined, 'explicit 0 balance_due wins over a stale alias → excluded');
  assert.equal(m.b4.balance_cents, 1234, 'balance alias');
  assert.equal(m.b5.balance_cents, 3000, 'paid_amount alias');
}

// --- aggregates reconcile to invoice balances ----------------------------------------
const EXPECTED_TOTAL = 10000 + 5000 + 20000 + 7550 + 1000 + 2000 + 50025 + 3333 + 4000 + 6000; // 108,908 cents
{
  const bt = bucketTotals(rows);
  assert.equal(bt.rows.length, 5, 'one row per bucket');
  assert.deepEqual(bt.rows.map((r) => r.bucket), [...AR_AGING_BUCKETS]);
  assert.equal(bt.totals.balance_cents, EXPECTED_TOTAL, 'bucket totals reconcile to Σ invoice balances');
  assert.equal(bt.totals.invoice_count, 10);
  assert.equal(bt.rows[0].balance_cents, 10000 + 4000 + 6000, 'current = i1+i9+i10');
  assert.equal(bt.rows[4].balance_cents, 3333, '90+ = i8');
  assert.ok(Math.abs(bt.rows[3].share_of_total - 52025 / EXPECTED_TOTAL) < 1e-9, 'share is a fraction');
  assert.equal(bt.totals.share_of_total, 1);

  const gc = groupByCustomer(rows);
  const custSum = gc.rows.reduce((s, r) => s + r.total_cents, 0);
  assert.equal(custSum, EXPECTED_TOTAL, 'customer rollup reconciles to Σ invoice balances');
  assert.equal(gc.totals.total_cents, EXPECTED_TOTAL);
  const c2 = gc.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.total_cents, 20000 + 7550 + 3333);
  assert.equal(c2.b1_30, 20000, 'per-bucket column carries cents');
  assert.equal(c2.b90p, 3333);
  assert.equal(gc.rows[0].customer_id, 'c1', 'sorted by open total desc (c1 = 75,025¢)');
  // per-bucket columns sum-reconcile to bucketTotals
  for (const [b, field] of Object.entries(AR_AGING_BUCKET_FIELD)) {
    const bucketRow = bt.rows.find((r) => r.bucket === b);
    assert.equal(gc.totals[field], bucketRow.balance_cents, `customer totals.${field} == bucketTotals ${b}`);
  }

  const gs = groupBySalesperson(rows);
  const repSum = gs.rows.reduce((s, r) => s + r.total_cents, 0);
  assert.equal(repSum, EXPECTED_TOTAL, 'salesperson rollup reconciles to Σ invoice balances');
  const un = gs.rows.find((r) => r.salesperson === '(unassigned)');
  assert.ok(un, 'invoices without a rep group under (unassigned)');
  assert.equal(un.customer_count, 3, '(unassigned) spans c1+c2+c3');
  const sam = gs.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.total_cents, 50025);
  assert.equal(sam.customer_count, 1);
  assert.equal(gs.totals.total_cents, EXPECTED_TOTAL);
}

// --- spec shape: every report passes the real engine contract -------------------------
assert.equal(AR_AGING_REPORTS.length, 4);
assert.deepEqual(Object.keys(AR_AGING_REPORTS_BY_ID).sort(),
  ['ar_aging_by_customer', 'ar_aging_by_salesperson', 'ar_aging_detail', 'ar_aging_summary']);
const defs = AR_AGING_REPORTS.map((s) => defineReport(s)); // throws on any contract violation
for (const d of defs) {
  assert.equal(d.category, 'financial');
  assert.ok(Object.isFrozen(d));
  assert.equal(d.defaults.as_of, '', 'as_of text param defaults blank = today');
}
const data = { invoices: FIXTURES, customers: Object.values(CUST) };

// summary report — 5 bucket rows, dollars at the boundary, totals row.
{
  const res = runReport(defs[0], {
    params: { as_of: AS_OF }, data, now: NOW,
  });
  assert.equal(res.meta.reportId, 'ar_aging_summary');
  assert.equal(res.meta.paramEcho.as_of, AS_OF, 'as_of echoes through resolved params');
  assert.equal(res.rows.length, 5);
  assert.equal(res.rows[0].bucket_label, 'Current');
  assert.equal(res.rows[0].balance, 200, 'current $200 = 20000¢/100 (dollars at the money boundary)');
  assert.equal(res.rows[4].balance, 33.33);
  assert.equal(res.summary.totals.balance, Math.round(EXPECTED_TOTAL) / 100);
  assert.equal(res.summary.totals.invoice_count, 10);
  assert.equal(res.rows[0].balance_cents, 20000, 'cent extras preserved for drilldowns');
}

// detail report — one row per open invoice, date/int/money typing.
{
  const res = runReport(defs[1], { params: { as_of: AS_OF }, data, now: NOW });
  assert.equal(res.rows.length, 10);
  assert.equal(res.rows[0].number, 'INV-1008', 'oldest past-due first');
  assert.equal(res.rows[0].bucket, '90+');
  assert.equal(res.rows[0].days_past_due, 91);
  assert.equal(res.rows[0].balance, 33.33);
  assert.equal(res.summary.totals.balance, Math.round(EXPECTED_TOTAL) / 100);
  assert.equal(res.summary.totals.number, '10 invoices');
  // bucket multiselect filter
  const only90 = runReport(defs[1], { params: { as_of: AS_OF, buckets: ['90+'] }, data, now: NOW });
  assert.deepEqual(only90.rows.map((r) => r.number), ['INV-1008']);
  // salesperson text filter
  const sam = runReport(defs[1], { params: { as_of: AS_OF, salesperson: 'sam' }, data, now: NOW });
  assert.deepEqual(sam.rows.map((r) => r.number), ['INV-1007'], 'salesperson substring filter (case-insensitive)');
  // customer text filter — matches name substring or exact customer_id
  const beta = runReport(defs[1], { params: { as_of: AS_OF, customer: 'beta' }, data, now: NOW });
  assert.equal(beta.rows.length, 3, 'Beta Works has 3 open invoices');
}

// by-customer — rollup rows in dollars + totals; by-salesperson — same shape.
{
  const res = runReport(defs[2], { params: { as_of: AS_OF }, data, now: NOW });
  assert.equal(res.rows.length, 3, 'three customers carry open AR');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.total, 308.83, 'customer total in dollars');
  assert.equal(c2.b1_30, 200, 'bucket column in dollars');
  assert.equal(c2.b90p, 33.33);
  assert.equal(res.summary.totals.total, Math.round(EXPECTED_TOTAL) / 100);
  assert.equal(res.summary.totals.current, 200);

  const rsp = runReport(defs[3], { params: { as_of: AS_OF }, data, now: NOW });
  const un = rsp.rows.find((r) => r.salesperson === '(unassigned)');
  assert.equal(un.total, Math.round(EXPECTED_TOTAL - 50025) / 100);
  assert.equal(rsp.summary.totals.total, Math.round(EXPECTED_TOTAL) / 100);
  assert.equal(rsp.summary.totals.customer_count, 3);
}

// engine interop: CSV + cell formatting on report output.
{
  const res = runReport(defs[1], { params: { as_of: AS_OF }, data, now: NOW });
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.split('\n')[1].includes('INV-1008'), 'CSV emits detail rows');
  assert.ok(csv.includes('33.33'), 'CSV money is raw dollars');
  assert.equal(formatCellValue(0.1827, { format: 'percent' }), '18.3%', 'percent format on share');
  assert.equal(formatCellValue('2026-08-16', { format: 'date' }), '2026-08-16');
}

rmSync(out, { force: true });
console.log('PASS ar-aging-reports');
