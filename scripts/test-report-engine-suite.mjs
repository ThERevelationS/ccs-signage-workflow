// N-04 (worker w-127) — report engine suite: fixture-driven reconciliation
// coverage across the top report packs. One canonical "small shop" dataset is
// esbuild-bundled through every pack so independent report paths must produce
// the same totals (AR == invoice balances, sales == financial invoiced,
// funnel orders == WO count, analytics pipeline == estimate pipeline,
// register net == customer_payments net, tax model == financial replica).
// Verification only — this file never edits model code; a mismatch is a
// defect to report, not something to patch.
//
// Run: node scripts/test-report-engine-suite.mjs  →  prints PASS report-engine-suite

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = (...p) => resolve(here, '..', ...p);
const tmpFiles = [];
const bundle = async (entry, tag) => {
  const out = repo('scripts', `.tmp-suite-${tag}.mjs`);
  buildSync({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  tmpFiles.push(out);
  return import(pathToFileURL(out).href);
};

// --- assertion counter --------------------------------------------------------
let COUNT = 0;
const eq = (a, b, msg) => { COUNT++; assert.equal(a, b, msg); };
const deq = (a, b, msg) => { COUNT++; assert.deepEqual(a, b, msg); };
const ok = (v, msg) => { COUNT++; assert.ok(v, msg); };
const thr = (fn, msg) => { COUNT++; assert.throws(fn, undefined, msg); };
const nt = (fn, msg) => { COUNT++; assert.doesNotThrow(fn, msg); };

// --- deterministic clocks ------------------------------------------------------
// Engine `now` is a LOCAL Date; as-of params are 'YYYY-MM-DD' text; the
// analytics/funnel models take UTC day stamps. All three pin 2026-11-15.
const NOW = new Date(2026, 10, 15, 12, 0, 0);
const AS_OF = '2026-11-15';
const ANALYTICS_NOW = '2026-11-15T00:00:00Z';
const FUNNEL_WINDOW = { from: '2026-01-01', to: '2026-12-31' };

// =============================================================================
// Canonical small-shop fixture — ONE dataset every pack reads.
// =============================================================================

const customers = [
  {
    id: 'c1', company_name: 'Acme Sign Co', salesperson: 'Sam Sales',
    customer_status: 'active', customer_type: 'Commercial',
    industry_type: 'Retail', origination_path: 'Referral',
    credit_limit: 5000, credit_terms_days: 30, in_store_credit_balance: 75,
    contact_first_name: 'Alice', contact_last_name: 'Anderson',
    contact_email: 'alice@acme.example', company_phone: '513-555-0100',
    billing_address_1: '100 Main St', billing_city: 'Cincinnati',
    billing_state: 'OH', billing_postal_code: '45202', billing_country: 'USA',
    created_date: '2026-01-05',
  },
  {
    id: 'c2', name: 'Beta Works', salesperson: 'Rey Repp',
    customer_status: 'active', customer_type: 'Commercial',
    industry_type: 'Manufacturing', master_account_id: 'c1',
    credit_limit: 1000,
    contact_email: 'ops@betaworks.example', company_phone: '859-555-0200',
    billing_city: 'Florence', billing_state: 'KY', billing_postal_code: '41042',
    created_date: '2026-02-10',
  },
  {
    id: 'c3', company: 'Cedar LLC', salesperson: 'Sam Sales',
    customer_status: 'lead', customer_type: 'Nonprofit',
    contact_first_name: 'Carol', contact_last_name: 'Cedar',
    created_date: '2026-03-15',
    tax_exemption: {
      status: 'active', reason: 'Resale', certificate_id: 'OH-EX-123',
      issued_by: 'Ohio Dept. of Taxation', expires_on: '2027-12-31',
    },
  },
];

const estimates = [
  // e1 converted via approved + work-order link (day comes from w1 created).
  {
    id: 'e1', estimate_number: 'EST-1001', status: 'approved',
    work_order_id: 'w1', customer_id: 'c1', salesperson: 'Sam Sales',
    project_name: 'Acme channel letters', quote_total: 3000,
    created_date: '2026-09-01', quote_issue_date: '2026-09-03',
    accepted_at: '2026-09-08',
  },
  // e2 open pipeline (sent, undecided).
  {
    id: 'e2', estimate_number: 'EST-1002', status: 'sent',
    customer_id: 'c2', salesperson: 'Rey Repp',
    project_name: 'Beta monument', quote_total: 1500,
    created_date: '2026-10-01', quote_issue_date: '2026-10-03',
  },
  // e3 open pipeline (draft — never sent).
  {
    id: 'e3', estimate_number: 'EST-1003', status: 'draft',
    customer_id: 'c2', salesperson: 'Rey Repp',
    project_name: 'Beta lobby plaque', quote_total: 700,
    created_date: '2026-11-01',
  },
  // e4 converted via legacy 'won' status.
  {
    id: 'e4', estimate_number: 'EST-1004', status: 'won',
    customer_id: 'c3', salesperson: 'Sam Sales', sales_stage: 'won',
    project_name: 'Cedar directory', quote_total: 900,
    created_date: '2026-08-15', quote_issue_date: '2026-08-20',
    converted_at: '2026-09-01',
  },
  // e5 lost — terminal, decided, out of pipeline.
  {
    id: 'e5', estimate_number: 'EST-1005', status: 'lost',
    customer_id: 'c1', salesperson: 'Sam Sales',
    project_name: 'Acme pylon', quote_total: 2000,
    created_date: '2026-07-01',
  },
];

const work_orders = [
  {
    id: 'w1', title: 'WO-101 Acme channel letters', current_stage: 'production',
    customer_id: 'c1', client_name: 'Acme Sign Co', sales_rep: 'Sam Sales',
    estimate_id: 'e1', created_date: '2026-09-10', date_order_created: '2026-09-10',
    fulfillment_method: 'installation', project_install_date: '2026-11-20',
    install_location: '100 Main St', city: 'Cincinnati', state: 'OH', zip: '45202',
    products: [
      {
        id: 'p1', description: 'Channel letters', product_type: 'signage',
        operational_status: 'in_production', quantity: 1, quoted_total: 1800,
        priority: 3, responsibility: 'Fabrication',
        parts: [
          { part_name: '3mm ACM Sheet', unit: 'sheet', quantity: 2, unit_cost: 45, vendor_name: 'AluSupply', mfg_part_number: 'ACM-3MM' },
          { part_name: 'LED Module', unit: 'ea', quantity: 12, unit_cost: 8.5, vendor_name: 'BrightLED' },
        ],
      },
      {
        id: 'p2', description: 'Raceway', product_type: 'electrical',
        operational_status: 'built', operational_status_changed_at: '2026-11-02',
        quantity: 1, quoted_total: 1200, fulfillment_state: 'awaiting_installation',
        responsibility: 'Fabrication',
      },
    ],
  },
  {
    id: 'w2', title: 'WO-102 Beta monument', current_stage: 'design',
    customer_id: 'c2', client_name: 'Beta Works', sales_rep: 'Rey Repp',
    created_date: '2026-10-05', date_order_created: '2026-10-05',
    products: [
      {
        id: 'p3', description: 'Monument sign', product_type: 'signage',
        operational_status: 'design_review', quantity: 1, quoted_total: 900,
        parts: [
          { part_name: 'LED Module', unit: 'ea', quantity: 6, unit_cost: 8.5, vendor_name: 'BrightLED' },
        ],
      },
    ],
  },
  {
    id: 'w3', title: 'WO-103 Cedar directory', current_stage: 'completed',
    completed: true, completed_date: '2026-10-20',
    customer_id: 'c3', client_name: 'Cedar LLC', sales_rep: 'Sam Sales',
    created_date: '2026-08-20', date_order_created: '2026-08-20',
    products: [
      {
        id: 'p4', description: 'Directory board', product_type: 'signage',
        operational_status: 'built', quantity: 1, quoted_total: 2500,
        fulfillment_state: 'installed',
        status_history: [
          { at: '2026-10-15', field: 'operational_status', to: 'built' },
        ],
      },
    ],
  },
  {
    id: 'w4', title: 'WO-104 Acme post & panel', current_stage: 'installation',
    customer_id: 'c1', client_name: 'Acme Sign Co', sales_rep: 'Sam Sales',
    created_date: '2026-11-01', date_order_created: '2026-11-01',
    fulfillment_method: 'delivery', due_date: '2026-11-25',
    install_location: '200 Elm Ave', city: 'Norwood', state: 'OH', zip: '45212',
    products: [
      {
        id: 'p5', description: 'Post & panel', product_type: 'signage',
        operational_status: 'in_production', quantity: 1, quoted_total: 600,
        priority: 1, responsibility: 'Fabrication',
        parts: [
          { part_name: '3mm ACM Sheet', unit: 'sheet', quantity: 1, unit_cost: 45, vendor_name: 'AluSupply' },
        ],
      },
    ],
  },
];

const revisions = [
  // status_transition → 'won' feeds e4's converted event in estimate_activity.
  {
    id: 'r1', estimate_id: 'e4', revision_type: 'status_transition',
    new_status: 'won', completed_at: '2026-09-01',
  },
];

const invoices = [
  // i1 — open AR, current bucket (due after as-of). Posted; linked to w1.
  {
    id: 'i1', invoice_number: 'INV-101', status: 'sent', customer_id: 'c1',
    work_order_id: 'w1', salesperson: 'Sam Sales', entered_by: 'Dana',
    issue_date: '2026-11-01', due_date: '2026-11-20',
    subtotal: 800, tax_amount: 60, total: 860, balance_due: 860,
    taxable_base: 800, tax_group_id: 'tg1',
    income_account_splits: [
      { income_account_code: '4000', amount: 500 },
      { income_account_code: '4100', amount: 300 },
    ],
    line_items: [{ quantity: 1, unit_price: 800, taxable: true, category: 'Signage' }],
  },
  // i2 — open AR, exactly 30 days past due → '1-30' boundary bucket.
  {
    id: 'i2', invoice_number: 'INV-102', status: 'partially_paid', customer_id: 'c1',
    salesperson: 'Sam Sales', entered_by: 'Dana',
    issue_date: '2026-09-15', due_date: '2026-10-16',
    subtotal: 750, tax_amount: 50, total: 800,
    amount_paid: 300, balance_due: 500,
    taxable_base: 750, tax_group_id: 'tg1',
    line_items: [{ line_total: 750, category: 'Prints' }],
  },
  // i3 — paid in full, no AR.
  {
    id: 'i3', invoice_number: 'INV-103', status: 'paid', customer_id: 'c2',
    salesperson: 'Rey Repp', entered_by: 'Kim',
    issue_date: '2026-08-01', due_date: '2026-08-31', paid_date: '2026-08-20',
    subtotal: 375, tax_amount: 25, total: 400,
    amount_paid: 400, balance_due: 0,
    taxable_base: 375, tax_group_id: 'tg1',
    income_account_splits: [{ income_account_code: '4000', amount: 375 }],
    line_items: [{ line_total: 375, category: 'Signage' }],
  },
  // i4 — open AR, 92 days past due → '90+'. Untaxed + flagged exempt.
  {
    id: 'i4', invoice_number: 'INV-104', status: 'sent', customer_id: 'c2',
    salesperson: 'Rey Repp', entered_by: 'Kim',
    issue_date: '2026-07-01', due_date: '2026-08-15',
    subtotal: 200, tax_amount: 0, total: 200, balance_due: 200,
    tax_exempt: true, exemption_reason: 'Resale', exemption_certificate_id: 'OH-EX-123',
    line_items: [{ line_total: 200, category: 'Service' }],
  },
  // i5 — draft: excluded from sales/AR/tax but appears in invoice_summary's
  // draft bucket AND counts as c3 credit exposure (documented quirk).
  {
    id: 'i5', invoice_number: 'INV-105', status: 'draft', customer_id: 'c3',
    issue_date: '2026-11-10', subtotal: 999, total: 999, balance_due: 999,
  },
  // i6 — void: only surfaces under void_policy include/only.
  {
    id: 'i6', invoice_number: 'INV-106', status: 'void', customer_id: 'c3',
    issue_date: '2026-10-01', total: 777,
  },
];

const payments = [
  {
    id: 'p1', invoice_id: 'i3', customer_id: 'c2', amount: 400,
    status: 'recorded', method: 'check', reference_number: 'CHK-1042',
    paid_date: '2026-08-20', created_by: 'Kim',
  },
  {
    id: 'p2', invoice_id: 'i2', customer_id: 'c1', amount: 300,
    status: 'recorded', method: 'card', reference_number: 'CARD-881',
    paid_date: '2026-10-01', created_by: 'Kim',
  },
  {
    id: 'p3', invoice_id: 'i3', customer_id: 'c2', amount: -150,
    status: 'refunded', method: 'card', paid_date: '2026-10-05',
    refund_of_payment_id: 'p1', created_by: 'Kim',
  },
  {
    id: 'p4', invoice_id: 'i1', customer_id: 'c1', amount: -75,
    status: 'recorded', method: 'credit_memo', paid_date: '2026-11-05',
    created_by: 'Sam',
  },
  {
    id: 'p5', invoice_id: 'i2', customer_id: 'c1', amount: 100,
    status: 'void', method: 'cash', paid_date: '2026-10-02',
  },
];

const credit_ledger = [
  { id: 'l1', kind: 'credit_issued', customer_id: 'c1', amount: 75, amount_cents: 7500, occurred_at: '2026-10-01' },
  { id: 'l2', kind: 'credit_applied', customer_id: 'c1', amount: -25, amount_cents: -2500, invoice_id: 'i2', occurred_at: '2026-10-15' },
];

const tax_groups = [
  { id: 'tg1', group_name: 'Ohio Combined Rate', tax_percent: 7.5, agency_id: 'ag1' },
];
const agencies = [
  { id: 'ag1', name: 'Ohio Dept. of Taxation', state: 'OH' },
];
const income_accounts = [
  { code: '4000', name: 'Sign Sales' },
  { code: '4100', name: 'Print Sales' },
];
const responsibilities = [
  { id: 'resp1', name: 'Fabrication', sort: 1 },
];
// Notifications are deliberately part of the canonical fixture even though no
// report pack consumes them — they must be inert.
const notifications = [
  { id: 'n1', kind: 'order_ready', work_order_id: 'w3', created_date: '2026-10-20', status: 'unread' },
  { id: 'n2', kind: 'payment_received', invoice_id: 'i2', created_date: '2026-10-01', status: 'read' },
];

// One canonical data blob — snake_case entity lists plus the camelCase
// aliases individual models document (funnel/analytics take workOrders).
const DATA = {
  customers,
  estimates,
  work_orders,
  workOrders: work_orders,
  revisions,
  invoices,
  payments,
  credit_ledger,
  creditLedger: credit_ledger,
  tax_groups,
  agencies,
  accounts: income_accounts,
  income_accounts,
  responsibilities,
  builder_products: [],
  contacts: [],
  notifications,
};

// Fixture expectations (hand-computed — kept next to the data so a fixture
// edit updates the expected column, not the assertion logic).
const EXPECT = {
  openArCents: 156000,          // i1 860 + i2 500 + i4 200
  openArCount: 3,
  arBucket: { current: 860, '1-30': 500, '31-60': 0, '61-90': 0, '90+': 200 },
  postedTotalCents: 226000,     // i1..i4 posted invoices
  postedCount: 4,
  incomeCents: 212500,          // subtotal bases: 800+750+375+200
  pipelineCents: 220000,        // e2 1500 + e3 700 (open, undecided)
  registerNetCents: 47500,      // 400+300-150-75 (p5 void out)
  taxCents: 13500,              // 60+50+25
  taxableCents: 192500,         // 800+750+375
  wipProductCents: 330000,      // p1 1800 + p3 900 + p5 600 (open products)
  wipOrderCents: 450000,        // w1 3000 + w2 900 + w4 600 (open order totals)
  builtCents: 370000,           // p2 1200 + p4 2500
};

// =============================================================================
// Bundle every pack, then run the suite.
// =============================================================================

let engine, ar, sales, production, estimates_pack, financial, customer, analytics, register, tax, funnel;
try {
  engine = await bundle(repo('src/components/reports/reportEngine.js'), 'engine');
  ar = await bundle(repo('base44/shared/arAgingReports.ts'), 'ar-aging');
  sales = await bundle(repo('base44/shared/salesReports.ts'), 'sales');
  production = await bundle(repo('base44/shared/productionReports.ts'), 'production');
  estimates_pack = await bundle(repo('base44/shared/estimateReports.ts'), 'estimates');
  financial = await bundle(repo('base44/shared/financialReports.ts'), 'financial');
  customer = await bundle(repo('base44/shared/customerReports.ts'), 'customer');
  analytics = await bundle(repo('base44/shared/customerAnalyticsModel.ts'), 'analytics');
  register = await bundle(repo('base44/shared/paymentRegisterModel.ts'), 'register');
  tax = await bundle(repo('base44/shared/taxLiabilityModel.ts'), 'tax');
  funnel = await bundle(repo('base44/shared/salesFunnelModel.ts'), 'funnel');
} catch (err) {
  for (const f of tmpFiles) rmSync(f, { force: true });
  throw err;
}

const { defineReport, runReport, rowsToCsv, formatCellValue, resolveDateRange, voidPolicyFilter } = engine;

// Registry table — one canonical DATA for every pack.
const PACKS = [
  { name: 'arAgingReports', reports: ar.AR_AGING_REPORTS, byId: ar.AR_AGING_REPORTS_BY_ID },
  { name: 'salesReports', reports: sales.SALES_REPORTS, byId: sales.SALES_REPORTS_BY_ID },
  { name: 'productionReports', reports: production.PRODUCTION_REPORTS, byId: production.PRODUCTION_REPORTS_BY_ID },
  { name: 'estimateReports', reports: estimates_pack.ESTIMATE_REPORTS, byId: estimates_pack.ESTIMATE_REPORTS_BY_ID },
  { name: 'financialReports', reports: financial.FINANCIAL_REPORTS, byId: financial.FINANCIAL_REPORTS_BY_ID },
  { name: 'customerReports', reports: customer.CUSTOMER_REPORTS, byId: customer.CUSTOMER_REPORTS_BY_ID },
];

// Params every spec resolves; extras are ignored by runReport.
const PARAMS = { as_of: AS_OF, date_range: { preset: 'custom' }, days: 10, rate: 10 };
const runSpec = (spec, params = {}, data = DATA) =>
  runReport(defineReport(spec), { params: { ...PARAMS, ...params }, data, now: NOW });
const specById = (pack, id) => {
  const spec = pack.byId?.[id];
  if (!spec) throw new Error(`unknown report_id "${id}" (${pack.name})`);
  return spec;
};

// --- A. registry shape: every entry has the required spec fields ---------------
eq(PACKS.reduce((s, p) => s + p.reports.length, 0), 41, 'catalog holds 41 report specs across 6 packs');
const ALL_SPECS = [];
for (const pack of PACKS) {
  ok(Array.isArray(pack.reports) && pack.reports.length > 0, `${pack.name} exports a non-empty report array`);
  ok(pack.byId && typeof pack.byId === 'object', `${pack.name} exports a by-id registry`);
  const ids = new Set();
  for (const spec of pack.reports) {
    ok(typeof spec.id === 'string' && spec.id.length > 0, `${pack.name} spec has a string id`);
    ids.add(spec.id);
    ok(typeof spec.name === 'string' && spec.name.length > 0, `${pack.name}.${spec.id} has a name`);
    ok(engine.REPORT_CATEGORIES.includes(spec.category), `${spec.id} category "${spec.category}" is a REPORT_CATEGORIES member`);
    ok(Array.isArray(spec.columns) && spec.columns.length > 0, `${spec.id} declares columns`);
    ok(spec.columns.every((c) => typeof c?.key === 'string' && c.key), `${spec.id} every column has a key`);
    ok(typeof spec.run === 'function', `${spec.id} has a run() function`);
    nt(() => defineReport(spec), `${spec.id} passes engine defineReport validation`);
    ok(pack.byId[spec.id] === spec, `${pack.name}_BY_ID[${spec.id}] maps to the same spec object`);
    ALL_SPECS.push({ pack, spec });
  }
  eq(ids.size, pack.reports.length, `${pack.name} report ids are unique`);
  deq(new Set(Object.keys(pack.byId)), ids, `${pack.name}_BY_ID keys exactly cover the registry`);
  // Engine-level: unknown report_id must fail.
  thr(() => specById(pack, 'not_a_real_report'), `${pack.name} unknown report_id throws`);
  thr(() => runSpec(pack.byId['not_a_real_report']), `${pack.name} unknown spec cannot be run through the engine`);
}

// --- B. every spec runs on the fixture AND on empty data ------------------------
const fixtureResults = new Map();
for (const { pack, spec } of ALL_SPECS) {
  let res;
  nt(() => { res = runSpec(spec); }, `${spec.id} runs on fixture data`);
  ok(res && Array.isArray(res.rows), `${spec.id} returns rows[]`);
  eq(res.meta.reportId, spec.id, `${spec.id} meta.reportId echoes the id`);
  eq(res.meta.rowCount, res.rows.length, `${spec.id} meta.rowCount matches rows.length`);
  ok(res.meta.generatedAt.startsWith('2026-11-15'), `${spec.id} generatedAt pins the injected now`);
  ok(res.summary && typeof res.summary === 'object', `${spec.id} summary object present`);
  fixtureResults.set(spec.id, res);
}
for (const { spec } of ALL_SPECS) {
  nt(() => {
    const r = runSpec(spec, {}, {});
    assert.ok(Array.isArray(r.rows), 'rows[]');
  }, `${spec.id} does not throw on an empty dataset`);
}
const R = (id) => fixtureResults.get(id);
const totals = (id) => R(id)?.summary?.totals ?? {};

// --- C. AR reconciliation -------------------------------------------------------
// C1: the four AR paths foot to the same grand total, and to the raw fixture.
{
  const detail = R('ar_aging_detail');
  eq(detail.rows.length, EXPECT.openArCount, 'ar_aging_detail lists the 3 open-balance invoices');
  eq(totals('ar_aging_detail').balance, EXPECT.openArCents / 100, 'ar_aging_detail total balance = Σ open balance_due');
  eq(totals('ar_aging_summary').balance, EXPECT.openArCents / 100, 'ar_aging_summary total = detail total');
  eq(totals('ar_aging_by_customer').total, EXPECT.openArCents / 100, 'ar_aging_by_customer total = detail total');
  eq(totals('ar_aging_by_salesperson').total, EXPECT.openArCents / 100, 'ar_aging_by_salesperson total = detail total');
  eq(totals('ar_aging_summary').invoice_count, EXPECT.openArCount, 'summary invoice count');
  // Independent recompute straight off the fixture — the brief's core check.
  const expected = invoices
    .filter((i) => !['draft', 'void'].includes(i.status) && Number(i.balance_due) > 0)
    .reduce((s, i) => s + Number(i.balance_due), 0);
  eq(totals('ar_aging_summary').balance, expected, 'AR grand total == invoice-level Σ balance_due on the same fixture');
  // Bucket placement incl. boundary days (i2 is exactly 30 past due → 1-30).
  const buckets = Object.fromEntries(R('ar_aging_summary').rows.map((r) => [r.bucket, r.balance]));
  eq(buckets.current, EXPECT.arBucket.current, 'current bucket holds i1 (due after as-of)');
  eq(buckets['1-30'], EXPECT.arBucket['1-30'], '1-30 bucket holds i2 at exactly 30 days');
  eq(buckets['90+'], EXPECT.arBucket['90+'], '90+ bucket holds i4 at 92 days');
  eq(buckets['31-60'] ?? 0, 0, 'empty 31-60 bucket still emits');
  eq(buckets['61-90'] ?? 0, 0, 'empty 61-90 bucket still emits');
  eq(R('ar_aging_summary').rows.length, 5, 'summary emits all five canonical buckets');
  // arAgingBucket unit boundaries (days past due → bucket).
  eq(ar.arAgingBucket(0), 'current', 'bucket fn: 0 days');
  eq(ar.arAgingBucket(30), '1-30', 'bucket fn: 30-day boundary');
  eq(ar.arAgingBucket(31), '31-60', 'bucket fn: 31 days');
  eq(ar.arAgingBucket(60), '31-60', 'bucket fn: 60-day boundary');
  eq(ar.arAgingBucket(61), '61-90', 'bucket fn: 61 days');
  eq(ar.arAgingBucket(90), '61-90', 'bucket fn: 90-day boundary');
  eq(ar.arAgingBucket(91), '90+', 'bucket fn: 91 days');
  // Cross-pack: customer_balance open AR must tie to the aging grand total.
  eq(totals('customer_balance').open_balance, EXPECT.openArCents / 100, 'customer_balance open total == AR aging total');
  const balByCustomer = Object.fromEntries(R('customer_balance').rows.map((r) => [r.customer_id, r.open_balance]));
  eq(balByCustomer.c1, 1360, 'customer_balance: c1 owes i1+i2');
  eq(balByCustomer.c2, 200, 'customer_balance: c2 owes i4');
  // Cross-pack: invoice_summary posted-status balance ties to AR too.
  const postedBalance = R('invoice_summary').rows
    .filter((r) => ['sent', 'partially_paid', 'paid'].includes(r.status))
    .reduce((s, r) => s + r.balance, 0);
  eq(postedBalance, EXPECT.openArCents / 100, 'invoice_summary posted balance == AR total');
}

// --- D. sales ↔ financial reconciliation ----------------------------------------
{
  eq(totals('sales_by_customer').total, EXPECT.postedTotalCents / 100, 'sales_by_customer invoiced total = posted invoice sum');
  eq(totals('sales_by_customer').invoice_count, EXPECT.postedCount, 'sales_by_customer invoice count');
  const postedTotal = R('invoice_summary').rows
    .filter((r) => ['sent', 'partially_paid', 'paid'].includes(r.status))
    .reduce((s, r) => s + r.total, 0);
  eq(postedTotal, EXPECT.postedTotalCents / 100, 'invoice_summary posted total == sales invoiced total');
  eq(totals('invoice_summary').total, 3259, 'invoice_summary grand total includes the draft row (posted + draft)');
  const statusRows = Object.fromEntries(R('invoice_summary').rows.map((r) => [r.status, r]));
  eq(statusRows.draft.invoice_count, 1, 'invoice_summary keeps a draft bucket (i5)');
  eq(statusRows.draft.total, 999, 'draft bucket total');
  eq(statusRows.sent.invoice_count, 2, 'sent bucket: i1+i4');
  eq(statusRows.paid.invoice_count, 1, 'paid bucket: i3');
  // Void policy on the same report path: only/include change membership honestly.
  const onlyVoid = runSpec(specById(PACKS[4], 'invoice_summary'), { void_policy: 'only' });
  eq(onlyVoid.summary.totals.invoice_count, 1, 'invoice_summary void_policy=only keeps only the void invoice');
  eq(onlyVoid.summary.totals.total, 777, 'void bucket total under only');
  const inclVoid = runSpec(specById(PACKS[4], 'invoice_summary'), { void_policy: 'include' });
  eq(inclVoid.summary.totals.invoice_count, 6, 'invoice_summary void_policy=include counts every row');
  // Income side: three independent money paths must foot to the same base.
  eq(totals('sales_by_income_account').total, EXPECT.incomeCents / 100, 'sales_by_income_account total = income base');
  eq(totals('business_summary').income, EXPECT.incomeCents / 100, 'business_summary income == sales income-account total');
  eq(totals('sales_commission').sales, EXPECT.incomeCents / 100, 'sales_commission sales == income-account total');
  eq(totals('sales_by_product_category').total, EXPECT.incomeCents / 100, 'product-category lines foot to income base');
  eq(totals('sales_commission').commission, 212.5, 'commission = 10% of sales (rate param honored)');
  const acct = Object.fromEntries(R('sales_by_income_account').rows.map((r) => [r.account_code || '(unmapped)', r.total]));
  eq(acct['4000'], 875, 'account 4000: i1 500 + i3 375');
  eq(acct['4100'], 300, 'account 4100: i1 300');
  eq(acct['(unmapped)'], 950, 'unmapped: i2 750 + i4 200 (no stored splits)');
  const cat = Object.fromEntries(R('sales_by_product_category').rows.map((r) => [r.category, r.total]));
  eq(cat.Signage, 1175, 'Signage: i1 800 + i3 375');
  eq(cat.Prints, 750, 'Prints: i2');
  eq(cat.Service, 200, 'Service: i4');
  // Same membership through a different group dimension must give same totals.
  eq(totals('sales_by_salesperson').total, EXPECT.postedTotalCents / 100, 'sales_by_salesperson total == customer total');
  eq(totals('billing_locale').total, EXPECT.postedTotalCents / 100, 'billing_locale total == customer total');
  eq(totals('sales_by_entered_by').total, EXPECT.postedTotalCents / 100, 'sales_by_entered_by total == customer total');
  const reps = Object.fromEntries(R('sales_by_salesperson').rows.map((r) => [r.salesperson, r.total]));
  eq(reps['Sam Sales'], 1660, 'Sam: i1+i2');
  eq(reps['Rey Repp'], 600, 'Rey: i3+i4');
  // Completed basis only admits completed (paid-date) invoices.
  const completedBasis = runSpec(specById(PACKS[1], 'sales_by_customer'), { date_basis: 'completed' });
  eq(completedBasis.summary.totals.total, 400, 'completed basis keeps only paid invoices (i3)');
  // Bounded window sanity: the whole fixture is inside 2026.
  const year = runSpec(specById(PACKS[1], 'sales_by_customer'), { date_range: 'this_year' });
  eq(year.summary.totals.total, EXPECT.postedTotalCents / 100, 'this_year window matches unbounded (all fixture rows are 2026)');
  const novOnly = runSpec(specById(PACKS[1], 'sales_by_customer'), { date_range: 'this_month' });
  eq(novOnly.summary.totals.total, 860, 'this_month (Nov 2026) keeps only i1');
}

// --- E. sales funnel reconciliation ----------------------------------------------
{
  const counts = funnel.funnelCounts(
    { customers, estimates, workOrders: work_orders, revisions },
    FUNNEL_WINDOW,
  );
  const tileKeys = funnel.FUNNEL_TILE_KEYS ?? Object.keys(counts);
  for (const k of tileKeys) ok(counts[k] && Number.isFinite(counts[k].count), `funnel tile ${k} present`);
  eq(counts.orders_placed.count, work_orders.length, 'funnel orders_placed == work-order count');
  eq(counts.orders_placed.count, 4, 'orders_placed = 4');
  eq(counts.new_customers.count, customers.length, 'funnel new_customers == customer count');
  eq(counts.estimates_created.count, 5, 'funnel estimates_created == live estimate count');
  eq(counts.estimates_converted.count, 2, 'funnel estimates_converted = e1+e4');
  eq(counts.estimates_cancelled.count, 0, "'lost' estimate is not a cancellation");
  eq(counts.orders_built.count, 2, 'orders_built = w1 (p2 built) + w3 (completed implies built)');
  eq(counts.orders_completed.count, 1, 'orders_completed = w3');
  eq(counts.orders_closed.count, 0, 'no closed orders in fixture');
  eq(counts.voided_pre_completion.count + counts.voided_post_completion.count, 0, 'no voided orders in fixture');
  // Cross-pack: funnel orders_placed == open-WIP orders + the completed one.
  eq(counts.orders_placed.count, totals('wip_by_order_status').order_count + 1, 'funnel orders == WIP open orders + completed order');
  const rates = funnel.funnelConversionRates(counts);
  eq(rates.est_to_order_rate, 0.4, 'est_to_order = 2/5');
  eq(rates.order_completion_rate, 0.25, 'order_completion = 1/4');
  const tileRows = funnel.funnelTileRows(counts);
  eq(tileRows.length, tileKeys.length, 'funnelTileRows emits every tile');
  // Unbounded run lands the same counts (all evidence is in-window).
  const unbounded = funnel.funnelCounts({ customers, estimates, workOrders: work_orders, revisions }, {});
  eq(unbounded.orders_placed.count, 4, 'unbounded orders_placed also 4');
  eq(unbounded.orders_built.count, 2, 'unbounded orders_built also 2');
}

// --- F. analytics ↔ estimate-report reconciliation ---------------------------------
{
  const A = analytics.customerAnalytics(
    { invoices, workOrders: work_orders, estimates, payments, creditLedger: credit_ledger },
    { now: ANALYTICS_NOW },
  );
  const pipeline = R('estimates_current');
  eq(pipeline.rows.length, 2, 'estimates_current lists e2+e3 open pipeline');
  eq(totals('estimates_current').total, EXPECT.pipelineCents / 100, 'estimates_current total = open pipeline dollars');
  eq(A.estimates.open_pipeline_cents, EXPECT.pipelineCents, 'analytics open_pipeline_cents == estimates_current pipeline total');
  eq(A.estimates.open_pipeline_cents, Math.round(totals('estimates_current').total * 100), 'analytics pipeline cents foot to report dollars');
  eq(A.estimates.total, 5, 'analytics sees all 5 live estimates');
  eq(A.estimates.converted, 2, 'analytics converted = e1+e4');
  eq(A.estimates.converted, totals('conversions_by_salesperson').converted_count, 'analytics converted == conversions report converted');
  // `sent` is event-day based on the report path; the two implementations agree
  // under any bounded window that contains every sent day in the fixture.
  const convBounded = runSpec(specById(PACKS[3], 'conversions_by_salesperson'), {
    date_range: { preset: 'custom', from: '2026-01-01', to: '2026-12-31' },
  });
  eq(A.estimates.sent, convBounded.summary.totals.sent_count, 'analytics sent == conversions report sent (bounded window)');
  eq(A.lifetime.invoiced_cents, EXPECT.postedTotalCents, 'analytics lifetime invoiced == sales invoiced total');
  eq(A.lifetime.open_balance_cents, EXPECT.openArCents, 'analytics open balance == AR grand total');
  eq(A.lifetime.paid_cents, 70000, 'lifetime paid = stamped amount_paid (i2 300 + i3 400)');
  eq(A.year.paid_cents, 50000, 'year paid = payment rows 475 + credit applied 25');
  eq(A.lifetime.order_count, 7, 'order book = 4 WOs + 3 standalone invoices (i1 folds into w1)');
  eq(A.lifetime.completed_order_count, 2, 'completed = w3 + standalone paid i3');
  // Rollup path: totals across groups must foot to the fixture.
  eq(totals('estimates_by_customer').estimate_count, 5, 'estimates_by_customer count');
  eq(totals('estimates_by_customer').total, 8100, 'estimates_by_customer total = Σ quote_total');
  eq(totals('estimates_by_customer').converted_total, 3900, 'converted value = e1 3000 + e4 900');
}

// --- F2. FIXED DEFECT N-04.1 — regression pin --------------------------------------
// base44/shared/estimateReports.ts previously over-counted `sent_count` under
// an unbounded window: `dayInRange` returned true before checking the day
// exists, so never-sent rows (e3 'draft', e5 'lost' — sent_day='') counted as
// "sent". The fix requires `r.sent_day` non-empty at the two count sites
// (rollupEstimateRows, conversionSalespersonRows). Undated rows still survive
// unbounded MEMBERSHIP gating — only the event count needs evidence.
{
  const unbounded = R('conversions_by_salesperson'); // default PARAMS → unbounded
  eq(unbounded.summary.totals.sent_count, 3, 'N-04.1 fixed: unbounded sent_count == evidence-backed sends');
  eq(totals('estimates_by_customer').sent_count, 3, 'N-04.1 fixed: rollupEstimateRows sent_count matches');
  const bounded = runSpec(specById(PACKS[3], 'conversions_by_salesperson'), {
    date_range: { preset: 'custom', from: '2026-01-01', to: '2026-12-31' },
  });
  eq(bounded.summary.totals.sent_count, 3, 'bounded window drops undated sent_day rows');
  eq(
    unbounded.summary.totals.conversion_rate,
    bounded.summary.totals.conversion_rate,
    'N-04.1 fixed: unbounded conversion_rate == bounded (2/3), no deflation',
  );
}

// --- G. payment register ↔ customer_payments ---------------------------------------
{
  const rows = register.registerRows(payments, { customersById: customers, invoicesById: invoices });
  eq(rows.length, 5, 'register lists all 5 payment rows incl. void');
  const t = register.registerTotals(rows);
  eq(t.by_status.posted?.count, 3, 'register posted: p1,p2,p4');
  eq(t.by_status.refunded?.count, 1, 'register refunded: p3');
  eq(t.by_status.void?.count, 1, 'register void: p5');
  const nonVoid = register.filterRegister(rows, {}).filter((r) => r.status !== 'void');
  const nonVoidNet = nonVoid.reduce((s, r) => s + r.amount_cents, 0);
  eq(nonVoidNet, EXPECT.registerNetCents, 'non-void register net = 475.00');
  eq(totals('customer_payments').amount, EXPECT.registerNetCents / 100, 'customer_payments net == register non-void net');
  eq(totals('customer_payments').payments_received, 700, 'received = 400+300 (positive legs only)');
  eq(totals('customer_payments').refunds_issued, -225, 'refunds = refund -150 + credit memo -75');
  eq(R('customer_payments').rows.length, 4, 'customer_payments drops the void row under exclude');
  // The credit memo row travels as a negative recorded payment on both paths.
  const memo = register.filterRegister(rows, { method: 'credit_memo' });
  eq(memo.length, 1, 'register method filter finds the credit memo row');
  eq(memo[0].amount_cents, -7500, 'credit memo keeps its negative amount');
  const memoReport = runSpec(specById(PACKS[5], 'customer_payments'), { methods: ['credit_memo'] });
  eq(memoReport.rows.length, 1, 'customer_payments method filter finds the memo');
  eq(memoReport.rows[0].amount, -75, 'report memo amount');
  const voidOnly = runSpec(specById(PACKS[5], 'customer_payments'), { void_policy: 'only' });
  eq(voidOnly.rows.length, 1, 'void_policy=only keeps p5');
  eq(voidOnly.summary.totals.amount, 100, 'void-only net = 100');
  const refunded = register.filterRegister(rows, { q: 'CHK-1042' });
  eq(refunded.length, 1, 'q filter hits the check reference number');
}

// --- H. tax liability: model ↔ financial replica ↔ injected path ---------------------
{
  const modelRows = tax.taxLiabilityRows(invoices, { taxGroupsById: tax_groups, agenciesById: agencies });
  const replicaRows = financial.salesTaxLiabilityRows(invoices, { taxGroupsById: tax_groups, jurisdictionsById: agencies });
  const strip = (r) => ({
    name: r.name, agency: r.agency, tax_group_id: r.tax_group_id,
    taxable_cents: r.taxable_cents, tax_collected_cents: r.tax_collected_cents,
    exempt_sales_cents: r.exempt_sales_cents, invoice_count: r.invoice_count,
    exempt_count: r.exempt_count, rate: r.rate,
  });
  deq(replicaRows.map(strip), modelRows.map(strip), 'financialReports salesTaxLiabilityRows replica deep-equals taxLiabilityModel');
  eq(modelRows.length, 2, 'two liability buckets: tg1 + ungrouped');
  const tg = modelRows.find((r) => r.tax_group_id === 'tg1');
  eq(tg.taxable_cents, EXPECT.taxableCents, 'tg1 taxable = 800+750+375');
  eq(tg.tax_collected_cents, EXPECT.taxCents, 'tg1 tax = 60+50+25');
  eq(tg.invoice_count, 3, 'tg1 covers i1,i2,i3');
  const un = modelRows.find((r) => !r.tax_group_id);
  eq(un.name, 'No tax group', 'ungrouped bucket label');
  eq(un.exempt_sales_cents, 20000, 'ungrouped row carries i4 exempt sale');
  eq(un.exempt_count, 1, 'one exempt invoice');
  const summary = tax.liabilitySummary(modelRows);
  eq(summary.total_tax_cents, EXPECT.taxCents, 'liabilitySummary total tax');
  eq(summary.total_taxable_cents, EXPECT.taxableCents, 'liabilitySummary taxable');
  eq(summary.invoice_count, 4, 'liabilitySummary counts the 4 posted invoices');
  const rec = tax.reconcileLiability(modelRows, invoices);
  eq(rec.ok, true, 'reconcileLiability ties to the cent');
  eq(rec.delta_cents, 0, 'zero delta');
  eq(rec.expected_invoice_count, 4, 'reconcile expects 4 posted invoices');
  // The report spec must produce the same totals, replica AND injected model.
  eq(totals('sales_tax_liability').tax_collected, EXPECT.taxCents / 100, 'sales_tax_liability report tax total == model total');
  eq(totals('sales_tax_liability').invoice_count, 4, 'report invoice count');
  eq(totals('sales_tax_liability').exempt_sales, 200, 'report exempt sales');
  const injected = runSpec(specById(PACKS[4], 'sales_tax_liability'), {}, { ...DATA, taxLiabilityRows: tax.taxLiabilityRows });
  deq(
    injected.rows.map((r) => ({ name: r.name, taxable: r.taxable, tax_collected: r.tax_collected, invoice_count: r.invoice_count })),
    R('sales_tax_liability').rows.map((r) => ({ name: r.name, taxable: r.taxable, tax_collected: r.tax_collected, invoice_count: r.invoice_count })),
    'injected taxLiabilityRows produces identical report rows to the replica',
  );
  const exempt = tax.exemptSalesRows(invoices);
  eq(exempt.length, 1, 'exemptSalesRows finds i4');
  eq(exempt[0].exempt_sales_cents, 20000, 'exempt sale dollars');
}

// --- I. production pack -------------------------------------------------------------
{
  eq(totals('wip_by_product_status').product_count, 3, 'WIP products = p1,p3,p5 (p2 built + p4 complete-order out)');
  eq(totals('wip_by_product_status').value, EXPECT.wipProductCents / 100, 'WIP product value');
  eq(totals('wip_by_order_status').order_count, 3, 'open orders = w1,w2,w4 (w3 completed out)');
  eq(totals('wip_by_order_status').product_count, 4, 'order-status view counts all products incl. built p2');
  eq(totals('wip_by_order_status').value, EXPECT.wipOrderCents / 100, 'order-status value is order-level (includes built product)');
  const stages = Object.fromEntries(R('wip_by_order_status').rows.map((r) => [r.stage, r]));
  eq(stages.production?.order_count, 1, 'production stage holds w1');
  eq(stages.design?.order_count, 1, 'design stage holds w2');
  eq(stages.installation?.order_count, 1, 'installation stage holds w4');
  const statuses = Object.fromEntries(R('wip_by_product_status').rows.map((r) => [r.status, r]));
  eq(statuses.in_production?.product_count, 2, 'in_production products p1+p5');
  eq(statuses.design_review?.product_count, 1, 'design_review product p3');
  // Built evidence: production builtRows and financial builtProductRows must
  // agree on the same two products/days (shared evidence chains).
  const built = R('built_report');
  eq(built.rows.length, 2, 'built_report rows = p4 (built 10-15) + p2 (built 11-02)');
  eq(built.summary.totals.value, EXPECT.builtCents / 100, 'built_report total value');
  const builtFin = R('built_summary');
  eq(builtFin.rows.length, 2, 'built_summary detail rows match');
  eq(builtFin.summary.totals.value, EXPECT.builtCents / 100, 'built_summary value == built_report value');
  const builtDays = new Set(built.rows.map((r) => r.built_date));
  eq(builtDays.has('2026-10-15') && builtDays.has('2026-11-02'), true, 'built days come from evidence chains');
  const novBuilt = runSpec(specById(PACKS[2], 'built_report'), { date_range: 'this_month' });
  eq(novBuilt.rows.length, 1, 'built_report this_month keeps only the Nov built product');
  // Part demand reconciles to Σ part.qty × product.qty across open products.
  const parts = Object.fromEntries(R('part_amount_needed').rows.map((r) => [r.part, r]));
  eq(R('part_amount_needed').rows.length, 2, 'two distinct parts needed');
  eq(parts['3mm ACM Sheet']?.needed, 3, 'ACM needed = 2 (p1) + 1 (p5)');
  eq(parts['LED Module']?.needed, 18, 'LED needed = 12 (p1) + 6 (p3)');
  eq(parts['3mm ACM Sheet']?.needed_value, 135, 'ACM extended cost 3 × $45');
  eq(parts['LED Module']?.needed_value, 153, 'LED extended cost 18 × $8.50');
  eq(totals('part_amount_needed').needed_value, 288, 'part demand total cost');
  // Built-date WIP: only the built-phase product on an open order shows up.
  const builtWip = R('wip_by_built_date');
  eq(builtWip.rows.length, 1, 'wip_by_built_date keeps only p2 (open order, built phase)');
  eq(builtWip.rows[0].built_date, '2026-11-02', 'built-day from changed-at stamp');
  // Address routing: one row per (open order, disposition).
  const addrs = R('addresses_by_disposition');
  eq(addrs.rows.length, 3, 'address rows = w1 installation + w4 delivery + w2 unassigned');
  eq(totals('wip_by_salesperson').value, EXPECT.wipProductCents / 100, 'salesperson WIP total == product-status total');
  eq(totals('wip_by_responsibility').value, EXPECT.wipProductCents / 100, 'responsibility WIP total == product-status total');
}

// --- J. customer pack ------------------------------------------------------------------
{
  const bal = R('customer_balance');
  eq(bal.rows.length, 2, 'customer_balance lists the two AR customers');
  const c1row = bal.rows.find((r) => r.customer_id === 'c1');
  eq(c1row.in_store_credit, 75, 'c1 stored in-store credit surfaces on balance row');
  const credit = R('instore_credit');
  eq(credit.rows.length, 1, 'instore_credit default lists only the credited customer');
  eq(credit.rows[0].source, 'stored', 'stored cache wins over ledger sum');
  eq(credit.rows[0].issued, 75, 'ledger issued sum');
  eq(credit.rows[0].applied, -25, 'ledger applied sum');
  const creditAll = runSpec(specById(PACKS[5], 'instore_credit'), { include_zero: true });
  eq(creditAll.rows.length, 3, 'include_zero lists every live customer');
  // Credit terms: drafts count as exposure — c3's draft i5 gives 999 used.
  const terms = Object.fromEntries(R('credit_terms_usage').rows.map((r) => [r.customer_id, r]));
  eq(terms.c1.used, 1360, 'c1 usage = open AR 860+500');
  eq(terms.c1.status, 'within_limit', 'c1 under its 5000 limit');
  eq(terms.c1.available, 3640, 'c1 available = limit − used');
  eq(terms.c3.used, 999, 'c3 usage counts the DRAFT invoice (credit exposure, not AR)');
  eq(terms.c3.status, 'no_limit', 'c3 has no configured limit');
  const exempt = R('tax_exemption_status');
  eq(exempt.rows.length, 1, 'one exemption record (c3)');
  eq(exempt.rows[0].status, 'active', 'c3 exemption active at as-of');
  eq(exempt.rows[0].days_until_expiry, 411, 'days until 2027-12-31 from as-of');
  eq(R('customers_by_created').rows.length, 3, 'all customers created in the window');
  const master = R('customers_by_master');
  eq(master.rows.length, 1, 'one master-account group');
  eq(master.rows[0].master_name, 'Acme Sign Co', 'master resolves to c1');
  eq(master.rows[0].customer_count, 1, 'c2 is the child account');
  eq(master.rows[0].open_balance, 200, 'master open balance = child open AR (i4)');
  // Dormancy boundary: c2's newest activity is 2026-10-05 → 41 days inactive.
  const dormant = R('dormant_customers'); // days:10 via PARAMS
  eq(dormant.rows.length, 1, 'days=10 → only c2 dormant');
  eq(dormant.rows[0].customer_id, 'c2', 'dormant row is c2');
  eq(dormant.rows[0].days_inactive, 41, 'days_inactive = Oct 5 → Nov 15');
  const dormantExact = runSpec(specById(PACKS[5], 'dormant_customers'), { days: 41 });
  eq(dormantExact.rows.length, 0, 'days=41 → boundary day is NOT dormant (needs strictly older)');
  eq(R('phone_address_list').rows.length, 3, 'directory lists all live customers');
  const dir = R('phone_address_list').rows.find((r) => r.customer_id === 'c1');
  eq(dir.city, 'Cincinnati', 'billing city on directory row');
  eq(dir.state, 'OH', 'billing state on directory row');
}

// --- K. estimate pack detail -------------------------------------------------------------
{
  const cur = R('estimates_current');
  const byEst = Object.fromEntries(cur.rows.map((r) => [r.estimate_id, r]));
  eq(byEst.e2.age_bucket, '31-60', 'e2 age 45 days → 31-60 bucket');
  eq(byEst.e3.age_bucket, '8-14', 'e3 age 14 days → 8-14 bucket');
  const draftOnly = runSpec(specById(PACKS[3], 'estimates_current'), { statuses: ['draft'] });
  eq(draftOnly.rows.length, 1, 'statuses pick narrows pipeline to drafts');
  const conv = R('conversions_by_salesperson');
  eq(conv.summary.totals.converted_total, 3900, 'converted_total = e1 3000 + e4 900');
  const convB = runSpec(specById(PACKS[3], 'conversions_by_salesperson'), {
    date_range: { preset: 'custom', from: '2026-01-01', to: '2026-12-31' },
  });
  const convReps = Object.fromEntries(convB.rows.map((r) => [r.salesperson, r]));
  eq(convReps['Sam Sales'].converted_count, 2, 'Sam converts e1+e4');
  eq(convReps['Rey Repp'].sent_count, 1, 'Rey sent e2 only');
  const activity = Object.fromEntries(R('estimate_activity').rows.map((r) => [r.event_type, r]));
  eq(activity.created?.estimate_count, 5, 'activity: 5 created events');
  eq(activity.sent?.estimate_count, 3, 'activity: e1,e2,e4 sent');
  eq(activity.converted?.estimate_count, 2, 'activity: e1 stamp + e4 revision conversions');
  eq(activity.approved?.estimate_count, 1, 'activity: e1 approved stamp');
}

// --- L. engine API: validation, params, formatting, CSV ------------------------------------
{
  thr(() => defineReport({ name: 'x', category: 'sales', columns: [{ key: 'a' }], run: () => ({ rows: [] }) }), 'defineReport rejects a spec without id');
  thr(() => defineReport({ id: 'x', category: 'sales', columns: [{ key: 'a' }], run: () => ({ rows: [] }) }), 'defineReport rejects a spec without name');
  thr(() => defineReport({ id: 'x', name: 'x', category: 'bogus', columns: [{ key: 'a' }], run: () => ({ rows: [] }) }), 'defineReport rejects an invalid category');
  thr(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [{ key: 'a' }] }), 'defineReport rejects a spec without run()');
  thr(() => defineReport({ id: 'x', name: 'x', category: 'sales', columns: [], run: () => ({ rows: [] }) }), 'defineReport rejects empty columns');
  thr(() => runReport({ id: 'x', columns: [{ key: 'a' }] }, { data: {} }), 'runReport rejects a def without run()');
  // Param resolution: invalid option → warning + default; unknown preset throws.
  const warn = runSpec(specById(PACKS[1], 'sales_by_customer'), { void_policy: 'bogus' });
  ok(warn.meta.warnings.length > 0, 'invalid void_policy emits a warning');
  eq(warn.meta.paramEcho.void_policy, 'exclude', 'invalid void_policy falls back to exclude');
  thr(() => resolveDateRange('bogus', NOW), 'unknown date_range preset throws');
  const month = resolveDateRange('this_month', NOW);
  eq(month.from.getDate(), 1, 'this_month starts on the 1st');
  eq(month.to.getDate(), 30, 'this_month(Nov) ends on the 30th');
  const unbounded = resolveDateRange({ preset: 'custom' }, NOW);
  eq(unbounded.from, null, 'custom range without bounds is unbounded');
  // formatCellValue display contract.
  eq(formatCellValue(1560, { format: 'money' }), '$1,560.00', 'money display');
  eq(formatCellValue(0.4, { format: 'percent' }), '40.0%', 'percent display');
  eq(formatCellValue(1560, { format: 'int' }), '1,560', 'int display');
  eq(formatCellValue('2026-11-15', { format: 'date' }), '2026-11-15', 'date display');
  eq(formatCellValue('', { format: 'money' }), '', 'blank stays blank');
  // voidPolicyFilter ladder.
  const vrows = [{ status: 'sent' }, { status: 'void' }, { status: 'paid' }];
  eq(voidPolicyFilter(vrows, 'exclude').length, 2, 'void exclude drops the void row');
  eq(voidPolicyFilter(vrows, 'only').length, 1, 'void only keeps the void row');
  eq(voidPolicyFilter(vrows, 'include').length, 3, 'void include keeps all');
}

// --- M. CSV contract: parses back, raw money, quoting ---------------------------------------
const parseCsv = (text) => {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
};
const MONEYISH = /^-?\d+(\.\d{1,2})?$/;
const checkCsv = (id) => {
  const res = R(id);
  const csv = rowsToCsv(res.columns, res.rows);
  const parsed = parseCsv(csv);
  eq(parsed.length, res.rows.length + 1, `${id} csv parses back to header + row count`);
  eq(parsed[0].length, res.columns.length, `${id} csv header has one cell per column`);
  const moneyCols = res.columns.map((c, i) => (c.format === 'money' ? i : -1)).filter((i) => i >= 0);
  ok(moneyCols.length > 0, `${id} exposes at least one money column`);
  let cells = 0;
  for (let r = 1; r < parsed.length; r++) {
    for (const i of moneyCols) {
      const cellV = parsed[r][i];
      if (cellV === '') continue;
      cells++;
      ok(MONEYISH.test(cellV) && !cellV.includes('$'), `${id} money cell "${cellV}" is raw rounded dollars, not decorated`);
      const row = res.rows[r - 1];
      const key = res.columns[i].key;
      ok(Math.abs(Number(cellV) - Number(row[key])) < 0.005, `${id} money cell round-trips to the row value`);
    }
  }
  ok(cells > 0, `${id} emitted at least one populated money cell`);
};
for (const id of ['ar_aging_detail', 'ar_aging_summary', 'sales_by_customer', 'sales_by_income_account', 'customer_payments', 'invoice_summary', 'estimates_current', 'built_report']) checkCsv(id);
// Quoting: commas and quotes inside values round-trip through the CSV grammar.
{
  const def = defineReport({
    id: 't_csv', name: 'CSV probe', category: 'sales',
    columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', format: 'money' }],
    run: () => ({ rows: [{ a: 'x, "y"', b: 12.345 }] }),
  });
  const csv = rowsToCsv(def.columns, [{ a: 'x, "y"', b: 12.345 }]);
  eq(csv, 'A,B\n"x, ""y""",12.35\n', 'csv quotes comma/quote values and rounds money to 2dp');
  eq(parseCsv(csv)[1][0], 'x, "y"', 'quoted cell parses back verbatim');
}

// --- N. fixture inertness: notifications are not a report input ------------------------------
{
  const { notifications: _drop, ...noNotif } = DATA;
  const withN = R('sales_by_customer');
  const without = runSpec(specById(PACKS[1], 'sales_by_customer'), {}, noNotif);
  deq(without.rows, withN.rows, 'notifications in the fixture blob never reach report output');
}

// ================================================================================
for (const f of tmpFiles) rmSync(f, { force: true });
console.log('PASS report-engine-suite');
console.log(`${COUNT} assertions`);
