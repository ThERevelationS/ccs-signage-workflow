import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-proof-transitions.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/proofTransitionModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PROOF_TRANSITIONS, PROOF_TRANSITION_TARGETS, PROOF_TRANSITION_REJECTIONS,
  PROOF_AUDIT_EVENT_TYPES, PROOF_ACTOR_TYPES,
  PROOF_AWAITING_STATUS, PROOF_APPROVED_STATUS, PROOF_CHANGES_REQUESTED_STATUS,
  validateProofTransition, approveProofPatch, proofAuditEvent, portalCanSeeProof,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-02T10:00:00Z';
const NOW_ISO = '2026-11-02T10:00:00.000Z';
const FILE = 'https://x/proof.pdf';
const PENDING = { id: 'p1', work_order_id: 'wo1', description: 'Pylon sign', operational_status: 'awaiting_proof_approval', proof_status: 'awaiting_approval', proof_version: 2, proof_file_url: FILE };

// --- vocabulary -------------------------------------------------------------
assert.equal(PROOF_AWAITING_STATUS, 'awaiting_proof_approval');
assert.equal(PROOF_APPROVED_STATUS, 'proof_approved');
assert.equal(PROOF_CHANGES_REQUESTED_STATUS, 'proof_changes_requested');
assert.deepEqual([...PROOF_ACTOR_TYPES], ['customer', 'staff']);
assert.deepEqual([...PROOF_AUDIT_EVENT_TYPES], ['proof_approved', 'proof_changes_requested', 'proof_superseded']);

// --- PROOF_TRANSITIONS map (spec fragment preserved) --------------------------
assert.deepEqual(PROOF_TRANSITIONS.awaiting_proof_approval, ['proof_approved', 'proof_changes_requested']);
assert.deepEqual(PROOF_TRANSITIONS.proof_approved, [], 'approved is terminal inside the proof window');
assert.ok(PROOF_TRANSITIONS.proof_changes_requested.includes('proof_approved'), 'staff re-approval edge exists');
assert.ok(PROOF_TRANSITIONS.proof_changes_requested.includes('awaiting_proof_approval'), 'revised-proof resend edge exists');
assert.deepEqual(PROOF_TRANSITIONS.design_review, ['awaiting_proof_approval'], 'staff send edge');
for (const t of ['proof_approved', 'proof_changes_requested', 'awaiting_proof_approval']) {
  assert.ok(PROOF_TRANSITION_TARGETS.includes(t), `target ${t} declared`);
}
for (const r of ['invalid_product', 'deleted', 'not_in_proof_window', 'unknown_target', 'illegal_transition', 'actor_forbidden']) {
  assert.ok(PROOF_TRANSITION_REJECTIONS.includes(r), `rejection ${r} declared`);
}

// --- validateProofTransition: customer path ---------------------------------
assert.equal(validateProofTransition(PENDING, 'proof_approved', { actor_type: 'customer' }).ok, true, 'customer may approve while awaiting');
assert.equal(validateProofTransition(PENDING, 'proof_changes_requested', { actor_type: 'customer' }).ok, true, 'customer may request changes while awaiting');
assert.equal(validateProofTransition(PENDING, 'awaiting_proof_approval', { actor_type: 'customer' }).ok, false, 'customer cannot resend');
{
  const r = validateProofTransition({ ...PENDING, operational_status: 'proof_changes_requested' }, 'proof_approved', { actor_type: 'customer' });
  assert.equal(r.ok, false, 'customer cannot self-approve a changes-requested product');
  assert.equal(r.reason, 'actor_forbidden');
}
assert.equal(validateProofTransition({ ...PENDING, operational_status: 'proof_approved' }, 'proof_approved', { actor_type: 'customer' }).reason, 'not_in_proof_window', 'already-approved → no pending decision');
assert.equal(validateProofTransition({ ...PENDING, operational_status: 'in_production' }, 'proof_approved', { actor_type: 'customer' }).reason, 'not_in_proof_window');
assert.equal(validateProofTransition({ status_key: 'awaiting_proof_approval' }, 'proof_approved', { actor_type: 'customer' }).ok, true, 'projected portal row shape works');
assert.equal(validateProofTransition({ operational_status: 'Awaiting Proof Approval' }, 'proof_approved', { actor_type: 'customer' }).ok, true, 'status normalization');

// --- validateProofTransition: staff path ------------------------------------
assert.equal(validateProofTransition(PENDING, 'proof_approved', { actor_type: 'staff' }).ok, true, 'staff may approve while awaiting');
assert.equal(validateProofTransition({ ...PENDING, operational_status: 'proof_changes_requested' }, 'proof_approved', { actor_type: 'staff' }).ok, true, 'staff may re-approve after revision');
assert.equal(validateProofTransition(PENDING, 'proof_changes_requested', { actor_type: 'staff' }).ok, true, 'staff may record a changes request');
assert.equal(validateProofTransition({ ...PENDING, operational_status: 'proof_changes_requested' }, 'awaiting_proof_approval', { actor_type: 'staff' }).ok, true, 'staff may resend a revised proof');
assert.equal(validateProofTransition({ operational_status: 'design_review' }, 'awaiting_proof_approval', { actor_type: 'staff' }).ok, true, 'staff may send the proof');
assert.equal(validateProofTransition({ operational_status: 'in_design' }, 'awaiting_proof_approval', { actor_type: 'staff' }).ok, true, 'legacy in_design folds onto design_review');
assert.equal(validateProofTransition(PENDING, 'in_production', { actor_type: 'staff' }).reason, 'unknown_target', 'non-proof target rejected');
assert.equal(validateProofTransition({ ...PENDING, operational_status: 'proof_approved' }, 'proof_approved', { actor_type: 'staff' }).reason, 'not_in_proof_window');

// --- validateProofTransition: rejection shapes -------------------------------
assert.equal(validateProofTransition(null, 'proof_approved', { actor_type: 'staff' }).reason, 'invalid_product');
assert.equal(validateProofTransition({ ...PENDING, deleted: true }, 'proof_approved', { actor_type: 'staff' }).reason, 'deleted');
assert.equal(validateProofTransition(PENDING, 'proof_approved', { actor_type: 'vendor' }).reason, 'actor_forbidden', 'vendor never decides');
assert.equal(validateProofTransition(PENDING, 'proof_approved', { actor_type: 'system' }).ok, false, 'system never decides');
assert.equal(validateProofTransition(PENDING, 'proof_approved', {}).reason, 'actor_forbidden', 'missing actor rejected');
assert.equal(validateProofTransition(PENDING, '', { actor_type: 'staff' }).reason, 'unknown_target');
assert.ok(validateProofTransition(PENDING, 'in_production', { actor_type: 'staff' }).error.length > 0, 'rejections carry a human error');

// --- approveProofPatch: one stamp, both paths -------------------------------
{
  const cust = approveProofPatch(PENDING, { actor_type: 'customer', actor_id: 'buyer@x.com', now: NOW });
  const staff = approveProofPatch(PENDING, { actor_type: 'staff', actor_id: 'designer@ccs.com', now: NOW });
  assert.deepEqual(cust, {
    operational_status: 'proof_approved',
    proof_status: 'approved',
    proof_approved_version: 2,
    proof_approved_at: NOW_ISO,
    proof_approved_by: 'buyer@x.com',
    proof_approval_actor_type: 'customer',
  }, 'customer patch is the stored snake_case field set');
  assert.deepEqual(staff, {
    ...cust,
    proof_approved_by: 'designer@ccs.com',
    proof_approval_actor_type: 'staff',
  }, 'staff patch identical except the two actor stamps');
  const { proof_approved_by: cb, proof_approval_actor_type: ct, ...custRest } = cust;
  const { proof_approved_by: sb, proof_approval_actor_type: st, ...staffRest } = staff;
  assert.deepEqual(staffRest, custRest, 'actor-blind fields are identical across paths');
}

// --- approveProofPatch: version pointer semantics (latest wins) --------------
assert.equal(approveProofPatch({ proof_version: 3 }, { actor_type: 'staff', actor_id: 'a', approved_version: 1, now: NOW }).proof_approved_version, 3, 'stored proof_version always wins over the explicit arg');
assert.equal(approveProofPatch({ proof_version: 0 }, { actor_type: 'staff', actor_id: 'a', approved_version: 4, now: NOW }).proof_approved_version, 0, 'a stored 0 is still the stored value (?? is null/undefined-only)');
assert.equal(approveProofPatch({}, { actor_type: 'customer', actor_id: 'c', approved_version: 5, now: NOW }).proof_approved_version, 5, 'no stored version → approved_version fallback');
assert.equal(approveProofPatch({ proof_version: '  ' }, { actor_type: 'customer', actor_id: 'c', approved_version: 2, now: NOW }).proof_approved_version, 2, 'blank stored version falls back');
assert.equal(approveProofPatch({ proof_version: 2, proof_approved_version: 1 }, { actor_type: 'staff', actor_id: 'a', now: NOW }).proof_approved_version, 2, 're-approval moves the pointer forward (E-01: never back-dated)');
// Clock + actor normalization.
assert.equal(approveProofPatch(PENDING, { actor_type: 'staff', actor_id: '  a@b.com ', now: new Date('2026-11-02T10:00:00Z') }).proof_approved_at, NOW_ISO, 'Date now → ISO');
assert.equal(approveProofPatch(PENDING, { actor_type: 'staff', actor_id: 'a', now: Date.parse(NOW_ISO) }).proof_approved_at, NOW_ISO, 'epoch-ms now → ISO');
assert.equal(approveProofPatch(PENDING, { actor_type: 'staff', actor_id: 'a' }).proof_approved_at.includes('T'), true, 'missing now → real clock');
assert.equal(approveProofPatch(PENDING, {}).proof_approved_by, '', 'missing actor_id → blank stamp');
assert.equal(approveProofPatch(PENDING, { actor_type: 'Customer' }).proof_approval_actor_type, 'customer', 'actor_type normalized');

// --- proofAuditEvent: shapes -------------------------------------------------
{
  const ev = proofAuditEvent(PENDING, 'proof_approved', { actor_type: 'customer', actor_id: 'buyer@x.com', now: NOW, note: 'looks great' });
  assert.equal(ev.event_type, 'proof_event', 'entity-legal bucket');
  assert.equal(ev.proof_event_type, 'proof_approved', 'spec vocabulary rides proof_event_type');
  assert.equal(ev.product_id, 'p1');
  assert.equal(ev.work_order_id, 'wo1');
  assert.equal(ev.product_label, 'Pylon sign');
  assert.equal(ev.actor_type, 'customer');
  assert.equal(ev.actor_id, 'buyer@x.com');
  assert.equal(ev.actor_label, 'buyer@x.com', 'entity actor_label mirrors actor_id');
  assert.equal(ev.version, 2);
  assert.equal(ev.proof_approved_version, 2);
  assert.equal(ev.note, 'looks great');
  assert.equal(ev.occurred_at, NOW_ISO);
  assert.equal(ev.created_date, NOW_ISO, 'spec read-shape: created_date mirrors occurred_at');
  assert.equal(ev.from_value, 'awaiting_proof_approval');
  assert.equal(ev.to_value, 'proof_approved');
  assert.equal(ev.details.proof_event_type, 'proof_approved');
  assert.deepEqual(ev.details.transition, { from: 'awaiting_proof_approval', to: 'proof_approved' });
}
{
  // Same product, both actor paths → identical event except actor fields.
  const cust = proofAuditEvent(PENDING, 'proof_approved', { actor_type: 'customer', actor_id: 'buyer@x.com', now: NOW });
  const staff = proofAuditEvent(PENDING, 'proof_approved', { actor_type: 'staff', actor_id: 'designer@ccs.com', now: NOW });
  const strip = ({ actor_type, actor_id, actor_label, creation_request_key, details, ...rest }) => {
    const { actor_id: _da, ...dRest } = details || {};
    return { ...rest, details: dRest };
  };
  assert.deepEqual(strip(staff), strip(cust), 'audit event identical across actor paths except actor fields');
  assert.equal(cust.actor_type, 'customer');
  assert.equal(staff.actor_type, 'staff');
}
{
  const ev = proofAuditEvent(PENDING, 'proof_changes_requested', { actor_type: 'customer', actor_id: 'buyer@x.com', now: NOW, note: 'wrong color' });
  assert.equal(ev.proof_event_type, 'proof_changes_requested');
  assert.equal(ev.to_value, 'proof_changes_requested');
  assert.equal(ev.note, 'wrong color');
  // To-status string input resolves to the same event.
  const byStatus = proofAuditEvent(PENDING, { to: 'proof_approved' }, { actor_type: 'staff', actor_id: 'a', now: NOW });
  assert.equal(byStatus.proof_event_type, 'proof_approved', 'object {to} descriptor resolves');
}
{
  const stale = { ...PENDING, proof_version: 3, proof_approved_version: 2, operational_status: 'awaiting_proof_approval' };
  const ev = proofAuditEvent(stale, 'proof_superseded', { actor_type: 'staff', actor_id: 'designer@ccs.com', now: NOW });
  assert.equal(ev.proof_event_type, 'proof_superseded');
  assert.equal(ev.from_value, ev.to_value, 'superseded is a version event — the product does not move');
  assert.equal(ev.details.proof_approved_version, 2, 'the E-01 approval pointer is preserved on the event');
  assert.match(ev.label, /approved v2, file v3/, 'label narrates the stale delta');
}
assert.equal(proofAuditEvent(PENDING, 'in_production', { actor_type: 'staff', actor_id: 'a', now: NOW }), null, 'unknown transition → null (fail closed)');
assert.equal(proofAuditEvent(PENDING, 'bogus', { actor_type: 'staff', actor_id: 'a', now: NOW }), null);
{
  // Retry-safe key: identical inputs regenerate the identical receipt.
  const a = proofAuditEvent(PENDING, 'proof_approved', { actor_type: 'customer', actor_id: 'c', now: NOW }).creation_request_key;
  const b = proofAuditEvent(PENDING, 'proof_approved', { actor_type: 'customer', actor_id: 'c', now: NOW }).creation_request_key;
  assert.equal(a, b, 'creation_request_key is deterministic');
  assert.ok(a.startsWith('proof:proof_approved:p1:2:customer:'));
  // work_order_id falls back through opts when the row lacks it.
  const noWo = proofAuditEvent({ id: 'p9', operational_status: 'awaiting_proof_approval', proof_version: 1 }, 'proof_approved', { actor_type: 'staff', actor_id: 'a', now: NOW, work_order_id: 'wo9' });
  assert.equal(noWo.work_order_id, 'wo9');
}

// --- portalCanSeeProof: latest version only ----------------------------------
assert.equal(portalCanSeeProof(PENDING), true, 'current proof visible');
assert.equal(portalCanSeeProof(PENDING, { version: 2 }), true, 'the latest version is visible');
assert.equal(portalCanSeeProof(PENDING, { version: 1 }), false, 'a superseded history version is never visible');
assert.equal(portalCanSeeProof(PENDING, { version: 3 }), false, 'a version ahead of the pointer does not exist');
assert.equal(portalCanSeeProof({}), false, 'no proof → nothing visible');
assert.equal(portalCanSeeProof({ proof_version: 0, proof_file_url: FILE }, { version: 0 }), false);
assert.equal(portalCanSeeProof({ proof_version: '2' }, { version: '2' }), true, 'string versions coerce');
assert.equal(portalCanSeeProof(PENDING, { version: 1 }), portalCanSeeProof({ ...PENDING, proof_history: [{ proof_version: 1 }] }, { version: 1 }), 'history rows do not widen visibility');

rmSync(out, { force: true });
console.log('PASS proof-transitions');
