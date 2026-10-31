import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-ops-reports.mjs');
const outPqm = resolve(here, '.tmp-ops-pqm.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/reports/opsReportModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/productQueueModel.js')],
  bundle: true, format: 'esm', outfile: outPqm, logLevel: 'silent',
});
const {
  wipByProductStatus,
  wipByOrderStage,
  overdueReport,
  onTimeReport,
  daysInStatusSummary,
  estimatesConversion,
  arAgingReport,
  arBucketIndex,
  productValue,
  productCompletedAt,
  productDueDate,
  OPS_REPORTS,
  OPS_REPORT_MAP,
} = await import(pathToFileURL(out).href);
const { flattenQueueRows } = await import(pathToFileURL(outPqm).href);

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Nov 10 2026, local noon
const isoDaysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
const dateDaysAgo = (days) => {
  const d = new Date(NOW.getTime() - days * 86400000);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const wo = (over = {}, products = []) => ({
  id: 'wo1', title: 'WO-1', client_name: 'Acme', current_stage: 'production',
  created_date: isoDaysAgo(20), products, ...over,
});

// Every registered report builds the uniform shape.
for (const def of OPS_REPORTS) {
  const report = def.build({ queueRows: [], workOrders: [], estimates: [], invoices: [], now: NOW });
  assert.ok(Array.isArray(report.columns) && report.columns.length > 0, `${def.key} columns`);
  assert.ok(Array.isArray(report.rows), `${def.key} rows`);
  assert.equal(OPS_REPORT_MAP[def.key], def);
}

// productValue / due / completion helpers.
{
  assert.equal(productValue({ quoted_total: 125.5 }), 125.5);
  assert.equal(productValue({ quoted_unit_price: 10, quantity: 3 }), 30);
  assert.equal(productValue({ quoted_unit_price: 10 }), 10);
  assert.equal(productValue({}), 0);
  assert.equal(productDueDate({ product_due_date: '2026-11-01' }, { project_install_date: '2026-12-01' }), '2026-11-01');
  assert.equal(productDueDate({}, { project_install_date: '2026-12-01' }), '2026-12-01');
  assert.equal(productDueDate({}, { due_date: '2026-12-05' }), '2026-12-05');
  const p = { status_history: [
    { at: '2026-11-01T10:00:00', field: 'fulfillment_state', from: 'awaiting_pickup', to: 'picked_up' },
    { at: '2026-11-02T10:00:00', field: 'operational_status', to: 'none' },
  ] };
  const done = productCompletedAt(p, {});
  assert.equal(done.getDate(), 1, 'latest fulfilled history entry wins');
  const proxy = productCompletedAt({}, { completed: true, updated_date: '2026-11-08T08:00:00Z' });
  assert.equal(proxy.getFullYear(), 2026);
  assert.equal(productCompletedAt({}, {}), null);
}

// wipByProductStatus: count + value by operational_status on flattened rows.
{
  const rows = flattenQueueRows([
    wo({}, [
      { id: 'a', operational_status: 'in_production', quoted_total: 100 },
      { id: 'b', operational_status: 'in_production', quoted_total: 50 },
      { id: 'c', operational_status: 'in_design', quoted_unit_price: 25, quantity: 2 },
      { id: 'd', operational_status: 'in_production', fulfillment_state: 'installed', quoted_total: 999 },
    ]),
  ]);
  const report = wipByProductStatus(rows);
  const prod = report.rows.find((r) => r[0] === 'In Production');
  const design = report.rows.find((r) => r[0] === 'In Design');
  assert.deepEqual(prod.slice(1), [2, 150]);
  assert.deepEqual(design.slice(1), [1, 50]);
  assert.deepEqual(report.totals, ['Total', 3, 200]);
  assert.equal(report.rows.length, 2, 'fulfilled product excluded by flattenQueueRows');
}

// wipByOrderStage: count + value by current_stage; completed/deleted excluded.
{
  const report = wipByOrderStage([
    wo({ id: 'w1', current_stage: 'production' }, [{ id: 'a', quoted_total: 100 }]),
    wo({ id: 'w2', current_stage: 'design' }, [{ id: 'b', quoted_total: 80 }, { id: 'c', quoted_total: 20 }]),
    wo({ id: 'w3', current_stage: 'design', estimate_amount: 40 }),
    wo({ id: 'w4', current_stage: 'completed', completed: true }, [{ id: 'd', quoted_total: 500 }]),
    wo({ id: 'w5', deleted: true }, [{ id: 'e', quoted_total: 500 }]),
  ]);
  assert.deepEqual(report.rows.map((r) => r[0]), ['Design', 'Production'], 'enum stage order');
  const design = report.rows[0];
  assert.deepEqual(design.slice(1), [2, 2, 140], 'orders, products, value incl. estimate_amount fallback');
  assert.deepEqual(report.totals, ['Total', 3, 3, 240]);
}

// overdueReport: only past-due products, grouped by owner, with days overdue.
{
  const rows = flattenQueueRows([
    wo({ id: 'w1', title: 'WO-1' }, [
      { id: 'a', operational_status: 'in_production', product_due_date: dateDaysAgo(5), responsibility: 'Fabrication', quoted_total: 100 },
      { id: 'b', operational_status: 'in_design', product_due_date: dateDaysAgo(2), assigned_to: 'sam@ccs.com', quoted_total: 60 },
      { id: 'c', operational_status: 'in_design', product_due_date: dateDaysAgo(9), responsibility: 'Fabrication', quoted_total: 40 },
      { id: 'd', operational_status: 'in_design', product_due_date: dateDaysAgo(-3), quoted_total: 70 }, // future — not overdue
    ]),
  ]);
  const report = overdueReport(rows, NOW);
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows[0][0], 'Fabrication');
  assert.equal(report.rows[0][6], 9, 'most overdue first within owner');
  assert.equal(report.rows[1][6], 5);
  assert.equal(report.rows[2][0], 'sam@ccs.com', 'assigned_to fallback after responsibility group');
  assert.equal(report.totals[7], 200);
  assert.ok(report.rowLinks[0].startsWith('/JobWorkspace?wo=w1'));
}

// onTimeReport: fulfillment history drives on-time vs late; avg days in WIP.
{
  const fulfilled = (at) => ({ status_history: [{ at, field: 'fulfillment_state', to: 'installed' }], fulfillment_state: 'installed' });
  const report = onTimeReport([
    wo({ id: 'w1', created_date: isoDaysAgo(10) }, [
      { id: 'a', product_due_date: dateDaysAgo(2), ...fulfilled(isoDaysAgo(3)) },   // 1 day early, 7d WIP
      { id: 'b', product_due_date: dateDaysAgo(5), ...fulfilled(isoDaysAgo(2)) },   // 3 days late, 8d WIP
      { id: 'c', product_due_date: '', ...fulfilled(isoDaysAgo(1)) },               // unrated (no due)
    ]),
    wo({ id: 'w2', created_date: isoDaysAgo(4), updated_date: isoDaysAgo(1), completed: true }, [
      { id: 'd', product_due_date: dateDaysAgo(0) },                                 // completed order → 1 day early via updated_date proxy
    ]),
  ], NOW);
  const [onTime, late, unrated] = report.rows;
  assert.equal(onTime[0], 'On Time');
  assert.equal(onTime[1], 2);
  assert.equal(late[0], 'Late');
  assert.equal(late[1], 1);
  assert.equal(unrated[1], 1);
  assert.ok(Math.abs(onTime[2] - 2 / 3) < 1e-9, 'share of rated');
  assert.ok(Math.abs(late[2] - 1 / 3) < 1e-9);
  assert.equal(late[4], 3, 'avg days late');
  assert.equal(onTime[4], -1, 'avg days vs due (negative = early)');
  assert.equal(report.totals[1], 3, 'rated count in totals');
  // Open products never count.
  const open = onTimeReport([wo({ id: 'w3' }, [{ id: 'x', operational_status: 'in_production', product_due_date: dateDaysAgo(5) }])], NOW);
  assert.equal(open.rows[0][1] + open.rows[1][1] + open.rows[2][1], 0);
}

// daysInStatusSummary: avg/max per status; undated counted apart.
{
  const rows = flattenQueueRows([
    wo({}, [
      { id: 'a', operational_status: 'in_production', operational_status_changed_at: isoDaysAgo(4) },
      { id: 'b', operational_status: 'in_production', operational_status_changed_at: isoDaysAgo(10) },
      { id: 'c', operational_status: 'in_design' },
    ]),
  ]);
  const report = daysInStatusSummary(rows, NOW);
  const prod = report.rows.find((r) => r[0] === 'In Production');
  assert.equal(prod[1], 2);
  assert.equal(prod[2], 7, 'avg of 4 and 10');
  assert.equal(prod[3], 10, 'max');
  const design = report.rows.find((r) => r[0] === 'In Design');
  assert.equal(design[4], 1, 'undated');
  assert.equal(design[2], null, 'no avg without timestamps');
  assert.equal(report.totals[4], 1);
}

// estimatesConversion: created/converted/cancelled by salesperson; templates out.
{
  const report = estimatesConversion([
    { id: 'e1', salesperson: 'Ann', status: 'approved', work_order_id: 'w1', quote_total: 1000 },
    { id: 'e2', salesperson: 'Ann', status: 'sent', quote_total: 500 },
    { id: 'e3', salesperson: 'Ann', status: 'cancelled', quote_total: 300 },
    { id: 'e4', salesperson: 'Bob', status: 'draft' },
    { id: 'e5', salesperson: 'Bob', status: 'archived', work_order_id: '', quote_total: 200 },
    { id: 'e6', salesperson: 'Bob', is_template: true, status: 'approved', work_order_id: 'w9' },
    { id: 'e7', status: 'sent', work_order_id: 'w2' },
  ]);
  const ann = report.rows.find((r) => r[0] === 'Ann');
  assert.deepEqual(ann.slice(1, 6), [3, 1, 1, 0, 1]);
  assert.ok(Math.abs(ann[6] - 1 / 3) < 1e-9, 'conv fraction');
  assert.equal(ann[7], 1800);
  const bob = report.rows.find((r) => r[0] === 'Bob');
  assert.deepEqual(bob.slice(1, 6), [2, 0, 0, 1, 1], 'template excluded');
  const un = report.rows.find((r) => r[0] === 'Unassigned');
  assert.deepEqual(un.slice(1, 6), [1, 1, 0, 0, 0]);
  assert.equal(report.totals[1], 6, 'created total excludes template');
  assert.ok(Math.abs(report.totals[6] - 2 / 6) < 1e-9);
}

// arAgingReport: buckets 0–30 / 31–60 / 61–90 / 90+ on open balances.
{
  const inv = (over = {}) => ({
    id: 'i', status: 'sent', balance_due: 100, customer_display_name: 'Acme',
    due_date: '2026-11-10', ...over,
  });
  // Bucket boundaries: 0-30 / 31-60 / 61-90 / 90+ days past due.
  assert.equal(arBucketIndex(0), 0);
  assert.equal(arBucketIndex(30), 0);
  assert.equal(arBucketIndex(31), 1);
  assert.equal(arBucketIndex(60), 1);
  assert.equal(arBucketIndex(61), 2);
  assert.equal(arBucketIndex(90), 2);
  assert.equal(arBucketIndex(91), 3);
  const report = arAgingReport([
    inv({ id: 'i1', due_date: dateDaysAgo(0), balance_due: 10 }),    // current → 0–30
    inv({ id: 'i2', due_date: dateDaysAgo(30), balance_due: 20 }),   // 30 → 0–30
    inv({ id: 'i3', due_date: dateDaysAgo(31), balance_due: 40 }),   // 31 → 31–60
    inv({ id: 'i4', due_date: dateDaysAgo(75), balance_due: 80 }),   // 75 → 61–90
    inv({ id: 'i5', due_date: dateDaysAgo(120), balance_due: 160 }), // 120 → 90+
    inv({ id: 'i6', status: 'paid', due_date: dateDaysAgo(120), balance_due: 0 }),
    inv({ id: 'i7', status: 'draft', due_date: dateDaysAgo(120), balance_due: 70 }),
    inv({ id: 'i8', status: 'void', balance_due: 90 }),
    inv({ id: 'i9', status: 'partially_paid', due_date: dateDaysAgo(45), balance_due: 5, customer_display_name: 'Beta' }),
    inv({ id: 'i10', issue_date: dateDaysAgo(50), due_date: '', balance_due: 7, customer_display_name: 'Gamma' }), // issue-date fallback
  ], NOW);
  const acme = report.rows.find((r) => r[0] === 'Acme');
  assert.equal(acme[1], 5, 'open invoice count (draft/void/paid excluded)');
  assert.deepEqual(acme.slice(2, 6), [30, 40, 80, 160]);
  assert.equal(acme[6], 310);
  const beta = report.rows.find((r) => r[0] === 'Beta');
  assert.deepEqual(beta.slice(2, 6), [0, 5, 0, 0]);
  const gamma = report.rows.find((r) => r[0] === 'Gamma');
  assert.deepEqual(gamma.slice(2, 6), [0, 7, 0, 0], 'issue_date fallback');
  assert.equal(report.totals[1], 7);
  assert.equal(report.totals[6], 322);
}

rmSync(out);
rmSync(outPqm);
console.log('PASS ops-reports');
