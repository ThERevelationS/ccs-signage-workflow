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
  customerFacingStatusLabel, allProductsOperationallyApproved, recalculateProductDueDateOnProofApproval,
  convertedWorkOrderStage,
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

rmSync(stub); rmSync(out);
console.log('PASS product-operational-status');
