import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-report-drilldown.mjs');
const specsOut = resolve(here, '.tmp-report-drilldown-specs.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/reportDrilldownModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/arAgingReports.ts')],
  bundle: true, format: 'esm', outfile: resolve(here, '.tmp-report-drilldown-ar.mjs'), logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerReports.ts')],
  bundle: true, format: 'esm', outfile: specsOut, logLevel: 'silent',
});
const {
  DRILL_TARGETS, DRILL_ENTITIES, DRILL_PRECEDENCE,
  canonicalDrillType, rowEntityRefs, deepLinkFor, drillLinkFor,
  drillableColumns, columnDrillType, cellDrillLink,
} = await import(pathToFileURL(out).href);
const { AR_AGING_REPORTS_BY_ID } = await import(pathToFileURL(resolve(here, '.tmp-report-drilldown-ar.mjs')).href);
const { CUSTOMER_REPORTS_BY_ID } = await import(pathToFileURL(specsOut).href);

// --- registry sanity --------------------------------------------------------
{
  assert.equal(DRILL_ENTITIES.length, 10, 'ten drill entities registered');
  assert.equal(DRILL_TARGETS.invoice.path, '/Invoices');
  assert.equal(DRILL_TARGETS.invoice.param, 'invoice');
  assert.equal(DRILL_TARGETS.work_order.path, '/JobWorkspace');
  assert.equal(DRILL_TARGETS.work_order.param, 'wo');
  assert.equal(DRILL_TARGETS.estimate.path, '/EstimateDetail');
  assert.equal(DRILL_TARGETS.customer.path, '/Customer360');
  assert.equal(DRILL_PRECEDENCE.indexOf('invoice'), 0, 'invoice resolves first');
  assert.ok(DRILL_PRECEDENCE.indexOf('customer') === DRILL_PRECEDENCE.length - 1,
    'customer is the least-specific catch-all');
}

// --- canonicalDrillType -----------------------------------------------------
{
  assert.equal(canonicalDrillType('Work Order'), 'work_order');
  assert.equal(canonicalDrillType('wo'), 'work_order');
  assert.equal(canonicalDrillType('order'), 'work_order');
  assert.equal(canonicalDrillType('Invoices'), 'invoice');
  assert.equal(canonicalDrillType('po'), 'purchase_order');
  assert.equal(canonicalDrillType('CO'), 'change_order');
  assert.equal(canonicalDrillType('nonsense'), '');
}

// --- rowEntityRefs: extraction shapes ---------------------------------------
{
  // flat snake_case (all J-pack rows)
  const r1 = rowEntityRefs({ invoice_id: 'i1', customer_id: 'c1', balance_cents: 500 });
  assert.equal(r1.invoice_id, 'i1');
  assert.equal(r1.customer_id, 'c1');
  assert.equal(r1.work_order_id, undefined, 'absent keys are omitted, not blank');
  // nested object refs + camelCase
  const r2 = rowEntityRefs({ invoice: { id: 'i9' }, customer: { _id: 'c9' }, workOrderId: 'w9' });
  assert.equal(r2.invoice_id, 'i9');
  assert.equal(r2.customer_id, 'c9');
  assert.equal(r2.work_order_id, 'w9');
  // number fields tolerated: order_number → work_order_number, estimate_number
  const r3 = rowEntityRefs({ order_number: 'JOB-1042', estimate_number: 'EST-77', part_number: 'P-1' });
  assert.equal(r3.work_order_number, 'JOB-1042');
  assert.equal(r3.estimate_number, 'EST-77');
  assert.equal(r3.part_number, 'P-1');
  // line-level refs fill product_id (EstimateDetail open= matches them)
  const r4 = rowEntityRefs({ estimate_id: 'e1', estimate_line_id: 'L-3' });
  assert.equal(r4.product_id, 'L-3');
  // master_id resolves as the customer ref (customers_by_master rows)
  const r5 = rowEntityRefs({ master_id: 'm1', master_name: 'Holdings Inc' });
  assert.equal(r5.customer_id, 'm1');
  // non-object / empty rows are safe
  assert.deepEqual(rowEntityRefs(null), {});
  assert.deepEqual(rowEntityRefs({ total: 42 }), {});
}

// --- deepLinkFor: per-entity hrefs -------------------------------------------
{
  assert.equal(deepLinkFor('invoice', 'i1'), '/Invoices?invoice=i1');
  assert.equal(deepLinkFor('work_order', 'w1'), '/JobWorkspace?wo=w1');
  assert.equal(deepLinkFor('estimate', 'e1'), '/EstimateDetail?id=e1');
  assert.equal(deepLinkFor('customer', 'c1'), '/Customer360?id=c1');
  assert.equal(deepLinkFor('opportunity', 'o1'), '/Opportunities?open=o1');
  assert.equal(deepLinkFor('purchase_order', 'p1'), '/PurchaseOrders?po=p1');
  assert.equal(deepLinkFor('change_order', 'x1'), '/ChangeOrders?co=x1');
  // product needs parent context — estimate first (real open= deep link)
  assert.equal(
    deepLinkFor('product', 'prod1', { context: { estimate_id: 'e1', work_order_id: 'w1' } }),
    '/EstimateDetail?id=e1&open=prod1',
    'product prefers the verified EstimateDetail open= anchor',
  );
  assert.equal(
    deepLinkFor('product', 'prod1', { context: { work_order_id: 'w1' } }),
    '/JobWorkspace?wo=w1&product=prod1',
    'product falls back to the parent workspace',
  );
  assert.equal(deepLinkFor('product', 'prod1'), '', 'context-free product ref cannot anchor');
  // payment rides the parent invoice when known, else forward-compat param
  assert.equal(
    deepLinkFor('payment', 'pay1', { context: { invoice_id: 'i7' } }),
    '/Invoices?invoice=i7',
  );
  assert.equal(deepLinkFor('payment', 'pay1'), '/Invoices?payment=pay1');
  // part: a part_number term hits the real q= prefill; bare id is forward-compat
  assert.equal(
    deepLinkFor('part', 'pt1', { context: { part_number: 'PN-88' } }),
    '/EstimatorParts?q=PN-88',
  );
  assert.equal(deepLinkFor('part', 'pt1'), '/EstimatorParts?part=pt1');
  // blank refs / unknown entities → '' (caller falls back to plain text)
  assert.equal(deepLinkFor('invoice', ''), '');
  assert.equal(deepLinkFor('bogus', 'x'), '');
  // refs are URI-encoded (external keys are not id-safe)
  assert.equal(deepLinkFor('work_order', 'JOB 1042/EST'), '/JobWorkspace?wo=JOB%201042%2FEST');
}

// --- drillLinkFor: precedence ------------------------------------------------
{
  // invoice wins over every other ref (spec chain)
  const link1 = drillLinkFor({
    invoice_id: 'i1', work_order_id: 'w1', estimate_id: 'e1', customer_id: 'c1',
  });
  assert.equal(link1.entity_type, 'invoice');
  assert.equal(link1.href, '/Invoices?invoice=i1');
  // invoice_number labels the link but cannot substitute for the id
  const link2 = drillLinkFor({ invoice_number: 'INV-1042', customer_id: 'c9' });
  assert.equal(link2.entity_type, 'customer', 'id-less invoice_number falls through');
  assert.equal(link2.href, '/Customer360?id=c9');
  const link3 = drillLinkFor({ invoice_id: 'i2', invoice_number: 'INV-1042' });
  assert.equal(link3.label, 'Invoice INV-1042', 'label prefers the human number');
  // product outranks work_order — consumes it as context
  const link4 = drillLinkFor({ work_order_id: 'w5', product_id: 'p5', customer_id: 'c5' });
  assert.equal(link4.entity_type, 'product');
  assert.equal(link4.href, '/JobWorkspace?wo=w5&product=p5');
  // payment row (customer_payments shape) drills to the parent invoice
  const link5 = drillLinkFor({ payment_id: 'pay1', invoice_id: 'i5', customer_id: 'c5' });
  assert.equal(link5.href, '/Invoices?invoice=i5');
  // payment_id alone still resolves (forward-compat param)
  const link6 = drillLinkFor({ payment_id: 'pay2', customer_id: 'c2' });
  assert.equal(link6.entity_type, 'payment');
  assert.equal(link6.href, '/Invoices?payment=pay2');
  // estimate beats customer when no invoice/wo refs exist
  const link7 = drillLinkFor({ estimate_id: 'e7', customer_id: 'c7' });
  assert.equal(link7.entity_type, 'estimate');
  // work_order display number alone still deep-links (findWorkOrder resolves it)
  const link8 = drillLinkFor({ order_number: 'INV-JOB-220', customer_id: 'c8' });
  assert.equal(link8.entity_type, 'work_order');
  assert.equal(link8.href, '/JobWorkspace?wo=INV-JOB-220');
  // entity_hint wins when resolvable; unresolvable hint falls through cleanly
  const link9 = drillLinkFor({ customer_id: 'c3', invoice_id: 'i3' }, { entity_hint: 'customer' });
  assert.equal(link9.entity_type, 'customer', 'hint overrides precedence');
  const link10 = drillLinkFor({ invoice_id: 'i4', customer_id: 'c4' }, { entity_hint: 'product' });
  assert.equal(link10.entity_type, 'invoice', 'unresolvable hint falls through to precedence');
  // nothing resolvable → null (render plain text, never a broken route)
  assert.equal(drillLinkFor({ bucket: '1-30', balance: 12 }), null);
  assert.equal(drillLinkFor('not a row'), null);
}

// --- drillableColumns / cellDrillLink on the REAL J-pack specs ---------------
{
  const detail = AR_AGING_REPORTS_BY_ID.ar_aging_detail;
  const cols = drillableColumns(detail);
  const keys = cols.map((c) => c.key);
  assert.ok(keys.includes('number'), 'ar_aging_detail "number" column carries the invoice ref');
  assert.ok(keys.includes('customer_name'), 'ar_aging_detail "customer_name" links to the customer');
  assert.equal(cols.find((c) => c.key === 'number').entity_type, 'invoice');
  assert.equal(cols.find((c) => c.key === 'customer_name').entity_type, 'customer');
  assert.ok(!keys.includes('balance'), 'money columns are not drillable');
  const pay = drillableColumns(CUSTOMER_REPORTS_BY_ID.customer_payments);
  assert.equal(pay.find((c) => c.key === 'invoice_number').entity_type, 'invoice');
  const master = drillableColumns(CUSTOMER_REPORTS_BY_ID.customers_by_master);
  assert.equal(master.find((c) => c.key === 'master_name').entity_type, 'customer',
    'master_name column drills to the master customer');
  // bare columns array input is tolerated too
  assert.equal(drillableColumns(detail.columns).length, cols.length);
  assert.equal(drillableColumns({}).length, 0, 'spec-less call returns []');
  // cellDrillLink: a customer cell links its own entity even when the row's
  // primary drill is the invoice
  const cell = cellDrillLink(
    { invoice_id: 'i1', customer_id: 'c1', number: 'INV-1', customer_name: 'Acme' },
    'customer_name',
  );
  assert.equal(cell.href, '/Customer360?id=c1');
  const cell2 = cellDrillLink({ invoice_id: 'i1', number: 'INV-1' }, 'number');
  assert.equal(cell2.href, '/Invoices?invoice=i1');
  // unknown column keys fall back to the row's primary drill
  const cell3 = cellDrillLink({ invoice_id: 'i1' }, 'balance');
  assert.equal(cell3.href, '/Invoices?invoice=i1');
  // columnDrillType: *_id keys resolve by naming convention
  assert.equal(columnDrillType('work_order_id'), 'work_order');
  assert.equal(columnDrillType('po_id'), 'purchase_order');
  assert.equal(columnDrillType('salesperson'), '');
}

rmSync(out, { force: true });
rmSync(specsOut, { force: true });
rmSync(resolve(here, '.tmp-report-drilldown-ar.mjs'), { force: true });
console.log('PASS report-drilldown');
