import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-financial-reports.mjs');
const outI13 = resolve(here, '.tmp-tax-liability-j08.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/financialReports.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/taxLiabilityModel.ts')],
  bundle: true, format: 'esm', outfile: outI13, logLevel: 'silent',
});
const {
  POSTED_INVOICE_STATUSES, UNASSIGNED_AGENCY, UNGROUPED_KEY, UNMAPPED_ACCOUNT,
  COMMISSION_BASIS_OPTIONS, BUILT_GROUP_OPTIONS, BUILTISH_STATUSES, FULFILLED_STATES,
  salesTaxLiabilityRows, liabilityAgencyRows, liabilityTotals,
  commissionRows, businessSummaryRows, invoiceSummaryRows, invoiceCogsCents,
  builtProductRows, builtSummaryRows,
  FINANCIAL_REPORTS, FINANCIAL_REPORTS_BY_ID,
} = await import(pathToFileURL(out).href);

// The real I-13 model — the replica must tie to it field-for-field.
const i13 = await import(pathToFileURL(outI13).href);

// The real J-01 engine (w-49) — spec-shape contract via defineReport+runReport.
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport, rowsToCsv, formatCellValue } = engine;

const NOW = new Date(2026, 10, 15, 12, 0, 0); // Nov 15 2026
const RANGE_OCT = { from: '2026-10-01', to: '2026-10-31' };

// ---------------------------------------------------------------------------
// Tax fixtures — same shape as scripts/test-tax-liability.mjs (Oct 2026).
// ---------------------------------------------------------------------------
const taxGroups = {
  g1: { id: 'g1', group_name: 'Ohio — Hamilton County', tax_percent: 7.8, agency_id: 'a1' },
  g2: { id: 'g2', group_name: 'Kentucky', tax_percent: 6, agency_id: 'a2' },
  g3: { id: 'g3', group_name: 'Indiana', tax_percent: 7 },
};
const agencies = {
  a1: { id: 'a1', name: 'Ohio Dept. of Taxation', rate: 5.75, jurisdiction: 'Ohio' },
  a2: { id: 'a2', name: 'Kentucky Department of Revenue', rate: 6, jurisdiction: 'Kentucky' },
};
const tline = (unit_price, taxable = true, quantity = 1) => ({ description: 'x', quantity, unit_price, taxable });
const taxInvoices = [
  { id: 'i1', invoice_number: 'INV-001', status: 'sent', issue_date: '2026-10-05', tax_group_id: 'g1', line_items: [tline(100)], tax_rate: 0.078, tax_amount: 7.8, subtotal: 100, total: 107.8 },
  { id: 'i2', invoice_number: 'INV-002', status: 'paid', issue_date: '2026-10-31', tax_group_id: 'g1', line_items: [tline(50)], tax_rate: 0.078, tax_amount: 3.9, subtotal: 50 },
  { id: 'i15', invoice_number: 'INV-015', status: 'sent', issue_date: '2026-10-08', tax_group_id: 'g1', line_items: [tline(100), tline(50, false)], discount_amount: 20, tax_rate: 0.078, tax_amount: 6.24, subtotal: 150 },
  { id: 'i6', invoice_number: 'INV-006', status: 'sent', issue_date: '2026-10-01', tax_group: 'Kentucky', line_items: [tline(200)], tax_rate: 0.06, tax_amount: 12, subtotal: 200 },
  { id: 'i14', invoice_number: 'INV-014', status: 'paid', issue_date: '2026-10-22', source_summary: { tax_group: 'Kentucky' }, tax_rate: 0.06, tax_amount: 9, taxable_subtotal: 150 },
  { id: 'i9', invoice_number: 'INV-009', status: 'sent', created_date: '2026-10-25T10:00:00Z', tax_group_id: 'g3', line_items: [tline(40, true, 2)], tax_rate: 0.07, tax_amount: 5.6 },
  { id: 'i16', invoice_number: 'INV-016', status: 'sent', issue_date: '2026-10-09', tax_group_id: 'g3', tax_rate: 0.07, tax_amount: 14 },
  { id: 'i19', invoice_number: 'INV-019', status: 'sent', issue_date: '2026-10-30', tax_group_name: 'Indiana', line_items: [tline(10)], tax_rate: 0.078, tax_amount: 0.78 },
  { id: 'i7', invoice_number: 'INV-007', status: 'sent', issue_date: '2026-10-15', tax_rate: 0.07, tax_amount: 7, line_items: [tline(100)] },
  { id: 'i12', invoice_number: 'INV-012', status: 'paid', issue_date: '2026-10-12', tax_rate: 0.078, tax_amount: 15.6, taxable_base: 200 },
  { id: 'i13', invoice_number: 'INV-013', status: 'sent', issue_date: '2026-10-18', tax_group_id: 'ghost', line_items: [tline(60)], tax_rate: 0.06, tax_amount: 3.6 },
  { id: 'i21', invoice_number: 'INV-021', status: 'sent', issue_date: '2026-10-11', tax_group: 'Special District', tax_rate: 0.05, tax_amount: 5, line_items: [tline(100)] },
  { id: 'i8', invoice_number: 'INV-008', status: 'sent', issue_date: '2026-10-20', customer_id: 'c9', customer_display_name: 'Exempt Co', tax_exempt: true, exemption_reason: 'Resale', tax_exempt_id: 'OH-98-123456', subtotal: 300, tax_rate: 0, tax_amount: 0, total: 300 },
  { id: 'i18', invoice_number: 'INV-018', status: 'paid', issue_date: '2026-10-29', tax_exemption: { reason: 'Nonprofit 501(c)(3)', certificate_id: 'CERT-77', expires_on: '2027-01-31', status: 'active' }, subtotal: 80, tax_amount: 0 },
  { id: 'i17', invoice_number: 'INV-017', status: 'sent', issue_date: '2026-10-28', subtotal: 500, tax_rate: 0, tax_amount: 0, total: 500 },
  { id: 'i3', invoice_number: 'INV-003', status: 'partially_paid', issue_date: '2026-11-01', tax_group_id: 'g1', tax_amount: 100 },
  { id: 'i10', invoice_number: 'INV-010', status: 'sent', issue_date: '2026-09-30', tax_amount: 33 },
  { id: 'i4', invoice_number: 'INV-004', status: 'draft', issue_date: '2026-10-10', tax_group_id: 'g1', tax_amount: 999 },
  { id: 'i5', invoice_number: 'INV-005', status: 'void', issue_date: '2026-10-10', tax_amount: 50 },
  { id: 'i11', invoice_number: 'INV-011', status: 'sent', tax_group_id: 'g1', tax_amount: 44 },
];
const TAX_OPTS = { ...RANGE_OCT, taxGroupsById: taxGroups, jurisdictionsById: agencies };

// --- constants ---------------------------------------------------------------
assert.deepEqual(POSTED_INVOICE_STATUSES, ['sent', 'partially_paid', 'paid']);
assert.equal(UNASSIGNED_AGENCY, '(unassigned)');
assert.equal(UNGROUPED_KEY, 'ungrouped');
assert.equal(UNMAPPED_ACCOUNT, '(unmapped)');
assert.deepEqual(COMMISSION_BASIS_OPTIONS, ['invoiced', 'completed', 'closed', 'vended']);
assert.deepEqual(BUILT_GROUP_OPTIONS, ['product', 'day', 'product_type', 'salesperson']);
assert.deepEqual(BUILTISH_STATUSES, ['built', 'completed', 'vended']);
assert.deepEqual(FULFILLED_STATES, ['picked_up', 'installed', 'shipped', 'delivered']);

// --- replica ties to the real I-13 model FIELD FOR FIELD -----------------------
{
  const mine = salesTaxLiabilityRows(taxInvoices, TAX_OPTS);
  const canon = i13.taxLiabilityRows(taxInvoices, TAX_OPTS);
  assert.equal(mine.length, canon.length, 'replica emits the same bucket count');
  assert.deepEqual(mine.period, canon.period, 'replica period matches');
  for (let k = 0; k < canon.length; k++) {
    assert.deepEqual(mine[k], canon[k], `bucket ${canon[k].name} identical to I-13 output`);
  }
  // Spot-check the I-13 numbers the test suite pinned (tie the replica to the
  // pinned values, not just to the model's self-consistency).
  const g1 = mine.find((r) => r.tax_group_id === 'g1');
  assert.equal(g1.taxable_cents, 23000);
  assert.equal(g1.tax_collected_cents, 1794);
  assert.equal(g1.rate, 7.8);
  const none = mine.find((r) => r.name === 'No tax group');
  assert.equal(none.exempt_count, 2);
  assert.equal(none.exempt_sales_cents, 38000);
  const totals = liabilityTotals(mine);
  assert.equal(totals.tax_collected_cents, 9052, 'total tax ties the pinned I-13 sum');
  assert.equal(totals.taxable_cents, 133000);
  assert.equal(totals.invoice_count, 15);
  const rec = i13.reconcileLiability(canon, taxInvoices);
  assert.equal(rec.ok, true, 'I-13 reconcile ok on the canonical rows');
  assert.equal(rec.computed_tax_cents, 9052);
}

// agency rollup --------------------------------------------------------------
{
  const rows = salesTaxLiabilityRows(taxInvoices, TAX_OPTS);
  const ag = liabilityAgencyRows(rows);
  assert.equal(ag.length, 3, 'Ohio + Kentucky + unassigned');
  const un = ag.find((r) => r.name === UNASSIGNED_AGENCY);
  assert.equal(un.tax_collected_cents, 5158, 'unassigned rolls g3+rate+ghost+special+none');
  assert.equal(un.invoice_count, 10);
  const ohio = ag.find((r) => r.name === 'Ohio Dept. of Taxation');
  assert.equal(ohio.tax_collected_cents, 1794);
  assert.equal(ohio.rate, null, 'agency rows carry no single rate');
}

// ---------------------------------------------------------------------------
// Commission fixtures — November 2026.
// ---------------------------------------------------------------------------
const workOrders = {
  w1: { id: 'w1', title: 'WO-100', client_name: 'Acme', sales_rep: 'Sam', completed: true, current_stage: 'completed',
        products: [{ id: 'p1', description: 'Sign', operational_status: 'vended', quantity: 1, quoted_total: 400 }] },
  w2: { id: 'w2', title: 'WO-200', client_name: 'Beta', sales_rep: 'Sam', completed: false, current_stage: 'production',
        products: [{ id: 'p2', description: 'Banner', operational_status: 'in_production', quantity: 1, quoted_total: 300 }] },
  w3: { id: 'w3', title: 'WO-300', client_name: 'Cedar', sales_rep: 'Jo', completed: true, current_stage: 'completed', close_date: '2026-11-09',
        products: [{ id: 'p3', description: 'Letters', operational_status: 'completed', fulfillment_state: 'installed', quantity: 2, quoted_total: 800 }] },
  w4: { id: 'w4', title: 'WO-400', client_name: 'Delta', sales_rep: 'Jo', completed: false, current_stage: 'installation',
        products: [{ id: 'p4', description: 'Wrap', operational_status: 'built', fulfillment_state: 'delivered', quantity: 1, quoted_total: 500 }] },
};
const split = (code, amount) => ({ income_account_code: code, amount });
const commInvoices = [
  // Sam — completed+vended order w1
  { id: 'c1', invoice_number: 'INV-201', status: 'sent', issue_date: '2026-11-05', work_order_id: 'w1', salesperson: 'Sam', subtotal: 1000, tax_amount: 78, total: 1078, income_account_splits: [split('4000', 700), split('4100', 300)] },
  // Sam — open production order w2 (completed basis fails, invoiced passes)
  { id: 'c2', invoice_number: 'INV-202', status: 'partially_paid', issue_date: '2026-11-07', work_order_id: 'w2', salesperson: 'Sam', subtotal: 500, discount_amount: 50, tax_amount: 35.1, total: 485.1, amount_paid: 200, balance_due: 285.1, income_account_splits: [split('4000', 450)] },
  // Jo — closed order w3 (completed + close_date; invoice paid)
  { id: 'c3', invoice_number: 'INV-203', status: 'paid', issue_date: '2026-11-08', work_order_id: 'w3', salesperson: 'Jo', subtotal: 1200, tax_amount: 93.6, total: 1293.6, amount_paid: 1293.6, balance_due: 0, income_account_splits: [split('4200', 1200)] },
  // Jo — vended order w4 (not completed/closed; delivered product)
  { id: 'c4', invoice_number: 'INV-204', status: 'sent', issue_date: '2026-11-10', work_order_id: 'w4', salesperson: 'Jo', subtotal: 600, tax_amount: 46.8, total: 646.8, income_account_splits: [split('4100', 600)] },
  // no salesperson, no splits → (unassigned) + income base
  { id: 'c5', invoice_number: 'INV-205', status: 'sent', issue_date: '2026-11-12', subtotal: 250, fee_lines: [{ label: 'Rush', kind: 'fee', amount: 50 }], tax_amount: 23.4, total: 323.4 },
  // filtered out
  { id: 'x1', status: 'draft', issue_date: '2026-11-05', salesperson: 'Sam', subtotal: 9999 },
  { id: 'x2', status: 'void', issue_date: '2026-11-05', salesperson: 'Sam', subtotal: 9999 },
  { id: 'x3', status: 'sent', issue_date: '2026-12-01', salesperson: 'Sam', subtotal: 9999 }, // out of period
];

{
  // group_by salesperson, invoiced basis, 5% rate.
  const rows = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'invoiced', groupBy: 'salesperson', rate: 5, workOrdersById: workOrders });
  assert.equal(rows.length, 3, 'Sam, Jo, (unassigned)');
  const sam = rows.find((r) => r.salesperson === 'Sam');
  assert.equal(sam.sales_cents, 145000, 'c1 100000 + c2 (50000 − 5000) = 145000 — discount nets the base');
  assert.equal(sam.commission_cents, 7250, '5% of $1,450');
  assert.equal(sam.invoice_count, 2);
  const jo = rows.find((r) => r.salesperson === 'Jo');
  assert.equal(jo.sales_cents, 180000, 'c3 120000 + c4 60000');
  assert.equal(jo.commission_cents, 9000);
  const un = rows.find((r) => r.salesperson === '(unassigned)');
  assert.equal(un.sales_cents, 30000, 'c5 subtotal 25000 + fee 5000 = income base 30000');
  assert.equal(un.commission_cents, 1500);

  // rate 0 → zero commission everywhere; scalar rate applies to all buckets.
  const zero = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', rate: 0, workOrdersById: workOrders });
  assert.ok(zero.every((r) => r.commission_cents === 0), 'rate 0 → commission 0');

  // order_basis filters.
  const completed = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'completed', workOrdersById: workOrders });
  assert.deepEqual(completed.map((r) => r.salesperson).sort(), ['(unassigned)', 'Jo', 'Sam'],
    'completed drops w2 (in production); unlinked c5 counts as a finished sale');
  assert.equal(completed.find((r) => r.salesperson === 'Sam').sales_cents, 100000, 'only c1 survives for Sam');

  const closed = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'closed', workOrdersById: workOrders });
  const closedSam = closed.find((r) => r.salesperson === 'Sam');
  assert.equal(closedSam, undefined, 'Sam has no settled invoice — c1 sent, c2 carries a balance');
  const closedJo = closed.find((r) => r.salesperson === 'Jo');
  assert.equal(closedJo.sales_cents, 120000, 'only the paid c3 is closed');
  assert.equal(closed.find((r) => r.salesperson === '(unassigned)'), undefined, 'unpaid unlinked invoice is not closed');

  const vended = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'vended', workOrdersById: workOrders });
  assert.equal(vended.find((r) => r.salesperson === 'Sam').sales_cents, 100000, 'w1 all-vended qualifies');
  assert.equal(vended.find((r) => r.salesperson === 'Jo').sales_cents, 180000, 'w3 installed + w4 delivered both vended');
  assert.equal(vended.find((r) => r.salesperson === '(unassigned)'), undefined, 'unlinked unpaid invoice is not vended');

  // group_by income_account — splits distribute the base.
  const acct = commissionRows(commInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'invoiced', groupBy: 'income_account', rate: 10, workOrdersById: workOrders });
  const a4000 = acct.find((r) => r.account_code === '4000');
  assert.equal(a4000.sales_cents, 115000, '70000 + 45000 across two invoices');
  assert.equal(a4000.commission_cents, 11500, '10% scalar');
  const unmapped = acct.find((r) => r.account_code === UNMAPPED_ACCOUNT);
  assert.equal(unmapped.sales_cents, 30000, 'split-less invoice lands in (unmapped)');
}

// ---------------------------------------------------------------------------
// Business summary fixtures.
// ---------------------------------------------------------------------------
const accounts = {
  '4000': { code: '4000', name: 'Sales Income' },
  '4100': { code: '4100', name: 'Install Income' },
};
const bizWo = {
  w1: { id: 'w1', title: 'WO-1', materials: [{ builder_product_id: 'p1', extended_cost: 200 }, { builder_product_id: 'p9', extended_cost: 100 }] },
};
const bizInvoices = [
  { id: 'b1', status: 'sent', issue_date: '2026-11-02', subtotal: 1000, income_account_splits: [split('4000', 750), split('4100', 250)], cogs_amount: 300 },
  { id: 'b2', status: 'paid', issue_date: '2026-11-12', subtotal: 500, income_account_splits: [split('4000', 500)], line_items: [{ quantity: 2, unit_price: 250, unit_cost: 40 }] }, // line cogs 2×40=80
  { id: 'b3', status: 'sent', issue_date: '2026-11-15', subtotal: 800, work_order_id: 'w1', income_account_splits: [split('4100', 800)] }, // WO materials 300
  { id: 'b4', status: 'sent', issue_date: '2026-11-16', subtotal: 100, work_order_id: 'w1', income_account_splits: [split('4100', 100)] }, // same WO — cost claimed already
  { id: 'bx', status: 'draft', issue_date: '2026-11-17', subtotal: 9999, cogs_amount: 1 }, // draft out
];
{
  const rows = businessSummaryRows(bizInvoices, { from: '2026-11-01', to: '2026-11-30', workOrdersById: bizWo, accountsByCode: accounts });
  const a4000 = rows.find((r) => r.account_code === '4000');
  assert.equal(a4000.income_cents, 125000, '75000 + 50000');
  assert.equal(a4000.account_name, 'Sales Income');
  // b1 cogs 30000 allocated 75/25 across splits → 22500 on 4000.
  assert.equal(a4000.cogs_cents, 22500 + 8000, 'pro-rata COGS share + line-item 8000');
  assert.equal(a4000.gross_profit_cents, 125000 - 30500);
  assert.ok(Math.abs(a4000.margin - (94500 / 125000)) < 1e-9, 'margin = profit/income fraction');
  const a4100 = rows.find((r) => r.account_code === '4100');
  assert.equal(a4100.income_cents, 115000, '25000 + 80000 + 10000');
  assert.equal(a4100.cogs_cents, 7500 + 30000, 'b1 share 7500 + WO materials 30000 to b3 only');
  const sum = rows.reduce((s, r) => s + r.cogs_cents, 0);
  assert.equal(sum, 30000 + 8000 + 30000, 'COGS foots exactly — no double-counted WO cost');
  // unmapped bucket when no splits at all.
  const noSplit = businessSummaryRows([{ id: 'u1', status: 'sent', issue_date: '2026-11-01', subtotal: 400, cogs_amount: 100 }], { accountsByCode: accounts });
  assert.equal(noSplit[0].key, UNMAPPED_ACCOUNT);
  assert.equal(noSplit[0].income_cents, 40000);
  assert.equal(noSplit[0].cogs_cents, 10000);
  // apportionment stays cent-exact on odd splits (3-way 30000 over 100/100/100).
  const odd = businessSummaryRows([
    { id: 'o1', status: 'sent', issue_date: '2026-11-01', subtotal: 3, income_account_splits: [split('A', 1), split('B', 1), split('C', 1)], cogs_amount: 1 },
  ], {});
  assert.equal(odd.reduce((s, r) => s + r.cogs_cents, 0), 100, 'largest-remainder keeps Σ ≡ invoice COGS');
  // invoiceCogsCents direct: WO claim dedupes.
  const claimed = new Set();
  const first = invoiceCogsCents(bizInvoices[2], { workOrdersById: bizWo, claimedWoIds: claimed });
  const second = invoiceCogsCents(bizInvoices[3], { workOrdersById: bizWo, claimedWoIds: claimed });
  assert.equal(first, 30000);
  assert.equal(second, 0, 'second invoice on the same WO gets no re-claim');
}

// ---------------------------------------------------------------------------
// Invoice summary fixtures.
// ---------------------------------------------------------------------------
const summInvoices = [
  { id: 's1', status: 'draft', issue_date: '2026-11-01', subtotal: 100, tax_amount: 0, total: 100 },
  { id: 's2', status: 'sent', issue_date: '2026-11-05', subtotal: 200, tax_amount: 15.6, total: 215.6, balance_due: 215.6, salesperson: 'Sam' },
  { id: 's3', status: 'partially_paid', issue_date: '2026-11-08', subtotal: 300, tax_amount: 23.4, total: 323.4, amount_paid: 100, balance_due: 223.4, salesperson: 'Jo' },
  { id: 's4', status: 'paid', issue_date: '2026-11-10', paid_date: '2026-11-20', subtotal: 400, tax_amount: 31.2, total: 431.2, amount_paid: 431.2, balance_due: 0, customer_display_name: 'Acme Co' },
  { id: 's5', status: 'void', issue_date: '2026-11-11', subtotal: 50, tax_amount: 3.9, total: 53.9 },
  { id: 's6', status: 'sent', issue_date: '2026-11-30', subtotal: 10, tax_amount: 0.78, total: 10.78, balance_due: 10.78, customer_id: 'cX' },
  { id: 's7', status: 'sent', issue_date: '2026-12-05', subtotal: 999 }, // out of period
];
{
  const rows = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'created' });
  assert.equal(rows.length, 5, 'five canonical buckets emit');
  assert.deepEqual(rows.map((r) => r.status), ['draft', 'sent', 'partially_paid', 'paid', 'void']);
  const sent = rows.find((r) => r.status === 'sent');
  assert.equal(sent.invoice_count, 2, 's2 + s6 (s7 out of period)');
  assert.equal(sent.subtotal_cents, 21000);
  assert.equal(sent.tax_cents, 1638);
  assert.equal(sent.total_cents, 22638);
  assert.equal(sent.balance_cents, 22638);
  assert.equal(sent.paid_cents, 0);
  const pp = rows.find((r) => r.status === 'partially_paid');
  assert.equal(pp.paid_cents, 10000);
  assert.equal(pp.balance_cents, 22340);
  const paid = rows.find((r) => r.status === 'paid');
  assert.equal(paid.paid_cents, 43120);
  assert.equal(paid.balance_cents, 0);
  const voided = rows.find((r) => r.status === 'void');
  assert.equal(voided.invoice_count, 0, 'void_policy exclude drops the void');
  // 'only' keeps just voidish rows.
  const only = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', voidPolicy: 'only' });
  assert.equal(only.find((r) => r.status === 'void').invoice_count, 1);
  assert.equal(only.reduce((s, r) => s + r.invoice_count, 0), 1);
  // 'include' keeps the void too.
  const incl = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', voidPolicy: 'include' });
  assert.equal(incl.reduce((s, r) => s + r.invoice_count, 0), 6);
  // completed basis reads paid_date — s4 qualifies (paid 11-20), s2/s6 don't.
  const done = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', basis: 'completed' });
  assert.equal(done.reduce((s, r) => s + r.invoice_count, 0), 1, 'only the paid-in-period invoice qualifies');
  // salesperson + customer filters.
  const sam = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', salesperson: 'sam' });
  assert.equal(sam.reduce((s, r) => s + r.invoice_count, 0), 1);
  const acme = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', customer: 'acme' });
  assert.equal(acme.reduce((s, r) => s + r.invoice_count, 0), 1);
  const byId = invoiceSummaryRows(summInvoices, { from: '2026-11-01', to: '2026-11-30', customer: 'cX' });
  assert.equal(byId.reduce((s, r) => s + r.invoice_count, 0), 1, 'exact customer_id match works');
}

// ---------------------------------------------------------------------------
// Built summary fixtures.
// ---------------------------------------------------------------------------
const builderProducts = {
  bp1: { id: 'bp1', frozen_cost: 150 },
};
const builtWos = [
  { id: 'w10', title: 'WO-1000', client_name: 'Acme', customer_id: 'c1', sales_rep: 'Sam', completed: false,
    products: [
      { id: 'p1', description: 'Channel Letters', product_type: 'channel_letters', operational_status: 'built', quantity: 2, quoted_total: 1200,
        status_history: [{ field: 'operational_status', to: 'built', at: '2026-11-03T15:00:00Z' }] },
      { id: 'p2', description: 'Banner', product_type: 'banner', operational_status: 'in_production', quantity: 1, quoted_total: 200 }, // not built
    ],
    materials: [
      { builder_product_id: 'p1', extended_cost: 300 },
      { builder_product_id: 'p9', extended_cost: 999 }, // unrelated line
    ] },
  { id: 'w11', title: 'WO-1001', client_name: 'Beta', customer_id: 'c2', sales_rep: 'Jo', completed: true, completed_date: '2026-11-08',
    products: [
      { id: 'p3', description: 'Vinyl Wrap', product_type: 'wrap', operational_status: 'completed', fulfillment_state: 'installed', quantity: 1, quoted_unit_price: 500, quantity: 1, builder_product_id: 'bp1' },
    ] },
  { id: 'w12', title: 'WO-1002', client_name: 'Cedar', customer_id: 'c3', sales_rep: 'Sam',
    products: [
      { id: 'p4', description: 'Monument', product_type: 'monument', operational_status: 'vended', fulfillment_state: 'picked_up', quantity: 1, quoted_total: 900,
        status_history: [{ field: 'fulfillment_state', to: 'picked_up', at: '2026-09-20T10:00:00Z' }] }, // built in Sept — out of period
    ] },
  { id: 'w13', title: 'WO-1003', client_name: 'Delta', customer_id: 'c4', sales_rep: 'Jo',
    products: [
      { id: 'p5', description: 'Pylon Face', product_type: 'pylon', operational_status: 'built', operational_status_changed_at: '2026-11-20T09:00:00Z', quantity: 3, quoted_total: 750, frozen_cost: 100 },
    ] },
];
{
  const rows = builtProductRows(builtWos, { from: '2026-11-01', to: '2026-11-30', builderProductsById: builderProducts });
  assert.equal(rows.length, 3, 'p1 (status history) + p3 (order proxy) + p5 (changed_at); p2 WIP and p4 September are out');
  const p1 = rows.find((r) => r.product_id === 'p1');
  assert.equal(p1.built_date, '2026-11-03', 'status_history transition supplies the day');
  assert.equal(p1.value_cents, 120000);
  assert.equal(p1.cost_cents, 30000, 'materials linked by builder_product_id');
  assert.equal(p1.gross_profit_cents, 90000);
  assert.equal(p1.salesperson, 'Sam');
  const p3 = rows.find((r) => r.product_id === 'p3');
  assert.equal(p3.built_date, '2026-11-08', 'completed order proxy day');
  assert.equal(p3.cost_cents, 15000, 'BuilderProduct frozen_cost fallback');
  const p5 = rows.find((r) => r.product_id === 'p5');
  assert.equal(p5.built_date, '2026-11-20', 'operational_status_changed_at stamps the built day');
  assert.equal(p5.cost_cents, 10000, 'explicit frozen_cost wins');
  assert.equal(p5.quantity, 3);
  // sorted built_date asc.
  assert.deepEqual(rows.map((r) => r.product_id), ['p1', 'p3', 'p5']);
  // rollups.
  const byType = builtSummaryRows(rows, 'product_type');
  assert.equal(byType.length, 3);
  assert.equal(byType[0].built_count, 1);
  assert.equal(byType.reduce((s, r) => s + r.value_cents, 0), 120000 + 50000 + 75000);
  const byDay = builtSummaryRows(rows, 'day');
  assert.deepEqual(byDay.map((r) => r.key), ['2026-11-03', '2026-11-08', '2026-11-20'], 'day rollup sorts asc');
  const byRep = builtSummaryRows(rows, 'salesperson');
  const samR = byRep.find((r) => r.key === 'Sam');
  assert.equal(samR.value_cents, 120000);
  assert.equal(samR.order_count, 1);
  const joR = byRep.find((r) => r.key === 'Jo');
  assert.equal(joR.order_count, 2, 'distinct order ids counted');
  assert.equal(joR.cost_cents, 25000);
}

// --- spec shape: all five pass the real engine contract ------------------------
assert.equal(FINANCIAL_REPORTS.length, 5);
assert.deepEqual(Object.keys(FINANCIAL_REPORTS_BY_ID).sort(),
  ['built_summary', 'business_summary', 'invoice_summary', 'sales_commission', 'sales_tax_liability']);
const defs = FINANCIAL_REPORTS.map((s) => defineReport(s)); // throws on contract violation
for (const d of defs) {
  assert.equal(d.category, 'financial');
  assert.ok(Object.isFrozen(d));
}
const defById = Object.fromEntries(defs.map((d) => [d.id, d]));

// sales_tax_liability via the engine — replica path, then the injected fn path.
{
  const data = { invoices: taxInvoices, tax_groups: Object.values(taxGroups), agencies: Object.values(agencies) };
  const res = runReport(defById.sales_tax_liability, {
    params: { date_range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' } },
    data, now: NOW,
  });
  assert.equal(res.meta.reportId, 'sales_tax_liability');
  assert.equal(res.rows.length, 8, 'replica buckets through the engine');
  const g1 = res.rows.find((r) => r.tax_group_id === 'g1');
  assert.equal(g1.taxable, 230, 'dollars at the money boundary');
  assert.equal(g1.tax_collected, 17.94);
  assert.equal(g1.rate, 7.8);
  assert.equal(g1.tax_collected_cents, 1794, 'cent extras preserved');
  assert.equal(res.summary.totals.tax_collected, 90.52);
  assert.equal(res.summary.totals.invoice_count, 15);
  const un = res.summary.by_agency.find((a) => a.agency === UNASSIGNED_AGENCY);
  assert.equal(un.tax_collected, 51.58, 'agency rollup in the summary');

  // Agency group_by — dynamic columns keep the agency label.
  const agRes = runReport(defById.sales_tax_liability, {
    params: { date_range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' }, group_by: 'agency' },
    data, now: NOW,
  });
  assert.equal(agRes.rows.length, 3);
  assert.equal(agRes.columns[0].label, 'Tax Agency');
  assert.equal(agRes.rows.reduce((s, r) => s + r.tax_collected, 0), 90.52);

  // Injected model path — data.taxLiabilityRows (function) is called verbatim.
  const inj = runReport(defById.sales_tax_liability, {
    params: { date_range: { preset: 'custom', from: '2026-10-01', to: '2026-10-31' } },
    data: { invoices: taxInvoices, taxLiabilityRows: i13.taxLiabilityRows, tax_groups: Object.values(taxGroups), agencies: Object.values(agencies) },
    now: NOW,
  });
  assert.deepEqual(
    inj.rows.map((r) => [r.tax_group_id, r.name, r.tax_collected]),
    res.rows.map((r) => [r.tax_group_id, r.name, r.tax_collected]),
    'injected I-13 fn and replica produce identical report rows',
  );
}

// sales_commission via the engine.
{
  const data = { invoices: commInvoices, work_orders: Object.values(workOrders), accounts: Object.values(accounts) };
  const res = runReport(defById.sales_commission, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' }, rate: 5, order_basis: 'invoiced' },
    data, now: NOW,
  });
  assert.equal(res.rows.length, 3);
  assert.equal(res.rows[0].label, 'Jo', 'sorted by sales desc ($1,800 > $1,450 > $300)');
  assert.equal(res.rows[0].sales, 1800);
  assert.equal(res.rows[0].commission, 90);
  const samRow = res.rows.find((r) => r.label === 'Sam');
  assert.equal(samRow.commission, 72.5);
  assert.equal(res.summary.totals.commission, 90 + 72.5 + 15);
  // income_account grouping via the engine.
  const acct = runReport(defById.sales_commission, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' }, rate: 10, group_by: 'income_account' },
    data, now: NOW,
  });
  assert.equal(acct.columns[0].label, 'Income Account');
  assert.equal(acct.rows.find((r) => r.account_code === '4000').sales, 1150);
  assert.equal(acct.rows.find((r) => r.account_code === UNMAPPED_ACCOUNT).sales, 300);
}

// business_summary via the engine.
{
  const data = { invoices: bizInvoices, work_orders: Object.values(bizWo), accounts: Object.values(accounts) };
  const res = runReport(defById.business_summary, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' } },
    data, now: NOW,
  });
  assert.equal(res.rows.length, 2);
  const a4000 = res.rows.find((r) => r.account_code === '4000');
  assert.equal(a4000.income, 1250);
  assert.equal(a4000.cogs, 305);
  assert.equal(a4000.gross_profit, 945);
  assert.equal(res.summary.totals.income, 2400);
  assert.equal(res.summary.totals.cogs, 680);
  assert.equal(res.summary.totals.gross_profit, 1720);
  assert.ok(Math.abs(res.summary.totals.margin - (1720 / 2400)) < 1e-9);
}

// invoice_summary via the engine — totals tie to fixture sums.
{
  const res = runReport(defById.invoice_summary, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' } },
    data: { invoices: summInvoices }, now: NOW,
  });
  assert.equal(res.rows.length, 5);
  assert.equal(res.summary.totals.invoice_count, 5, 'draft+sent(2)+partially_paid+paid (void excluded)');
  assert.equal(res.summary.totals.total, 215.6 + 323.4 + 431.2 + 10.78 + 100);
  assert.equal(res.summary.totals.paid, 100 + 431.2);
  // w-63 chain: unpaid rows owe their total — the draft's 100 counts too.
  assert.equal(res.summary.totals.balance, 215.6 + 223.4 + 10.78 + 100);
  const csv = rowsToCsv(res.columns, res.rows);
  assert.ok(csv.split('\n')[1].startsWith('Draft,'), 'CSV emits the draft bucket first');
}

// built_summary via the engine — detail + grouped modes.
{
  const data = { work_orders: builtWos, builder_products: Object.values(builderProducts) };
  const res = runReport(defById.built_summary, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' } },
    data, now: NOW,
  });
  assert.equal(res.rows.length, 3);
  assert.equal(res.rows[0].built_date, '2026-11-03');
  assert.equal(res.rows[0].value, 1200);
  assert.equal(res.rows[0].cost, 300);
  assert.equal(res.summary.totals.value, 1200 + 500 + 750);
  assert.equal(res.summary.totals.cost, 300 + 150 + 100);
  assert.equal(res.summary.totals.gross_profit, 2450 - 550);
  const grouped = runReport(defById.built_summary, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' }, group_by: 'salesperson' },
    data, now: NOW,
  });
  assert.equal(grouped.columns[0].label, 'Salesperson', 'dynamic columns for grouped mode');
  const samR = grouped.rows.find((r) => r.label === 'Sam');
  assert.equal(samR.value, 1200);
  assert.equal(grouped.summary.totals.built_count, 3);
  // salesperson text filter trims detail rows.
  const jo = runReport(defById.built_summary, {
    params: { date_range: { preset: 'custom', from: '2026-11-01', to: '2026-11-30' }, salesperson: 'jo' },
    data, now: NOW,
  });
  assert.equal(jo.rows.length, 2);
  assert.equal(formatCellValue(0.2, { format: 'percent' }), '20.0%');
}

rmSync(out, { force: true });
rmSync(outI13, { force: true });
console.log('PASS financial-reports');
