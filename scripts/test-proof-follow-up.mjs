import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-proof-follow-up.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/proofFollowUpModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PROOF_FOLLOW_UP_CFG, PROOF_FOLLOW_UP_SENT_STATUSES,
  PROOF_FOLLOW_UP_TERMINAL_STATUSES, PROOF_FOLLOW_UP_ANCHOR_FIELDS,
  FOLLOW_UP_STAGES,
  productsNeedingProofFollowUp, proofFollowUpBatch, applyProofFollowUpPatch,
  proofFollowUpState, proofFollowUpGateStatus, proofFollowUpAnchor,
  proofFollowUpDecision,
} = await import(pathToFileURL(out).href);

const iso = (d) => new Date(`${d}T00:00:00`).toISOString(); // date-only → local midnight → UTC ISO
const apply = (product, patch) => applyProofFollowUpPatch(product, patch);
const SENT = '2026-11-02'; // proof_sent_at anchor (fu1 due 11-09, fu2 due 11-16 w/ defaults)

// --- cfg preset ---------------------------------------------------------------
assert.equal(PROOF_FOLLOW_UP_CFG.status_field, '_proof_gate_status');
assert.equal(PROOF_FOLLOW_UP_CFG.anchor_field, '_proof_anchor_at');
assert.deepEqual(PROOF_FOLLOW_UP_SENT_STATUSES, ['sent', 'awaiting_approval', 'awaiting_proof_approval']);
for (const s of ['approved', 'revision_requested', 'in_production', 'built', 'completed', 'voided']) {
  assert.ok(PROOF_FOLLOW_UP_TERMINAL_STATUSES.includes(s), `${s} terminal`);
}
assert.deepEqual(FOLLOW_UP_STAGES, ['none', 'fu1_sent', 'fu2_sent', 'answered', 'closed']);
assert.deepEqual(PROOF_FOLLOW_UP_ANCHOR_FIELDS.slice(0, 2), ['proof_sent_at', 'proof_submitted_at']);
assert.equal(PROOF_FOLLOW_UP_ANCHOR_FIELDS.at(-1), 'updated_date');

// --- gate synthesis (two-field OR, terminal wins) -------------------------------
assert.equal(proofFollowUpGateStatus({ proof_status: 'sent' }), 'sent');
assert.equal(proofFollowUpGateStatus({ proof_status: 'awaiting_approval' }), 'awaiting_approval');
assert.equal(proofFollowUpGateStatus({ operational_status: 'awaiting_proof_approval' }), 'awaiting_proof_approval');
assert.equal(proofFollowUpGateStatus({ operational_status: 'Awaiting Proof Approval' }), 'awaiting_proof_approval', 'spaces fold to underscores');
assert.equal(proofFollowUpGateStatus({ proof_status: 'sent', operational_status: 'in_production' }), 'in_production', 'terminal beats sent across fields');
assert.equal(proofFollowUpGateStatus({ proof_status: 'approved', operational_status: 'awaiting_proof_approval' }), 'approved', 'stale op status cannot keep an approved product alive');
assert.equal(proofFollowUpGateStatus({ proof_status: 'draft', operational_status: 'awaiting_proof_approval' }), 'awaiting_proof_approval', 'OR gate — either field in the window qualifies');
assert.equal(proofFollowUpGateStatus({ proof_status: 'draft', operational_status: 'in_design' }), 'draft', 'inert gate reports first raw status');

// --- anchor chain --------------------------------------------------------------
assert.ok(proofFollowUpAnchor({ proof_sent_at: '2026-11-02', proof_submitted_at: '2026-11-01' }).startsWith('2026-11-02'), 'proof_sent_at wins');
assert.ok(proofFollowUpAnchor({ proof_submitted_at: '2026-11-01', updated_date: '2026-10-30' }).startsWith('2026-11-01'), 'proof_submitted_at second');
assert.ok(proofFollowUpAnchor({ operational_status_changed_at: '2026-10-28', updated_date: '2026-10-30' }).startsWith('2026-10-28'), 'status-change stamp beats updated_date');
assert.ok(proofFollowUpAnchor({ updated_date: '2026-10-30' }).startsWith('2026-10-30'), 'updated_date last resort');
assert.equal(proofFollowUpAnchor({}), null);

// --- stale proof fires fu1 then fu2 on schedule ----------------------------------
const stale = { id: 'p1', description: 'Channel letters', proof_status: 'awaiting_approval', operational_status: 'awaiting_proof_approval', proof_sent_at: SENT };
const wo = { id: 'wo1', products: [stale] };
assert.deepEqual(productsNeedingProofFollowUp(wo, { now: '2026-11-08T23:59:59' }), [], '1ms before the 7-day boundary is not due');
{
  const [row] = productsNeedingProofFollowUp(wo, { now: '2026-11-09' });
  assert.equal(row.index, 0);
  assert.equal(row.product.id, 'p1');
  assert.equal(row.decision.action, 'send_fu1', 'day-7 boundary is due (inclusive)');
  assert.equal(row.decision.reason, 'fu1_due');
  assert.equal(row.decision.patch.stage, 'fu1_sent');
  assert.equal(row.decision.patch.next_due_at, iso('2026-11-16'), 'next_due = now + fu2_after_fu1_days');
  assert.ok(row.decision.patch.anchor_at.startsWith('2026-11-02'), 'anchor frozen');
  assert.equal(row.decision.patch.fu1_sent_at, row.decision.patch.last_sent_at);

  const p1 = apply(stale, row.decision.patch);
  assert.equal(p1.proof_follow_up_state.stage, 'fu1_sent');
  assert.equal(stale.proof_follow_up_state, undefined, 'apply does not mutate the input');
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo1', products: [p1] }, { now: '2026-11-09' }), [], 'same-day re-evaluation never re-fires');
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo1', products: [p1] }, { now: '2026-11-15' }), []);

  const [row2] = productsNeedingProofFollowUp({ id: 'wo1', products: [p1] }, { now: '2026-11-16' });
  assert.equal(row2.decision.action, 'send_fu2');
  assert.equal(row2.decision.reason, 'fu2_due:next_due_at');
  assert.equal(row2.decision.patch.stage, 'fu2_sent');
  assert.equal(row2.decision.patch.next_due_at, null);
  assert.equal(row2.decision.patch.fu1_sent_at, row.decision.patch.fu1_sent_at, 'FU1 stamp preserved');
  const p2 = apply(p1, row2.decision.patch);
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo1', products: [p2] }, { now: '2026-12-01' }), [], 'sequence_complete is inert');
}

// --- approved / answered products never fire -------------------------------------
{
  const approved = { id: 'p2', proof_status: 'approved', operational_status: 'proof_approved', proof_sent_at: SENT };
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [approved] }, { now: '2026-11-09' });
  assert.equal(r.decision.action, 'close');
  assert.equal(r.decision.patch.stage, 'closed');
  assert.equal(r.decision.patch.closed_reason, 'approved');
  const closed = apply(approved, r.decision.patch);
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [closed] }, { now: '2026-11-20' }), [], 'closes exactly once — already_closed');
}
{
  const movedOn = { id: 'p3', proof_status: 'sent', operational_status: 'in_production', proof_sent_at: SENT };
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [movedOn] }, { now: '2026-11-09' });
  assert.equal(r.decision.action, 'close', 'downstream operational status closes a stale sequence');
  assert.equal(r.decision.patch.closed_reason, 'in_production');
}
{
  const revised = { id: 'p4', proof_status: 'revision_requested', operational_status: 'awaiting_proof_approval', proof_sent_at: SENT };
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [revised] }, { now: '2026-11-09' });
  assert.equal(r.decision.action, 'close', 'revision request = customer answered');
  assert.equal(r.decision.patch.closed_reason, 'revision_requested');
}
// Inert statuses pause, never close.
assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [{ id: 'p5', proof_status: 'draft', operational_status: 'in_design', proof_sent_at: SENT }] }, { now: '2026-11-20' }), [], 'draft/in_design pauses');
assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [{ id: 'p6', proof_status: 'none', operational_status: 'order_review' }] }, { now: '2026-11-20' }), []);
// OR gate — operational_status alone qualifies a product.
{
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [{ id: 'p7', operational_status: 'awaiting_proof_approval', proof_sent_at: SENT }] }, { now: '2026-11-09' });
  assert.equal(r.decision.action, 'send_fu1', 'op status alone opens the window');
}

// --- per-product independence -----------------------------------------------------
{
  const mixed = {
    id: 'wo-mix',
    products: [
      { id: 'a', description: 'Stale', proof_status: 'awaiting_approval', proof_sent_at: SENT },
      { id: 'b', description: 'Fresh', proof_status: 'awaiting_approval', proof_sent_at: '2026-11-08' },
      { id: 'c', description: 'Done', proof_status: 'approved', proof_sent_at: SENT },
    ],
  };
  const rows = productsNeedingProofFollowUp(mixed, { now: '2026-11-09' });
  assert.equal(rows.length, 2, 'stale fires fu1, approved closes, fresh waits');
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].decision.action, 'send_fu1');
  assert.equal(rows[1].index, 2);
  assert.equal(rows[1].decision.action, 'close');
  const patchedA = apply(mixed.products[0], rows[0].decision.patch);
  assert.equal(mixed.products[1].proof_follow_up_state, undefined, 'patching product A leaves B untouched');
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo-mix', products: [patchedA, mixed.products[1], mixed.products[2]] }, { now: '2026-11-09' }).map((r) => r.index), [2], 'A now inert, B still not due — only the unpatched approved product re-emits close');
}

// --- per-product state never collides with estimate-level fields -------------------
{
  const polluted = {
    id: 'p8', proof_status: 'awaiting_approval', proof_sent_at: SENT,
    follow_up_state: { stage: 'fu2_sent' }, follow_up_stage: 'fu2_sent',
    follow_up_last_sent_at: '2026-11-01T00:00:00Z',
  };
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [polluted] }, { now: '2026-11-09' });
  assert.equal(r.decision.action, 'send_fu1', 'estimate-level follow_up_state/stage on the product is ignored');
  assert.equal(proofFollowUpState(polluted).stage, 'none', 'read-side isolation too');
}

// --- partial-write cooldown + fu2 recovery ------------------------------------------
{
  const lost = { id: 'p9', proof_status: 'awaiting_approval', proof_sent_at: '2026-10-01', proof_follow_up_state: { stage: 'none', last_sent_at: '2026-11-09T00:00:00' } };
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [lost] }, { now: '2026-11-12' }), [], 'lost stage marker suppressed inside spacing window');
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [lost] }, { now: '2026-11-16' });
  assert.equal(r.decision.action, 'send_fu1', 'cooldown expires — stale stage recovers');
}
{
  const noDue = { id: 'p10', proof_status: 'awaiting_approval', proof_sent_at: SENT, proof_follow_up_state: { stage: 'fu1_sent', last_sent_at: '2026-11-20T00:00:00', next_due_at: null } };
  // due = max(anchor 11-02 + 14d, fu1 11-20 + 7d) = 11-27.
  assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [noDue] }, { now: '2026-11-26' }), [], 'recovered schedule never fires early');
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [noDue] }, { now: '2026-11-27' });
  assert.equal(r.decision.action, 'send_fu2');
  assert.equal(r.decision.reason, 'fu2_due:recovered');
}

// --- stored extras survive the machine patch -----------------------------------------
{
  const prod = { id: 'p11', proof_status: 'awaiting_approval', proof_sent_at: SENT, proof_follow_up_state: { custom_flag: 'keep' } };
  const [r] = productsNeedingProofFollowUp({ id: 'wo', products: [prod] }, { now: '2026-11-09' });
  assert.equal(r.decision.patch.custom_flag, 'keep', 'unknown stored keys preserved through the patch');
}

// --- batch flatten --------------------------------------------------------------------
{
  const w1 = { id: 'w1', products: [
    { id: 'p1', description: 'Letters', proof_status: 'awaiting_approval', proof_sent_at: SENT },
    { id: 'p2', description: 'Fresh', proof_status: 'awaiting_approval', proof_sent_at: '2026-11-08' },
  ] };
  const w2 = { id: 'w2', products: [{ id: 'p3', client_product_name: 'Monument sign', proof_status: 'revision_requested', proof_sent_at: SENT }] };
  const w3 = { id: 'w3', products: [{ description: 'No id product', proof_status: 'awaiting_approval', proof_sent_at: SENT }] };
  const dead = { id: 'w4', completed: true, products: [{ id: 'px', proof_status: 'awaiting_approval', proof_sent_at: SENT }] };
  const gone = { id: 'w5', deleted: true, products: [{ id: 'py', proof_status: 'awaiting_approval', proof_sent_at: SENT }] };
  const rows = proofFollowUpBatch([w1, w2, w3, dead, gone], { now: '2026-11-09' });
  assert.equal(rows.length, 3, 'flat rows across orders; completed/deleted skipped');
  assert.deepEqual(rows.map((r) => [r.work_order_id, r.product_id]), [['w1', 'p1'], ['w2', 'p3'], ['w3', 'w3:0']]);
  assert.equal(rows[0].product_label, 'Letters');
  assert.equal(rows[1].product_label, 'Monument sign', 'client_product_name fallback');
  assert.equal(rows[2].product_label, 'No id product');
  assert.equal(rows[1].action, 'close');
  for (const key of ['work_order_id', 'product_id', 'product_label', 'action', 'patch', 'reason']) {
    assert.ok(key in rows[0], `row carries ${key}`);
  }
}
{
  const rows = proofFollowUpBatch([{ id: 'w', products: [{ product_type: 'Vinyl', proof_status: 'awaiting_approval', proof_sent_at: SENT }] }], { now: '2026-11-09' });
  assert.equal(rows[0].product_label, 'Vinyl', 'product_type label fallback');
  const blank = proofFollowUpBatch([{ id: 'w', products: [{ proof_status: 'awaiting_approval', proof_sent_at: SENT }] }], { now: '2026-11-09' });
  assert.equal(blank[0].product_label, 'Product 1', 'positional label fallback');
}
assert.deepEqual(proofFollowUpBatch([], { now: '2026-11-09' }), []);
assert.deepEqual(proofFollowUpBatch(null, { now: '2026-11-09' }), []);

// --- applyProofFollowUpPatch -------------------------------------------------------------
{
  const prod = { id: 'p', proof_status: 'awaiting_approval', proof_follow_up_state: { stage: 'none', extra: 1 } };
  const merged = applyProofFollowUpPatch(prod, { stage: 'fu1_sent', last_sent_at: 'x', next_due_at: 'y', anchor_at: 'z', fu1_sent_at: 'x', fu2_sent_at: null, answered_at: null, closed_reason: null });
  assert.equal(merged.proof_follow_up_state.stage, 'fu1_sent');
  assert.equal(merged.proof_follow_up_state.extra, 1, 'unknown keys merged, not replaced');
  assert.equal(merged.id, 'p', 'other product fields preserved');
  const noop = applyProofFollowUpPatch(prod, null);
  assert.deepEqual(noop.proof_follow_up_state, prod.proof_follow_up_state, 'null patch is a no-op copy');
  assert.equal(applyProofFollowUpPatch(null, { stage: 'x' }), null, 'non-object product passes through');
}

// --- guards --------------------------------------------------------------------------------
assert.deepEqual(productsNeedingProofFollowUp({ id: 'wo', products: [stale] }, {}), [], 'missing now refuses to fire');
assert.equal(proofFollowUpDecision(stale, {}).reason, 'now_invalid');
assert.equal(proofFollowUpDecision({ proof_status: 'awaiting_approval' }, { now: '2026-12-01' }).reason, 'anchor_missing', 'no dates → cannot schedule');
{
  const r = proofFollowUpDecision(stale, { now: '2026-11-05', cfg: { fu1_delay_days: 3 } });
  assert.equal(r.action, 'send_fu1', 'cfg delay override honored');
  const pin = proofFollowUpDecision(stale, { now: '2026-11-09', cfg: { status_field: 'proof_status', anchor_field: 'proof_sent_at' } });
  assert.equal(pin.action, 'send_fu1', 'caller cfg cannot detach the view wiring (status/anchor still resolve)');
}

rmSync(out, { force: true });
console.log('PASS proof-follow-up');
