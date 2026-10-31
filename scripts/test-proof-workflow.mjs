import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-proof-stub.mjs');
const outModel = resolve(here, '.tmp-proof-model.mjs');
const outWoc = resolve(here, '.tmp-proof-woc.mjs');
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {}; export const NotificationTriggers = {}; export function saveTrackedFields() {}; export default {};\n');
const alias = {
  '@/api/base44Client': stub,
  '@/components/staff/staffEntities': stub,
  '@/components/workflow/NotificationService': stub,
  '@/components/shared/trackedFieldPersistence': stub,
};
buildSync({
  entryPoints: [resolve(here, '../src/components/proofs/proofModel.js')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent', alias,
});
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/workOrderConversion.js')],
  bundle: true, format: 'esm', outfile: outWoc, logLevel: 'silent', alias,
});
const {
  PROOF_TRANSITIONS, canRequestApproval, canApproveProof, canRequestRevision,
  isProofStale, proofBadge, proofHistory, nextProofPatch,
} = await import(pathToFileURL(outModel).href);
const { applyProductOperationalPatch } = await import(pathToFileURL(outWoc).href);

// --- Transition legality -----------------------------------------------------
assert.equal(PROOF_TRANSITIONS.none.includes('awaiting_approval'), true);
assert.equal(PROOF_TRANSITIONS.approved.includes('approved'), false, 'approved is terminal until superseded');
assert.equal(PROOF_TRANSITIONS.draft.includes('approved'), false, 'draft cannot skip straight to approved');

// A product with no proof file cannot be sent or approved.
{
  const bare = { id: 'p1', proof_status: 'draft' };
  assert.equal(canRequestApproval(bare), false, 'no file → cannot request approval');
  assert.equal(canApproveProof(bare), false);
  assert.throws(() => nextProofPatch(bare, 'send_proof'), /Upload a proof file/);
  assert.throws(() => nextProofPatch(bare, 'approve'), /no proof file to approve/);
}
// send_proof requires a reachable awaiting_approval state.
{
  const approved = { id: 'p1', proof_status: 'approved', proof_version: 1, proof_approved_version: 1, proof_file_url: 'https://x/p.pdf' };
  assert.equal(canRequestApproval(approved), false, 'approved product must be superseded first');
  assert.throws(() => nextProofPatch(approved, 'send_proof'), /cannot be sent for approval/);
  assert.equal(canRequestRevision(approved), true, 'revision can invalidate an approval');
}
// send_proof: file lands, product waits on the customer.
{
  const product = { id: 'p1', proof_status: 'draft', operational_status: 'in_design' };
  const patch = nextProofPatch(product, 'send_proof', { fileUrl: 'https://x/proof.pdf', fileName: 'proof.pdf', fileVersion: 1 });
  assert.equal(patch.proofStatus, 'awaiting_approval');
  assert.equal(patch.operationalStatus, 'awaiting_proof_approval');
  assert.equal(patch.proofFileUrl, 'https://x/proof.pdf');
  assert.equal(patch.proofVersion, 1);
  const next = applyProductOperationalPatch(product, patch, { now: '2026-11-01T00:00:00Z', actor: 'qa@x.com' });
  assert.equal(next.proof_status, 'awaiting_approval');
  assert.equal(next.operational_status, 'awaiting_proof_approval');
  assert.equal(next.proof_file_url, 'https://x/proof.pdf');
  assert.equal(next.proof_version, 1);
  assert.equal(proofHistory(next).length >= 3, true, 'proof fields audited in status_history');
}
// approve: advances operational status, recalcs a soft due date, stamps version.
{
  const product = {
    id: 'p1', proof_status: 'awaiting_approval', operational_status: 'awaiting_proof_approval',
    proof_version: 2, proof_file_url: 'https://x/v2.pdf', product_due_date: '2026-11-20',
  };
  const patch = nextProofPatch(product, 'approve', { leadTimeDays: 5, now: '2026-10-30T12:00:00Z' });
  assert.equal(patch.proofApprovedVersion, 2);
  const next = applyProductOperationalPatch(product, patch, { now: '2026-10-30T12:00:00Z' });
  assert.equal(next.proof_status, 'approved');
  assert.equal(next.operational_status, 'proof_approved');
  assert.equal(next.proof_approved_version, 2, 'approval is stamped to the exact version');
  assert.equal(next.product_due_date.startsWith('2026-11-04'), true, 'soft due date rolls forward by lead days');
  assert.equal(isProofStale(next), false);
  assert.equal(proofBadge(next).label, 'Approved v2');
}
// approve honors hard due dates: due date never moves.
{
  const product = {
    id: 'p1', proof_status: 'awaiting_approval', operational_status: 'awaiting_proof_approval',
    proof_version: 1, proof_file_url: 'https://x/v1.pdf',
    hard_due_date: true, product_due_date: '2026-11-01',
  };
  const next = applyProductOperationalPatch(product, nextProofPatch(product, 'approve', { leadTimeDays: 30, now: '2026-10-01' }));
  assert.equal(next.product_due_date, '2026-11-01', 'hard due date survives approval recalc');
  assert.equal(next.proof_status, 'approved');
  assert.equal(next.operational_status, 'proof_approved');
}
// A newer file version on an "approved" product is stale.
{
  const product = { id: 'p1', proof_status: 'approved', proof_version: 3, proof_approved_version: 1, proof_file_url: 'https://x/v3.pdf' };
  assert.equal(isProofStale(product), true, 'v3 file vs v1 approval is stale');
  assert.equal(isProofStale(product, 1), false, 'the approved version itself is not stale');
  assert.equal(proofBadge(product).key, 'stale');
}
// supersede: new version returns to draft and clears the approval.
{
  const product = {
    id: 'p1', proof_status: 'approved', operational_status: 'proof_approved',
    proof_version: 1, proof_approved_version: 1, proof_file_url: 'https://x/v1.pdf',
  };
  const patch = nextProofPatch(product, 'supersede', { fileUrl: 'https://x/v2.pdf', fileName: 'v2.pdf' });
  assert.equal(patch.proofStatus, 'draft');
  assert.equal(patch.proofVersion, 2, 'version auto-increments');
  assert.equal(patch.proofApprovedVersion, 0);
  assert.equal(patch.operationalStatus, 'in_design', 'approved product returns to design');
  const next = applyProductOperationalPatch(product, patch);
  assert.equal(next.proof_status, 'draft');
  assert.equal(next.proof_version, 2);
  assert.equal(next.proof_approved_version, 0, 'stale approval invalidated');
  assert.equal(next.operational_status, 'in_design');
  assert.equal(canRequestApproval(next), true, 'new version can be sent again');
}
// request_revision clears a versioned approval.
{
  const product = {
    id: 'p1', proof_status: 'awaiting_approval', proof_version: 1,
    proof_approved_version: 0, proof_file_url: 'https://x/v1.pdf',
  };
  const next = applyProductOperationalPatch(product, nextProofPatch(product, 'request_revision'));
  assert.equal(next.proof_status, 'revision_requested');
  assert.equal(next.proof_approved_version, 0);
  assert.equal(canApproveProof(next), false, 'cannot approve while revision requested');
  assert.equal(canRequestApproval(next), true, 're-send allowed after revision');
}
// Illegal actions throw instead of writing inconsistent state.
assert.throws(() => nextProofPatch({ proof_status: 'none' }, 'request_revision'), /cannot be requested/);
assert.throws(() => nextProofPatch({ proof_status: 'awaiting_approval' }, 'supersede', {}), /new proof file is required/);
assert.throws(() => nextProofPatch({ proof_status: 'draft' }, 'bogus'), /Unknown proof action/);
// proofHistory reads only proof fields from status_history.
{
  const product = {
    status_history: [
      { at: '2026-11-01T00:00:00Z', field: 'designer', from: '', to: 'ann', by: 'a@x' },
      { at: '2026-11-02T00:00:00Z', field: 'proof_status', from: 'draft', to: 'awaiting_approval', by: 'b@x' },
      { at: '2026-11-03T00:00:00Z', field: 'proof_version', from: 1, to: 2, by: 'b@x' },
    ],
  };
  const history = proofHistory(product);
  assert.equal(history.length, 2);
  assert.equal(history[0].field, 'proof_status');
  assert.equal(history[1].to, 2);
}

rmSync(stub); rmSync(outModel); rmSync(outWoc);
console.log('PASS proof-workflow');
