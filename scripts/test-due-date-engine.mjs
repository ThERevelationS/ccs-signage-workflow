import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-due-date-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/dueDateEngine.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  computeProductDueDate, computeOrderDueDate, recalcOnProofApproval,
  resolvePartLead, addLeadDays, clockFromHours, parseDateOnly,
  LEAD_TIERS, DUE_DATE_CLOCKS,
} = await import(pathToFileURL(out).href);

// Weekday anchors (verified): 2026-11-01 Sun, 11-02 Mon, 11-04 Wed,
// 11-06 Fri, 11-07 Sat, 11-09 Mon, 11-10 Tue.
const MON = '2026-11-02';
const FRI = '2026-11-06';
const SAT = '2026-11-07';
const WK = [1, 2, 3, 4, 5]; // Mon–Fri business week

// --- resolvePartLead: flat fallback + tier bounds ---------------------------
assert.equal(resolvePartLead({ product_lead_days: 5 }, 'product').days, 5);
assert.equal(resolvePartLead({ product_lead_days: 5 }, 'product').source, 'flat');
assert.equal(resolvePartLead({ product_lead_days: 9, product_std_days: 4 }, 'product').days, 4, 'std overrides flat');
assert.equal(resolvePartLead({ product_min_days: 2, product_std_days: 5 }, 'product', 'minimum').days, 2);
assert.equal(resolvePartLead({ product_std_days: 5 }, 'product', 'minimum').days, 5, 'min tier falls back to std');
assert.equal(resolvePartLead({ product_std_days: 5, product_add_days: 2 }, 'product', 'additional').days, 7, 'additional = std + add');
assert.equal(resolvePartLead({ product_lead_days: 1, product_min_days: 3 }, 'product').days, 3, 'min bound floors the standard pick');
assert.equal(resolvePartLead({ product_lead_days: 8 }, 'product', 4).days, 4, 'numeric tier override');
assert.equal(resolvePartLead({ product_min_days: 3, product_std_days: 5 }, 'product', 1).days, 3, 'numeric tier clamps to floor');
assert.equal(resolvePartLead({}, 'design').days, 0);
assert.equal(resolvePartLead({ design_lead_days: -4 }, 'design').days, 0, 'negative leads clamp to 0');
assert.equal(resolvePartLead({ design_std_days: 2, design_add_days: 1 }, 'design', 'max').days, 3, 'max alias = additional');

// --- computeProductDueDate: max-of-parts ------------------------------------
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 3 }, { product_lead_days: 5, name: 'long pole' }, { product_lead_days: 2 }],
    anchor_date: MON,
  });
  assert.equal(r.due_date, '2026-11-07', 'product_due = anchor + max(part leads)');
  assert.equal(r.max_product_lead_days, 5);
  assert.equal(r.changed, true);
  assert.equal(r.pushed, false, 'no prior date — set, not pushed');
  assert.ok(r.trace.some((t) => t.kind === 'part' && t.index === 1));
  assert.ok(r.trace.some((t) => t.kind === 'max' && t.field === 'product_due_date'));
}
// Design due resolves on its own kind, same anchor.
{
  const r = computeProductDueDate({
    parts: [{ design_lead_days: 2, product_lead_days: 5 }, { design_lead_days: 4 }],
    anchor_date: MON,
  });
  assert.equal(r.design_due_date, '2026-11-06', 'design_due = anchor + max design leads');
  assert.equal(r.due_date, '2026-11-07');
}
// Tier fields flow through parts.
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 10, product_std_days: 3 }, { product_std_days: 6 }],
    anchor_date: MON,
  });
  assert.equal(r.due_date, '2026-11-08', 'std tier fields beat flat fields in the max');
}
{
  const r = computeProductDueDate({
    parts: [{ product_std_days: 3, product_add_days: 4 }],
    anchor_date: MON, tier: 'additional',
  });
  assert.equal(r.due_date, '2026-11-09', 'additional tier applies across all parts');
}
// Empty / zero inputs.
{
  const r = computeProductDueDate({ parts: [], anchor_date: MON });
  assert.equal(r.due_date, '');
  assert.equal(r.changed, false);
  assert.ok(r.trace.some((t) => t.reason === 'no_parts'));
}
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 0 }, {}], anchor_date: MON });
  assert.equal(r.due_date, MON, 'parts present but zero-lead → anchor is the due date');
}
// Missing/invalid anchor keeps the existing date and reports why.
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 5 }], anchor_date: 'not-a-date', product_due_date: '2026-11-20' });
  assert.equal(r.due_date, '2026-11-20');
  assert.equal(r.changed, false);
  assert.ok(r.trace.some((t) => t.reason === 'anchor_unparseable'));
}

// --- hard_due_date hold ------------------------------------------------------
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 30 }],
    anchor_date: MON,
    hard_due_date: true,
    product_due_date: '2026-11-12',
  });
  assert.equal(r.due_date, '2026-11-12', 'hard due date never moves');
  assert.equal(r.held_by_hard_date, true);
  assert.equal(r.pushed, false);
  assert.ok(r.trace.some((t) => t.kind === 'hard_date' && t.held === true));
}
// Hard flag with nothing stored → nothing to hold, computation proceeds.
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: MON, hard_due_date: true });
  assert.equal(r.due_date, '2026-11-05');
  assert.equal(r.held_by_hard_date, false);
}
// respect_hard_dates off: the flag stops protecting the date.
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 15 }],
    anchor_date: MON,
    hard_due_date: true,
    product_due_date: '2026-11-12',
    respect_hard_dates: false,
  });
  assert.equal(r.due_date, '2026-11-17', 'unrespected hard flag → the computed candidate wins');
  assert.equal(r.held_by_hard_date, false);
  assert.ok(r.trace.some((t) => t.kind === 'hard_date' && t.held === false));
}

// --- business-day clock ------------------------------------------------------
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: WK } });
  assert.equal(r.due_date, '2026-11-09', 'Fri + 1 business day → Mon');
}
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: '2026-11-04', clock: { business_days: WK } });
  assert.equal(r.due_date, '2026-11-09', 'Wed + 3 business days skips the weekend → Mon');
}
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: SAT, clock: { business_days: WK } });
  assert.equal(r.due_date, '2026-11-09', 'closed-day anchor counts from the next open day');
}
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI,
    clock: { business_days: WK, holidays: ['2026-11-09'] },
  });
  assert.equal(r.due_date, '2026-11-10', 'holidays close an otherwise-open day');
}
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 0 }], anchor_date: MON, clock: { business_days: WK } });
  assert.equal(r.due_date, MON, 'zero lead keeps the anchor even under a business clock');
}
// Empty business_days is ambiguous — treated as calendar, never a lockup.
{
  const r = computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: [] } });
  assert.equal(r.due_date, '2026-11-07', 'empty business_days falls back to calendar days');
}
// Two clocks: design on the sales-center clock (Mon–Sat), production Mon–Fri.
{
  const r = computeProductDueDate({
    parts: [{ design_lead_days: 1, product_lead_days: 1 }],
    anchor_date: FRI,
    clock: { business_days: WK },
    design_clock: { business_days: [1, 2, 3, 4, 5, 6] },
  });
  assert.equal(r.due_date, '2026-11-09', 'production clock skips the weekend');
  assert.equal(r.design_due_date, '2026-11-07', 'sales-center clock counts Saturday');
  const clockTraces = r.trace.filter((t) => t.kind === 'clock');
  assert.equal(clockTraces.length, 2, 'one clock trace per computed field');
}
// business_days also accepts day names.
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI,
    clock: { business_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  });
  assert.equal(r.due_date, '2026-11-09');
}

// --- clockFromHours adapter --------------------------------------------------
{
  const clock = clockFromHours([
    { day: 'monday', open: '08:00', close: '17:00' },
    { days_of_week: [2, 3, 4, 5] },
    { weekday: 6, closed: true },
    { date: '2026-12-25' },
  ], 'production');
  assert.deepEqual(clock.business_days, [1, 2, 3, 4, 5]);
  assert.deepEqual(clock.holidays, ['2026-12-25']);
  assert.equal(clock.name, 'production');
  assert.deepEqual(clockFromHours([], 'x').business_days, null, 'no entries → calendar');
}

// --- recalcOnProofApproval: forward-only + hard-date rules -------------------
// Computed later than stored → pushed.
{
  const r = recalcOnProofApproval({
    product: { product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-07');
  assert.equal(r.pushed, true);
  assert.equal(r.changed, true);
  assert.equal(r.computed_due_date, '2026-11-07');
  assert.equal(r.prior_due_date, '2026-11-04');
  assert.equal(r.trace[0].label, 'proof_approval');
}
// Computed earlier than stored → never pulls earlier.
{
  const r = recalcOnProofApproval({
    product: { product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-20', 'forward-only clamp holds the later stored date');
  assert.equal(r.pushed, false);
  assert.equal(r.changed, false);
  assert.equal(r.computed_due_date, '2026-11-04', 'candidate still reported for diagnostics');
  assert.ok(r.trace.some((t) => t.kind === 'clamp' && t.reason === 'push_forward_only'));
}
// No stored date → the recalc sets one (changed, not "pushed").
{
  const r = recalcOnProofApproval({ product: { parts: [{ product_lead_days: 3 }] }, approval_date: MON });
  assert.equal(r.due_date, '2026-11-05');
  assert.equal(r.pushed, false);
  assert.equal(r.changed, true);
}
// Hard due date holds regardless of leads.
{
  const r = recalcOnProofApproval({
    product: { hard_due_date: true, product_due_date: '2026-11-12', parts: [{ product_lead_days: 30 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-12');
  assert.equal(r.held_by_hard_date, true);
  assert.equal(r.pushed, false);
}
// ISO stored dates parse for the forward comparison.
{
  const r = recalcOnProofApproval({
    product: { product_due_date: '2026-11-20T15:00:00.000Z', parts: [{ product_lead_days: 2 }] },
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-20', 'ISO prior parsed to its local day for the clamp');
}
// Explicit parts arg wins over embedded product.parts.
{
  const r = recalcOnProofApproval({
    product: { parts: [{ product_lead_days: 50 }] },
    parts: [{ product_lead_days: 2 }],
    approval_date: MON,
  });
  assert.equal(r.due_date, '2026-11-04');
}

// --- computeOrderDueDate: max-of-products ------------------------------------
{
  const r = computeOrderDueDate({
    products: [
      { id: 'p1', product_due_date: '2026-11-05' },
      { id: 'p2', product_due_date: '2026-11-12' },
      { id: 'p3' },
      { id: 'p4', product_due_date: 'not-a-date' },
    ],
  });
  assert.equal(r.due_date, '2026-11-12', 'order_due = max(products)');
  assert.equal(r.binding_product_id, 'p2');
  assert.equal(r.binding_index, 1);
}
// Accepts computeProductDueDate result objects straight in.
{
  const prod = computeProductDueDate({ parts: [{ product_lead_days: 4 }], anchor_date: MON });
  const r = computeOrderDueDate({ products: [prod, { product_due_date: '2026-11-03' }] });
  assert.equal(r.due_date, '2026-11-06');
}
{
  const r = computeOrderDueDate({ products: [] });
  assert.equal(r.due_date, '');
  assert.equal(r.changed, false);
}
{
  const r = computeOrderDueDate({ products: [{ id: 'p1' }, { product_due_date: '' }] });
  assert.equal(r.due_date, '', 'all-blank product dates → no order date');
}
// Forward-only clamp + hard hold work at order level too.
{
  const r = computeOrderDueDate({
    products: [{ product_due_date: '2026-11-05' }],
    existing_due_date: '2026-11-30',
    push_forward_only: true,
  });
  assert.equal(r.due_date, '2026-11-30');
  assert.equal(r.pushed, false);
}
{
  const r = computeOrderDueDate({
    products: [{ product_due_date: '2026-12-01' }],
    existing_due_date: '2026-11-15',
    push_forward_only: true,
  });
  assert.equal(r.due_date, '2026-12-01');
  assert.equal(r.pushed, true);
}
{
  const r = computeOrderDueDate({
    products: [{ product_due_date: '2026-12-01' }],
    existing_due_date: '2026-11-15',
    hard_due_date: true,
  });
  assert.equal(r.due_date, '2026-11-15');
  assert.equal(r.held_by_hard_date, true);
}

// --- misc --------------------------------------------------------------------
assert.equal(parseDateOnly('2026-11-09'), '2026-11-09');
assert.equal(parseDateOnly('garbage'), '');
assert.deepEqual(LEAD_TIERS, ['standard', 'minimum', 'additional']);
assert.equal(DUE_DATE_CLOCKS.PRODUCTION, 'production');
assert.equal(DUE_DATE_CLOCKS.SALES_CENTER, 'sales_center');
// addLeadDays direct: calendar mode matches the legacy helper's setDate math.
assert.equal(addLeadDays(new Date('2026-11-02T00:00:00'), 5).toISOString().slice(0, 10), '2026-11-07');

rmSync(out, { force: true });
console.log('PASS due-date-engine');
