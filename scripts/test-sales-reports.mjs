import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-sales-reports.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/salesReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SALES_REPORTS, SALES_REPORTS_BY_ID,
  SALES_DATE_BASIS, MONTHLY_MODES, MONTHS, LOCALE_GROUP_LEVELS,
  salesInvoiceRows, groupByCustomer, groupByLocale, groupBySalesperson,
  groupByEnteredBy, incomeAccountRows, productCategoryRows,
  invoiceCreatedDay, invoiceCompletedDay, incomeBaseCents, monthlyModeOf,
} = await import(pathToFileURL(out).href);

// The real J-01 engine (w-49) — spec-shape contract is validated by pushing
// every sales spec through defineReport + runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv } = engine;

const NOW = new Date(2026, 10, 15, 12, 0, 0); // local noon — this_month = November
const UNBOUNDED = { preset: 'custom', from: '', to: '' };

const cust = (over = {}) => ({
  id: 'c?', company_name: 'Co ?', customer_status: 'active',
  created_date: '2026-06-01', ...over,
});

// --- customers ---------------------------------------------------------------
// c1 Acme  — Sam, primary CustomerContact ct1, billing Cincinnati OH 45202-1234
// c2 Beta  — Riley, billing BLANK → location Florence KY 41042 fills; billing
//            contact flats only
// c3 Cedar — Riley, billing Cincinnati OH 45202 (same city, different zip
//            than Acme), contact_* flats, company_phone
const CUSTOMERS = [
  cust({
    id: 'c1', company_name: 'Acme Sign Co', salesperson: 'Sam',
    contact_first_name: 'Pat', contact_last_name: 'Acme', contact_email: 'pat@acme.test',
    company_phone: '513-555-0100',
    billing_address_1: '100 Main St', billing_city: 'Cincinnati', billing_state: 'OH',
    billing_postal_code: '45202', billing_postal_ext: '1234', billing_country: 'United States',
  }),
  cust({
    id: 'c2', company_name: 'Beta Works', salesperson: 'Riley',
    company_phone: '859-555-0300',
    billing_contact_name: 'Betty Beta', billing_contact_email: 'betty@beta.test',
    location_address_1: '7 Elm Ave', location_city: 'Florence', location_state: 'KY',
    location_postal_code: '41042',
  }),
  cust({
    id: 'c3', company_name: 'Cedar LLC', salesperson: 'Riley',
    contact_first_name: 'Cory', contact_last_name: 'Cedar', contact_email: 'cory@cedar.test',
    company_phone: '513-555-0200',
    billing_address_1: '9 Vine St', billing_city: 'Cincinnati', billing_state: 'OH',
    billing_postal_code: '45202',
  }),
];

// ct1 is c1's primary contact — beats the customer's contact_* flats.
const CONTACTS = [
  { id: 'ct1', customer_id: 'c1', first_name: 'Pat', last_name: 'Acme-Jr', email: 'pjr@acme.test', phone: '513-555-0101' },
];

const INCOME_ACCOUNTS = [
  { id: 'a1', code: '4000', name: 'Sales Income' },
  { id: 'a2', code: '4100', name: 'Services Income' },
];

// --- invoices -----------------------------------------------------------------
// i1  Nov-03 c1 ct1 — sent, 1000 (subtotal 900 + tax 100), Sam/kim, splits
//     4000/4100 footing to the 900 income base, Signs+Install lines
// i2  Nov-10 c1 — paid Nov-20, 500, Sam/kim
// i3  Oct-15 c2 — paid Nov-05: created-basis OUT of November, completed IN
// i4  Nov-12 c3 — paid Nov-14, 800, Riley/jo
// i5  Nov-05 unknown cX — frozen display name, invoice-level billing Mason OH,
//     no splits → unmapped, uncategorized line, no salesperson/entered_by
// i6  draft — excluded everywhere
// i7  Nov-01 c1 — void: 'exclude' drops, 'include'/'only' keep
// i8  Dec-01 c1 — sent, fee_lines (+25 shipping, −5 discount) → income base
//     320 posts to unmapped (no splits), Install line
// i9  Dec-15-2025 c2 — paid Jan-10-2026: prior-YEAR row for month×year
// i10 Nov-01 c2 — paid Nov-03, 60.25 odd cents, Riley/lee
// i11 undated cX2 — created-unbounded only; no locale → '(unknown)' bucket
const inv = (over = {}) => ({
  id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
  issue_date: '2026-11-01', subtotal: 0, total: 0, ...over,
});
const INVOICES = [
  inv({
    id: 'i1', invoice_number: 'INV-1001', contact_id: 'ct1',
    issue_date: '2026-11-03', subtotal: 900, tax_amount: 100, total: 1000,
    balance_due: 1000, salesperson: 'Sam', entered_by: 'kim@shop',
    income_account_splits: [
      { income_account_code: '4000', amount: 600 },
      { income_account_code: '4100', amount: 300 },
    ],
    line_items: [
      { description: 'Pylon sign', quantity: 2, unit_price: 300, line_total: 600, category: 'Signs', taxable: true },
      { description: 'Install labor', quantity: 1, unit_price: 300, line_total: 300, category: 'Install', taxable: false },
    ],
  }),
  inv({
    id: 'i2', invoice_number: 'INV-1002', status: 'paid',
    issue_date: '2026-11-10', paid_date: '2026-11-20',
    subtotal: 500, total: 500, amount_paid: 500, balance_due: 0,
    salesperson: 'Sam', entered_by: 'kim@shop',
    income_account_splits: [{ income_account_code: '4000', amount: 500 }],
    line_items: [{ description: 'Banner', quantity: 1, unit_price: 500, line_total: 500, category: 'Signs' }],
  }),
  inv({
    id: 'i3', invoice_number: 'INV-1003', customer_id: 'c2', status: 'paid',
    issue_date: '2026-10-15', paid_date: '2026-11-05',
    subtotal: 250, total: 250, amount_paid: 250, balance_due: 0,
    salesperson: 'Riley', entered_by: 'jo@shop',
    income_account_splits: [{ income_account_code: '4100', amount: 250 }],
    line_items: [{ description: 'Service call', quantity: 1, unit_price: 250, line_total: 250, category: 'Service' }],
  }),
  inv({
    id: 'i4', invoice_number: 'INV-1004', customer_id: 'c3', status: 'paid',
    issue_date: '2026-11-12', paid_date: '2026-11-14',
    subtotal: 800, total: 800, amount_paid: 800, balance_due: 0,
    salesperson: 'Riley', entered_by: 'jo@shop',
    income_account_splits: [{ income_account_code: '4000', amount: 800 }],
    line_items: [{ description: 'Channel letters', quantity: 1, unit_price: 800, line_total: 800, category: 'Signs' }],
  }),
  inv({
    id: 'i5', invoice_number: 'INV-1005', customer_id: 'cX',
    customer_display_name: 'Mystery Co',
    issue_date: '2026-11-05', subtotal: 120, total: 120, balance_due: 120,
    salesperson: '', entered_by: '',
    billing_city: 'Mason', billing_state: 'OH', billing_postal_code: '45040',
    line_items: [{ description: 'Misc part', quantity: 1, unit_price: 120, line_total: 120 }],
  }),
  inv({
    id: 'i6', invoice_number: 'INV-1006', status: 'draft',
    subtotal: 999, total: 999, salesperson: 'Sam', entered_by: 'kim@shop',
  }),
  inv({
    id: 'i7', invoice_number: 'INV-1007', status: 'void',
    issue_date: '2026-11-01', voided_date: '2026-11-08', void_reason: 'duplicate',
    subtotal: 999, total: 999, salesperson: 'Sam', entered_by: 'kim@shop',
    income_account_splits: [{ income_account_code: '4000', amount: 999 }],
    line_items: [{ description: 'Dup', quantity: 1, unit_price: 999, line_total: 999, category: 'Signs' }],
  }),
  inv({
    id: 'i8', invoice_number: 'INV-1008',
    issue_date: '2026-12-01', subtotal: 300, total: 320, balance_due: 320,
    salesperson: 'Sam', entered_by: 'kim@shop',
    fee_lines: [
      { label: 'Shipping', kind: 'shipping', amount: 25, taxable: false },
      { label: 'Loyalty disc', kind: 'discount', amount: 5, taxable: false },
    ],
    line_items: [{ description: 'Install crew', quantity: 1, unit_price: 300, line_total: 300, category: 'Install' }],
  }),
  inv({
    id: 'i9', invoice_number: 'INV-1009', customer_id: 'c2', status: 'paid',
    issue_date: '2025-12-15', paid_date: '2026-01-10',
    subtotal: 400, total: 400, amount_paid: 400, balance_due: 0,
    salesperson: 'Riley', entered_by: 'lee@shop',
    income_account_splits: [{ income_account_code: '4100', amount: 400 }],
    line_items: [{ description: 'Service plan', quantity: 2, unit_price: 200, line_total: 400, category: 'Service' }],
  }),
  inv({
    id: 'i10', invoice_number: 'INV-1010', customer_id: 'c2', status: 'paid',
    issue_date: '2026-11-01', paid_date: '2026-11-03',
    subtotal: 60.25, total: 60.25, amount_paid: 60.25, balance_due: 0,
    salesperson: 'Riley', entered_by: 'lee@shop',
    income_account_splits: [{ income_account_code: '4000', amount: 60.25 }],
    line_items: [{ description: 'Vinyl cut', quantity: 1, unit_price: 60.25, line_total: 60.25, category: 'Service' }],
  }),
  inv({
    id: 'i11', invoice_number: 'INV-1011', customer_id: 'cX2',
    issue_date: '', created_date: '',
    subtotal: 50, total: 50, balance_due: 50,
    salesperson: 'Sam', entered_by: 'kim@shop',
    income_account_splits: [{ income_account_code: '4000', amount: 50 }],
    line_items: [{ description: 'Sticker', quantity: 1, unit_price: 50, line_total: 50, category: 'Signs' }],
  }),
];

const DATA = {
  invoices: INVOICES,
  customers: CUSTOMERS,
  contacts: CONTACTS,
  income_accounts: INCOME_ACCOUNTS,
};

// === spec shape =================================================================
assert.equal(SALES_REPORTS.length, 6, 'six sales report specs');
assert.deepEqual(
  Object.keys(SALES_REPORTS_BY_ID).sort(),
  [
    'billing_locale', 'sales_by_customer', 'sales_by_entered_by',
    'sales_by_income_account', 'sales_by_product_category', 'sales_by_salesperson',
  ],
);
const defs = SALES_REPORTS.map((s) => defineReport(s)); // throws on contract violation
assert.equal(defs.length, 6);
for (const d of defs) {
  assert.equal(d.category, 'sales', `${d.id} category`);
  assert.ok(Object.isFrozen(d), `${d.id} frozen`);
  assert.equal(typeof d.run, 'function');
  const basis = d.params.find((p) => p.key === 'date_basis');
  assert.ok(basis, `${d.id} has date_basis param`);
  assert.deepEqual(basis.options.map((o) => o.value), ['created', 'completed'], `${d.id} basis excludes 'built'`);
  assert.equal(basis.default, 'created');
}

const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
const run = (id, params = {}, data = DATA, now = NOW) =>
  runReport(byId[id], { params, data, now });

// === exported helpers ============================================================
assert.deepEqual([...SALES_DATE_BASIS], ['created', 'completed']);
assert.deepEqual([...MONTHLY_MODES], ['none', 'month', 'month_year']);
assert.deepEqual([...LOCALE_GROUP_LEVELS], ['state', 'city', 'zip']);
assert.equal(MONTHS.length, 12);
assert.equal(MONTHS[0][0], '01');
assert.equal(invoiceCreatedDay({ invoice_date: '2026-05-01', issue_date: '2026-05-09' }), '2026-05-01', 'invoice_date wins');
assert.equal(invoiceCreatedDay({ issue_date: '2026-05-09', created_date: '2026-04-01' }), '2026-05-09', 'issue_date next');
assert.equal(invoiceCompletedDay({ paid_in_full_date: '2026-06-01', paid_date: '2026-06-05' }), '2026-06-01', 'paid_in_full wins');
assert.equal(invoiceCompletedDay({ paid_date: '2026-06-05', closed_date: '2026-06-30' }), '2026-06-05');
assert.equal(invoiceCompletedDay({ closed_date: '2026-06-30' }), '2026-06-30', 'closed_date fallback');
assert.equal(invoiceCompletedDay({ issue_date: '2026-06-30' }), '', 'no completion marks → blank');
assert.equal(incomeBaseCents(INVOICES[0]), 90000, 'base = subtotal − discount + signed fees (i1: 900, no fees)');
assert.equal(incomeBaseCents(INVOICES[7]), 32000, 'i8: 300 + ship 25 − discount 5 = 320');
assert.equal(monthlyModeOf('month_year'), 'month_year');
assert.equal(monthlyModeOf('monthyear'), 'month_year');
assert.equal(monthlyModeOf(true), 'month', "brief's monthly:true → month totals");
assert.equal(monthlyModeOf('month'), 'month');
assert.equal(monthlyModeOf('none'), 'none');
assert.equal(monthlyModeOf(undefined), 'none');

// === salesInvoiceRows — membership + basis =======================================
{
  const nov = salesInvoiceRows(INVOICES, { from: '2026-11-01', to: '2026-11-30', customersById: CUSTOMERS, contactsById: CONTACTS });
  assert.equal(nov.length, 5, 'created-Nov: i1,i2,i4,i5,i10 (draft i6 + void i7 + undated i11 excluded)');
  assert.deepEqual(nov.map((r) => r.invoice_id), ['i10', 'i1', 'i5', 'i2', 'i4'], 'day-asc order');
  assert.equal(nov[1].month, '2026-11');
  assert.equal(nov[1].month_num, 11);
  assert.equal(nov[1].year, '2026');
  assert.equal(nov[1].city, 'Cincinnati');
  assert.equal(nov[1].postal_code, '45202-1234', 'postal ext joins with a dash');
  assert.equal(nov[1].contact_name, 'Pat Acme-Jr', 'primary CustomerContact row beats customer flats');
  assert.equal(nov[1].contact_email, 'pjr@acme.test');
  const i5 = nov.find((r) => r.invoice_id === 'i5');
  assert.equal(i5.customer_name, 'Mystery Co', 'frozen customer_display_name fallback');
  assert.equal(i5.customer_id, '', 'unknown customer → blank id');
  assert.equal(i5.salesperson, '', 'no rep anywhere → blank → (unassigned) group');
  assert.equal(i5.city, 'Mason', 'invoice billing_* block wins when customer is unknown');
  const i10 = nov.find((r) => r.invoice_id === 'i10');
  assert.equal(i10.city, 'Florence', 'billing blank → customer location_* fills');
  assert.equal(i10.entered_by, 'lee@shop');

  const completed = salesInvoiceRows(INVOICES, { basis: 'completed', from: '2026-11-01', to: '2026-11-30', customersById: CUSTOMERS });
  assert.deepEqual(completed.map((r) => r.invoice_id), ['i10', 'i3', 'i4', 'i2'], 'completed-Nov = paid_date in Nov');
  assert.equal(
    salesInvoiceRows(INVOICES, { basis: 'completed', customersById: CUSTOMERS }).length,
    5,
    'completed unbounded: only the five invoices with a completion day (i9 Jan-2026 paid counts)',
  );
  const all = salesInvoiceRows(INVOICES, { customersById: CUSTOMERS });
  assert.equal(all.length, 9, 'created unbounded keeps undated i11 (draft+void still out)');
  const i11 = all.find((r) => r.invoice_id === 'i11');
  assert.equal(i11.day, '', 'undated row: no basis day');
  assert.equal(i11.month, '', 'undated row: no month bucket');
  assert.equal(salesInvoiceRows(INVOICES, { voidPolicy: 'include', customersById: CUSTOMERS }).length, 10, 'include → void i7 returns');
  const only = salesInvoiceRows(INVOICES, { voidPolicy: 'only', customersById: CUSTOMERS });
  assert.equal(only.length, 1, 'only → just the void row');
  assert.equal(only[0].invoice_id, 'i7');
}

// === 1. sales_by_customer =========================================================
{
  const res = run('sales_by_customer'); // this_month → November, created basis
  assert.equal(res.rows.length, 4, 'four customer groups');
  assert.equal(res.rows[0].customer_name, 'Acme Sign Co', 'largest sales first');
  assert.equal(res.rows[0].total, 1500, 'i1 + i2');
  assert.equal(res.rows[0].invoice_count, 2);
  assert.equal(res.rows[0].avg_invoice, 750);
  assert.equal(res.rows[0].contact_name, 'Pat Acme-Jr');
  assert.equal(res.rows[0].contact_email, 'pjr@acme.test');
  assert.equal(res.rows[0].contact_phone, '513-555-0101');
  assert.equal(res.rows[0].salesperson, 'Sam');
  assert.equal(res.rows[0].first_invoice_day, '2026-11-03');
  assert.equal(res.rows[0].last_invoice_day, '2026-11-10');
  const cedar = res.rows.find((r) => r.customer_id === 'c3');
  assert.equal(cedar.total, 800);
  assert.equal(cedar.contact_name, 'Cory Cedar', 'contact_* flats when no CustomerContact row');
  assert.equal(cedar.contact_phone, '513-555-0200', 'company_phone fills phone');
  const beta = res.rows.find((r) => r.customer_id === 'c2');
  assert.equal(beta.total, 60.25);
  assert.equal(beta.contact_name, 'Betty Beta', 'billing_contact_name last resort');
  const mystery = res.rows.find((r) => r.customer_name === 'Mystery Co');
  assert.equal(mystery.customer_id, '');
  assert.equal(mystery.contact_name, '', 'no customer row → no contact');
  // reconcile: group totals == member invoice totals
  assert.equal(res.summary.totals.total, 2480.25, 'reconciles to Σ invoice.total of Nov members');
  assert.equal(res.summary.totals.invoice_count, 5);
  assert.equal(res.summary.totals.share_of_total, 1);
  // completed basis: only invoices PAID in November
  const comp = run('sales_by_customer', { date_basis: 'completed' });
  assert.equal(comp.rows.length, 3, 'completed-Nov: c1(i2), c2(i3+i10), c3(i4)');
  const compC2 = comp.rows.find((r) => r.customer_id === 'c2');
  assert.equal(compC2.total, 310.25, 'i3 250 + i10 60.25 — completed-basis pulls Oct-created i3 in');
  assert.equal(comp.summary.totals.total, 1610.25);
  // filters
  assert.equal(run('sales_by_customer', { customer: 'acme' }).rows.length, 1, 'name substring');
  assert.equal(run('sales_by_customer', { customer: 'c3' }).rows.length, 1, 'exact id');
  assert.equal(run('sales_by_customer', { salesperson: 'riley' }).rows.length, 2, 'rep filter keeps c3+c2 groups');
  assert.equal(run('sales_by_customer', { void_policy: 'only' }).rows.length, 1, 'void only → Acme row over i7');
  assert.equal(run('sales_by_customer', { void_policy: 'only' }).rows[0].total, 999);
}

// === 2. billing_locale ============================================================
{
  const res = run('billing_locale'); // zip level, November, created
  assert.equal(res.rows.length, 4, 'four locales');
  assert.equal(res.rows[0].locale, 'Cincinnati, OH 45202-1234');
  assert.equal(res.rows[0].total, 1500);
  assert.equal(res.rows[0].customer_count, 1);
  assert.equal(res.rows[0].invoice_count, 2);
  const cedarLocale = res.rows.find((r) => r.postal_code === '45202');
  assert.equal(cedarLocale.total, 800, 'same city, different zip → separate locale row');
  const mason = res.rows.find((r) => r.city === 'Mason');
  assert.equal(mason.total, 120, 'invoice-level billing resolves without a customer');
  assert.equal(mason.customer_count, 0, 'unknown customer contributes no customer id');
  const florence = res.rows.find((r) => r.state === 'KY');
  assert.equal(florence.total, 60.25);
  assert.equal(res.summary.totals.total, 2480.25, 'reconciles to invoice totals');
  // state rollup
  const byState = run('billing_locale', { group_by: 'state' });
  assert.equal(byState.rows.length, 2, 'OH + KY');
  assert.equal(byState.rows[0].state, 'OH');
  assert.equal(byState.rows[0].total, 2420, 'Acme 1500 + Cedar 800 + Mason 120');
  assert.equal(byState.rows[0].invoice_count, 4);
  assert.equal(byState.rows[0].customer_count, 2, 'distinct customers only');
  // city rollup merges the two Cincinnati zips
  const byCity = run('billing_locale', { group_by: 'city' });
  const cincy = byCity.rows.find((r) => r.city === 'Cincinnati');
  assert.equal(cincy.total, 2300);
  assert.equal(cincy.postal_code, null, 'zip column blank at city level');
  // unbounded picks up the locale-less i11 → '(unknown)' bucket
  const all = run('billing_locale', { date_range: UNBOUNDED });
  const unknown = all.rows.find((r) => r.locale === '(unknown)');
  assert.ok(unknown, 'locale-less invoices land in (unknown)');
  assert.equal(unknown.total, 50);
}

// === 3. sales_by_salesperson — flat, bases, monthly crosstabs ======================
{
  const res = run('sales_by_salesperson');
  assert.equal(res.rows.length, 3, 'Sam, Riley, (unassigned)');
  assert.equal(res.rows[0].salesperson, 'Sam');
  assert.equal(res.rows[0].total, 1500);
  assert.equal(res.rows[0].invoice_count, 2);
  assert.equal(res.rows[0].customer_count, 1);
  assert.equal(res.rows[0].avg_invoice, 750);
  const riley = res.rows.find((r) => r.salesperson === 'Riley');
  assert.equal(riley.total, 860.25);
  assert.equal(riley.customer_count, 2, 'c3 + c2 distinct');
  assert.equal(riley.avg_invoice, 430.13, '860.25/2 → cent-rounded dollars');
  const un = res.rows.find((r) => r.salesperson === '(unassigned)');
  assert.equal(un.total, 120);
  assert.equal(res.summary.totals.total, 2480.25, 'rep rollup reconciles to invoice totals');
  // completed basis flips the leaderboard
  const comp = run('sales_by_salesperson', { date_basis: 'completed' });
  assert.equal(comp.rows.length, 2, 'unassigned i5 never completed → dropped');
  assert.equal(comp.rows[0].salesperson, 'Riley');
  assert.equal(comp.rows[0].total, 1110.25, 'i3 250 + i4 800 + i10 60.25');
  assert.equal(comp.summary.totals.total, 1610.25);

  // monthly 'month' — month columns aggregate across years
  const monthly = run('sales_by_salesperson', { date_range: UNBOUNDED, monthly: 'month' });
  const mcols = monthly.columns.map((c) => c.key);
  assert.ok(mcols.includes('m01') && mcols.includes('m12'), 'dynamic month columns emitted');
  assert.equal(monthly.columns.length, 16, 'salesperson + invoices + 12 months + total + avg');
  const sam = monthly.rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.total, 1870, 'Sam = i1 1000 + i2 500 + i8 320 + i11 50');
  assert.equal(sam.invoice_count, 4);
  assert.equal(sam.m11, 1500, 'Nov months: i1+i2');
  assert.equal(sam.m12, 320, 'Dec month: i8 (fee-inclusive total)');
  assert.equal(sam.m10, 0, 'no October sales');
  const ril = monthly.rows.find((r) => r.salesperson === 'Riley');
  assert.equal(ril.m10, 250, 'i3 Oct');
  assert.equal(ril.m11, 860.25, 'i4+i10 Nov');
  assert.equal(ril.m12, 400, 'i9 Dec-2025 merges into the Dec column (all years)');
  assert.equal(monthly.summary.totals.m11, 2480.25, '1500 + 860.25 + 120 — all Nov activity in m11');
  assert.equal(monthly.summary.totals.total, 3500.25);

  // monthly 'month_year' — years as rows inside each rep group
  const crosstab = run('sales_by_salesperson', { date_range: UNBOUNDED, monthly: 'month_year' });
  const xcols = crosstab.columns.map((c) => c.key);
  assert.ok(xcols.includes('year') && xcols.includes('m11') && xcols.includes('total'), 'year + month + total columns');
  assert.equal(crosstab.columns.length, 18, 'salesperson+year+customers+invoices+12 months+total+avg');
  const rileyYears = crosstab.rows.filter((r) => r.salesperson === 'Riley');
  assert.equal(rileyYears.length, 2, 'Riley spans 2025 + 2026');
  assert.equal(rileyYears[0].year, '2025', 'years ascending inside the rep group');
  assert.equal(rileyYears[0].m12, 400, 'i9 lands in Dec-2025');
  assert.equal(rileyYears[0].invoice_count, 1);
  assert.equal(rileyYears[1].year, '2026');
  assert.equal(rileyYears[1].m10, 250);
  assert.equal(rileyYears[1].m11, 860.25);
  assert.equal(rileyYears[1].invoice_count, 3);
  assert.equal(rileyYears[1].total, 1110.25);
  const samYears = crosstab.rows.filter((r) => r.salesperson === 'Sam');
  assert.equal(samYears.length, 2, 'Sam 2026 + the undated i11 row');
  assert.equal(samYears[0].year, '2026');
  assert.equal(samYears[0].m11, 1500);
  assert.equal(samYears[0].total, 1820, 'dated Sam rows only (i1+i2+i8)');
  assert.equal(samYears[1].year, '(undated)', 'undated invoices trail as their own year row');
  assert.equal(samYears[1].invoice_count, 1);
  assert.equal(samYears[1].total, 50);
  assert.equal(samYears[1].m11, 0, 'undated contributes no month cell');
  // crosstab still foots to member totals
  assert.equal(crosstab.summary.totals.total, 3500.25);
  assert.equal(crosstab.summary.totals.invoice_count, 9);
  assert.equal(crosstab.summary.totals.m11, 2480.25);
  // rep filter narrows the crosstab too
  const justRiley = run('sales_by_salesperson', { date_range: UNBOUNDED, monthly: 'month_year', salesperson: 'riley' });
  assert.equal(justRiley.rows.length, 2);
  assert.ok(justRiley.rows.every((r) => r.salesperson === 'Riley'));
}

// === 4. sales_by_entered_by ========================================================
{
  const res = run('sales_by_entered_by');
  assert.equal(res.rows.length, 4, 'kim, jo, (unassigned), lee');
  assert.equal(res.rows[0].entered_by, 'kim@shop');
  assert.equal(res.rows[0].total, 1500);
  assert.equal(res.rows[0].invoice_count, 2);
  const jo = res.rows.find((r) => r.entered_by === 'jo@shop');
  assert.equal(jo.total, 800);
  assert.equal(jo.customer_count, 1);
  const un = res.rows.find((r) => r.entered_by === '(unassigned)');
  assert.equal(un.total, 120, 'i5 entered_by blank → unassigned group');
  assert.equal(res.summary.totals.total, 2480.25);
  assert.equal(res.summary.totals.customer_count, 3, 'distinct customer ids c1,c3,c2 — blank skipped');
  // entered_by chain: created_by fills when entered_by absent
  const rows = salesInvoiceRows(
    [{ id: 'x1', status: 'sent', issue_date: '2026-11-02', created_by: 'system@import', total: 10 }],
    { from: '2026-11-01', to: '2026-11-30' },
  );
  assert.equal(rows[0].entered_by, 'system@import', 'created_by fallback');
}

// === 5. sales_by_income_account ====================================================
{
  const res = run('sales_by_income_account');
  assert.equal(res.rows.length, 3, '4000 + 4100 + unmapped');
  const a4000 = res.rows.find((r) => r.account_code === '4000');
  assert.equal(a4000.account_name, 'Sales Income', 'IncomeAccount lookup resolves');
  assert.equal(a4000.total, 1960.25, '600 + 500 + 800 + 60.25');
  assert.equal(a4000.invoice_count, 4, 'i1,i2,i4,i10 post to 4000');
  assert.equal(a4000.split_count, 4);
  const a4100 = res.rows.find((r) => r.account_code === '4100');
  assert.equal(a4100.total, 300);
  assert.equal(a4100.account_name, 'Services Income');
  const unmapped = res.rows.find((r) => r.account_code === null);
  assert.ok(unmapped, 'i5 has no splits → unmapped bucket');
  assert.equal(unmapped.account_label, '(unmapped)');
  assert.equal(unmapped.total, 120, 'no splits → whole income base posts to unmapped');
  assert.equal(res.summary.totals.total, 2380.25, 'foots to income base (pre-tax), not 2480.25 invoice total');
  assert.equal(res.summary.totals.invoice_count, 5, 'distinct member invoices (i1 posts to two accounts, counted once)');
  // unbounded: i8 fee-adjusted base 320 joins unmapped; i9 adds 4100
  const all = run('sales_by_income_account', { date_range: UNBOUNDED });
  assert.equal(all.summary.totals.total, 3400.25, 'Σ income bases of all members');
  const allUnmapped = all.rows.find((r) => r.account_code === null);
  assert.equal(allUnmapped.total, 440, 'i5 base 120 + i8 fee-adjusted base 320');
  const allA4100 = all.rows.find((r) => r.account_code === '4100');
  assert.equal(allA4100.total, 950, '300 + 250 + 400');
}

// === 6. sales_by_product_category ==================================================
{
  const res = run('sales_by_product_category');
  const cats = Object.fromEntries(res.rows.map((r) => [r.category, r]));
  assert.equal(res.rows.length, 4, 'Signs, Install, Service, (uncategorized)');
  assert.equal(cats['Signs'].total, 1900, '600 + 500 + 800');
  assert.equal(cats['Signs'].line_count, 3);
  assert.equal(cats['Signs'].quantity, 4, 'qty 2+1+1 across the three Signs lines');
  assert.equal(cats['Signs'].invoice_count, 3, 'i1,i2,i4');
  assert.equal(cats['Install'].total, 300);
  assert.equal(cats['Service'].total, 60.25);
  assert.equal(cats['(uncategorized)'].total, 120, 'i5 line has no category');
  assert.ok(Math.abs(cats['Signs'].share_of_total - 1900 / 2380.25) < 1e-9, 'share = cat/grand');
  assert.equal(res.summary.totals.total, 2380.25, 'foots to Σ line totals (pre-tax, pre-fee)');
  assert.equal(res.summary.totals.invoice_count, 5, 'distinct invoices across categories');
  assert.equal(res.summary.totals.quantity, 7);
  assert.equal(res.summary.totals.line_count, 6);
  // unbounded adds i3/i8/i9/i10 Service+Install+Signs and keeps i11
  const all = run('sales_by_product_category', { date_range: UNBOUNDED });
  assert.equal(all.summary.totals.total, 3380.25, 'Σ line totals of all members (fee_lines excluded by design)');
  const allCats = Object.fromEntries(all.rows.map((r) => [r.category, r]));
  assert.equal(allCats['Service'].total, 710.25, '250 + 400 + 60.25');
  assert.equal(allCats['Install'].total, 600, 'i1 300 + i8 300');
  assert.equal(allCats['Signs'].total, 1950, 'adds i11 50');
}

// === engine interop: CSV export + meta echo =======================================
{
  const res = run('sales_by_customer');
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.split('\n')[0].includes('Customer'), 'CSV header');
  assert.ok(csv.includes('Acme Sign Co'), 'CSV emits customer names');
  assert.ok(csv.includes('1500'), 'CSV keeps raw totals');
  assert.equal(res.meta.reportId, 'sales_by_customer');
  assert.equal(res.meta.paramEcho.date_basis, 'created', 'basis echoed in meta');
  assert.equal(res.meta.paramEcho.date_range.preset, 'this_month', 'resolved range echoed');
  // direct spec.run() bypass — monthly:true spelling tolerated
  const direct = SALES_REPORTS_BY_ID.sales_by_salesperson.run(
    { date_basis: 'created', monthly: true, date_range: UNBOUNDED },
    { invoices: INVOICES, customers: CUSTOMERS },
  );
  assert.ok(Array.isArray(direct.columns), 'direct run still emits dynamic columns');
  assert.ok(direct.rows.some((r) => r.salesperson === 'Sam' && r.m11 === 1500), 'boolean monthly → month mode');
}

rmSync(out, { force: true });
rmSync(resolve(here, '.tmp-sr-check.mjs'), { force: true });
console.log('PASS sales-reports');

