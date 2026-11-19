// B-08 contract test: hard_due_date protection — the explicit guard exports on
// base44/shared/dueDateEngine.ts (isHardDue / assertDueDateMutable) plus the
// jobs badge/patch model (src/components/jobs/hardDueModel.js). Also regresses
// the existing engine computes on non-hard inputs so the additive edit proves
// nothing moved. Run: node scripts/test-hard-due.mjs
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// --- Bundle the engine + jobs model (esbuild resolves the shared .ts import)
buildSync({
  entryPoints: [
    resolve(root, 'base44/shared/dueDateEngine.ts'),
    resolve(root, 'src/components/jobs/hardDueModel.js'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir: resolve(here, '.tmp-hard-due-out'), logLevel: 'silent',
});
const engine = await import(pathToFileURL(resolve(here, '.tmp-hard-due-out/base44/shared/dueDateEngine.js')).href);
const model = await import(pathToFileURL(resolve(here, '.tmp-hard-due-out/src/components/jobs/hardDueModel.js')).href);
const {
  isHardDue, assertDueDateMutable, DUE_DATE_MANUAL_ACTORS,
  computeProductDueDate, recalcOnProofApproval,
} = engine;
const { HARD_DUE_BADGE, setHardDuePatch, hardDueDisplay } = model;

const MON = '2026-11-02';
const HARD = { hard_due_date: true, product_due_date: '2026-11-20' };
const SOFT = { hard_due_date: false, product_due_date: '2026-11-20' };

// === isHardDue ==============================================================
assert.equal(isHardDue(HARD), true, 'flag true');
assert.equal(isHardDue(SOFT), false, 'flag false');
assert.equal(isHardDue({}), false, 'missing flag');
assert.equal(isHardDue(null), false, 'null-safe');
assert.equal(isHardDue({ hard_due_date: 'true' }), false, 'only strict boolean true counts');

// === assertDueDateMutable: hard products block moves in BOTH directions =====
{
  const earlier = assertDueDateMutable(HARD, '2026-11-10', { actor_type: 'recalc' });
  assert.equal(earlier.ok, false, 'recalc may not pull a hard date earlier');
  assert.equal(earlier.held_by_hard_date, true);
  assert.match(earlier.error, /locked/i);
  const later = assertDueDateMutable(HARD, '2026-11-30', { actor_type: 'recalc' });
  assert.equal(later.ok, false, 'recalc may not push a hard date later');
  assert.equal(later.moves_date, true);
  // Every non-manual actor fails closed — system, proof_approval, unknown,
  // and a missing actor_type (defaults to recalc).
  for (const actor of ['system', 'proof_approval', 'sync', 'bogus_actor', '']) {
    const r = assertDueDateMutable(HARD, '2026-11-30', { actor_type: actor });
    assert.equal(r.ok, false, `${actor || '(empty)'} blocked on hard move`);
    assert.equal(r.held_by_hard_date, true);
  }
  assert.equal(assertDueDateMutable(HARD, '2026-11-30').ok, false, 'missing actor_type defaults to recalc');
  // Clearing the stored date is a move too (blank requested vs stored date).
  const cleared = assertDueDateMutable(HARD, '', { actor_type: 'recalc' });
  assert.equal(cleared.ok, false, 'clearing a hard date is blocked');
  assert.equal(cleared.moves_date, true);
}

// === assertDueDateMutable: soft products + no-ops pass =======================
{
  assert.equal(assertDueDateMutable(SOFT, '2026-11-10', { actor_type: 'recalc' }).ok, true, 'soft moves earlier');
  assert.equal(assertDueDateMutable(SOFT, '2026-11-30', { actor_type: 'recalc' }).ok, true, 'soft moves later');
  assert.equal(assertDueDateMutable({}, '2026-11-30', { actor_type: 'recalc' }).ok, true, 'no-flag product mutable');
  const noop = assertDueDateMutable(HARD, '2026-11-20', { actor_type: 'recalc' });
  assert.equal(noop.ok, true, 'same-date recalc on a hard product is a no-op');
  assert.equal(noop.moves_date, false);
  assert.equal(noop.held_by_hard_date, false);
  assert.equal(assertDueDateMutable({ hard_due_date: true }, '', { actor_type: 'recalc' }).ok, true,
    'both-blank is a no-op');
}

// === assertDueDateMutable: manual override passes, flagged ===================
{
  const r = assertDueDateMutable(HARD, '2026-11-25', { actor_type: 'manual' });
  assert.equal(r.ok, true, 'manual actor may move a hard date');
  assert.equal(r.manual_override, true, 'flagged for the caller to audit');
  assert.match(r.warning, /manual override/i);
  assert.equal(r.error, '');
  for (const actor of DUE_DATE_MANUAL_ACTORS) {
    assert.equal(assertDueDateMutable(HARD, '2026-11-25', { actor_type: actor }).manual_override, true,
      `${actor} counts as manual`);
  }
  // Earlier direction also allowed-but-flagged for manual actors.
  const back = assertDueDateMutable(HARD, '2026-11-15', { actor_type: 'staff' });
  assert.equal(back.ok, true);
  assert.equal(back.manual_override, true);
}

// === Composition: held recalc result feeds back as a same-date no-op ========
{
  const recalc = recalcOnProofApproval({
    product: { ...HARD, parts: [{ product_lead_days: 30 }] },
    approval_date: MON,
  });
  assert.equal(recalc.held_by_hard_date, true, 'engine still holds the hard date');
  assert.equal(recalc.due_date, '2026-11-20');
  const verdict = assertDueDateMutable(HARD, recalc.due_date, { actor_type: 'recalc' });
  assert.equal(verdict.ok, true, 'held result is a same-date no-op for the guard');
  assert.equal(verdict.moves_date, false);
  // A compute-result object (due_date field) works as the product too.
  const viaDueField = assertDueDateMutable({ hard_due_date: true, due_date: '2026-11-20' }, '2026-11-21', { actor_type: 'recalc' });
  assert.equal(viaDueField.ok, false, 'due_date fallback field honored');
}

// === HARD_DUE_BADGE / setHardDuePatch / hardDueDisplay =======================
assert.deepEqual(HARD_DUE_BADGE, { text: 'Hard due date', tone: 'red' }, 'kit StatusChip badge shape');
{
  const NOW = '2026-11-02T14:30:00.000Z';
  const on = setHardDuePatch(SOFT, { hard: true, actor: 'brett@shop.com', now: NOW });
  assert.equal(on.hard_due_date, true, 'enable sets the flag');
  assert.equal(on.hard_due_set_by, 'brett@shop.com', 'enable stamps actor');
  assert.equal(on.hard_due_set_at, NOW, 'enable stamps time');
  const off = setHardDuePatch(HARD, { hard: false, actor: 'brett@shop.com', now: NOW });
  assert.equal(off.hard_due_date, false, 'disable clears the flag');
  assert.equal(off.hard_due_set_by, '', 'disable clears the actor stamp');
  assert.equal(off.hard_due_set_at, '', 'disable clears the time stamp');
  assert.deepEqual(Object.keys(on).sort(), ['hard_due_date', 'hard_due_set_at', 'hard_due_set_by'],
    'patch carries only field keys (nothing leaks into the row)');
}
{
  const d = hardDueDisplay({ hard_due_date: true });
  assert.equal(d.is_hard, true);
  assert.deepEqual(d.badge, { text: 'Hard due date', tone: 'red' });
  assert.equal(d.tooltip, 'Due date is locked — recalculation will not move it.', 'lock tooltip');
  const soft = hardDueDisplay({ hard_due_date: false });
  assert.equal(soft.is_hard, false);
  assert.equal(soft.badge, null, 'soft rows get no badge');
  assert.equal(soft.tooltip, '');
  const stamped = hardDueDisplay({
    hard_due_date: true, hard_due_set_by: 'amy', hard_due_set_at: '2026-11-02T09:00:00.000Z',
  });
  assert.match(stamped.tooltip, /locked/, 'stamped tooltip keeps the lock text');
  assert.match(stamped.tooltip, /set by amy on 2026-11-02/, 'stamped tooltip attributes provenance');
  assert.equal(hardDueDisplay(null).is_hard, false, 'null-safe');
}

// === Regression: existing engine outputs unchanged on non-hard inputs =======
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 3 }, { product_lead_days: 5, name: 'long pole' }, { product_lead_days: 2 }],
    anchor_date: MON,
  });
  assert.equal(r.due_date, '2026-11-07', 'product_due = anchor + max(part leads)');
  assert.equal(r.max_product_lead_days, 5);
}
{
  const r = recalcOnProofApproval({
    product: { product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-20', 'forward-only clamp holds the later stored date');
  assert.equal(r.pushed, false);
  assert.equal(r.computed_due_date, '2026-11-04');
}
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: '2026-11-06',
    clock: { business_days: [1, 2, 3, 4, 5] },
  });
  assert.equal(r.due_date, '2026-11-09', 'Fri + 1 business day → Mon');
}
{
  const r = recalcOnProofApproval({
    product: { product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-07', 'later candidate still pushes a soft product');
  assert.equal(r.pushed, true);
}

rmSync(resolve(here, '.tmp-hard-due-out'), { recursive: true, force: true });
console.log('PASS hard-due');
