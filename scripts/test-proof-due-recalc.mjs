// E-04 contract test: proof-approval due-date recalc —
// base44/shared/proofDueRecalcModel.ts wrapping the B-07 engine
// (dueDateEngine.ts) with the B-08 hard-date guard composed in. Bundles the
// engine + the E-02 transition model for real so the merged-patch asserts
// run against approveProofPatch's actual output. Run:
//   node scripts/test-proof-due-recalc.mjs
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outdir = resolve(here, '.tmp-proof-due-recalc-out');
buildSync({
  entryPoints: [
    resolve(root, 'base44/shared/proofDueRecalcModel.ts'),
    resolve(root, 'base44/shared/proofTransitionModel.ts'),
    resolve(root, 'base44/shared/dueDateEngine.ts'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir, logLevel: 'silent',
});
const model = await import(pathToFileURL(resolve(outdir, 'proofDueRecalcModel.js')).href);
const transition = await import(pathToFileURL(resolve(outdir, 'proofTransitionModel.js')).href);
const {
  recalcOnProofApprove, orderDueAfterApprove, recalcSummary, approvalWithRecalc,
  RECALC_HOLD_HARD_DUE, RECALC_HOLD_REASONS, RECALC_DEFAULT_ACTOR, RECALC_PATCH_FIELDS,
} = model;
const { approveProofPatch } = transition;

const NOW = '2026-11-02'; // Monday
const NOW_ISO = '2026-11-02T00:00:00.000Z';

// === vocabulary ==============================================================
assert.equal(RECALC_HOLD_HARD_DUE, 'hard_due_date');
assert.deepEqual([...RECALC_HOLD_REASONS], ['hard_due_date']);
assert.equal(RECALC_DEFAULT_ACTOR, 'proof_approval', 'recalc runs as a non-manual actor class');
assert.deepEqual([...RECALC_PATCH_FIELDS], ['product_due_date'], 'the recalc writes the production due date only');

// === recalcOnProofApprove: hard hold — approve proceeds, date frozen =========
{
  const hard = { id: 'p1', hard_due_date: true, product_due_date: '2026-11-12', parts: [{ product_lead_days: 30 }] };
  const r = recalcOnProofApprove(hard, { now: NOW, actor_type: 'customer' });
  assert.equal(r.held, true, 'hard product holds');
  assert.equal(r.hold_reason, 'hard_due_date');
  assert.deepEqual(r.patch, {}, 'held patch is empty — the approval patch is unaffected');
  assert.equal(r.due_date, '2026-11-12', 'stored date untouched');
  assert.equal(r.pushed, false);
  assert.equal(r.changed, false);
  assert.equal(r.product_id, 'p1');
  // A hard product with NO stored date still holds — writing the first date is
  // a move (B-08: blank→date, non-manual actor fails closed).
  const blankHard = recalcOnProofApprove({ hard_due_date: true, parts: [{ product_lead_days: 5 }] }, { now: NOW });
  assert.equal(blankHard.held, true, 'blank-date hard product is still locked');
  assert.deepEqual(blankHard.patch, {});
  // Every actor class gets the same hold — approving is not a date edit.
  for (const actor of ['customer', 'staff', 'system', '']) {
    assert.equal(recalcOnProofApprove(hard, { now: NOW, actor_type: actor }).held, true,
      `${actor || '(default)'} actor held on hard product`);
  }
}

// === recalcOnProofApprove: soft forward-push =================================
{
  const soft = { id: 'p2', product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] };
  const r = recalcOnProofApprove(soft, { now: NOW });
  assert.equal(r.held, false);
  assert.equal(r.hold_reason, '');
  assert.deepEqual(r.patch, { product_due_date: '2026-11-07' }, 'anchor + max lead pushes forward');
  assert.equal(r.due_date, '2026-11-07');
  assert.equal(r.prior_due_date, '2026-11-04');
  assert.equal(r.computed_due_date, '2026-11-07');
  assert.equal(r.pushed, true);
  assert.equal(r.changed, true);
  assert.equal(r.actor_type, 'proof_approval');
  assert.equal(r.design_due_date, '2026-11-02', 'design candidate rides the result as a diagnostic');
  assert.equal('design_due_date' in r.patch, false, 'design candidate is never a patch field');
  // First write when no date was stored.
  const first = recalcOnProofApprove({ parts: [{ product_lead_days: 3 }] }, { now: NOW });
  assert.deepEqual(first.patch, { product_due_date: '2026-11-05' }, 'unset soft date gets the computed date');
}

// === recalcOnProofApprove: forward-only — earlier candidates rejected ========
{
  const r = recalcOnProofApprove({ product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] }, { now: NOW });
  assert.deepEqual(r.patch, {}, 'computed earlier than stored → clamped no-op');
  assert.equal(r.due_date, '2026-11-20');
  assert.equal(r.computed_due_date, '2026-11-04', 'the unclamped candidate stays visible');
  assert.equal(r.changed, false);
  const same = recalcOnProofApprove({ product_due_date: '2026-11-07', parts: [{ product_lead_days: 5 }] }, { now: NOW });
  assert.deepEqual(same.patch, {}, 'same-date compute is a no-op');
  assert.equal(same.held, false, 'a no-op is not a hold');
}

// === recalcOnProofApprove: lead_days override precedence =====================
{
  // No parts → the explicit days synthesize the lead (legacy leadTimeDays reach).
  const noParts = recalcOnProofApprove({ product_due_date: '2026-11-01' }, { now: NOW, lead_days: 4 });
  assert.deepEqual(noParts.patch, { product_due_date: '2026-11-06' });
  // Parts + override → numeric tier per part; each part's floor still wins.
  const floored = recalcOnProofApprove(
    { product_due_date: '2026-11-01', parts: [{ product_min_days: 10, product_std_days: 20 }] },
    { now: NOW, lead_days: 3 },
  );
  assert.equal(floored.patch.product_due_date, '2026-11-12', 'override respects the part min floor');
  // No parts AND no override → no candidate, stored date stands.
  const idle = recalcOnProofApprove({ product_due_date: '2026-11-09' }, { now: NOW });
  assert.deepEqual(idle.patch, {});
  assert.equal(idle.due_date, '2026-11-09');
}

// === recalcOnProofApprove: B-08 second wall on respect_hard_dates:false ======
{
  const hard = { hard_due_date: true, product_due_date: '2026-11-05', parts: [{ product_lead_days: 10 }] };
  const blocked = recalcOnProofApprove(hard, { now: NOW, actor_type: 'customer', respect_hard_dates: false });
  assert.equal(blocked.held, true, 'disrespecting the flag still fails closed for non-manual actors');
  assert.equal(blocked.hold_reason, 'hard_due_date');
  assert.deepEqual(blocked.patch, {});
  assert.equal(blocked.computed_due_date, '2026-11-12', 'the blocked candidate is diagnosable');
  const override = recalcOnProofApprove(hard, { now: NOW, actor_type: 'staff', respect_hard_dates: false });
  assert.equal(override.held, false, 'a manual-actor caller may deliberately move it');
  assert.equal(override.patch.product_due_date, '2026-11-12');
  assert.equal(override.manual_override, true, 'flagged for the caller to audit');
  assert.match(override.warning, /manual override/i);
}

// === recalcOnProofApprove: input hygiene =====================================
{
  assert.deepEqual(recalcOnProofApprove(null, { now: NOW }).patch, {}, 'null product → empty patch');
  assert.equal(recalcOnProofApprove(null, { now: NOW }).held, false);
  assert.deepEqual(recalcOnProofApprove('p9', { now: NOW }).patch, {}, 'non-object product → empty patch');
  const badAnchor = recalcOnProofApprove({ parts: [{ product_lead_days: 3 }] }, { now: 'not-a-date' });
  assert.deepEqual(badAnchor.patch, {}, 'unparseable anchor cannot move a date');
}

// === orderDueAfterApprove: max of OPEN product dues ==========================
{
  const wo = {
    id: 'wo1',
    due_date: '2026-11-15',
    products: [
      { id: 'p1', description: 'Pylon', product_due_date: '2026-11-04', operational_status: 'awaiting_proof_approval', parts: [{ product_lead_days: 20 }] },
      { id: 'p2', description: 'Channel letters', product_due_date: '2026-11-10', operational_status: 'in_production' },
      { id: 'p3', description: 'Built banner', product_due_date: '2026-11-25', operational_status: 'built' },
      { id: 'p4', description: 'Deleted panel', product_due_date: '2026-11-30', deleted: true },
      { id: 'p5', description: 'Done vinyl', product_due_date: '2026-11-28', completed: true },
    ],
  };
  const r = orderDueAfterApprove(wo, 'p1', { now: NOW });
  assert.equal(r.order_due_date, '2026-11-22', 'order due = max of open product dues (p1 recalc 11-22 > p2 11-10)');
  assert.equal(r.binding_product_id, 'p1', 'the approved product binds the order date');
  assert.equal(r.order_pushed, true);
  assert.equal(r.prior_order_due_date, '2026-11-15');
  assert.equal(r.computed_order_due_date, '2026-11-22');
  assert.equal(r.product_found, true);
  assert.equal(r.product_patches.length, 1, 'one patch entry for the approved product');
  assert.equal(r.product_patches[0].product_id, 'p1');
  assert.deepEqual(r.product_patches[0].patch, { product_due_date: '2026-11-22' });
  assert.equal(r.product_patches[0].held, false);
  // Terminal/deleted/completed rows never drive the max — p3/p4/p5 all had
  // later stored dates than the winner.
}

// === orderDueAfterApprove: hard-held products still count toward the max =====
{
  const wo = {
    due_date: '2026-11-15',
    products: [
      { id: 'p1', description: 'Hard monument', hard_due_date: true, product_due_date: '2026-11-25', operational_status: 'awaiting_proof_approval', parts: [{ product_lead_days: 30 }] },
      { id: 'p2', description: 'Soft pylon', product_due_date: '2026-11-10', operational_status: 'in_production' },
    ],
  };
  const r = orderDueAfterApprove(wo, 'p1', { now: NOW });
  assert.equal(r.product_patches[0].held, true, 'the approved product holds');
  assert.equal(r.product_patches[0].hold_reason, 'hard_due_date');
  assert.deepEqual(r.product_patches[0].patch, {});
  assert.equal(r.order_due_date, '2026-11-25', 'the held product\'s stored date still binds the order max');
  assert.equal(r.binding_product_id, 'p1');
}

// === orderDueAfterApprove: order-level guards ================================
{
  // Forward-only: a later stored order date is never pulled earlier.
  const fwdOnly = orderDueAfterApprove(
    { due_date: '2026-12-01', products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: NOW },
  );
  assert.equal(fwdOnly.order_due_date, undefined, 'order due never moves earlier');
  assert.equal(fwdOnly.computed_order_due_date, '2026-11-22');
  assert.equal(fwdOnly.order_pushed, false);
  // Order-level hard hold.
  const hardOrder = orderDueAfterApprove(
    { due_date: '2026-11-15', hard_due_date: true, products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: NOW },
  );
  assert.equal(hardOrder.order_held, true, 'order-level hard_due_date holds the order date');
  assert.equal(hardOrder.order_due_date, undefined);
  assert.deepEqual(hardOrder.product_patches[0].patch, { product_due_date: '2026-11-22' }, 'the product still recalcs');
  // Missing target → rollup still runs over stored rows, flagged not found.
  const missing = orderDueAfterApprove(
    { due_date: '2026-11-01', products: [{ id: 'p1', product_due_date: '2026-11-10' }] },
    'ghost', { now: NOW },
  );
  assert.equal(missing.product_found, false);
  assert.deepEqual(missing.product_patches, []);
  assert.equal(missing.order_due_date, '2026-11-10', 'stored open dates still roll up');
  // Bare products[] array input works.
  const bare = orderDueAfterApprove(
    [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }],
    'p1', { now: NOW },
  );
  assert.equal(bare.order_due_date, '2026-11-22');
}

// === approvalWithRecalc: merged patch, one write =============================
{
  const product = {
    id: 'p1', work_order_id: 'wo1', description: 'Pylon',
    operational_status: 'awaiting_proof_approval', proof_status: 'awaiting_approval',
    proof_version: 2, proof_file_url: 'https://x/proof.pdf',
    product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }],
  };
  const stamp = approveProofPatch(product, { actor_type: 'customer', actor_id: 'buyer@x.com', now: NOW });
  const merged = approvalWithRecalc(product, stamp, { now: NOW });
  // The return IS the merged patch — approval stamp + moved due date in one
  // object, enumerable keys are all stored fields.
  assert.deepEqual(merged, {
    operational_status: 'proof_approved',
    proof_status: 'approved',
    proof_approved_version: 2,
    proof_approved_at: NOW_ISO,
    proof_approved_by: 'buyer@x.com',
    proof_approval_actor_type: 'customer',
    product_due_date: '2026-11-07',
  }, 'one write carries the approval stamp and the recalc');
  // Hold metadata rides non-enumerably — invisible to spread/keys/stringify.
  assert.equal(merged.held, false);
  assert.equal(merged.hold_reason, '');
  assert.equal(merged.recalc.pushed, true);
  assert.deepEqual(Object.keys(merged), Object.keys(merged).filter(k => !['held', 'hold_reason', 'recalc'].includes(k)), 'metadata is non-enumerable');
  assert.equal('held' in { ...merged }, false, 'spread patch is clean');
  assert.equal(JSON.parse(JSON.stringify(merged)).held, undefined, 'serialized patch is clean');
  assert.deepEqual(Object.keys(merged).sort(), ['operational_status', 'product_due_date', 'proof_approval_actor_type', 'proof_approved_at', 'proof_approved_by', 'proof_approved_version', 'proof_status'].sort());
  // Hard product: the approval still proceeds — merged patch carries the full
  // stamp with the due date frozen out.
  const hardMerged = approvalWithRecalc({ ...product, hard_due_date: true }, stamp, { now: NOW });
  assert.equal(hardMerged.operational_status, 'proof_approved', 'approve still proceeds on hold');
  assert.equal(hardMerged.proof_status, 'approved');
  assert.equal('product_due_date' in hardMerged, false, 'date frozen — no recalc field in the write');
  assert.equal(hardMerged.held, true);
  assert.equal(hardMerged.hold_reason, 'hard_due_date');
  // A caller-staged field always wins over the computed one.
  const staged = approvalWithRecalc(product, { ...stamp, product_due_date: '2026-12-25' }, { now: NOW });
  assert.equal(staged.product_due_date, '2026-12-25', 'explicit transition keys beat computed keys');
}

// === recalcSummary: moved / held / unchanged buckets =========================
{
  const products = [
    { id: 'p1', description: 'Pylon', product_due_date: '2026-11-04' },
    { id: 'p2', description: 'Monument', product_due_date: '2026-11-12' },
    { id: 'p3', description: 'Vinyl', product_due_date: '2026-11-20' },
  ];
  const results = [
    recalcOnProofApprove({ ...products[0], parts: [{ product_lead_days: 5 }] }, { now: NOW }),
    recalcOnProofApprove({ ...products[1], hard_due_date: true, parts: [{ product_lead_days: 30 }] }, { now: NOW }),
    recalcOnProofApprove({ ...products[2], parts: [{ product_lead_days: 1 }] }, { now: NOW }),
  ];
  const s = recalcSummary(products, results);
  assert.equal(s.moved.length, 1);
  assert.deepEqual(s.moved[0], { product_id: 'p1', label: 'Pylon', from: '2026-11-04', to: '2026-11-07', days: 3 });
  assert.equal(s.held.length, 1);
  assert.equal(s.held[0].product_id, 'p2');
  assert.equal(s.held[0].label, 'Monument');
  assert.equal(s.held[0].hold_reason, 'hard_due_date');
  assert.equal(s.held[0].due_date, '2026-11-12', 'held row reports the frozen date');
  assert.equal(s.unchanged.length, 1);
  assert.equal(s.unchanged[0].product_id, 'p3');
  assert.equal(s.unchanged[0].due_date, '2026-11-20');
  // orderDueAfterApprove results feed straight in via product_patches.
  const orderRes = orderDueAfterApprove(
    { due_date: '', products: [{ id: 'p1', description: 'Pylon', product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] }] },
    'p1', { now: NOW },
  );
  const s2 = recalcSummary([{ id: 'p1', description: 'Pylon', product_due_date: '2026-11-04' }], orderRes);
  assert.equal(s2.moved.length, 1, 'order result unwraps product_patches');
  assert.equal(s2.moved[0].to, '2026-11-07');
  // Empty inputs → three empty buckets.
  assert.deepEqual(recalcSummary([], []), { moved: [], held: [], unchanged: [] });
}

rmSync(outdir, { recursive: true, force: true });
console.log('PASS proof-due-recalc');
