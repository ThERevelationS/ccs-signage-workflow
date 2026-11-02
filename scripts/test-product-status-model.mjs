import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-product-status-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/productStatusModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  OPERATIONAL_STATUS_SET, WIP_STATUSES, TERMINAL_STATUSES, WORK_ORDER_STAGE_SET,
  STATUS_STAGE_MAP, isOperationalStatus, isWipStatus, isTerminalStatus,
  stageHintForStatus, CUSTOMER_FACING_LABELS, INTERNAL_STATUSES,
  isInternalStatus, customerFacingLabel,
} = await import(pathToFileURL(out).href);

// B-01 — the locked vocabulary is exactly the CoreBridge WIP set + wrappers.
const EXPECTED = [
  'order_review', 'site_survey', 'awaiting_customer_action',
  'awaiting_proof_approval', 'permitting', 'proof_approved', 'in_production',
  'install_removal_only', 'quality_control', 'design_review', 'service_repair',
  'built', 'completed', 'voided',
];
assert.deepEqual([...OPERATIONAL_STATUS_SET], EXPECTED, '14 locked statuses in order');
assert.equal(new Set(OPERATIONAL_STATUS_SET).size, 14, 'no duplicates');

// WIP/terminal split covers the whole set with no overlap.
assert.deepEqual([...TERMINAL_STATUSES], ['built', 'completed', 'voided'], 'terminal wrappers');
assert.equal(WIP_STATUSES.length, 11, 'eleven WIP statuses');
assert.deepEqual(
  [...WIP_STATUSES, ...TERMINAL_STATUSES].sort(),
  [...OPERATIONAL_STATUS_SET].sort(),
  'WIP ∪ TERMINAL = full set',
);
for (const s of WIP_STATUSES) assert.ok(!TERMINAL_STATUSES.includes(s), `${s} not terminal`);

// Stage map covers every status and only emits real WO stages.
assert.deepEqual(
  Object.keys(STATUS_STAGE_MAP).sort(), [...OPERATIONAL_STATUS_SET].sort(),
  'stage map keyed on all statuses',
);
for (const [status, stage] of Object.entries(STATUS_STAGE_MAP)) {
  assert.ok(WORK_ORDER_STAGE_SET.includes(stage), `${status}→${stage} is a real stage`);
}
assert.equal(STATUS_STAGE_MAP.order_review, 'sales');
assert.equal(STATUS_STAGE_MAP.site_survey, 'design');
assert.equal(STATUS_STAGE_MAP.permitting, 'permitting');
assert.equal(STATUS_STAGE_MAP.proof_approved, 'production');
assert.equal(STATUS_STAGE_MAP.in_production, 'production');
assert.equal(STATUS_STAGE_MAP.quality_control, 'fabrication');
assert.equal(STATUS_STAGE_MAP.install_removal_only, 'installation');
assert.equal(STATUS_STAGE_MAP.built, 'installation');
assert.equal(STATUS_STAGE_MAP.completed, 'completed');
assert.equal(STATUS_STAGE_MAP.voided, 'completed');

// isOperationalStatus: membership + the patch-builder normalization.
for (const s of OPERATIONAL_STATUS_SET) assert.ok(isOperationalStatus(s), `${s} validates`);
assert.ok(isOperationalStatus(' Awaiting_Proof_Approval '), 'case/whitespace normalize');
assert.ok(isOperationalStatus('awaiting proof approval'), 'spaces fold to underscores');
assert.ok(isOperationalStatus('IN-PRODUCTION'), 'hyphens fold');
assert.equal(isOperationalStatus('bogus'), false, 'unknown rejected');
assert.equal(isOperationalStatus('in_design'), false, 'retired in_design rejected');
assert.equal(isOperationalStatus('vended'), false, 'retired vended rejected');
assert.equal(isOperationalStatus('install_or_removal_only'), false, 'legacy spelling rejected');
assert.equal(isOperationalStatus(''), false);
assert.equal(isOperationalStatus(undefined), false);
assert.equal(isOperationalStatus(null), false);
assert.equal(isOperationalStatus(42), false);

// WIP/terminal helpers agree with the arrays.
assert.ok(isWipStatus('in_production') && !isWipStatus('built'));
assert.ok(isTerminalStatus('voided') && !isTerminalStatus('permitting'));
assert.equal(stageHintForStatus('proof_approved'), 'production');
assert.equal(stageHintForStatus('bogus'), '', 'unknown status → no hint');

// B-02 — customer-facing labels: exact text, one entry per status.
const EXPECTED_LABELS = {
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
assert.deepEqual(
  Object.keys(CUSTOMER_FACING_LABELS).sort(), [...OPERATIONAL_STATUS_SET].sort(),
  'label map keyed on all statuses',
);
for (const [status, label] of Object.entries(EXPECTED_LABELS)) {
  assert.equal(CUSTOMER_FACING_LABELS[status], label, `${status} label`);
}
assert.equal(customerFacingLabel('in_production'), 'In Production');
assert.equal(customerFacingLabel('Awaiting_Proof_Approval'), 'Requires Proof Approval');
assert.equal(customerFacingLabel('bogus'), '', 'unknown → empty');
assert.equal(customerFacingLabel(''), '');

// INTERNAL_STATUSES: never rendered on customer surfaces; subset of the set.
assert.ok(INTERNAL_STATUSES.length >= 1, 'internal list declared');
for (const s of INTERNAL_STATUSES) {
  assert.ok(OPERATIONAL_STATUS_SET.includes(s), `${s} internal is a real status`);
}
assert.ok(INTERNAL_STATUSES.includes('voided'), 'voided is internal-only');
assert.ok(isInternalStatus('Voided') && !isInternalStatus('in_production'));

rmSync(out);
console.log('PASS product-status-model');
