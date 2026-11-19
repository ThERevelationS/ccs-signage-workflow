import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-analytics.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerAnalyticsModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  POSTED_INVOICE_STATUSES, ORDER_LIFECYCLE_STATES, ANALYTICS_TONES,
  isPostedInvoice, invoiceDate, orderLifecycleState, isOrderInBook,
  isCompletedOrder, isClosedOrder, isLiveEstimate, estimateConverted,
  customerAnalytics, analyticsBadges, yearComparison, centsToMoney,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// Fixtures — customer activity across 2024 (prior) / 2025 / 2026 (current).
// ---------------------------------------------------------------------------
const NOW = '2026-06-15T12:00:00Z';
const OPTS = { now: NOW };

const inv = (id, status, total, extra = {}) => ({
  id, invoice_number: `INV-${id}`, status, total, ...extra,
});
const invoices = [
  // 2026 posted: wo-linked pair (progress billing on w1) + standalone paid.
  inv('a1', 'sent', 1000, { issue_date: '2026-02-10', work_order_id: 'w1', amount_paid: 400, balance_due: 600, discount_amount: 50, subtotal: 1050 }),
  inv('a2', 'paid', 2000, { issue_date: '2026-03-01', work_order_id: 'w1', amount_paid: 2000, balance_due: 0, paid_date: '2026-03-20', fee_lines: [{ kind: 'discount', amount: -100 }] }),
  inv('a3', 'paid', 500, { issue_date: '2026-01-15', amount_paid: 500, balance_due: 0, paid_date: '2026-01-20', line_items: [{ quantity: 2, unit_price: 260, discount_amount: 20 }] }),
  // 2025 posted: one paid standalone + one still-open bill.
  inv('b1', 'paid', 800, { issue_date: '2025-05-05', amount_paid: 800, balance_due: 0, paid_date: '2025-05-10' }),
  inv('b2', 'partially_paid', 1200, { issue_date: '2025-11-20', amount_paid: 200, balance_due: 1000 }),
  // 2024 posted (prior year for yearComparison).
  inv('c1', 'paid', 600, { issue_date: '2024-03-03', amount_paid: 600, balance_due: 0 }),
  // Filtered out: draft never billed, void reversed, deleted row, bad status.
  inv('d1', 'draft', 9999, { issue_date: '2026-02-01' }),
  inv('d2', 'void', 9999, { issue_date: '2026-02-01', work_order_id: 'w1' }),
  inv('d3', 'sent', 9999, { issue_date: '2026-02-01', deleted: true }),
  inv('d4', 'mystery', 9999, { issue_date: '2026-02-01' }),
];

const workOrders = [
  { id: 'w1', current_stage: 'installation', estimate_id: 'e1', created_date: '2026-01-20T00:00:00Z', estimate_amount: 3000 },
  { id: 'w2', completed: true, current_stage: 'completed', created_date: '2026-04-01T00:00:00Z', completed_date: '2026-05-10', estimate_amount: 2500 },
  { id: 'w3', current_stage: 'production', created_date: '2025-08-01T00:00:00Z', estimate_amount: 700 },
  { id: 'w4', closed: true, closed_date: '2026-06-01', created_date: '2026-02-01T00:00:00Z', estimate_amount: 1500 },
  { id: 'w5', sales_status: 'lost', current_stage: 'sales', created_date: '2026-01-05T00:00:00Z', estimate_amount: 4000 }, // dead deal — not an order
  { id: 'w6', deleted: true, completed: true, created_date: '2026-01-05T00:00:00Z' }, // voided — excluded
];

const estimates = [
  { id: 'e1', status: 'approved', work_order_id: 'w1', quote_total: 3000, created_date: '2025-12-01T00:00:00Z', quote_issue_date: '2025-12-05' }, // converted via approved+wo
  { id: 'e2', status: 'sent', quote_total: 1500, created_date: '2026-01-10T00:00:00Z', quote_issue_date: '2026-01-12' }, // open pipeline
  { id: 'e3', status: 'draft', quote_total: 700, created_date: '2026-05-01T00:00:00Z' }, // open pipeline, never sent
  { id: 'e4', status: 'sent', quote_total: 900, created_date: '2025-11-01T00:00:00Z', converted_to_work_order: true }, // converted via flag
  { id: 'e5', status: 'archived', quote_total: 2000, created_date: '2025-06-01T00:00:00Z', quote_issue_date: '2025-06-02' }, // sent, not converted
  { id: 'e6', status: 'sent', quote_total: 500, is_template: true }, // template — not a pipeline estimate
  { id: 'e7', status: 'cancelled', quote_total: 100, deleted: true }, // dead
];

const payments = [
  { id: 'p1', invoice_id: 'a2', amount: 2000, status: 'recorded', paid_date: '2026-03-20' },
  { id: 'p2', invoice_id: 'a3', amount: 500, status: 'recorded', paid_date: '2026-01-20' },
  { id: 'p3', invoice_id: 'a1', amount: 400, status: 'recorded', paid_date: '2026-04-15' },
  { id: 'p4', invoice_id: 'b1', amount: 800, status: 'recorded', paid_date: '2025-05-10' },
  { id: 'p5', invoice_id: 'b2', amount: 200, status: 'recorded', paid_date: '2025-12-01' },
  { id: 'p6', invoice_id: 'c1', amount: 600, status: 'recorded', paid_date: '2024-03-15' },
  { id: 'p7', invoice_id: 'a1', amount: 300, status: 'void', paid_date: '2026-04-01' }, // reversed — excluded
  { id: 'p8', invoice_id: 'a1', amount: -50, status: 'refunded', paid_date: '2026-04-18' }, // signed refund — nets
];

const creditLedger = [
  { id: 'l1', kind: 'credit_issued', amount: 120, amount_cents: 12000, occurred_at: '2026-04-01T00:00:00Z' },
  { id: 'l2', kind: 'credit_applied', amount: -100, amount_cents: -10000, invoice_id: 'a1', occurred_at: '2026-04-02T00:00:00Z' },
  { id: 'l3', kind: 'credit_voided', amount: 20, amount_cents: 2000, ref: 'l1', reversed_kind: 'credit_issued', occurred_at: '2026-04-03T00:00:00Z' },
];

const INPUT = { invoices, workOrders, estimates, payments, creditLedger };

// --- primitives -------------------------------------------------------------
assert.deepEqual(POSTED_INVOICE_STATUSES, ['sent', 'partially_paid', 'paid']);
assert.equal(isPostedInvoice({ status: 'sent' }), true);
assert.equal(isPostedInvoice({ status: 'partial' }), true, 'import alias tolerated');
assert.equal(isPostedInvoice({ status: 'draft' }), false);
assert.equal(isPostedInvoice({ status: 'void' }), false);
assert.equal(isPostedInvoice({ status: 'sent', deleted: true }), false, 'deleted row not posted');
assert.equal(invoiceDate({ invoice_date: '2026-01-01', issue_date: '2026-02-01' }), '2026-01-01');
assert.equal(invoiceDate({ issue_date: '2026-02-01', created_date: '2026-01-01T00:00:00Z' }), '2026-02-01');
assert.equal(invoiceDate({ created_date: '2026-03-01T10:00:00Z' }), '2026-03-01', 'ISO prefix wins');

// --- order lifecycle (E-06 parity) ---------------------------------------------
assert.deepEqual(ORDER_LIFECYCLE_STATES, ['open', 'in_progress', 'completed', 'closed', 'voided']);
assert.equal(orderLifecycleState({ completed: true }), 'completed');
assert.equal(orderLifecycleState({ current_stage: 'completed' }), 'completed');
assert.equal(orderLifecycleState({ closed: true }), 'closed');
assert.equal(orderLifecycleState({ closed_date: '2026-01-01' }), 'closed');
assert.equal(orderLifecycleState({ deleted: true }), 'voided');
assert.equal(orderLifecycleState({ order_status: 'cancelled' }), 'voided', 'cancelled alias → voided');
assert.equal(orderLifecycleState({ order_status: 'closed', completed: false }), 'closed', 'explicit lifecycle wins');
assert.equal(orderLifecycleState({ current_stage: 'production' }), 'in_progress');
assert.equal(orderLifecycleState({}), 'open');
assert.equal(isOrderInBook(workOrders[4]), false, 'sales_status lost excluded from the book');
assert.equal(isOrderInBook(workOrders[5]), false, 'deleted WO excluded');
assert.equal(isCompletedOrder(workOrders[3]), true, 'closed counts as completed (passed through it)');
assert.equal(isClosedOrder(workOrders[1]), false, 'completed WO is not closed');

// --- estimate conversion (estimateReports parity) --------------------------------
assert.equal(isLiveEstimate(estimates[5]), false, 'template excluded');
assert.equal(isLiveEstimate(estimates[6]), false, 'deleted excluded');
assert.equal(estimateConverted(estimates[0]), true, 'approved + work_order_id');
assert.equal(estimateConverted(estimates[3]), true, 'converted flag');
assert.equal(estimateConverted({ status: 'won' }), true, 'legacy won status');
assert.equal(estimateConverted({ status: 'sent', work_order_id: 'w9' }), true, 'bare WO link');
assert.equal(estimateConverted(estimates[1]), false, 'plain sent');
assert.equal(estimateConverted({ sales_stage: 'won' }), true, 'pipeline mirror won');

// --- lifetime metrics -------------------------------------------------------------
const A = customerAnalytics(INPUT, OPTS);
const L = A.lifetime;
// Posted invoices: a1 1000 + a2 2000 + a3 500 + b1 800 + b2 1200 + c1 600 = 6100.
// Draft/void/deleted/mystery are out (posted-filter assert below checks a draft can't sneak in).
assert.equal(L.invoiced_cents, 610000);
assert.equal(L.open_balance_cents, 160000, 'a1 600 + b2 1000');
// paid: stamped amount_paid = 400+2000+500+800+200+600 = 4500 (canonical — payments list ignored).
assert.equal(L.paid_cents, 450000);
// Order book: w1,w2,w3,w4 (live) + standalones a3,b1,b2,c1 (a1/a2 link to
// w1; lost w5 and deleted w6 are out) = 8.
assert.equal(L.order_count, 8);
// Completed: w2 (completed), w4 (closed) + paid standalones a3, b1, c1 = 5.
assert.equal(L.completed_order_count, 5, 'w2 + w4 + paid standalones a3, b1, c1');
assert.equal(L.closed_order_count, 4, 'w4 closed + paid standalones a3, b1, c1');
// avg order = invoiced ÷ order book.
assert.equal(L.avg_order_cents, Math.round(610000 / 8));
// completed_invoiced: bills on completed orders — a2/a1 sit on w1 (incomplete);
// standalone completed: a3 500 + b1 800 + c1 600 = 1900.
assert.equal(L.completed_invoiced_cents, 190000);
// Unbilled work value: w2 2500 + w3 700 + w4 1500 (no posted bills); w1 has
// invoices → excluded; standalone invoice orders don't apply.
assert.equal(L.unbilled_order_value_cents, 470000);
// Order timing uses BOOKING days: c1 2024-03-03 earliest, w2 2026-04-01 latest.
assert.equal(A.first_order_at, '2024-03-03');
assert.equal(A.last_order_at, '2026-04-01');
// 759 days span ÷ (8 dated orders − 1) = 108.4.
assert.equal(A.avg_days_between_orders, 108.4);

// --- year scoping -------------------------------------------------------------------
assert.equal(A.year.year, 2026, 'year defaults to now year');
const Y = A.year;
// 2026 invoices: a1 1000 + a2 2000 + a3 500 = 3500.
assert.equal(Y.invoiced_cents, 350000);
assert.equal(Y.open_balance_cents, 60000, 'only a1 carries a 2026 balance');
// 2026 paid via payment rows dated in-year + ledger credit applied:
// p1 2000 + p2 500 + p3 400 + p8 −50 + credit l2 100 = 2950 (p7 void excluded).
assert.equal(Y.paid_cents, 295000);
// 2026 orders by booking day: w1 (01-20), w2 (04-01), w4 (02-01) + standalone a3 (01-15) = 4.
assert.equal(Y.order_count, 4);
// 2026 completed by completion day: w2 (05-10), w4 (06-01) + a3 paid (01-20) = 3.
assert.equal(Y.completed_order_count, 3);
assert.equal(Y.closed_order_count, 2, 'w4 + standalone a3');
assert.equal(Y.avg_order_cents, Math.round(350000 / 4));
// by_year coverage: prior years are queryable without a second pass.
assert.equal(A.by_year['2025'].invoiced_cents, 200000, 'b1 800 + b2 1200');
assert.equal(A.by_year['2025'].paid_cents, 100000, 'p4 800 + p5 200');
assert.equal(A.by_year['2024'].invoiced_cents, 60000);
assert.equal(A.by_year['2025'].order_count, 3, 'w3 + standalones b1, b2');

// --- discounts -------------------------------------------------------------------------
const D = A.discounts;
// invoice-level 50 + line-level 20 + fee-line 100 = 170 → discount_given.
assert.equal(D.invoice_discount_cents, 5000);
assert.equal(D.line_discount_cents, 2000);
assert.equal(D.fee_discount_cents, 10000);
assert.equal(D.discount_given_cents, 17000);
assert.equal(D.discounted_invoice_count, 3, 'a1, a2 (fee), a3 (line)');
// credit applied: ledger canonical — |−100| = 10000 (issued/voided don't count).
assert.equal(D.credit_applied_cents, 10000);
assert.equal(D.credit_applied_invoice_count, 1);
// pct of sales: gross = subtotal 1050 (a1) + 2000+100 fee disc (a2) +
// 500+20 line disc (a3) + 800 + 1200 + 600 = 6270 → 17000/627000 = 2.7113%.
assert.equal(D.discount_pct_of_sales, Math.round((17000 / 627000) * 100 * 10000) / 10000);

// --- estimates block ----------------------------------------------------------------------
const E = A.estimates;
assert.equal(E.total, 5, 'e1–e5 live; template + deleted excluded');
assert.equal(E.sent, 4, 'e1 sent-like (approved), e2, e4, e5; draft e3 never sent');
assert.equal(E.converted, 2, 'e1 approved+wo, e4 flag');
assert.equal(E.conversion_rate, 0.5, 'converted ÷ sent (J-07 basis)');
assert.equal(E.open_pipeline_cents, 220000, 'e2 1500 + e3 700 (draft+calculated+sent)');

// --- badges + YoY ----------------------------------------------------------------------------
const badges = analyticsBadges(A);
assert.equal(badges.length, 4);
assert.deepEqual(badges.map((b) => b.label), ['Avg order', 'Lifetime invoiced', 'Open balance', 'Estimate conversion']);
assert.equal(badges[0].value, centsToMoney(L.avg_order_cents));
assert.equal(badges[1].value, '$6,100.00');
assert.equal(badges[2].tone, 'warn', 'open balance warns');
assert.equal(badges[3].value, '50%');
const yoy = yearComparison(A);
assert.equal(yoy.prior_year.year, 2025);
assert.equal(yoy.this_year.invoiced_cents, 350000);
assert.equal(yoy.delta_pct, 75, '(3500−2000)/2000 = +75%');
const yoy2 = yearComparison(A, { yearsBack: 2 });
assert.equal(yoy2.prior_year.year, 2024);
assert.equal(yoy2.delta_pct, Math.round(((350000 - 60000) / 60000) * 1000) / 10);
const yoyEmpty = yearComparison(customerAnalytics({}, OPTS));
assert.equal(yoyEmpty.delta_pct, null, 'zero prior base reports null, not Infinity');

// --- degraded + malformed input -----------------------------------------------------------------
// No payments/ledger supplied → paid falls back to paid-day attribution;
// invoice.credit_applied mirror covers the ledger.
const degraded = customerAnalytics({ invoices, workOrders, estimates }, OPTS);
assert.equal(degraded.lifetime.paid_cents, 450000, 'amount_paid carries the total when no payment rows exist');
assert.equal(degraded.year.paid_cents, 250000, 'a2 paid 03-20 + a3 paid 01-20 in 2026 via paid_date');
assert.equal(degraded.discounts.credit_applied_cents, 0, 'no ledger, no credit_applied fields → 0');

// Cross-year settlement: a 2025 bill paid in 2026 counts in 2026 paid.
const crossYear = customerAnalytics({
  invoices: [inv('cy1', 'paid', 400, { issue_date: '2025-11-01', paid_date: '2026-02-15' })],
}, OPTS);
assert.equal(crossYear.year.paid_cents, 40000, 'prior-year bill settled in-year counts by paid day');
assert.equal(crossYear.by_year['2025'].paid_cents, 0, 'not double-counted into the billing year');

const withCreditMirror = customerAnalytics(
  { invoices: [inv('x1', 'paid', 300, { issue_date: '2026-01-01', credit_applied: 25, paid_date: '2026-01-02' })] },
  OPTS,
);
assert.equal(withCreditMirror.discounts.credit_applied_cents, 2500, 'invoice.credit_applied mirror used when ledger absent');
assert.equal(withCreditMirror.discounts.credit_applied_invoice_count, 1);

// Progress billing: one WO with deposit+progress+final invoices = ONE order.
const prog = customerAnalytics({
  invoices: [
    inv('f1', 'paid', 500, { work_order_id: 'wp', issue_date: '2026-01-01' }),
    inv('f2', 'sent', 1000, { work_order_id: 'wp', issue_date: '2026-02-01' }),
    inv('f3', 'draft', 500, { work_order_id: 'wp', issue_date: '2026-03-01' }),
  ],
  workOrders: [{ id: 'wp', current_stage: 'production', created_date: '2026-01-01' }],
}, OPTS);
assert.equal(prog.lifetime.order_count, 1, 'three bills, one order');
assert.equal(prog.lifetime.invoiced_cents, 150000, 'draft never bills');

// Undated rows never create a spurious year bucket.
const undated = customerAnalytics({ invoices: [inv('u1', 'sent', 100)], workOrders: [{}] }, OPTS);
assert.equal(undated.by_year['0'], undefined, 'undated rows do not forge a year-0 bucket');
assert.equal(undated.lifetime.invoiced_cents, 10000, 'undated posted bills still count lifetime');
assert.equal(undated.year.order_count, 0, 'undated order drops out of bounded year scope');
assert.equal(undated.lifetime.order_count, 2, 'undated WO + undated bill still in the lifetime book');

// Malformed input never throws.
assert.doesNotThrow(() => customerAnalytics(null, null));
const empty = customerAnalytics('nope');
assert.equal(empty.lifetime.invoiced_cents, 0);
assert.equal(empty.lifetime.avg_order_cents, 0);
assert.equal(empty.estimates.conversion_rate, 0);
assert.equal(empty.avg_days_between_orders, null);
assert.equal(analyticsBadges(null).length, 4);
assert.equal(centsToMoney(123456), '$1,234.56');
assert.equal(centsToMoney(-500), '-$5.00');
assert.ok(ANALYTICS_TONES.includes('warn'));

rmSync(out, { force: true });
console.log('PASS customer-analytics');
