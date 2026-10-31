import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-jw-stub.mjs');
const out = resolve(here, '.tmp-jw.mjs');
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {}; export default {};\n');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/jobWorkspaceModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
  },
});
const {
  findWorkOrder, findWorkOrdersForEstimate, jobFinancialSummary,
  jobActivityTimeline, workspaceProductRows, recordLinksWorkOrder,
  WORKSPACE_STAGES, PAYMENT_STATUS_LABELS,
} = await import(pathToFileURL(out).href);

const wo = {
  id: 'wo1',
  estimate_id: 'est1',
  corbridge_invoice_number: 'INV-1001',
  current_stage: 'production',
  estimate_amount: 5000,
  products: [
    { id: 'p1', description: 'Channel Letters', module_key: 'channel_letter', quantity: 2, quoted_unit_price: 1200, quoted_total: 2400, operational_status: 'in_production', proof_status: 'approved', fulfillment_state: 'none', product_due_date: '2026-11-10', status_history: [
      { at: '2026-10-28T10:00:00.000Z', field: 'operational_status', from: 'order_review', to: 'in_design', by: 'ann@x.com' },
      { at: '2026-10-30T09:00:00.000Z', field: 'operational_status', from: 'in_design', to: 'in_production', by: 'bob@x.com' },
    ] },
    { id: 'p2', description: 'Monument Panel', quantity: 1, quoted_total: 1500, status_history: [
      { at: '2026-10-29T12:00:00.000Z', field: 'proof_status', from: 'sent', to: 'approved', by: 'cust@x.com' },
    ] },
  ],
};

// --- findWorkOrder -----------------------------------------------------------
assert.equal(findWorkOrder([wo], 'wo1'), wo, 'matches by id');
assert.equal(findWorkOrder([wo], 'INV-1001'), wo, 'matches by corbridge_invoice_number');
assert.equal(findWorkOrder([wo], 'missing'), null);
assert.equal(findWorkOrder([wo], ''), null);
assert.equal(findWorkOrder([], 'wo1'), null);

// --- findWorkOrdersForEstimate ----------------------------------------------
{
  const other = { id: 'wo2', estimate_id: 'est1', created_date: '2026-01-01' };
  const deleted = { id: 'wo3', estimate_id: 'est1', deleted: true };
  const list = findWorkOrdersForEstimate([wo, other, deleted], 'est1');
  assert.equal(list.length, 2, 'deleted rows excluded');
  assert.equal(findWorkOrdersForEstimate([wo], 'est9').length, 0);
  assert.equal(findWorkOrdersForEstimate([wo], '').length, 0);
}

// --- recordLinksWorkOrder ----------------------------------------------------
assert.equal(recordLinksWorkOrder({ work_order_id: 'wo1' }, wo), true);
assert.equal(recordLinksWorkOrder({ estimate_id: 'est1' }, wo), true, 'estimate-linked invoice still counts');
assert.equal(recordLinksWorkOrder({ work_order_id: 'wo9' }, wo), false);
assert.equal(recordLinksWorkOrder({ work_order_id: 'wo1', deleted: true }, wo), false);

// --- jobFinancialSummary -----------------------------------------------------
const inv = (id, total, extra = {}) => ({ id, work_order_id: 'wo1', status: 'sent', total, balance_due: total, ...extra });

// uninvoiced: no linked invoices.
{
  const s = jobFinancialSummary({ workOrder: wo, invoices: [], payments: [] });
  assert.equal(s.quotedTotal, 3900, 'quoted = sum of product quoted_total');
  assert.equal(s.invoicedTotal, 0);
  assert.equal(s.paidTotal, 0);
  assert.equal(s.invoiceCount, 0);
  assert.equal(s.paymentStatus, 'uninvoiced');
}
// quoted fallback to estimate_amount when the work order has no products.
{
  const s = jobFinancialSummary({ workOrder: { ...wo, products: [] }, invoices: [], payments: [] });
  assert.equal(s.quotedTotal, 5000);
}
// invoiced_unpaid: live invoice, no payments.
{
  const s = jobFinancialSummary({ workOrder: wo, invoices: [inv('i1', 1000)], payments: [] });
  assert.equal(s.invoicedTotal, 1000);
  assert.equal(s.balanceDue, 1000);
  assert.equal(s.unpaidInvoiceCount, 1);
  assert.equal(s.paymentStatus, 'invoiced_unpaid');
}
// partial: some money applied.
{
  const s = jobFinancialSummary({
    workOrder: wo,
    invoices: [inv('i1', 1000, { balance_due: 400 })],
    payments: [{ invoice_id: 'i1', amount: 600, status: 'recorded' }],
  });
  assert.equal(s.paidTotal, 600);
  assert.equal(s.balanceDue, 400);
  assert.equal(s.paymentStatus, 'partial');
}
// paid: balance cleared.
{
  const s = jobFinancialSummary({
    workOrder: wo,
    invoices: [inv('i1', 1000, { status: 'paid', balance_due: 0 })],
    payments: [{ invoice_id: 'i1', amount: 1000, status: 'recorded' }],
  });
  assert.equal(s.paymentStatus, 'paid');
  assert.equal(s.unpaidInvoiceCount, 0);
}
// overpaid: payments exceed invoiced total.
{
  const s = jobFinancialSummary({
    workOrder: wo,
    invoices: [inv('i1', 1000, { balance_due: 0 })],
    payments: [{ invoice_id: 'i1', amount: 1500, status: 'recorded' }],
  });
  assert.equal(s.paymentStatus, 'overpaid');
}
// CoreBridge rule: COMPLETED order with a balance is still unpaid AR.
{
  const completed = { ...wo, current_stage: 'completed' };
  const s = jobFinancialSummary({
    workOrder: completed,
    invoices: [inv('i1', 1000, { balance_due: 250 })],
    payments: [{ invoice_id: 'i1', amount: 750, status: 'recorded' }],
  });
  assert.equal(s.paymentStatus, 'invoiced_unpaid', 'completed + balance is never paid');
  assert.notEqual(s.paymentStatus, 'paid');
}
// unlinked / voided / deleted records are ignored.
{
  const s = jobFinancialSummary({
    workOrder: wo,
    invoices: [
      inv('i1', 1000),
      { id: 'i2', work_order_id: 'wo9', total: 999, status: 'sent' },           // other job
      { id: 'i3', work_order_id: 'wo1', total: 500, status: 'void' },          // voided
      { id: 'i4', work_order_id: 'wo1', total: 500, deleted: true },           // deleted
      { id: 'i5', estimate_id: 'est1', total: 250, status: 'sent', balance_due: 250 }, // estimate-linked counts
    ],
    payments: [
      { invoice_id: 'i1', amount: 100, status: 'recorded' },
      { invoice_id: 'i3', amount: 500, status: 'recorded' },                   // on voided invoice — not linked
      { work_order_id: 'wo1', amount: 50, status: 'void' },                    // voided payment
      { work_order_id: 'wo1', amount: 75, status: 'refunded' },                // refunded payment
      { work_order_id: 'wo9', amount: 999, status: 'recorded' },               // other job
      { estimate_id: 'est1', amount: 25, status: 'recorded' },                 // estimate-linked counts
    ],
  });
  assert.equal(s.invoiceCount, 2, 'live linked invoices only');
  assert.equal(s.invoicedTotal, 1250);
  assert.equal(s.paidTotal, 125, 'only live linked payments');
  assert.equal(s.balanceDue, 1250, 'balance comes from live invoices only');
  assert.equal(s.paymentStatus, 'partial');
}
// direct work_order_id-linked payment without a matching invoice still counts.
{
  const s = jobFinancialSummary({
    workOrder: wo,
    invoices: [inv('i1', 1000, { balance_due: 0 })],
    payments: [{ work_order_id: 'wo1', amount: 1000, status: 'recorded' }],
  });
  assert.equal(s.paidTotal, 1000);
  assert.equal(s.paymentStatus, 'paid');
}

// --- jobActivityTimeline ------------------------------------------------------
{
  const tl = jobActivityTimeline(wo);
  assert.equal(tl.length, 3, 'all product history merged');
  assert.equal(tl[0].at, '2026-10-30T09:00:00.000Z', 'newest first');
  assert.equal(tl[0].product, 'Channel Letters');
  assert.equal(tl[0].field, 'operational_status');
  assert.equal(tl[0].from, 'in_design');
  assert.equal(tl[0].to, 'in_production');
  assert.equal(tl[0].by, 'bob@x.com');
  assert.equal(tl[1].product, 'Monument Panel');
  assert.equal(tl[2].at, '2026-10-28T10:00:00.000Z');
}
// Timeline caps at the newest 100 entries.
{
  const many = { products: [{ id: 'p', status_history: Array.from({ length: 150 }, (_, i) => ({ at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00.000Z`, field: 'f' })) }] };
  const tl = jobActivityTimeline(many);
  assert.equal(tl.length, 100);
  for (let i = 1; i < tl.length; i += 1) {
    assert.ok(tl[i - 1].at >= tl[i].at, 'sorted newest-first');
  }
}
assert.deepEqual(jobActivityTimeline({}), []);
assert.deepEqual(jobActivityTimeline(null), []);

// --- workspaceProductRows ------------------------------------------------------
{
  const rows = workspaceProductRows(wo);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].position, '1/2');
  assert.equal(rows[0].name, 'Channel Letters');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].quotedTotal, 2400);
  assert.equal(rows[0].status, 'in_production');
  assert.equal(rows[0].proof, 'approved');
  assert.equal(rows[0].historyCount, 2);
  assert.equal(rows[0].editable, true);
  assert.equal(rows[1].position, '2/2');
  // Products without an id are visible but not editable.
  const noId = workspaceProductRows({ id: 'woX', products: [{ description: 'Legacy' }] });
  assert.equal(noId[0].editable, false);
  assert.equal(noId[0].name, 'Legacy');
  // Completed work orders still contribute rows (unlike the queue flatten).
  const done = workspaceProductRows({ id: 'woD', completed: true, products: wo.products });
  assert.equal(done.length, 2, 'completed jobs still list products');
}

// Label maps cover every schema stage.
for (const stage of ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation', 'completed']) {
  assert.ok(WORKSPACE_STAGES[stage], `stage label for ${stage}`);
}
for (const s of ['uninvoiced', 'partial', 'invoiced_unpaid', 'paid', 'overpaid']) {
  assert.ok(PAYMENT_STATUS_LABELS[s], `payment label for ${s}`);
}

rmSync(stub); rmSync(out);
console.log('PASS job-workspace');
