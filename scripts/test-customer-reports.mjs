import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-reports.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  CUSTOMER_REPORTS, CUSTOMER_REPORTS_BY_ID,
  CREDIT_USAGE_STATUSES, TAX_EXEMPTION_STATUSES, LIFECYCLE_STATUSES,
  paymentRows, customerBalanceRows, instoreCreditRows, creditTermsUsageRows,
  taxExemptionRows, customersByCreatedRows, masterAccountRows,
  dormantCustomerRows, phoneAddressRows,
  customerTaxExemption, lifecycleStatus, ledgerSumCents, creditBalanceCents,
  creditUsageCents,
} = await import(pathToFileURL(out).href);

// The real J-01 engine (w-49) — spec-shape contract is validated by pushing
// every customer spec through defineReport + runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv } = engine;

const AS_OF = '2026-11-15';
const NOW = new Date(2026, 10, 15, 12, 0, 0); // local noon — this_month = November
const UNBOUNDED = { preset: 'custom', from: '', to: '' };

const cust = (over = {}) => ({
  id: 'c?', company_name: 'Co ?', customer_status: 'active',
  created_date: '2026-06-01', ...over,
});

// --- customers ----------------------------------------------------------------
// c1 Acme — active, Net 30, $5000 limit, active cert, stored credit 125.50,
//     ledger rows that DISAGREE (stored wins). contact + billing fields.
// c2 Beta — no limit/terms, legacy-expired cert, NO stored credit (ledger
//     fallback), billing blank → location address fills.
// c3 Cedar — prospect, Net 15 $1000 limit, revoked cert, child of c1 by id.
// c4 Delta — inactive, dormant (Feb invoice), child of Acme by NAME label,
//     stored credit 75.
// c5 merged stub — excluded everywhere.
// c6 Echo — active, never any dates → never-active dormant; perpetual cert.
// c7/c8 — dormancy boundary at exactly 90 / 91 days before AS_OF.
const CUSTOMERS = [
  cust({
    id: 'c1', company_name: 'Acme Sign Co', salesperson: 'Sam',
    terms: 'Net 30', credit_terms_days: 30, credit_limit: 5000,
    tax_exemption: { reason: 'resale', certificate_id: 'CERT-1', expires_on: '2027-01-31', issued_by: 'OH DOR', status: 'active' },
    in_store_credit_balance: 125.5,
    contact_first_name: 'Pat', contact_last_name: 'Acme', contact_email: 'pat@acme.test',
    company_phone: '513-555-0100', contact_cell_phone: '513-555-0199',
    billing_address_1: '100 Main St', billing_address_2: 'Ste 4', billing_city: 'Cincinnati',
    billing_state: 'OH', billing_postal_code: '45202', billing_postal_ext: '1234', billing_country: 'United States',
    created_date: '2026-09-01', last_contacted_at: '2026-11-12T09:00:00Z',
    customer_type: 'wholesale', customer_origination: 'referral',
  }),
  cust({
    id: 'c2', company_name: 'Beta Works',
    credit_terms_days: 0, credit_limit: 0,
    tax_exempt: true, tax_exempt_id: 'LEG-9', tax_exempt_expires: '2026-10-01',
    location_address_1: '7 Elm Ave', location_city: 'Florence', location_state: 'KY',
    location_postal_code: '41042',
    created_date: '2026-10-20',
  }),
  cust({
    id: 'c3', company_name: 'Cedar LLC', customer_status: 'prospect',
    credit_terms_days: 15, credit_limit: 1000,
    tax_exemption: { status: 'revoked', reason: 'audit failure', expires_on: '2027-06-01' },
    master_account_id: 'c1', master_account: 'Acme Sign Co',
    created_date: '2026-11-10', customer_type: 'contractor',
  }),
  cust({
    id: 'c4', company_name: 'Delta Co', customer_status: 'inactive',
    master_account: 'Acme Sign Co',
    in_store_credit_balance: 75,
    company_phone: '859-555-7700',
    created_date: '2026-01-15',
  }),
  cust({ // merged stub — audit shell, never listed
    id: 'c5', company_name: 'Merged Away', merged_into_customer_id: 'c1',
    master_account_id: 'c1', created_date: '2026-11-05',
    in_store_credit_balance: 999, credit_limit: 999,
  }),
  cust({
    id: 'c6', company_name: 'Echo Industries',
    tax_exempt: true, // legacy flag, no dates → perpetual active record
    created_date: '', // no parseable activity of any kind → never-active
  }),
  cust({ id: 'c7', company_name: 'Boundary Near', created_date: '2026-08-17', master_account: 'Umbrella Corp' }), // exactly 90d
  cust({ id: 'c8', company_name: 'Boundary Far', created_date: '2026-08-16' }),  // 91d → dormant
];

// --- invoices -----------------------------------------------------------------
const inv = (over = {}) => ({
  id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
  issue_date: '2026-10-01', total: 0, balance_due: 0, ...over,
});
const INVOICES = [
  inv({ id: 'i1', invoice_number: 'INV-1001', balance_due: 400, total: 1000 }),
  inv({ id: 'i2', invoice_number: 'INV-1002', status: 'paid', balance_due: 0, total: 500, amount_paid: 500 }),
  inv({ id: 'i3', invoice_number: 'INV-1003', customer_id: 'c2', issue_date: '2026-09-15', balance_due: 250, total: 250 }),
  inv({ id: 'i4', invoice_number: 'INV-1004', customer_id: 'c3', issue_date: '2026-11-01', balance_due: 1200, total: 1200 }), // c3 over its $1000 limit
  inv({ id: 'i5', invoice_number: 'INV-1005', customer_id: 'c4', issue_date: '2026-02-01', balance_due: 300, total: 300 }),
  inv({ id: 'i6', invoice_number: 'INV-1006', status: 'draft', balance_due: 999, total: 999 }),   // draft — AR excl., w-63 usage INCL.
  inv({ id: 'i7', invoice_number: 'INV-1007', customer_id: 'c2', status: 'void', balance_due: 999, total: 999 }),
  inv({ id: 'i8', invoice_number: 'INV-1008', issue_date: '2026-11-20', balance_due: 500, total: 500 }), // issued after as-of — AR excl., usage INCL.
];

// --- payments -----------------------------------------------------------------
const pay = (over = {}) => ({
  id: 'p?', amount: 0, method: 'other', status: 'recorded',
  paid_date: '2026-11-05', customer_id: 'c1', ...over,
});
const PAYMENTS = [
  pay({ id: 'p1', invoice_id: 'i1', amount: 500, method: 'check', reference_number: 'CHK-100', created_by: 'kim@shop' }),
  pay({ id: 'p2', invoice_id: 'i1', amount: -100, method: 'credit_memo', status: 'refunded', paid_date: '2026-11-06', refund_of_payment_id: 'p1' }),
  pay({ id: 'p3', invoice_id: 'i3', amount: 250, method: 'cash', paid_date: '2026-11-02', customer_id: 'c2' }),
  pay({ id: 'p4', amount: 50, method: 'card', paid_date: '2026-11-14', customer_id: 'c3' }), // no invoice link
  pay({ id: 'p5', amount: 999, status: 'void', paid_date: '2026-11-07', void_reason: 'duplicate' }),
  pay({ id: 'p6', invoice_id: 'i1', amount: 75, method: 'ach', paid_date: '2026-09-01' }), // outside November
];

// --- store-credit ledger (entity shape: amount_cents canonical) ----------------
const LEDGER = [
  { id: 'l1', customer_id: 'c2', kind: 'credit_issued', amount_cents: 10000, amount: 100, occurred_at: '2026-10-01' },
  { id: 'l2', customer_id: 'c2', kind: 'credit_applied', amount_cents: -2500, amount: -25, occurred_at: '2026-10-20', invoice_id: 'i3' },
  { id: 'l3', customer_id: 'c2', kind: 'credit_voided', amount_cents: -10000, amount: -100, ref: 'l1', occurred_at: '2026-10-25' },
  { id: 'l4', customer_id: 'c1', kind: 'credit_issued', amount_cents: 20000, amount: 200, occurred_at: '2026-11-01' }, // stored 125.50 wins anyway
  { id: 'l5', customer_id: 'c2', kind: 'bogus_kind', amount_cents: 99999 },            // unknown kind ignored
  { id: 'l6', customer_id: 'c2', kind: 'credit_issued', amount_cents: 5555, deleted: true }, // dead row ignored
];

const WORK_ORDERS = [{ id: 'wo1', customer_id: 'c1', created_date: '2026-11-10' }];
const OPPORTUNITIES = [{ id: 'o1', customer_id: 'c3', last_activity_at: '2026-11-01T15:00:00Z' }];

const DATA = {
  customers: CUSTOMERS, invoices: INVOICES, payments: PAYMENTS,
  credit_ledger: LEDGER, work_orders: WORK_ORDERS, opportunities: OPPORTUNITIES,
};

// === spec shape ================================================================
assert.equal(CUSTOMER_REPORTS.length, 9, 'nine customer report specs');
assert.deepEqual(
  Object.keys(CUSTOMER_REPORTS_BY_ID).sort(),
  [
    'credit_terms_usage', 'customer_balance', 'customer_payments',
    'customers_by_created', 'customers_by_master', 'dormant_customers',
    'instore_credit', 'phone_address_list', 'tax_exemption_status',
  ],
);
const defs = CUSTOMER_REPORTS.map((s) => defineReport(s)); // throws on contract violation
assert.equal(defs.length, 9);
for (const d of defs) {
  assert.equal(d.category, 'customers', `${d.id} category`);
  assert.ok(Object.isFrozen(d), `${d.id} frozen`);
  assert.equal(typeof d.run, 'function');
}

const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
const run = (id, params = {}, data = DATA, now = NOW) =>
  runReport(byId[id], { params, data, now });

// === exported model helpers ====================================================
assert.equal(ledgerSumCents(LEDGER, 'c2'), -2500, 'ledger sum c2 = 100 - 25 - 100 (void reversal)');
assert.equal(creditBalanceCents(CUSTOMERS[0], LEDGER), 12550, 'stored field wins over a disagreeing ledger');
assert.equal(creditBalanceCents(CUSTOMERS[1], LEDGER), -2500, 'ledger fallback when no stored field');
assert.equal(creditUsageCents('c1', INVOICES), 189900, 'w-63 usage: draft + post-asof rows count (400+999+500)');
assert.equal(creditUsageCents('c2', INVOICES), 25000, 'void row excluded from usage');
assert.equal(lifecycleStatus(CUSTOMERS[0]), 'Active');
assert.equal(lifecycleStatus({ customer_status: 'prospect' }), 'Prospect');
assert.equal(lifecycleStatus({}), 'Lead', 'blank lifecycle → Lead');
assert.deepEqual([...CREDIT_USAGE_STATUSES], ['no_limit', 'within_limit', 'at_limit', 'exceeded']);
assert.deepEqual([...TAX_EXEMPTION_STATUSES], ['active', 'expired', 'revoked']);
assert.deepEqual([...LIFECYCLE_STATUSES], ['Lead', 'Prospect', 'Active', 'Inactive']);
{
  // taxExemption replica — revoked beats a future expiry; 'none' without any record.
  const c3 = CUSTOMERS.find((c) => c.id === 'c3');
  const ex = customerTaxExemption(c3, { asOf: AS_OF });
  assert.equal(ex.status, 'revoked', 'revoked always wins (future expiry ignored)');
  const none = customerTaxExemption(CUSTOMERS[3], { asOf: AS_OF });
  assert.equal(none.status, 'none');
}

// === 1. customer_payments ======================================================
{
  const res = run('customer_payments'); // this_month → November
  assert.equal(res.rows.length, 4, 'four live payments in November (p6 out-of-period, p5 void)');
  assert.equal(res.rows[0].payment_id, 'p4', 'newest paid_date first');
  assert.equal(res.rows[0].amount, 50);
  const p1 = res.rows.find((r) => r.payment_id === 'p1');
  assert.equal(p1.invoice_number, 'INV-1001', 'invoice number resolved via invoicesById');
  assert.equal(p1.customer_name, 'Acme Sign Co');
  assert.equal(p1.reference_number, 'CHK-100');
  assert.equal(p1.method, 'check');
  const p2 = res.rows.find((r) => r.payment_id === 'p2');
  assert.equal(p2.amount, -100, 'refund rows stay negative');
  assert.equal(p2.payment_kind, 'refund');
  const p4 = res.rows.find((r) => r.payment_id === 'p4');
  assert.equal(p4.invoice_number, '', 'no invoice link → blank number, customer still resolved');
  assert.equal(res.summary.totals.amount, 700, 'net = 500 - 100 + 250 + 50');
  assert.equal(res.summary.totals.payments_received, 800);
  assert.equal(res.summary.totals.refunds_issued, -100);
  assert.equal(res.summary.totals.reference_number, '4 payments');

  // method multiselect / void ladder / customer filter / unbounded range
  assert.equal(run('customer_payments', { methods: ['check'] }).rows.length, 1);
  assert.equal(run('customer_payments', { void_policy: 'include' }).rows.length, 5, 'void row returns under include');
  assert.equal(run('customer_payments', { void_policy: 'only' }).rows.length, 1, 'only → just the void row');
  assert.equal(run('customer_payments', { customer: 'acme' }).rows.length, 2, 'name substring filter');
  assert.equal(run('customer_payments', { customer: 'c2' }).rows.length, 1, 'exact-id filter');
  assert.equal(run('customer_payments', { date_range: UNBOUNDED }).rows.length, 5, 'unbounded keeps the September payment too');
}

// === 2. customer_balance =======================================================
{
  const res = run('customer_balance', { as_of: AS_OF });
  assert.equal(res.rows.length, 4, 'four customers carry open AR');
  assert.equal(res.rows[0].customer_id, 'c3', 'largest balance first');
  assert.equal(res.rows[0].open_balance, 1200);
  const c1 = res.rows.find((r) => r.customer_id === 'c1');
  assert.equal(c1.open_balance, 400, 'draft i6 + future i8 excluded from billed AR');
  assert.equal(c1.in_store_credit, 125.5, 'credit column from stored field');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.open_balance, 250, 'void i7 excluded');
  assert.equal(c2.in_store_credit, -25, 'ledger-fallback credit is raw (negative = net-owes)');
  assert.equal(res.summary.totals.open_balance, 2150, 'AR total = 400+250+1200+300');
  assert.equal(res.summary.totals.invoice_count, 4);
  // as-of slide: at Oct 15, i1/i3/i5 are billed — i4 (11-01) and i8 are future
  const early = run('customer_balance', { as_of: '2026-10-15' });
  assert.equal(early.rows.length, 3, 'as-of boundary filters unbilled rows');
}

// === 3. instore_credit =========================================================
{
  const res = run('instore_credit');
  assert.equal(res.rows.length, 3, 'nonzero balances or ledger rows only');
  assert.equal(res.rows[0].customer_id, 'c1', '|125.50| largest');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.balance, -25);
  assert.equal(c2.issued, 100);
  assert.equal(c2.applied, -25);
  assert.equal(c2.voided, -100);
  assert.equal(c2.entry_count, 3, 'bogus kind + deleted row not counted');
  assert.equal(c2.last_activity, '2026-10-25');
  assert.equal(c2.source, 'ledger');
  const c1 = res.rows.find((r) => r.customer_id === 'c1');
  assert.equal(c1.balance, 125.5, 'stored cache beats the 200-cent ledger sum');
  assert.equal(c1.source, 'stored');
  const c4 = res.rows.find((r) => r.customer_id === 'c4');
  assert.equal(c4.balance, 75);
  const all = run('instore_credit', { include_zero: true });
  assert.equal(all.rows.length, 7, 'every live customer listed (merged stub stays out)');
  assert.equal(res.summary.totals.balance, 175.5, '125.5 - 25 + 75');
}

// === 4. credit_terms_usage =====================================================
{
  const res = run('credit_terms_usage');
  assert.equal(res.rows.length, 4, 'customers w/ terms, a limit, or usage');
  const c1 = res.rows.find((r) => r.customer_id === 'c1');
  assert.equal(c1.used, 1899, 'w-63 exposure math: draft + post-asof count');
  assert.equal(c1.credit_limit, 5000);
  assert.equal(c1.available, 3101);
  assert.ok(Math.abs(c1.usage_pct - 0.3798) < 1e-9, 'used/limit fraction');
  assert.equal(c1.status, 'within_limit');
  assert.equal(c1.terms, 'Net 30');
  const c3 = res.rows.find((r) => r.customer_id === 'c3');
  assert.equal(c3.status, 'exceeded', '1200 used > 1000 limit');
  assert.equal(c3.available, 0, 'available floors at zero');
  assert.equal(c3.terms, 'Net 15', 'terms label derives from days when text absent');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.status, 'no_limit', 'unconfigured limit never warns');
  assert.equal(c2.available, null);
  assert.equal(c2.usage_pct, null);
  assert.equal(c2.terms, 'Due on receipt');
  assert.equal(res.summary.totals.used, 3649, 'total usage = 1899+250+1200+300');
  const exceeded = run('credit_terms_usage', { statuses: ['exceeded'] });
  assert.deepEqual(exceeded.rows.map((r) => r.customer_id), ['c3']);
  const all = run('credit_terms_usage', { include_all: true });
  assert.equal(all.rows.length, 7, 'include_all lists zero-term accounts too');
}

// === 5. tax_exemption_status ===================================================
{
  const res = run('tax_exemption_status', { as_of: AS_OF });
  assert.equal(res.rows.length, 4, 'every customer WITH a record (none excluded)');
  const c1 = res.rows.find((r) => r.customer_id === 'c1');
  assert.equal(c1.status, 'active');
  assert.equal(c1.certificate_id, 'CERT-1');
  assert.equal(c1.days_until_expiry, 77, 'Nov 15 → Jan 31 = 77 days');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.status, 'expired', 'Oct 1 expiry is before the as-of day');
  assert.equal(c2.days_until_expiry, -45);
  const c3 = res.rows.find((r) => r.customer_id === 'c3');
  assert.equal(c3.status, 'revoked');
  const c6 = res.rows.find((r) => r.customer_id === 'c6');
  assert.equal(c6.status, 'active');
  assert.equal(c6.perpetual, true, 'no expiry → perpetual');
  assert.equal(res.rows[0].customer_id, 'c2', 'soonest expiry sorts first');
  assert.equal(res.rows[3].customer_id, 'c6', 'perpetual sorts last (Cedar<Echo by name in that group)');
  const active = run('tax_exemption_status', { as_of: AS_OF, statuses: ['active'] });
  assert.deepEqual(active.rows.map((r) => r.customer_id), ['c1', 'c6']);
  // as-of slide: on Sep 1 the Oct-1 cert is still active, 30 days out
  const early = run('tax_exemption_status', { as_of: '2026-09-01' });
  assert.equal(early.rows.find((r) => r.customer_id === 'c2').status, 'active');
  assert.equal(early.rows.find((r) => r.customer_id === 'c2').days_until_expiry, 30);
  assert.equal(res.summary.totals.expired, 1);
  assert.equal(res.summary.totals.revoked, 1);
}

// === 6. customers_by_created ===================================================
{
  const res = run('customers_by_created'); // this_month → November
  assert.equal(res.rows.length, 1, 'only Cedar created in November (merged stub + undated excluded)');
  assert.equal(res.rows[0].customer_id, 'c3');
  assert.equal(res.rows[0].customer_status, 'Prospect');
  assert.equal(res.rows[0].customer_origination, '', 'no origination on fixture');
  const span = run('customers_by_created', { date_range: { preset: 'custom', from: '2026-09-01', to: '2026-10-31' } });
  assert.deepEqual(span.rows.map((r) => r.customer_id), ['c2', 'c1'], 'newest created first');
  const all = run('customers_by_created', { date_range: UNBOUNDED });
  assert.equal(all.rows.length, 7, 'unbounded keeps undated rows too');
  const actives = run('customers_by_created', { date_range: UNBOUNDED, statuses: ['active'] });
  assert.deepEqual(actives.rows.map((r) => r.customer_id), ['c2', 'c1', 'c7', 'c8', 'c6'], 'status multiselect (prospect c3 + inactive c4 out, undated c6 last)');
  assert.equal(res.summary.totals.customer_name, '1 customer');
}

// === 7. customers_by_master ====================================================
{
  const res = run('customers_by_master', { as_of: AS_OF });
  assert.equal(res.rows.length, 2, 'id-link and label-link merge into one Acme group + unknown Umbrella');
  const acme = res.rows[0];
  assert.equal(acme.master_name, 'Acme Sign Co');
  assert.equal(acme.customer_count, 2, 'c3 by master_account_id + c4 by label resolve to the same master');
  assert.ok(acme.customer_names.includes('Cedar LLC') && acme.customer_names.includes('Delta Co'));
  assert.equal(acme.open_balance, 1500, 'children balances roll up (1200 + 300)');
  const umbrella = res.rows[1];
  assert.equal(umbrella.master_name, 'Umbrella Corp', 'label-only master keeps its stored name');
  assert.equal(umbrella.customer_count, 1);
  assert.equal(res.summary.totals.customer_count, 3);
  assert.equal(res.summary.totals.open_balance, 1500);
  const filtered = run('customers_by_master', { customer: 'delta' });
  assert.equal(filtered.rows.length, 1, 'child-name filter finds the parent group');
}

// === 8. dormant_customers ======================================================
{
  const res = run('dormant_customers', { as_of: AS_OF }); // days default 90
  assert.deepEqual(res.rows.map((r) => r.customer_id), ['c6', 'c4', 'c8'],
    'never-active first, then most-inactive');
  const c4 = res.rows.find((r) => r.customer_id === 'c4');
  assert.equal(c4.days_inactive, 287, 'Feb 1 → Nov 15 = 287 days');
  assert.equal(c4.last_invoice_date, '2026-02-01');
  const c6 = res.rows.find((r) => r.customer_id === 'c6');
  assert.equal(c6.never_active, true);
  assert.equal(c6.days_inactive, null);
  const c8 = res.rows.find((r) => r.customer_id === 'c8');
  assert.equal(c8.days_inactive, 91);
  // boundary: c7 at exactly 90 days is inside the window → absent; c8 at 91 present
  assert.ok(!res.rows.some((r) => r.customer_id === 'c7'), 'exactly `days` ago is NOT dormant');
  // not dormant: c1 (last_contacted 11-12 + WO 11-10), c2 (payment 11-02), c3 (opp 11-01)
  const none = ['c1', 'c2', 'c3'].filter((id) => res.rows.some((r) => r.customer_id === id));
  assert.deepEqual(none, [], 'any recent activity of any kind shields dormancy');
  const noNever = run('dormant_customers', { as_of: AS_OF, include_never: false });
  assert.deepEqual(noNever.rows.map((r) => r.customer_id), ['c4', 'c8']);
  const tight = run('dormant_customers', { as_of: AS_OF, days: 30 });
  assert.equal(tight.rows.length, 4, 'c7 joins at 30d; c1/c2/c3 stay shielded (3/13/14 days inactive)');
  assert.deepEqual(tight.rows.filter((r) => !r.never_active).map((r) => r.customer_id), ['c4', 'c8', 'c7']);
  assert.equal(res.summary.totals.days_inactive, 287, 'totals carry the worst inactivity');
  // direct model call: activity source coverage
  const model = dormantCustomerRows(CUSTOMERS, {
    asOf: AS_OF, days: 90, invoices: INVOICES, workOrders: WORK_ORDERS,
    opportunities: OPPORTUNITIES, payments: PAYMENTS,
  });
  assert.deepEqual(model.map((r) => r.customer_id), ['c6', 'c4', 'c8']);
}

// === 9. phone_address_list =====================================================
{
  const res = run('phone_address_list');
  assert.equal(res.rows.length, 7, 'every live customer (merged stub excluded)');
  assert.equal(res.rows[0].customer_id, 'c1', 'alphabetical — Acme first');
  const c1 = res.rows[0];
  assert.equal(c1.contact_name, 'Pat Acme');
  assert.equal(c1.phone, '513-555-0100');
  assert.equal(c1.alt_phone, '513-555-0199');
  assert.equal(c1.email, 'pat@acme.test');
  assert.equal(c1.city, 'Cincinnati');
  assert.equal(c1.postal_code, '45202-1234', 'postal ext joins with a dash');
  const c2 = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(c2.address_1, '7 Elm Ave', 'billing blank → location address fills');
  assert.equal(c2.city, 'Florence');
  const prospects = run('phone_address_list', { statuses: ['prospect'] });
  assert.deepEqual(prospects.rows.map((r) => r.customer_id), ['c3']);
  assert.equal(res.summary.totals.customer_name, '7 customers');
}

// === engine interop: CSV export on report output =================================
{
  const res = run('customer_payments');
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.split('\n')[0].includes('Customer'), 'CSV header');
  assert.ok(csv.includes('INV-1001'), 'CSV emits invoice numbers');
  assert.ok(csv.includes('-100'), 'CSV keeps signed refund amounts raw');
  assert.equal(res.meta.reportId, 'customer_payments');
  assert.equal(res.meta.paramEcho.date_range.preset, 'this_month', 'resolved range echoed in meta');
}

rmSync(out, { force: true });
console.log('PASS customer-reports');
