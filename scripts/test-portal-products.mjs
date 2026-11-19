import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-portal-products.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/portal/productPortalModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  OPERATIONAL_STATUS_CUSTOMER_LABELS, FULFILLMENT_STATE_LABELS, PROOF_STATE_LABELS,
  canonicalProductStatus, customerFacingProducts, portalOrderSummary, proofActionable,
} = await import(pathToFileURL(out).href);

const product = (over = {}) => ({
  id: over.id || `p-${Math.random().toString(36).slice(2, 8)}`,
  description: 'Monument sign',
  quantity: 1,
  operational_status: 'order_review',
  customer_facing_status: '',
  fulfillment_state: 'none',
  proof_status: 'none',
  proof_file_url: '',
  product_due_date: '',
  design_due_date: '',
  ...over,
});
const wo = (products) => ({ products });

// --- B-02 label mapping: every locked status maps to its customer label ----
const EXPECTED = {
  order_review: 'Order Review',
  site_survey: 'Site Survey Scheduled',
  awaiting_customer_action: 'Action Required',
  awaiting_proof_approval: 'Requires Proof Approval',
  permitting: 'Permitting',
  proof_approved: 'Proof Approved',
  design_review: 'Design Review',
  in_production: 'In Production',
  install_removal_only: 'Install/Removal Only',
  quality_control: 'Quality Control',
  service_repair: 'Service/Repair',
  built: 'Built',
  completed: 'Completed',
  voided: 'Voided',
};
for (const [status, label] of Object.entries(EXPECTED)) {
  assert.equal(OPERATIONAL_STATUS_CUSTOMER_LABELS[status], label, `${status} label`);
}
{
  // One product per locked status — voided is internal-only and filtered.
  const rows = customerFacingProducts(wo(
    Object.keys(EXPECTED).map((s, i) => product({ id: `s${i}`, operational_status: s })),
  ));
  assert.equal(rows.length, 13, 'voided product hidden from customer view');
  const byStatus = new Map(rows.map((r) => [r.status_key, r]));
  for (const [status, label] of Object.entries(EXPECTED)) {
    if (status === 'voided') { assert.ok(!byStatus.has('voided'), 'voided absent'); continue; }
    assert.equal(byStatus.get(status)?.customer_label, label, `${status} rendered label`);
  }
}

// --- Retired/legacy statuses fold onto the locked vocabulary ---------------
assert.equal(canonicalProductStatus('vended'), 'built');
assert.equal(canonicalProductStatus('in_design'), 'design_review');
assert.equal(canonicalProductStatus('install_or_removal_only'), 'install_removal_only');
assert.equal(canonicalProductStatus('none'), '');
assert.equal(canonicalProductStatus('IN-PRODUCTION'), 'in_production');
{
  const rows = customerFacingProducts(wo([product({ operational_status: 'vended' })]));
  assert.equal(rows[0].status_key, 'built', 'legacy vended folds to built');
  assert.equal(rows[0].customer_label, 'Built', 'legacy vended takes canonical label');
}
{
  // Unknown status with a stored explicit label falls back to the stored text.
  const rows = customerFacingProducts(wo([product({ operational_status: 'mystery', customer_facing_status: 'Waiting on vinyl' })]));
  assert.equal(rows[0].customer_label, 'Waiting on vinyl', 'stored customer_facing_status fallback');
}

// --- Row shape: position/total, name, qty, due date ------------------------
{
  const rows = customerFacingProducts(wo([
    product({ id: 'a', description: 'Pylon', quantity: 3, product_due_date: '2026-03-01', design_due_date: '2026-02-01' }),
    product({ id: 'b', description: '', customer_description: 'Channel letters', design_due_date: '2026-02-15' }),
    product({ id: 'c', description: '', customer_description: '' }),
  ]));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.position, r.total]), [[1, 3], [2, 3], [3, 3]]);
  assert.equal(rows[0].product_name, 'Pylon');
  assert.equal(rows[0].qty, 3);
  assert.equal(rows[0].due_date, '2026-03-01', 'product_due_date beats design_due_date');
  assert.equal(rows[1].product_name, 'Channel letters', 'customer_description fallback');
  assert.equal(rows[1].qty, 1, 'quantity defaults to 1');
  assert.equal(rows[1].due_date, '2026-02-15', 'design_due_date used when no product_due_date');
  assert.equal(rows[2].product_name, 'Item 3', 'last-resort name');
}
{
  // deleted rows are hidden; nulls/non-arrays are safe.
  const rows = customerFacingProducts(wo([product({ id: 'x' }), product({ id: 'y', deleted: true }), null]));
  assert.deepEqual(rows.map((r) => r.id), ['x']);
  assert.deepEqual(customerFacingProducts(null), []);
  assert.deepEqual(customerFacingProducts({}), []);
}

// --- Fulfillment labels win over status (live-portal precedence) -----------
for (const [state, label] of Object.entries({
  awaiting_pickup: 'Awaiting pickup',
  awaiting_installation: 'Awaiting installation',
  awaiting_shipping: 'Awaiting shipping',
  awaiting_delivery: 'Awaiting delivery',
  picked_up: 'Picked up',
  installed: 'Installed',
  shipped: 'Shipped',
  delivered: 'Delivered',
})) {
  assert.equal(FULFILLMENT_STATE_LABELS[state], label, `${state} fulfillment label`);
  const rows = customerFacingProducts(wo([product({ operational_status: 'built', fulfillment_state: state })]));
  assert.equal(rows[0].customer_label, label, `fulfillment ${state} wins over status label`);
}

// --- proof_state mapping ----------------------------------------------------
for (const [status, state] of Object.entries({
  none: 'none', draft: 'in_preparation', sent: 'awaiting_approval',
  awaiting_approval: 'awaiting_approval', approved: 'approved',
  revision_requested: 'changes_requested', bogus: 'in_preparation',
})) {
  const rows = customerFacingProducts(wo([product({ proof_status: status })]));
  assert.equal(rows[0].proof_state, state, `proof_status ${status} → ${state}`);
}
assert.ok(PROOF_STATE_LABELS.awaiting_approval.length > 0, 'proof labels declared');

// --- proofActionable truth table --------------------------------------------
assert.equal(proofActionable({ status_key: 'awaiting_proof_approval', proof_file_url: 'https://x/proof.pdf' }), true);
assert.equal(proofActionable({ status_key: 'awaiting_proof_approval', proof_file_url: '' }), false, 'no file → not actionable');
assert.equal(proofActionable({ status_key: 'awaiting_proof_approval' }), false, 'missing url field → not actionable');
assert.equal(proofActionable({ status_key: 'in_production', proof_file_url: 'https://x/p.pdf' }), false, 'past approval → not actionable');
assert.equal(proofActionable({ status_key: 'order_review', proof_file_url: 'https://x/p.pdf' }), false);
assert.equal(proofActionable({ operational_status: 'awaiting_proof_approval', proof_file_url: ' https://x/p.pdf ' }), true, 'raw WO row shape works');
assert.equal(proofActionable({ operational_status: 'Awaiting Proof Approval', proof_file_url: 'https://x/p.pdf' }), true, 'status normalization');
assert.equal(proofActionable({}), false);
assert.equal(proofActionable(null), false);

// --- portalOrderSummary ------------------------------------------------------
{
  const s = portalOrderSummary(wo([
    product({ id: '1', operational_status: 'proof_approved' }),
    product({ id: '2', operational_status: 'in_production' }),
    product({ id: '3', operational_status: 'quality_control' }),
    product({ id: '4', operational_status: 'awaiting_proof_approval', proof_status: 'sent' }),
    product({ id: '5', operational_status: 'order_review' }),
    product({ id: '6', operational_status: 'voided' }),
  ]));
  assert.equal(s.total_products, 5, 'voided excluded from total');
  assert.equal(s.approved_count, 3, 'proof_approved+production+qc are approved');
  assert.equal(s.in_production_count, 3, 'released-through-qc counts as in production');
  assert.equal(s.fulfilled_count, 0);
  assert.equal(s.overall_label, 'Action needed', 'pending proof approval drives the headline');
}
{
  // proof_status approved counts toward approval even before status advances.
  const s = portalOrderSummary(wo([
    product({ id: '1', operational_status: 'awaiting_proof_approval', proof_status: 'approved' }),
    product({ id: '2', operational_status: 'built', fulfillment_state: 'picked_up' }),
    product({ id: '3', operational_status: 'completed' }),
  ]));
  assert.equal(s.approved_count, 3, 'proof approval + built + completed all approved');
  assert.equal(s.fulfilled_count, 2, 'picked_up + completed are fulfilled');
  assert.equal(s.overall_label, 'Action needed', 'action still wins over in-flight work');
}
{
  const s = portalOrderSummary(wo([
    product({ id: '1', operational_status: 'completed', fulfillment_state: 'delivered' }),
    product({ id: '2', operational_status: 'built', fulfillment_state: 'installed' }),
  ]));
  assert.equal(s.fulfilled_count, 2);
  assert.equal(s.overall_label, 'Order complete', 'all fulfilled → complete');
}
{
  const s = portalOrderSummary(wo([
    product({ id: '1', operational_status: 'in_production' }),
    product({ id: '2', operational_status: 'order_review' }),
  ]));
  assert.equal(s.overall_label, 'In production');
}
{
  const s = portalOrderSummary(wo([product({ operational_status: 'site_survey' })]));
  assert.equal(s.overall_label, 'In progress', 'early-stage fallback');
  assert.equal(s.approved_count, 0);
}
{
  const s = portalOrderSummary(wo([]));
  assert.deepEqual(s, {
    total_products: 0, approved_count: 0, in_production_count: 0,
    fulfilled_count: 0, overall_label: 'No items on this order',
  });
}
// Action-needed beats fulfilled edge: an action flag on a mixed order never
// reports complete.
{
  const s = portalOrderSummary(wo([
    product({ id: '1', operational_status: 'completed' }),
    product({ id: '2', operational_status: 'awaiting_customer_action' }),
  ]));
  assert.equal(s.overall_label, 'Action needed');
  assert.equal(s.fulfilled_count, 1);
}

rmSync(out);
console.log('PASS portal-products');
