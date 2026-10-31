import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-woc-stub.mjs');
const out = resolve(here, '.tmp-woc.mjs');
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {}; export const NotificationTriggers = {}; export function saveTrackedFields() {}; export default {};\n');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/workOrderConversion.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: {
    '@/api/base44Client': stub,
    '@/components/staff/staffEntities': stub,
    '@/components/workflow/NotificationService': stub,
    '@/components/shared/trackedFieldPersistence': stub,
  },
});
const {
  buildEstimateWorkOrderProducts, mergeWorkOrderProducts, buildProductOperationalPatch,
  applyProductOperationalPatch, customerFacingStatusLabel, allProductsOperationallyApproved,
  recalculateProductDueDateOnProofApproval, convertedWorkOrderStage,
} = await import(pathToFileURL(out).href);

// Conversion seeds CoreBridge-style defaults on every product row.
{
  const products = buildEstimateWorkOrderProducts({ line_items: [{ line_id: 'l1', client_product_name: 'Sign' }] });
  assert.equal(products.length, 1);
  const p = products[0];
  assert.equal(p.operational_status, 'order_review', 'defaults to WIP : Order Review');
  assert.equal(p.fulfillment_state, 'none');
  assert.equal(p.proof_status, 'none');
  assert.equal(p.hard_due_date, false);
}
// Explicit line values are preserved.
{
  const products = buildEstimateWorkOrderProducts({ line_items: [{ line_id: 'l1', operational_status: 'permitting', hard_due_date: true, product_due_date: '2026-11-05' }] });
  assert.equal(products[0].operational_status, 'permitting');
  assert.equal(products[0].hard_due_date, true);
  assert.equal(products[0].product_due_date, '2026-11-05');
}
// Patch builder maps customer-facing labels and normalizes values.
{
  const patch = buildProductOperationalPatch({ operationalStatus: 'Awaiting_Proof_Approval', operationalSubstatus: '  rush  ' });
  assert.equal(patch.operational_status, 'awaiting_proof_approval');
  assert.equal(patch.operational_substatus, 'rush');
  assert.equal(patch.customer_facing_status, 'Requires Proof Approval');
  const partial = buildProductOperationalPatch({ fulfillmentState: 'Awaiting_Installation' });
  assert.equal(partial.fulfillment_state, 'awaiting_installation');
  assert.equal('operational_status' in partial, false, 'untouched fields omitted');
}
// Explicit customer label wins over the mapped default.
assert.equal(customerFacingStatusLabel('in_production', 'Custom Label'), 'Custom Label');
assert.equal(customerFacingStatusLabel('in_production'), 'In Production');
assert.equal(customerFacingStatusLabel('bogus'), '');
// CoreBridge rule: order advances only when EVERY product is approved.
assert.equal(allProductsOperationallyApproved([{ id: 'a', proof_status: 'approved' }, { id: 'b', operational_status: 'proof_approved' }]), true);
assert.equal(allProductsOperationallyApproved([{ id: 'a', proof_status: 'approved' }, { id: 'b', operational_status: 'in_production' }]), false);
assert.equal(allProductsOperationallyApproved([]), false);
// Proof-approval due-date recalc honors hard due dates.
{
  const product = { hard_due_date: true, product_due_date: '2026-11-01' };
  assert.equal(recalculateProductDueDateOnProofApproval({ product, leadTimeDays: 5, fromDate: '2026-10-30' }), '2026-11-01', 'hard date never moves');
  const soft = { product_due_date: '2026-11-20' };
  const next = recalculateProductDueDateOnProofApproval({ product: soft, leadTimeDays: 5, fromDate: '2026-10-30' });
  assert.equal(next.startsWith('2026-11-04'), true, 'soft date rolls forward by lead days');
}
// Existing work-order rows are preserved on merge; only new estimate products append.
{
  const existing = [{ id: 'x', description: 'Edited Row', operational_status: 'in_production' }];
  const merged = mergeWorkOrderProducts(existing, [{ id: 'x', description: 'Estimate Row' }, { id: 'y', description: 'New' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].description, 'Edited Row', 'existing row untouched');
  assert.equal(merged[0].operational_status, 'in_production');
}
// Stage never moves backward once operations advanced.
assert.equal(convertedWorkOrderStage('production'), 'production');
assert.equal(convertedWorkOrderStage('sales'), 'sales');
assert.equal(convertedWorkOrderStage('estimating'), 'sales');

// Unknown enum values are rejected instead of silently stored.
assert.throws(() => buildProductOperationalPatch({ operationalStatus: 'bogus' }), /Unknown product status "bogus"/);
assert.throws(() => buildProductOperationalPatch({ proofStatus: 'bogus' }), /Unknown proof status "bogus"/);
assert.throws(() => buildProductOperationalPatch({ fulfillmentState: 'bogus' }), /Unknown fulfillment state "bogus"/);
// Due dates must parse; blank is allowed (clears the date).
assert.throws(() => buildProductOperationalPatch({ productDueDate: 'not-a-date' }), /Invalid due date "not-a-date"/);
assert.equal(buildProductOperationalPatch({ productDueDate: '' }).product_due_date, '');
assert.equal(buildProductOperationalPatch({ designDueDate: '2026-11-05' }).design_due_date, '2026-11-05');
assert.throws(() => buildProductOperationalPatch({ designDueDate: '2026-13-99' }), /Invalid due date/);
// Queue priority clamps to 0-99; non-numeric becomes 0.
assert.equal(buildProductOperationalPatch({ queuePriority: 150 }).queue_priority, 99);
assert.equal(buildProductOperationalPatch({ queuePriority: -3 }).queue_priority, 0);
assert.equal(buildProductOperationalPatch({ queuePriority: 'x' }).queue_priority, 0);
assert.equal(buildProductOperationalPatch({ queuePriority: 42 }).queue_priority, 42);

// No-op patch returns the identical product object (transition helper no-ops).
{
  const product = { id: 'p1', operational_status: 'in_design', customer_facing_status: 'In Design', proof_status: 'sent', queue_priority: 5 };
  const same = applyProductOperationalPatch(product, { operationalStatus: 'in_design', proofStatus: 'sent', queuePriority: 5 });
  assert.equal(same, product, 'unchanged product keeps identity');
}
// Changed fields append status_history entries with from/to/by.
{
  const product = { id: 'p1', operational_status: 'in_design', designer: 'ann' };
  const next = applyProductOperationalPatch(product, { operationalStatus: 'in_production', designer: 'bob' }, { now: '2026-11-01T12:00:00Z', actor: 'qa@x.com' });
  assert.notEqual(next, product);
  assert.equal(next.operational_status, 'in_production');
  assert.equal(next.customer_facing_status, 'In Production');
  assert.equal(next.operational_status_changed_at, '2026-11-01T12:00:00.000Z');
  assert.equal(next.status_history.length, 2);
  assert.deepEqual(next.status_history[0], { at: '2026-11-01T12:00:00.000Z', field: 'operational_status', from: 'in_design', to: 'in_production', by: 'qa@x.com' });
  assert.equal(next.status_history[1].field, 'designer');
  assert.equal(next.status_history[1].from, 'ann');
  // Original object is untouched.
  assert.equal(product.status_history, undefined);
}
// History is capped at the most recent 50 entries.
{
  const product = { id: 'p1', status_history: Array.from({ length: 50 }, (_, i) => ({ field: `f${i}` })) };
  const next = applyProductOperationalPatch(product, { operationalSubstatus: 'hold' });
  assert.equal(next.status_history.length, 50);
  assert.equal(next.status_history[49].field, 'operational_substatus');
  assert.equal(next.status_history[0].field, 'f1');
}
// Proof approval auto-advances only from awaiting_proof_approval.
{
  const waiting = { id: 'p1', operational_status: 'awaiting_proof_approval' };
  const advanced = applyProductOperationalPatch(waiting, { proofStatus: 'approved' }, { now: '2026-11-01T00:00:00Z' });
  assert.equal(advanced.proof_status, 'approved');
  assert.equal(advanced.operational_status, 'proof_approved');
  assert.equal(advanced.customer_facing_status, 'Proof Approved');
  const other = { id: 'p2', operational_status: 'in_production' };
  const unchanged = applyProductOperationalPatch(other, { proofStatus: 'approved' });
  assert.equal(unchanged.operational_status, 'in_production');
  assert.equal(unchanged.operational_status_changed_at, undefined);
}
// Hard due date blocks moving product_due_date later without an override.
{
  const product = { id: 'p1', hard_due_date: true, product_due_date: '2026-11-05' };
  assert.throws(
    () => applyProductOperationalPatch(product, { productDueDate: '2026-11-20' }),
    /hard due date; moving it later requires an explicit override/
  );
  const earlier = applyProductOperationalPatch(product, { productDueDate: '2026-11-01' });
  assert.equal(earlier.product_due_date, '2026-11-01', 'earlier date allowed');
  const overridden = applyProductOperationalPatch(product, { productDueDate: '2026-11-20' }, { overrideHardDue: true });
  assert.equal(overridden.product_due_date, '2026-11-20', 'explicit override allowed');
  const soft = { id: 'p2', hard_due_date: false, product_due_date: '2026-11-05' };
  const moved = applyProductOperationalPatch(soft, { productDueDate: '2026-11-20' });
  assert.equal(moved.product_due_date, '2026-11-20', 'soft due date moves freely');
}

rmSync(stub); rmSync(out);
console.log('PASS product-operational-status');