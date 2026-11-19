import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-proof-batch.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/proofBatchModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PROOF_PENDING_PROOF_STATUSES, PROOF_PENDING_OPERATIONAL_STATUS,
  PROOF_APPROVED_OPERATIONAL_STATUS, PROOF_BLOCK_REASONS,
  proofActionable, proofAwaitingApproval, isProofVersionStale,
  proofBlockReason, hasProofState, pendingProofs,
  perProductApprovePatch, batchApprovePlan, batchApproveResult,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-02T10:00:00Z';
const NOW_ISO = '2026-11-02T10:00:00.000Z';
const FILE = 'https://x/proof.pdf';

// --- vocabulary ---------------------------------------------------------------
assert.deepEqual([...PROOF_PENDING_PROOF_STATUSES], ['sent', 'awaiting_approval']);
assert.equal(PROOF_PENDING_OPERATIONAL_STATUS, 'awaiting_proof_approval');
assert.equal(PROOF_APPROVED_OPERATIONAL_STATUS, 'proof_approved', 'canonical post-approval status (B-15/E-02)');
for (const r of ['not_selected', 'invalid_product', 'deleted', 'internal_status', 'no_proof_state', 'not_pending', 'no_proof_file', 'stale_version']) {
  assert.ok(PROOF_BLOCK_REASONS.includes(r), `reason ${r} declared`);
}

// --- proofActionable truth table ----------------------------------------------
// Pending gate: operational status OR proof status (broader than the portal's
// op-status-only rule — covers drifted rows still owed a decision).
assert.equal(proofActionable({ operational_status: 'awaiting_proof_approval', proof_file_url: FILE }), true);
assert.equal(proofActionable({ status_key: 'awaiting_proof_approval', proof_file_url: FILE }), true, 'projected row shape works');
assert.equal(proofActionable({ proof_status: 'sent', proof_file_url: FILE }), true, 'sent counts as pending');
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_file_url: FILE }), true);
assert.equal(proofActionable({ proof_status: 'awaiting_approval', operational_status: 'design_review', proof_file_url: FILE }), true, 'proof status carries a drifted op status');
assert.equal(proofActionable({ operational_status: 'Awaiting Proof Approval', proof_file_url: FILE }), true, 'status normalization');
// File gate.
assert.equal(proofActionable({ operational_status: 'awaiting_proof_approval' }), false, 'missing url → not actionable');
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_file_url: '   ' }), false, 'blank url → not actionable');
// Not-pending rows.
assert.equal(proofActionable({ proof_status: 'approved', operational_status: 'proof_approved', proof_file_url: FILE }), false, 'approved → not pending');
assert.equal(proofActionable({ proof_status: 'draft', proof_file_url: FILE }), false);
assert.equal(proofActionable({ proof_status: 'revision_requested', proof_file_url: FILE }), false);
assert.equal(proofActionable({ operational_status: 'in_production', proof_file_url: FILE }), false);
assert.equal(proofActionable({}), false);
assert.equal(proofActionable(null), false);
// Stale-version gate: a file version that differs from the recorded approved
// version needs review, not a batch approval stamp.
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_version: 3, proof_approved_version: 1, proof_file_url: FILE }), false, 'v3 file vs v1 approval → stale');
assert.equal(proofActionable({ proof_status: 'sent', proof_version: 2, proof_approved_version: 1, proof_file_url: FILE }), false, 'sent + newer version → stale');
assert.equal(proofActionable({ operational_status: 'awaiting_proof_approval', proof_status: 'approved', proof_version: 3, proof_approved_version: 1, proof_file_url: FILE }), false, 'approved-claim arm of staleness');
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_version: 3, proof_approved_version: 0, proof_file_url: FILE }), true, 'never approved → current version is the pending one');
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_version: 2, proof_approved_version: 2, proof_file_url: FILE }), true, 'pending on the already-approved version → not stale');
assert.equal(proofActionable({ proof_status: 'awaiting_approval', proof_version: 0, proof_approved_version: 0, proof_file_url: FILE }), true, 'unversioned file still actionable');

// --- predicate pieces -----------------------------------------------------------
assert.equal(proofAwaitingApproval({ proof_status: 'sent' }), true);
assert.equal(proofAwaitingApproval({ operational_status: 'awaiting_proof_approval' }), true);
assert.equal(proofAwaitingApproval({ proof_status: 'approved' }), false);
assert.equal(isProofVersionStale({ proof_version: 3, proof_approved_version: 1 }), true);
assert.equal(isProofVersionStale({ proof_version: 3, proof_approved_version: 0, proof_status: 'awaiting_approval' }), false, 'no versioned approval → not stale');
assert.equal(isProofVersionStale({ proof_version: 2, proof_approved_version: 2 }), false);
assert.equal(isProofVersionStale({ proof_version: 0, proof_approved_version: 0 }), false);
assert.equal(proofBlockReason({ proof_status: 'approved' }), 'not_pending');
assert.equal(proofBlockReason({ proof_status: 'awaiting_approval' }), 'no_proof_file');
assert.equal(proofBlockReason({ proof_status: 'awaiting_approval', proof_file_url: FILE, proof_version: 2, proof_approved_version: 1 }), 'stale_version');
assert.equal(proofBlockReason({ proof_status: 'awaiting_approval', proof_file_url: FILE }), '');
assert.equal(hasProofState({ proof_status: 'draft' }), true);
assert.equal(hasProofState({ proof_version: 1 }), true, 'a bare version counts as proof signal');
assert.equal(hasProofState({ proof_file_url: FILE }), true);
assert.equal(hasProofState({ operational_status: 'in_production' }), false);
assert.equal(hasProofState({}), false);

// --- perProductApprovePatch ------------------------------------------------------
{
  const patch = perProductApprovePatch(
    { id: 'p1', proof_version: 2, proof_file_url: FILE },
    { actor: '  customer@x.com ', now: NOW },
  );
  assert.deepEqual(patch, {
    proof_status: 'approved',
    proof_approved_version: 2,
    operational_status: 'proof_approved',
    proof_approved_at: NOW_ISO,
    proof_approved_by: 'customer@x.com',
  }, 'patch is the stored snake_case field set');
  assert.equal(perProductApprovePatch({}, { actor: 'a', now: NOW }).proof_approved_version, 0, 'unversioned product stamps 0');
  assert.equal(perProductApprovePatch({ proof_version: 1 }, { actor: 'staff@x.com', now: NOW }).proof_approved_by, 'staff@x.com');
  // Unconditional — the caller gates with proofActionable / staff policy.
  const stale = perProductApprovePatch({ proof_status: 'approved', proof_version: 3, proof_approved_version: 1 }, { actor: 'staff@x.com', now: NOW });
  assert.equal(stale.proof_approved_version, 3, 'patch builds regardless of actionability (gate lives in proofActionable)');
}

// --- batchApprovePlan: mixed pending/approved/no-proof ---------------------------
{
  const wo = {
    id: 'wo1',
    products: [
      { id: 'a', proof_status: 'awaiting_approval', operational_status: 'awaiting_proof_approval', proof_version: 1, proof_file_url: FILE },      // approve
      { id: 'b', proof_status: 'approved', operational_status: 'proof_approved', proof_version: 1, proof_approved_version: 1, proof_file_url: FILE }, // not_pending
      { id: 'c', description: 'No proof at all', operational_status: 'in_production' },                                                            // no_proof_state
      { id: 'd', proof_status: 'awaiting_approval', operational_status: 'awaiting_proof_approval' },                                               // no_proof_file
      { id: 'e', proof_status: 'awaiting_approval', proof_version: 3, proof_approved_version: 1, proof_file_url: FILE },                           // stale_version
      { id: 'f', proof_status: 'sent', proof_file_url: FILE, deleted: true },                                                                     // deleted
      { id: 'g', proof_status: 'sent', proof_file_url: FILE, operational_status: 'voided' },                                                      // internal_status
      { id: 'h', proof_status: 'draft', proof_file_url: FILE },                                                                                   // not_pending
      null,                                                                                                                                     // invalid_product
      { id: 'j', proof_status: 'sent', proof_version: 2, proof_file_url: FILE },                                                                  // approve
    ],
  };
  const plan = batchApprovePlan(wo, { actor: 'customer@x.com', now: NOW });
  assert.deepEqual(plan.approve.map((r) => r.index), [0, 9], 'batch approve updates ONLY pending+actionable products');
  assert.deepEqual(
    plan.skipped.map((r) => [r.index, r.reason]),
    [[1, 'not_pending'], [2, 'no_proof_state'], [3, 'no_proof_file'], [4, 'stale_version'], [5, 'deleted'], [6, 'internal_status'], [7, 'not_pending'], [8, 'invalid_product']],
    'every skipped row carries its earliest disqualifier',
  );
  const patch = plan.approve[0].patch;
  assert.equal(patch.proof_status, 'approved');
  assert.equal(patch.proof_approved_version, 1, 'approval stamps the current version');
  assert.equal(patch.operational_status, 'proof_approved');
  assert.equal(patch.proof_approved_at, NOW_ISO);
  assert.equal(patch.proof_approved_by, 'customer@x.com');
  assert.equal(plan.approve[1].patch.proof_approved_version, 2);
  const result = batchApproveResult(plan);
  assert.deepEqual(result, { approved_count: 2, skipped_count: 8 });
}

// --- batchApprovePlan: product_ids filter ---------------------------------------
{
  const wo = {
    id: 'wo2',
    products: [
      { id: 'a', proof_status: 'awaiting_approval', proof_file_url: FILE },
      { id: 'b', proof_status: 'awaiting_approval', proof_file_url: FILE },
      { id: 'c', proof_status: 'awaiting_approval', proof_file_url: FILE },
    ],
  };
  const plan = batchApprovePlan(wo, { actor: 'customer@x.com', now: NOW, product_ids: ['b'] });
  assert.deepEqual(plan.approve.map((r) => r.index), [1], 'filter approves only the selected product');
  assert.deepEqual(plan.skipped.map((r) => [r.index, r.reason]), [[0, 'not_selected'], [2, 'not_selected']]);
  // Scalar + numeric ids normalize the same way.
  const single = batchApprovePlan(wo, { actor: 'a', now: NOW, product_ids: 'a' });
  assert.deepEqual(single.approve.map((r) => r.index), [0], 'scalar product_id works');
  const numeric = batchApprovePlan({ products: [{ id: 7, proof_status: 'sent', proof_file_url: FILE }] }, { actor: 'a', now: NOW, product_ids: [7] });
  assert.equal(numeric.approve.length, 1, 'numeric id matches through string normalization');
  // An id-less product can never match a filter.
  const idless = batchApprovePlan({ products: [{ proof_status: 'sent', proof_file_url: FILE }] }, { actor: 'a', now: NOW, product_ids: ['x'] });
  assert.equal(idless.skipped[0].reason, 'not_selected');
}

// --- batchApprovePlan: edge shapes ------------------------------------------------
assert.deepEqual(batchApprovePlan({}, { actor: 'a', now: NOW }), { approve: [], skipped: [] }, 'no products → empty plan');
assert.deepEqual(batchApprovePlan(null, { actor: 'a', now: NOW }), { approve: [], skipped: [] });
{
  const plan = batchApprovePlan({ products: [{ id: 'p', proof_status: 'sent', proof_file_url: FILE }] }, {});
  assert.equal(plan.approve[0].patch.proof_approved_by, '', 'missing actor → blank stamp');
  assert.ok(plan.approve[0].patch.proof_approved_at.includes('T'), 'missing now → real clock fallback');
}

// --- batchApproveResult -------------------------------------------------------------
assert.deepEqual(batchApproveResult({ approve: [{}, {}, {}], skipped: [{}] }), { approved_count: 3, skipped_count: 1 });
assert.deepEqual(batchApproveResult({}), { approved_count: 0, skipped_count: 0 });
assert.deepEqual(batchApproveResult(null), { approved_count: 0, skipped_count: 0 });
assert.deepEqual(batchApproveResult([{ index: 0 }, { index: 2 }]), { approved_count: 2, skipped_count: 0 }, 'bare approve array reads as approved');

// --- pendingProofs: staff-side per-product state -------------------------------------
{
  const stale = { id: 'e', proof_status: 'awaiting_approval', proof_version: 3, proof_approved_version: 1, proof_file_url: FILE };
  const wo = {
    id: 'wo3',
    products: [
      { id: 'a', proof_status: 'awaiting_approval', proof_file_url: FILE },           // actionable
      { id: 'b', proof_status: 'approved', operational_status: 'proof_approved', proof_version: 1, proof_approved_version: 1 }, // not_pending
      { id: 'c', description: 'Plain product', operational_status: 'in_production' }, // no proof state → not surfaced
      { id: 'd', proof_status: 'awaiting_approval' },                                  // no_proof_file
      stale,                                                                          // stale_version
      { id: 'f', proof_status: 'sent', proof_file_url: FILE, deleted: true },         // excluded entirely
      { id: 'g', proof_status: 'sent', proof_file_url: FILE, operational_status: 'voided' }, // excluded entirely
      { id: 'h', proof_status: 'draft', proof_file_url: FILE },                        // not_pending
    ],
  };
  const rows = pendingProofs(wo);
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 3, 4, 7], 'every product with a proof state surfaces; deleted/voided/plain filtered');
  assert.equal(rows[0].actionable, true);
  assert.equal(rows[0].block_reason, '');
  assert.equal(rows[0].product.id, 'a', 'row carries the product reference');
  assert.equal(rows[1].actionable, false);
  assert.equal(rows[1].block_reason, 'not_pending');
  assert.equal(rows[2].block_reason, 'no_proof_file');
  assert.equal(rows[3].block_reason, 'stale_version');
  assert.equal(rows[3].product, stale, 'product reference preserved');
  assert.equal(rows[4].block_reason, 'not_pending', 'draft → not pending');
}
assert.deepEqual(pendingProofs({}), [], 'empty WO → no rows');
assert.deepEqual(pendingProofs(null), []);

rmSync(out, { force: true });
console.log('PASS proof-batch');
