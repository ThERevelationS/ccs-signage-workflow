// Due-date engine SUITE — masterplan item N-03 (worker w-133, B-07).
// ONE suite that esbuild-bundles every pure model in the due-date chain and
// asserts lifecycle + interop across them:
//   base44/shared/dueDateEngine.ts         (B-07 the engine: lead resolution,
//                                           max-of-parts / max-of-products,
//                                           hard-date hold, forward-only
//                                           proof-approval recalc, clock math)
//   base44/shared/proofDueRecalcModel.ts   (E-04 wrapper: recalcOnProofApprove,
//                                           orderDueAfterApprove, recalcSummary,
//                                           approvalWithRecalc + B-08 2nd wall)
//   base44/shared/hoursOfOperationModel.ts (K-01 dual business clocks —
//                                           production vs sales; the
//                                           clock/calendar/businessDay helpers
//                                           the engine consumes via
//                                           {business_days,holidays} clocks)
//   base44/shared/proofTransitionModel.ts  (E-02 approval stamp — real merge
//                                           target for approvalWithRecalc)
//   src/components/jobs/hardDueModel.js    (B-08 badge/toggle/display half)
//
// Themes: lead-time max rule (per-kind tier bounds → max of parts → max of
// products; NOTE: no customer-level lead field exists — the rule is
// parts-level then products-level, asserted via a source-grep marker),
// hard-date hold (engine hold + standalone guard + wrapper second wall +
// badge), proof-recalc push-forward (candidate recomputed from the approval
// anchor, clamped to max(stored, candidate) — never by slip amount, never
// earlier), two-clock rule (production vs sales-center/design clock,
// calendar vs business mode, hoursFor→toDueDateClock bridge), date-only
// "YYYY-MM-DD"-as-local-midnight semantics, weekend/holiday skipping, and
// the edge grid (same-day / past-due / blank / DST / leap / year boundary).
//
// Run: node scripts/test-due-date-suite.mjs  →  prints "PASS due-date-suite"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readText = (p) => readFileSync(join(root, p), 'utf8');

// Per-model bundles (sibling-suite convention: shared export names would
// collide in a single splitting bundle — each model gets its own namespace).
const bundle = (rel, name) => {
  const out = resolve(here, `.tmp-due-suite-${name}.mjs`);
  buildSync({
    entryPoints: [resolve(root, rel)],
    bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  });
  return out;
};
const TMP = [
  bundle('base44/shared/dueDateEngine.ts', 'engine'),
  bundle('base44/shared/proofDueRecalcModel.ts', 'recalc'),
  bundle('base44/shared/hoursOfOperationModel.ts', 'hours'),
  bundle('base44/shared/proofTransitionModel.ts', 'transition'),
  bundle('src/components/jobs/hardDueModel.js', 'badge'),
];
const eng = await import(pathToFileURL(TMP[0]).href);
const rec = await import(pathToFileURL(TMP[1]).href);
const hrs = await import(pathToFileURL(TMP[2]).href);
const trn = await import(pathToFileURL(TMP[3]).href);
const badge = await import(pathToFileURL(TMP[4]).href);

const {
  LEAD_TIERS, LEAD_KINDS, DUE_DATE_CLOCKS, DUE_DATE_MANUAL_ACTORS,
  toLocalDate, toDateOnly, parseDateOnly, clockFromHours, addLeadDays,
  resolvePartLead, computeProductDueDate, computeOrderDueDate,
  recalcOnProofApproval, isHardDue, assertDueDateMutable,
} = eng;
const {
  recalcOnProofApprove, orderDueAfterApprove, recalcSummary, approvalWithRecalc,
  RECALC_HOLD_HARD_DUE, RECALC_HOLD_REASONS, RECALC_DEFAULT_ACTOR, RECALC_PATCH_FIELDS,
} = rec;
const {
  DEFAULT_PRODUCTION_HOURS, DEFAULT_SALES_HOURS, HOURS_KINDS,
  normalizeSchedule, normalizeKind, hoursFor, isBusinessDay, isBusinessTime,
  nextOpen, addBusinessDays, dueDateWithClock, followUpDateWithClock,
  toDueDateClock, openDayIndexes,
} = hrs;
const { approveProofPatch } = trn;
const { HARD_DUE_BADGE, setHardDuePatch, hardDueDisplay } = badge;

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const deepEq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };
const match = (s, re, msg) => { assert.match(s, re, msg); n += 1; };

// Weekday anchors (verified): 2026-11-01 Sun, 11-02 Mon, 11-03 Tue, 11-04 Wed,
// 11-05 Thu, 11-06 Fri, 11-07 Sat, 11-08 Sun, 11-09 Mon, 11-10 Tue.
const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const THU = '2026-11-05';
const FRI = '2026-11-06';
const SAT = '2026-11-07';
const MON2 = '2026-11-09';
const TUE2 = '2026-11-10';
const WK = [1, 2, 3, 4, 5];          // Mon–Fri business week
const WK6 = [1, 2, 3, 4, 5, 6];      // Mon–Sat business week
const localMid = (y, m, d) => new Date(y, m - 1, d).getTime();

// ===========================================================================
// S1 — purity + registry contract
// ===========================================================================
{
  const engSrc = readText('base44/shared/dueDateEngine.ts');
  ok(!/^\s*import\s/m.test(engSrc) && !/require\(/.test(engSrc),
    'dueDateEngine.ts is pure — zero imports/requires (Deno-safe)');
  // 'YYYY-MM-DD' must parse at LOCAL midnight — either the T00:00:00 template
  // path or local-component construction (N-03.3 fix uses the latter so
  // day-overflow fails closed). Bare `new Date(str)` (UTC) is still banned.
  match(engSrc, /new Date\((`\$\{v\}T00:00:00`|y, m - 1, day)\)/,
    "engine parses 'YYYY-MM-DD' via a local-midnight path, never bare new Date(str)");
  ok(!/customer_(lead|due)|customer.*lead_days/i.test(engSrc),
    'NOTE marker: no customer-level lead field exists — the max rule is parts → products');

  const recSrc = readText('base44/shared/proofDueRecalcModel.ts');
  const recImports = [...recSrc.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  deepEq(recImports, ['./dueDateEngine.ts'], 'proofDueRecalcModel.ts imports ONLY the engine');

  const badgeSrc = readText('src/components/jobs/hardDueModel.js');
  const badgeImports = [...badgeSrc.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  ok(badgeImports.length === 1 && badgeImports[0].endsWith('base44/shared/dueDateEngine.ts'),
    'hardDueModel.js imports ONLY the engine');

  deepEq(LEAD_TIERS, ['standard', 'minimum', 'additional'], 'lead tier registry');
  deepEq(LEAD_KINDS, ['design', 'product'], 'lead kind registry');
  deepEq(DUE_DATE_CLOCKS, { PRODUCTION: 'production', SALES_CENTER: 'sales_center' },
    'two named settings clocks: production + sales_center');
  ok(DUE_DATE_MANUAL_ACTORS.includes('manual') && DUE_DATE_MANUAL_ACTORS.includes('staff'),
    'manual actor registry present');
  eq(RECALC_HOLD_HARD_DUE, 'hard_due_date');
  deepEq([...RECALC_HOLD_REASONS], ['hard_due_date']);
  eq(RECALC_DEFAULT_ACTOR, 'proof_approval', 'approval recalc runs as a NON-manual actor class');
  ok(!DUE_DATE_MANUAL_ACTORS.includes(RECALC_DEFAULT_ACTOR), 'proof_approval is not a manual actor');
  deepEq([...RECALC_PATCH_FIELDS], ['product_due_date'], 'the recalc writes the production due date only');
  deepEq(HARD_DUE_BADGE, { text: 'Hard due date', tone: 'red' }, 'B-08 badge shape');
}

// ===========================================================================
// S2 — date-only semantics: "YYYY-MM-DD" = local midnight, never bare Date
// ===========================================================================
{
  // TZ-invariant proof: date-only parses to the same instant as local
  // component construction — a bare new Date(str) would be UTC midnight.
  eq(toLocalDate('2026-11-02').getTime(), localMid(2026, 11, 2), 'date-only → local midnight');
  eq(toLocalDate('2026-11-02').getHours(), 0, 'local-midnight hours');
  eq(toLocalDate('2026-11-02').getDate(), 2, 'stays on its own day in the local zone');
  eq(toDateOnly(toLocalDate('2026-11-02')), '2026-11-02', 'date-only round-trips');
  // Full ISO inputs normalize to their LOCAL day (stored-instant → local day).
  eq(toDateOnly(toLocalDate('2026-11-20T15:00:00.000Z')),
    toDateOnly(new Date('2026-11-20T15:00:00.000Z')), 'ISO instant → its local day');
  const zDay = new Date('2026-11-21T02:00:00.000Z');
  eq(parseDateOnly('2026-11-21T02:00:00.000Z'),
    `${zDay.getFullYear()}-${String(zDay.getMonth() + 1).padStart(2, '0')}-${String(zDay.getDate()).padStart(2, '0')}`,
    'late-UTC instant collapses to the local calendar day (day-boundary rule)');
  // Input forms: Date copy, epoch ms, trimmed, non-padded via Date fallback.
  const d = new Date(2026, 10, 2, 15, 30);
  eq(toLocalDate(d).getTime(), d.getTime(), 'Date input copied through');
  ok(toLocalDate(d) !== d, 'Date input is copied, not aliased');
  eq(toDateOnly(toLocalDate(Date.UTC(2026, 10, 2, 12, 0, 0))), '2026-11-02', 'epoch ms input');
  eq(toDateOnly(toLocalDate('  2026-11-02  ')), '2026-11-02', 'whitespace trimmed');
  // Invalid / empty inputs fail closed.
  eq(toLocalDate('garbage'), null, 'unparseable → null');
  eq(toLocalDate(''), null, 'empty → null');
  eq(toLocalDate(null), null, 'null → null');
  eq(toLocalDate(NaN), null, 'NaN → null');
  eq(parseDateOnly('garbage'), '', 'unparseable → ""');
  eq(parseDateOnly('2026-13-01'), '', 'month 13 rejected');
  eq(parseDateOnly('2026-00-10'), '', 'month 00 rejected');
  eq(parseDateOnly('2026-01-32'), '', 'day 32 rejected');
  eq(toDateOnly(new Date(2026, 0, 5)), '2026-01-05', 'toDateOnly pads');

  // FIXED DEFECT N-03.3 — day-overflow dates used to ROLL FORWARD instead of
  // failing closed (Feb 30 → Mar 2). toLocalDate now verifies the parsed
  // components round-trip; invalid days yield ''/null per the header contract.
  eq(parseDateOnly('2026-02-30'), '', 'N-03.3 fixed: non-existent Feb 30 fails closed');
  eq(parseDateOnly('2026-11-31'), '', 'N-03.3 fixed: Nov 31 fails closed');
  eq(parseDateOnly('2026-02-29'), '', 'N-03.3 fixed: Feb 29 in a non-leap year fails closed');
  eq(parseDateOnly('2028-02-29'), '2028-02-29', 'leap-year Feb 29 is a real date (kept)');
  // Same defect used to be reachable through toLocalDate + clock holiday parsing.
  eq(toLocalDate('2026-04-31'), null, 'N-03.3 fixed: toLocalDate returns null for Apr 31');
  {
    const clock = { business_days: WK, holidays: ['2026-02-30'] };
    const r = computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: '2026-02-27', clock });
    // Fri 2026-02-27 +1 business day: Sat/Sun skip; the invalid holiday is
    // dropped entirely, so the open day is Mon 2026-03-02.
    eq(r.due_date, '2026-03-02', 'N-03.3 fixed: invalid holiday ignored, next open day wins');
  }
}

// ===========================================================================
// S3 — resolvePartLead: tier bounds (flat → std → min/add, clamped)
// ===========================================================================
{
  eq(resolvePartLead({ product_lead_days: 5 }, 'product').days, 5, 'flat lead');
  eq(resolvePartLead({ product_lead_days: 5 }, 'product').source, 'flat');
  eq(resolvePartLead({ product_lead_days: 9, product_std_days: 4 }, 'product').days, 4, 'std overrides flat');
  eq(resolvePartLead({ product_lead_days: 9, product_std_days: 4 }, 'product').source, 'std');
  eq(resolvePartLead({ product_min_days: 2, product_std_days: 5 }, 'product', 'minimum').days, 2, 'minimum tier → min field');
  eq(resolvePartLead({ product_min_days: 2, product_std_days: 5 }, 'product', 'minimum').source, 'min');
  eq(resolvePartLead({ product_std_days: 5 }, 'product', 'minimum').days, 5, 'missing min falls back to std');
  eq(resolvePartLead({ product_std_days: 5, product_add_days: 2 }, 'product', 'additional').days, 7, 'additional = std + add');
  eq(resolvePartLead({ product_std_days: 5, product_add_days: 2 }, 'product', 'additional').source, 'add');
  eq(resolvePartLead({ product_std_days: 3, product_add_days: 2 }, 'product', 'max').days, 5, 'max alias = additional');
  eq(resolvePartLead({ product_std_days: 3, product_add_days: 2 }, 'product', 'extended').days, 5, 'extended alias = additional');
  eq(resolvePartLead({ product_min_days: 2, product_std_days: 5 }, 'product', 'min').days, 2, 'min alias = minimum');
  // Bounds: tier picks clamp into [floor, std+add]; floor can lift the std pick.
  eq(resolvePartLead({ product_lead_days: 1, product_min_days: 3 }, 'product').days, 3, 'min bound floors the standard pick');
  eq(resolvePartLead({ product_min_days: 8, product_std_days: 5, product_add_days: 10 }, 'product', 'standard').days, 8,
    'floor lifts a standard pick that lands under the minimum');
  eq(resolvePartLead({ product_lead_days: 20, product_add_days: 3 }, 'product').days, 20,
    'flat lead doubles as std — ceiling (std+add) can never bind the standard pick');
  eq(resolvePartLead({ product_lead_days: 20, product_add_days: 3 }, 'product').ceiling, 23,
    'ceiling = std + add is reported for diagnostics');
  eq(resolvePartLead({ product_min_days: 10, product_std_days: 4 }, 'product').days, 10,
    'degenerate ceiling below floor → floor wins');
  // Explicit numeric tier: floor-only clamp — the deliberate override lane.
  eq(resolvePartLead({ product_lead_days: 8 }, 'product', 4).days, 4, 'numeric tier overrides leads');
  eq(resolvePartLead({ product_lead_days: 8 }, 'product', 4).source, 'tier');
  eq(resolvePartLead({ product_min_days: 3, product_std_days: 5 }, 'product', 1).days, 3, 'numeric tier clamps to floor');
  eq(resolvePartLead({ product_min_days: 3, product_std_days: 5, product_add_days: 2 }, 'product', 30).days, 30,
    'numeric tier may exceed the tier ceiling (floor only)');
  eq(resolvePartLead({ product_lead_days: 8 }, 'product', '4').days, 4, 'numeric STRING tier resolves as override');
  eq(resolvePartLead({ product_lead_days: 8 }, 'product', '').days, 8, 'blank tier → standard');
  eq(resolvePartLead({ product_lead_days: 8 }, 'product', 'STANDARD').days, 8, 'case-insensitive tier name');
  // Kind isolation + hygiene.
  eq(resolvePartLead({ design_lead_days: 4, product_lead_days: 9 }, 'design').days, 4, 'design kind reads design fields');
  eq(resolvePartLead({ design_lead_days: 4, product_lead_days: 9 }, 'product').days, 9, 'product kind reads product fields');
  eq(resolvePartLead({ design_std_days: 2, product_std_days: 9 }, 'design').days, 2, 'kind-scoped std fields');
  eq(resolvePartLead({}, 'design').days, 0, 'empty part → 0');
  eq(resolvePartLead({}, 'design').source, 'zero');
  eq(resolvePartLead(null, 'product').days, 0, 'null part → 0');
  eq(resolvePartLead({ product_lead_days: -4 }, 'product').days, 0, 'negative lead clamps to 0');
  eq(resolvePartLead({ product_lead_days: 'abc' }, 'product').days, 0, 'non-numeric lead → 0');
  eq(resolvePartLead({ product_lead_days: '6' }, 'product').days, 6, 'numeric string lead parses');
  eq(resolvePartLead({ product_lead_days: 5, product_std_days: 0 }, 'product').days, 0,
    'explicit std 0 beats flat (std field defined wins)');
  const r = resolvePartLead({ product_min_days: 2, product_std_days: 5, product_add_days: 3, product_lead_days: 9 }, 'product');
  eq(r.floor, 2); eq(r.ceiling, 8); eq(r.std_days, 5); eq(r.min_days, 2); eq(r.add_days, 3); eq(r.flat_days, 9);
}

// ===========================================================================
// S4 — lead-time max rule: product_due = anchor + max(product leads);
//      design_due = anchor + max(design leads); envelope shape.
// ===========================================================================
{
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 3 }, { product_lead_days: 5, name: 'long pole' }, { product_lead_days: 2 }],
    anchor_date: MON,
  });
  eq(r.due_date, '2026-11-07', 'product_due = anchor + MAX part lead (largest wins)');
  eq(r.max_product_lead_days, 5, 'max_product_lead_days reports the winner');
  eq(r.anchor_date, MON);
  eq(r.computed_due_date, '2026-11-07');
  eq(r.prior_due_date, '');
  eq(r.changed, true);
  eq(r.pushed, false, 'no prior — first write is "changed", not "pushed"');
  eq(r.held_by_hard_date, false);
  deepEq(Object.keys(r).sort(), ['anchor_date', 'changed', 'computed_due_date', 'design_due_date', 'due_date',
    'held_by_hard_date', 'max_design_lead_days', 'max_product_lead_days', 'prior_due_date', 'pushed', 'trace'].sort(),
    'product-compute envelope keys');
  ok(r.trace.some((t) => t.kind === 'anchor' && t.date === MON), 'anchor trace');
  ok(r.trace.filter((t) => t.kind === 'part').length === 3, 'one part trace per part');
  ok(r.trace.some((t) => t.kind === 'max' && t.field === 'product_due_date' && t.days === 5), 'max trace on product_due_date');
  ok(r.trace.some((t) => t.kind === 'clock' && t.mode === 'calendar'), 'no clock → calendar-mode trace');
}
{
  // The two kinds take independent maxes off the same anchor.
  const r = computeProductDueDate({
    parts: [{ design_lead_days: 2, product_lead_days: 5 }, { design_lead_days: 4 }, { design_lead_days: 1, product_lead_days: 1 }],
    anchor_date: MON,
  });
  eq(r.due_date, '2026-11-07', 'product max picks the largest product lead');
  eq(r.design_due_date, '2026-11-06', 'design_due = anchor + MAX design lead');
  eq(r.max_design_lead_days, 4);
  eq(r.max_product_lead_days, 5);
}
{
  // Max works on RESOLVED bounds, not raw flat fields — the std/add fields win.
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 10, product_std_days: 3 }, { product_std_days: 6 }],
    anchor_date: MON,
  });
  eq(r.due_date, '2026-11-08', 'std-tier fields beat flat fields inside the max');
  const add = computeProductDueDate({
    parts: [{ product_std_days: 3, product_add_days: 4 }],
    anchor_date: MON, tier: 'additional',
  });
  eq(add.due_date, '2026-11-09', 'the tier applies to every part before the max');
  const tiered = computeProductDueDate({
    parts: [{ product_min_days: 8, product_std_days: 20 }, { product_lead_days: 9 }],
    anchor_date: MON, tier: 2,
  });
  eq(tiered.due_date, '2026-11-10', 'numeric tier overrides EVERY part (floors still win) → max 8');
  eq(tiered.max_product_lead_days, 8);
  // Tie: the LAST part holding the max reports as owner (>= comparison).
  const tie = computeProductDueDate({
    parts: [{ id: 'a', product_lead_days: 5 }, { id: 'b', product_lead_days: 5 }],
    anchor_date: MON,
  });
  eq(tie.trace.find((t) => t.kind === 'max' && t.field === 'product_due_date').part_id, 'b',
    'max tie → last part reported as the binding part');
}
{
  // push_forward_only OFF (the default — the conversion/seeding lane): a
  // computed candidate may move the stored date EARLIER; changed, not pushed.
  const r = computeProductDueDate({
    parts: [{ product_lead_days: 2 }], anchor_date: MON, product_due_date: '2026-11-20',
  });
  eq(r.due_date, '2026-11-04', 'default lane moves the stored date earlier');
  eq(r.changed, true);
  eq(r.pushed, false, 'earlier move is never "pushed"');
  // ON: earlier candidate clamps to the stored date with a clamp trace.
  const fwd = computeProductDueDate({
    parts: [{ product_lead_days: 2 }], anchor_date: MON, product_due_date: '2026-11-20', push_forward_only: true,
  });
  eq(fwd.due_date, '2026-11-20', 'forward-only holds the later stored date');
  eq(fwd.computed_due_date, '2026-11-04', 'unclamped candidate still reported');
  ok(fwd.trace.some((t) => t.kind === 'clamp' && t.reason === 'push_forward_only'), 'clamp trace');
  const fwdLater = computeProductDueDate({
    parts: [{ product_lead_days: 15 }], anchor_date: MON, product_due_date: '2026-11-10', push_forward_only: true,
  });
  eq(fwdLater.due_date, '2026-11-17', 'forward-only still pushes when the candidate is later');
  eq(fwdLater.pushed, true);
  // The design field clamps independently.
  const fwdDesign = computeProductDueDate({
    parts: [{ design_lead_days: 1, product_lead_days: 10 }], anchor_date: MON,
    product_due_date: '2026-11-30', design_due_date: '2026-11-25', push_forward_only: true,
  });
  eq(fwdDesign.design_due_date, '2026-11-25', 'design due clamps forward too');
  // Hygiene.
  eq(computeProductDueDate({ parts: [], anchor_date: MON }).due_date, '', 'empty parts → no date');
  ok(computeProductDueDate({ parts: [], anchor_date: MON }).trace.some((t) => t.reason === 'no_parts'), 'no_parts trace');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 0 }, {}], anchor_date: MON }).due_date, MON,
    'zero leads → anchor is the due date (same-day edge)');
  {
    const r = computeProductDueDate({ parts: [{ product_lead_days: 5 }], anchor_date: 'not-a-date', product_due_date: '2026-11-20' });
    eq(r.due_date, '2026-11-20', 'unparseable anchor keeps the existing date');
    eq(r.changed, false);
    ok(r.trace.some((t) => t.reason === 'anchor_unparseable'), 'anchor_unparseable trace');
  }
  eq(computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: new Date(2026, 10, 2) }).due_date, '2026-11-05',
    'Date-object anchor');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: '2026-11-02T15:30:00' }).due_date, '2026-11-05',
    'ISO-with-time anchor normalizes to its local day');
  const sparse = computeProductDueDate({ parts: [null, 'x', { product_lead_days: 4 }], anchor_date: MON });
  eq(sparse.due_date, '2026-11-06', 'non-object parts filtered before the max');
  eq(sparse.trace.filter((t) => t.kind === 'part').length, 1, 'only real parts trace');
}

// ===========================================================================
// S5 — order rollup: order_due = max(product due dates) + KNOWN DEFECT N-03.1
// ===========================================================================
{
  const r = computeOrderDueDate({
    products: [
      { id: 'p1', product_due_date: '2026-11-05' },
      { id: 'p2', product_due_date: '2026-11-12' },
      { id: 'p3' },
      { id: 'p4', product_due_date: 'not-a-date' },
    ],
  });
  eq(r.due_date, '2026-11-12', 'order_due = MAX across products (largest wins)');
  eq(r.binding_product_id, 'p2', 'binding product reported');
  eq(r.binding_index, 1);
  eq(r.computed_due_date, '2026-11-12');
  eq(r.changed, true);
  deepEq(Object.keys(r).sort(), ['binding_index', 'binding_product_id', 'changed', 'computed_due_date',
    'design_due_date', 'due_date', 'held_by_hard_date', 'prior_due_date', 'pushed', 'trace'].sort(),
    'order-compute envelope keys');
  // Engine-result objects feed straight in (due_date field).
  const prod = computeProductDueDate({ parts: [{ product_lead_days: 4 }], anchor_date: MON });
  eq(computeOrderDueDate({ products: [prod, { product_due_date: '2026-11-03' }] }).due_date, '2026-11-06',
    'computeProductDueDate results accepted (due_date)');
  // due_date field beats product_due_date when both present.
  eq(computeOrderDueDate({ products: [{ product_due_date: '2026-11-01', due_date: '2026-11-20' }] }).due_date, '2026-11-20',
    'due_date read before product_due_date');
  // date_field forces a different column.
  eq(computeOrderDueDate({
    products: [{ promised_date: '2026-11-30', product_due_date: '2026-11-01' }], date_field: 'promised_date',
  }).due_date, '2026-11-30', 'date_field override');
  // Empty / all-blank → existing echoes, no binding.
  const none = computeOrderDueDate({ products: [{ id: 'p1' }, { product_due_date: '' }], existing_due_date: '2026-11-15' });
  eq(none.due_date, '2026-11-15', 'all-blank product dates → existing stands');
  eq(none.binding_index, -1);
  eq(none.binding_product_id, '');
  eq(none.changed, false);
  eq(computeOrderDueDate({ products: [] }).due_date, '', 'no products → no date');
  // Forward-only clamp + push at order level.
  eq(computeOrderDueDate({
    products: [{ product_due_date: '2026-11-05' }], existing_due_date: '2026-11-30', push_forward_only: true,
  }).due_date, '2026-11-30', 'order clamp forward — never pulled earlier');
  eq(computeOrderDueDate({
    products: [{ product_due_date: '2026-12-01' }], existing_due_date: '2026-11-15', push_forward_only: true,
  }).pushed, true, 'order pushed when a product lands later');

  // KNOWN DEFECT N-03.1 — reported indexes are FILTERED-list positions, not
  // input-array positions. computeOrderDueDate filters products to objects
  // (line ~401) then forEach assigns `index` from the filtered list into
  // binding_index + product-trace rows; a sparse input shifts the reported
  // position off the caller's array. binding_product_id stays correct.
  const sparse = computeOrderDueDate({ products: [null, 'x', { id: 'p7', product_due_date: '2026-11-10' }] });
  eq(sparse.binding_product_id, 'p7', 'binding id still correct on sparse input');
  eq(sparse.binding_index, 0, 'KNOWN DEFECT N-03.1: binding_index is the filtered index (0), not the input index (2)');
  eq(sparse.trace.find((t) => t.kind === 'product' && t.product_id === 'p7').index, 0,
    'KNOWN DEFECT N-03.1: product-trace index also filtered');
  const sparseProd = computeProductDueDate({ parts: [null, { id: 'a', product_lead_days: 2 }, { id: 'b', product_lead_days: 5 }], anchor_date: MON });
  eq(sparseProd.trace.find((t) => t.kind === 'max' && t.field === 'product_due_date').index, 1,
    'KNOWN DEFECT N-03.1: max-owner index filtered (1), not the input index (2)');
}

// ===========================================================================
// S6 — hard-date hold: engine hold + B-08 guard + badge/toggle chain
// ===========================================================================
{
  const held = computeProductDueDate({
    parts: [{ product_lead_days: 30 }], anchor_date: MON,
    hard_due_date: true, product_due_date: '2026-11-12', design_due_date: '2026-11-05',
  });
  eq(held.due_date, '2026-11-12', 'hard due date never moves on recalc');
  eq(held.design_due_date, '2026-11-05', 'the hold freezes the design date too');
  eq(held.held_by_hard_date, true);
  eq(held.pushed, false);
  eq(held.computed_due_date, '', 'held result carries no candidate');
  ok(held.trace.some((t) => t.kind === 'hard_date' && t.held === true), 'hard_date hold trace');
  // Soft twin of the same input moves.
  const soft = computeProductDueDate({
    parts: [{ product_lead_days: 30 }], anchor_date: MON, product_due_date: '2026-11-12',
  });
  eq(soft.due_date, '2026-12-02', 'soft dates move on recalculation');
  // Hard flag with NO stored product date → nothing to hold: the engine
  // computes (B-08's blank→date lock lives in the guard/wrapper, not here).
  const blankHard = computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: MON, hard_due_date: true });
  eq(blankHard.due_date, '2026-11-05', 'engine computes for hard+blank (guard owns blank→date locking)');
  eq(blankHard.held_by_hard_date, false);
  // respect_hard_dates off → the flag stops protecting the stored date.
  const free = computeProductDueDate({
    parts: [{ product_lead_days: 15 }], anchor_date: MON,
    hard_due_date: true, product_due_date: '2026-11-12', respect_hard_dates: false,
  });
  eq(free.due_date, '2026-11-17', 'respect off → computed candidate wins');
  eq(free.held_by_hard_date, false);
  ok(free.trace.some((t) => t.kind === 'hard_date' && t.held === false), 'disrespect trace');
  // Order level: same hold.
  const ord = computeOrderDueDate({
    products: [{ product_due_date: '2026-12-01' }], existing_due_date: '2026-11-15', hard_due_date: true,
  });
  eq(ord.due_date, '2026-11-15', 'order-level hard_due_date holds the order date');
  eq(ord.held_by_hard_date, true);
  const ordFree = computeOrderDueDate({
    products: [{ product_due_date: '2026-12-01' }], existing_due_date: '2026-11-15',
    hard_due_date: true, respect_hard_dates: false,
  });
  eq(ordFree.due_date, '2026-12-01', 'respect off releases the order date too');
}
{
  // isHardDue + assertDueDateMutable (the standalone writer guard).
  eq(isHardDue({ hard_due_date: true }), true);
  eq(isHardDue({ hard_due_date: false }), false);
  eq(isHardDue({}), false);
  eq(isHardDue(null), false);
  eq(isHardDue({ hard_due_date: 'true' }), false, 'only strict boolean true counts');

  const HARD = { hard_due_date: true, product_due_date: '2026-11-20' };
  const SOFT = { hard_due_date: false, product_due_date: '2026-11-20' };
  const earlier = assertDueDateMutable(HARD, '2026-11-10', { actor_type: 'recalc' });
  eq(earlier.ok, false, 'recalc may not pull a hard date earlier');
  eq(earlier.held_by_hard_date, true);
  match(earlier.error, /locked/i);
  eq(assertDueDateMutable(HARD, '2026-11-30', { actor_type: 'recalc' }).ok, false,
    'recalc may not push a hard date later — locked BOTH directions');
  eq(assertDueDateMutable(HARD, '', { actor_type: 'recalc' }).ok, false, 'clearing a hard date is a move — blocked');
  for (const actor of ['system', 'proof_approval', 'sync', 'bogus_actor', '']) {
    eq(assertDueDateMutable(HARD, '2026-11-30', { actor_type: actor }).ok, false,
      `non-manual actor "${actor || '(empty)'}" fails closed`);
  }
  eq(assertDueDateMutable(HARD, '2026-11-30').ok, false, 'missing actor_type defaults to recalc');
  // Soft + no-op lanes.
  eq(assertDueDateMutable(SOFT, '2026-11-10', { actor_type: 'recalc' }).ok, true, 'soft moves earlier');
  eq(assertDueDateMutable(SOFT, '2026-11-30', { actor_type: 'recalc' }).ok, true, 'soft moves later');
  const noop = assertDueDateMutable(HARD, '2026-11-20', { actor_type: 'recalc' });
  eq(noop.ok, true, 'same-date on a hard product is a no-op');
  eq(noop.moves_date, false);
  eq(assertDueDateMutable({ hard_due_date: true }, '', { actor_type: 'recalc' }).ok, true, 'both-blank no-op');
  // Manual override lane — allowed, flagged for audit.
  const manual = assertDueDateMutable(HARD, '2026-11-25', { actor_type: 'manual' });
  eq(manual.ok, true, 'manual actor may move a hard date');
  eq(manual.manual_override, true, 'flagged for the caller to audit');
  match(manual.warning, /manual override/i);
  for (const actor of DUE_DATE_MANUAL_ACTORS) {
    eq(assertDueDateMutable(HARD, '2026-11-25', { actor_type: actor }).manual_override, true, `${actor} counts as manual`);
  }
  eq(assertDueDateMutable(HARD, '2026-11-15', { actor_type: 'staff' }).ok, true,
    'manual lane also allows earlier moves (flagged)');
  // due_date fallback field lets compute results feed straight back in.
  eq(assertDueDateMutable({ hard_due_date: true, due_date: '2026-11-20' }, '2026-11-21', { actor_type: 'recalc' }).ok, false,
    'due_date fallback field honored');
  const base = assertDueDateMutable(HARD, '2026-11-25', { actor_type: 'Manual' });
  eq(base.actor_type, 'manual', 'actor normalized to lowercase');
  deepEq(Object.keys(base).sort(), ['actor_type', 'error', 'existing_due_date', 'held_by_hard_date', 'is_hard',
    'manual_override', 'moves_date', 'ok', 'requested_due_date', 'warning'].sort(), 'guard envelope keys');
  // Composition: a held recalc envelope fed back is a same-date no-op.
  const heldCalc = recalcOnProofApproval({ product: { ...HARD, parts: [{ product_lead_days: 30 }] }, approval_date: MON });
  eq(heldCalc.held_by_hard_date, true);
  eq(assertDueDateMutable(HARD, heldCalc.due_date, { actor_type: 'recalc' }).ok, true,
    'held result → same-date no-op through the guard');
}
{
  // Badge/toggle chain: set flag → isHardDue → guard blocks → display shows.
  const stamped = setHardDuePatch({ hard_due_date: false }, { hard: true, actor: 'brett@shop.com', now: '2026-11-02T14:30:00.000Z' });
  eq(stamped.hard_due_date, true, 'enable sets the flag');
  eq(stamped.hard_due_set_by, 'brett@shop.com', 'enable stamps the actor');
  eq(stamped.hard_due_set_at, '2026-11-02T14:30:00.000Z', 'enable stamps time');
  deepEq(Object.keys(stamped).sort(), ['hard_due_date', 'hard_due_set_at', 'hard_due_set_by'],
    'patch carries only field keys');
  const flagged = { product_due_date: '2026-11-20', ...stamped };
  eq(isHardDue(flagged), true, 'stamped product reads hard');
  eq(assertDueDateMutable(flagged, '2026-11-25', { actor_type: 'system' }).ok, false,
    'stamped product blocks a system write');
  const disp = hardDueDisplay(flagged);
  eq(disp.is_hard, true);
  deepEq(disp.badge, { text: 'Hard due date', tone: 'red' });
  match(disp.tooltip, /locked/);
  match(disp.tooltip, /set by brett@shop\.com on 2026-11-02/, 'provenance in tooltip');
  const off = setHardDuePatch(flagged, { hard: false });
  eq(off.hard_due_date, false, 'disable clears the flag');
  eq(off.hard_due_set_by, '', 'disable clears provenance');
  eq(hardDueDisplay({ hard_due_date: false }).badge, null, 'soft rows get no badge');
  eq(hardDueDisplay(null).is_hard, false, 'display null-safe');
}

// ===========================================================================
// S7 — proof-recalc push-forward: candidate = approval_anchor + max(leads),
//      final = max(stored, candidate). The rule is recompute + forward clamp —
//      NEVER a push by slip amount, never earlier, no cap.
// ===========================================================================
{
  const push = recalcOnProofApproval({
    product: { product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] },
    approval_date: MON,
  });
  eq(push.due_date, '2026-11-07', 'approval slip → due recomputed to anchor + lead');
  eq(push.pushed, true);
  eq(push.computed_due_date, '2026-11-07');
  eq(push.prior_due_date, '2026-11-04');
  eq(push.trace[0].label, 'proof_approval', 'trigger label traced');
  // A LATER stored date is never pulled earlier — the push is one-way.
  const clamped = recalcOnProofApproval({
    product: { product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] },
    approval_date: MON,
  });
  eq(clamped.due_date, '2026-11-20', 'earlier candidate clamps to stored — push-forward only');
  eq(clamped.pushed, false);
  eq(clamped.changed, false);
  eq(clamped.computed_due_date, '2026-11-04', 'candidate still reported for diagnostics');
  // No cap: the full recomputed date lands however far forward it is.
  const far = recalcOnProofApproval({
    product: { product_due_date: '2026-11-04', parts: [{ product_lead_days: 60 }] },
    approval_date: MON,
  });
  eq(far.due_date, '2027-01-01', 'no cap — full recompute lands (MON 11-02 + 60 → Jan 1)');
  eq(far.pushed, true);
  // First write on approval.
  const first = recalcOnProofApproval({ product: { parts: [{ product_lead_days: 3 }] }, approval_date: MON });
  eq(first.due_date, '2026-11-05');
  eq(first.pushed, false);
  eq(first.changed, true);
  // Hard + stored → held. Hard + BLANK → engine computes (wrapper differs —
  // the wrapper holds blank hard products via B-08; asserted below).
  eq(recalcOnProofApproval({
    product: { hard_due_date: true, product_due_date: '2026-11-12', parts: [{ product_lead_days: 30 }] },
    approval_date: MON,
  }).held_by_hard_date, true, 'raw engine holds hard+stored');
  eq(recalcOnProofApproval({
    product: { hard_due_date: true, parts: [{ product_lead_days: 3 }] }, approval_date: MON,
  }).due_date, '2026-11-05', 'raw engine computes for hard+blank (holdResult needs a stored date)');
  // Embedded part fallbacks + explicit parts win.
  eq(recalcOnProofApproval({
    product: { part_list: [{ product_lead_days: 4 }] }, approval_date: MON,
  }).due_date, '2026-11-06', 'part_list fallback');
  eq(recalcOnProofApproval({
    product: { builder_parts: [{ product_lead_days: 4 }] }, approval_date: MON,
  }).due_date, '2026-11-06', 'builder_parts fallback');
  eq(recalcOnProofApproval({
    product: { parts: [{ product_lead_days: 50 }] }, parts: [{ product_lead_days: 2 }], approval_date: MON,
  }).due_date, '2026-11-04', 'explicit parts beat embedded');
  eq(recalcOnProofApproval({
    product: { product_due_date: '2026-11-20T15:00:00.000Z', parts: [{ product_lead_days: 2 }] },
    approval_date: MON,
  }).due_date, '2026-11-20', 'ISO stored date normalizes for the clamp');
}
{
  // recalcOnProofApprove — patch semantics (E-04 write path).
  const soft = { id: 'p2', product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] };
  const r = recalcOnProofApprove(soft, { now: MON });
  deepEq(r.patch, { product_due_date: '2026-11-07' }, 'patch carries the moved production date only');
  eq(r.held, false);
  eq(r.hold_reason, '');
  eq(r.pushed, true);
  eq(r.changed, true);
  eq(r.actor_type, 'proof_approval');
  eq(r.design_due_date, '2026-11-02', 'design candidate rides the result as a diagnostic');
  eq('design_due_date' in r.patch, false, 'design candidate is NEVER a patch field');
  deepEq(Object.keys(r).sort(), ['actor_type', 'changed', 'computed_due_date', 'design_due_date', 'due_date',
    'held', 'hold_reason', 'manual_override', 'patch', 'prior_due_date', 'product_id', 'pushed', 'trace', 'warning'].sort(),
    'recalc envelope keys');
  // Hard hold — the approval still proceeds (patch:{} merges harmlessly).
  const hard = { id: 'p1', hard_due_date: true, product_due_date: '2026-11-12', parts: [{ product_lead_days: 30 }] };
  const held = recalcOnProofApprove(hard, { now: MON, actor_type: 'customer' });
  eq(held.held, true);
  eq(held.hold_reason, 'hard_due_date');
  deepEq(held.patch, {}, 'held patch is empty — the approval patch is unaffected');
  eq(held.due_date, '2026-11-12');
  eq(held.computed_due_date, '', 'held before compute — no candidate');
  for (const actor of ['customer', 'staff', 'system', '']) {
    eq(recalcOnProofApprove(hard, { now: MON, actor_type: actor }).held, true,
      `${actor || '(default)'} actor held on hard product`);
  }
  const blankHeld = recalcOnProofApprove({ hard_due_date: true, parts: [{ product_lead_days: 5 }] }, { now: MON });
  eq(blankHeld.held, true, 'wrapper holds hard+blank (blank→date is a move — tighter than the raw engine)');
  // Forward-only: earlier candidate → no-op, same-date → no-op.
  eq(recalcOnProofApprove({ product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] }, { now: MON }).changed, false);
  deepEq(recalcOnProofApprove({ product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] }, { now: MON }).patch, {});
  const same = recalcOnProofApprove({ product_due_date: '2026-11-07', parts: [{ product_lead_days: 5 }] }, { now: MON });
  deepEq(same.patch, {}, 'same-date compute is a no-op');
  eq(same.held, false, 'a no-op is not a hold');
  // lead_days override precedence: synthesize / numeric tier / idle.
  deepEq(recalcOnProofApprove({ product_due_date: '2026-11-01' }, { now: MON, lead_days: 4 }).patch,
    { product_due_date: '2026-11-06' }, 'no parts → explicit days synthesize the lead');
  eq(recalcOnProofApprove(
    { product_due_date: '2026-11-01', parts: [{ product_min_days: 10, product_std_days: 20 }] },
    { now: MON, lead_days: 3 },
  ).patch.product_due_date, '2026-11-12', 'override respects each part floor');
  deepEq(recalcOnProofApprove({ product_due_date: '2026-11-09' }, { now: MON }).patch, {},
    'no parts + no override → stored date stands');
  // B-08 second wall: disrespecting the flag still fails closed for
  // non-manual actors; a manual-actor caller may move it flagged.
  const hardP = { hard_due_date: true, product_due_date: '2026-11-05', parts: [{ product_lead_days: 10 }] };
  const blocked = recalcOnProofApprove(hardP, { now: MON, actor_type: 'system', respect_hard_dates: false });
  eq(blocked.held, true, 'respect off + non-manual actor → second wall still holds');
  eq(blocked.hold_reason, 'hard_due_date');
  eq(blocked.computed_due_date, '2026-11-12', 'blocked candidate diagnosable');
  const override = recalcOnProofApprove(hardP, { now: MON, actor_type: 'staff', respect_hard_dates: false });
  eq(override.held, false, 'manual-actor caller may deliberately move it');
  eq(override.patch.product_due_date, '2026-11-12');
  eq(override.manual_override, true);
  match(override.warning, /manual override/i);
  // Hygiene.
  deepEq(recalcOnProofApprove(null, { now: MON }).patch, {}, 'null product → empty patch');
  deepEq(recalcOnProofApprove('p9', { now: MON }).patch, {}, 'non-object product → empty patch');
  deepEq(recalcOnProofApprove({ parts: [{ product_lead_days: 3 }] }, { now: 'not-a-date' }).patch, {},
    'unparseable anchor cannot move a date');
}
{
  // orderDueAfterApprove — order due = max of OPEN product dues after the
  // approved product recalcs. Terminal/deleted/completed rows never drive it;
  // a held product's stored date still counts (frozen ≠ absent).
  const wo = {
    id: 'wo1', due_date: '2026-11-15',
    products: [
      { id: 'p1', description: 'Pylon', product_due_date: '2026-11-04', operational_status: 'awaiting_proof_approval', parts: [{ product_lead_days: 20 }] },
      { id: 'p2', description: 'Channel letters', product_due_date: '2026-11-10', operational_status: 'in_production' },
      { id: 'p3', description: 'Built banner', product_due_date: '2026-11-25', operational_status: 'built' },
      { id: 'p4', description: 'Deleted panel', product_due_date: '2026-11-30', deleted: true },
      { id: 'p5', description: 'Done vinyl', product_due_date: '2026-11-28', completed: true },
      { id: 'p6', description: 'Vended legacy', product_due_date: '2026-11-29', operational_status: 'vended' },
    ],
  };
  const r = orderDueAfterApprove(wo, 'p1', { now: MON });
  eq(r.order_due_date, '2026-11-22', 'order due = max of OPEN product dues after recalc');
  eq(r.binding_product_id, 'p1', 'the approved product binds the order date');
  eq(r.order_pushed, true);
  eq(r.prior_order_due_date, '2026-11-15');
  eq(r.computed_order_due_date, '2026-11-22');
  eq(r.product_found, true);
  eq(r.product_patches.length, 1);
  deepEq(r.product_patches[0].patch, { product_due_date: '2026-11-22' });
  deepEq(Object.keys(r).sort(), ['binding_product_id', 'computed_order_due_date', 'order_due_date', 'order_held',
    'order_manual_override', 'order_pushed', 'order_warning', 'prior_order_due_date', 'product_found', 'product_patches', 'trace'].sort(), 'rollup envelope keys');
  // Held products still count toward the max by their STORED date.
  const heldWo = {
    due_date: '2026-11-15',
    products: [
      { id: 'p1', description: 'Hard monument', hard_due_date: true, product_due_date: '2026-11-25', operational_status: 'awaiting_proof_approval', parts: [{ product_lead_days: 30 }] },
      { id: 'p2', description: 'Soft pylon', product_due_date: '2026-11-10', operational_status: 'in_production' },
    ],
  };
  const hr = orderDueAfterApprove(heldWo, 'p1', { now: MON });
  eq(hr.product_patches[0].held, true);
  eq(hr.order_due_date, '2026-11-25', "a held product's stored date still binds the order max");
  eq(hr.binding_product_id, 'p1');
  // Order-level guards: forward-only, order hard hold, missing target, bare array.
  const fwdOnly = orderDueAfterApprove(
    { due_date: '2026-12-01', products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON },
  );
  eq(fwdOnly.order_due_date, undefined, 'order due never moves earlier');
  eq(fwdOnly.computed_order_due_date, '2026-11-22');
  const hardOrder = orderDueAfterApprove(
    { due_date: '2026-11-15', hard_due_date: true, products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON },
  );
  eq(hardOrder.order_held, true, 'order-level hard_due_date holds the order date');
  eq(hardOrder.order_due_date, undefined);
  deepEq(hardOrder.product_patches[0].patch, { product_due_date: '2026-11-22' }, 'the product still recalcs');
  const missing = orderDueAfterApprove(
    { due_date: '2026-11-01', products: [{ id: 'p1', product_due_date: '2026-11-10' }] }, 'ghost', { now: MON },
  );
  eq(missing.product_found, false);
  deepEq(missing.product_patches, []);
  eq(missing.order_due_date, '2026-11-10', 'stored open dates still roll up');
  eq(orderDueAfterApprove(
    [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }], 'p1', { now: MON },
  ).order_due_date, '2026-11-22', 'bare products[] input');
  eq(orderDueAfterApprove(
    { order_due_date: '2026-11-15', products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON },
  ).prior_order_due_date, '2026-11-15', 'order_due_date field fallback');

  // FIXED DEFECT N-03.2 — the ORDER-level hard date now has the B-08 second
  // wall. orderDueAfterApprove applies assertDueDateMutable to the order
  // rollup: respect_hard_dates:false can no longer un-hold the order date
  // for a non-manual actor (manual actors still move it, flagged).
  const leaky = orderDueAfterApprove(
    { due_date: '2026-11-15', hard_due_date: true, products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON, respect_hard_dates: false, actor_type: 'system' },
  );
  eq(leaky.order_held, true, 'N-03.2 fixed: order hard date held for non-manual actor');
  eq(leaky.order_due_date, undefined, 'N-03.2 fixed: order date does not move');
  eq(leaky.order_pushed, false, 'N-03.2 fixed: order_pushed false when guard blocks');
  // …and the same flag combo on a HARD PRODUCT still holds (symmetry kept).
  const contrast = orderDueAfterApprove(
    { due_date: '2026-11-15', hard_due_date: true, products: [{ id: 'p1', hard_due_date: true, product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON, respect_hard_dates: false, actor_type: 'system' },
  );
  eq(contrast.product_patches[0].held, true, 'product-level second wall still holds under the same flags');
  // …while a MANUAL actor still moves the hard order date, flagged for audit.
  const manual = orderDueAfterApprove(
    { due_date: '2026-11-15', hard_due_date: true, products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 20 }] }] },
    'p1', { now: MON, respect_hard_dates: false, actor_type: 'staff' },
  );
  eq(manual.order_held, false, 'N-03.2 fixed: manual actor moves the hard order date');
  eq(manual.order_due_date, '2026-11-22', 'N-03.2 fixed: manual override lands the new date');
  eq(manual.order_manual_override, true, 'N-03.2 fixed: manual move flagged manual_override');
}
{
  // recalcSummary + approvalWithRecalc (merged E-02 stamp + recalc, one write).
  const products = [
    { id: 'p1', description: 'Pylon', product_due_date: '2026-11-04' },
    { id: 'p2', description: 'Monument', product_due_date: '2026-11-12' },
    { id: 'p3', description: 'Vinyl', product_due_date: '2026-11-20' },
  ];
  const results = [
    recalcOnProofApprove({ ...products[0], parts: [{ product_lead_days: 5 }] }, { now: MON }),
    recalcOnProofApprove({ ...products[1], hard_due_date: true, parts: [{ product_lead_days: 30 }] }, { now: MON }),
    recalcOnProofApprove({ ...products[2], parts: [{ product_lead_days: 1 }] }, { now: MON }),
  ];
  const s = recalcSummary(products, results);
  eq(s.moved.length, 1);
  deepEq(s.moved[0], { product_id: 'p1', label: 'Pylon', from: '2026-11-04', to: '2026-11-07', days: 3 },
    'moved bucket carries from/to/days');
  eq(s.held.length, 1);
  eq(s.held[0].hold_reason, 'hard_due_date');
  eq(s.held[0].due_date, '2026-11-12', 'held row reports the frozen date');
  eq(s.unchanged.length, 1);
  eq(s.unchanged[0].product_id, 'p3');
  const s2 = recalcSummary([{ id: 'p1', description: 'Pylon', product_due_date: '2026-11-04' }],
    orderDueAfterApprove({ due_date: '', products: [{ id: 'p1', product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] }] }, 'p1', { now: MON }));
  eq(s2.moved.length, 1, 'order result unwraps product_patches');
  deepEq(recalcSummary([], []), { moved: [], held: [], unchanged: [] });

  const product = {
    id: 'p1', work_order_id: 'wo1', description: 'Pylon',
    operational_status: 'awaiting_proof_approval', proof_status: 'awaiting_approval',
    proof_version: 2, proof_file_url: 'https://x/proof.pdf',
    product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }],
  };
  const stamp = approveProofPatch(product, { actor_type: 'customer', actor_id: 'buyer@x.com', now: MON });
  const merged = approvalWithRecalc(product, stamp, { now: MON });
  deepEq(merged, {
    operational_status: 'proof_approved', proof_status: 'approved',
    proof_approved_version: 2, proof_approved_at: '2026-11-02T00:00:00.000Z',
    proof_approved_by: 'buyer@x.com', proof_approval_actor_type: 'customer',
    product_due_date: '2026-11-07',
  }, 'ONE merged write: approval stamp + recalc field');
  eq(merged.held, false, 'hold metadata rides along');
  eq(merged.hold_reason, '');
  eq(merged.recalc.pushed, true);
  eq('held' in { ...merged }, false, 'spread patch is clean');
  eq(Object.keys(merged).includes('held'), false, 'held is non-enumerable');
  eq(JSON.parse(JSON.stringify(merged)).held, undefined, 'serialized patch is clean');
  const hardMerged = approvalWithRecalc({ ...product, hard_due_date: true }, stamp, { now: MON });
  eq(hardMerged.operational_status, 'proof_approved', 'approve proceeds on hold');
  eq('product_due_date' in hardMerged, false, 'date frozen out of the write');
  eq(hardMerged.held, true);
  eq(hardMerged.hold_reason, 'hard_due_date');
  const staged = approvalWithRecalc(product, { ...stamp, product_due_date: '2026-12-25' }, { now: MON });
  eq(staged.product_due_date, '2026-12-25', 'caller-staged keys beat computed keys');
}

// ===========================================================================
// S8 — two-clock rule: production clock drives deadline math, sales-center /
//      design_clock drives design math (defaults to clock). Calendar mode vs
//      business mode, day names + spellings, holidays, K-01 bridge.
// ===========================================================================
{
  // Calendar vs business mode on the same input.
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: FRI }).due_date, '2026-11-07',
    'no clock → calendar days (Fri+1 → Sat)');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: WK } }).due_date,
    '2026-11-09', 'production clock → Fri+1 business day → Mon');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 3 }], anchor_date: WED, clock: { business_days: WK } }).due_date,
    '2026-11-09', 'Wed+3 business days skips the weekend');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: SAT, clock: { business_days: WK } }).due_date,
    '2026-11-09', 'closed-day anchor counts from the next open day');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 0 }], anchor_date: MON, clock: { business_days: WK } }).due_date,
    MON, 'zero lead keeps the anchor even on a closed clock');
  // Holidays close otherwise-open days.
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: WK, holidays: ['2026-11-09'] },
  }).due_date, '2026-11-10', 'holiday closes an otherwise-open day');
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 2 }], anchor_date: MON, clock: { holidays: ['2026-11-03'] },
  }).due_date, '2026-11-05', 'holidays-only clock → every weekday open except the holiday');
  // Restriction spellings + degenerate inputs.
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  }).due_date, '2026-11-09', 'day names accepted');
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { businessDays: WK },
  }).due_date, '2026-11-09', 'camelCase businessDays accepted');
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { days_of_week: WK },
  }).due_date, '2026-11-09', 'days_of_week spelling accepted');
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: [] },
  }).due_date, '2026-11-07', 'empty business_days → calendar (never a lockup)');
  eq(computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: ['bogus', 'noday'] },
  }).due_date, '2026-11-07', 'all-garbage days → calendar');
  {
    const all = computeProductDueDate({
      parts: [{ product_lead_days: 1 }], anchor_date: FRI, clock: { business_days: [0, 1, 2, 3, 4, 5, 6] },
    });
    eq(all.due_date, '2026-11-07', 'all-7 business days → same dates as calendar…');
    eq(all.trace.find((t) => t.kind === 'clock').mode, 'business', '…but reported as business mode');
    const biz = all.trace.find((t) => t.kind === 'clock');
    deepEq(biz.business_days, [0, 1, 2, 3, 4, 5, 6], 'clock trace carries the day set');
    deepEq(biz.holidays, [], 'clock trace carries holidays');
  }
  // Two clocks: design runs on design_clock (defaults to production clock).
  const two = computeProductDueDate({
    parts: [{ design_lead_days: 1, product_lead_days: 1 }],
    anchor_date: FRI,
    clock: { business_days: WK },
    design_clock: { business_days: WK6 },
  });
  eq(two.due_date, '2026-11-09', 'production clock skips the weekend');
  eq(two.design_due_date, '2026-11-07', 'sales-center clock counts Saturday');
  eq(two.trace.filter((t) => t.kind === 'clock').length, 2, 'one clock trace per computed field');
  const shared = computeProductDueDate({
    parts: [{ design_lead_days: 1, product_lead_days: 1 }],
    anchor_date: FRI, clock: { business_days: WK },
  });
  eq(shared.design_due_date, '2026-11-09', 'design_clock defaults to the production clock');
  // clockFromHours adapter (hoursOfOperation entry shapes → engine clock).
  const c = clockFromHours([
    { day: 'monday', open: '08:00', close: '17:00' },
    { days_of_week: [2, 3, 4, 5] },
    { weekday: 6, closed: true },
    { date: '2026-12-25' },
    'sunday',
  ], 'production');
  deepEq(c.business_days, [0, 1, 2, 3, 4, 5], 'entry day keys + bare names resolve; closed day dropped');
  deepEq(c.holidays, ['2026-12-25']);
  eq(c.name, 'production');
  deepEq(clockFromHours([], 'x').business_days, null, 'no entries → calendar-mode clock');
  const viaHours = computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI,
    clock: clockFromHours([{ day: 'monday' }, { days_of_week: [2, 3, 4, 5] }, { weekday: 6, closed: true }]),
  });
  eq(viaHours.due_date, '2026-11-09', 'clockFromHours output drives the engine directly');
}
{
  // K-01 bridge — hoursOfOperationModel feeds the engine's clock shape.
  eq(normalizeKind('sales_center'), 'sales');
  eq(normalizeKind('counter'), 'sales');
  eq(normalizeKind('prod'), 'production');
  eq(normalizeKind('bogus'), 'production', 'unknown kind → production default');
  eq(HOURS_KINDS.PRODUCTION, 'production');
  eq(HOURS_KINDS.SALES, 'sales');
  // Defaults: production Mon–Fri 07:00–17:00, sales Mon–Fri 08:00–17:00.
  deepEq(toDueDateClock(DEFAULT_PRODUCTION_HOURS).business_days, WK, 'default production clock = Mon–Fri');
  deepEq(toDueDateClock(DEFAULT_SALES_HOURS).business_days, WK, 'default sales clock = Mon–Fri');
  eq(toDueDateClock(null).business_days, null, 'unrestricted → calendar-mode clock');
  deepEq(toDueDateClock(normalizeSchedule([{ day: 'tue', open: '09:00', close: '17:00' }, { date: '2026-12-25' }]), 'shop'),
    { name: 'shop', business_days: [2], holidays: ['2026-12-25'] }, 'schedule → engine clock shape');
  // Settings-tier resolution (GlobalSettings.hoursOfOperation shapes) → engine.
  const settings = {
    hoursOfOperation: {
      production_hours: [{ days_of_week: [1, 2, 3, 4, 5] }],
      sales_center_hours: [{ days_of_week: [1, 2, 3, 4, 5, 6] }],
    },
  };
  const prodSched = hoursFor(null, { settings, kind: 'production' });
  const salesSched = hoursFor(null, { settings, kind: 'sales' });
  eq(prodSched.source, 'settings', 'production hours resolve from settings');
  eq(salesSched.source, 'settings', 'sales hours resolve from settings');
  const bridged = computeProductDueDate({
    parts: [{ design_lead_days: 1, product_lead_days: 1 }], anchor_date: FRI,
    clock: toDueDateClock(prodSched, 'production'),
    design_clock: toDueDateClock(salesSched, 'sales'),
  });
  eq(bridged.due_date, '2026-11-09', 'settings→hoursFor→toDueDateClock→engine: prod clock skips weekend');
  eq(bridged.design_due_date, '2026-11-07', 'the two clocks diverge exactly as configured (sales counts Sat)');
  // Location tier beats settings for the deadline clock.
  const loc = hoursFor(
    { name: 'East', id: 'loc1', production_hours: [{ day: 'saturday', open: '09:00', close: '13:00' }] },
    { settings, kind: 'production' },
  );
  eq(loc.source, 'location', 'location-tier hours win');
  eq(toDueDateClock(loc).business_days.join(','), '6', 'location schedule → engine clock');
  // Defaults tier → same documented bridge.
  const dflt = computeProductDueDate({
    parts: [{ product_lead_days: 1 }], anchor_date: FRI,
    clock: toDueDateClock(hoursFor(null, { kind: 'production' })),
  });
  eq(dflt.due_date, '2026-11-09', 'default production hours → Mon–Fri clock → Fri+1 = Mon');
  // Equivalence: engine business-mode ≡ hours model business-day arithmetic.
  const sched = normalizeSchedule({ weekdays: '07:00-17:00', holidays: ['2026-11-09'] });
  for (const [anchor, days] of [[FRI, 1], [WED, 3], [SAT, 1], [MON, 5], [FRI, 0]]) {
    eq(toDateOnly(addLeadDays(toLocalDate(anchor), days, toDueDateClock(sched))),
      toDateOnly(addBusinessDays(anchor, days, sched)),
      `addLeadDays(clock) ≡ addBusinessDays(schedule) for ${anchor}+${days}`);
  }
  eq(toDateOnly(addBusinessDays(`${SAT}T09:00:00`, 0, sched)), '2026-11-07', 'N=0 returns anchor on a closed day');
  // dueDateWithClock (standalone lead-add on the production clock) agrees
  // with a single-part engine compute over the same clock.
  eq(dueDateWithClock({ product_lead_days: 1 }, { now: FRI }), '2026-11-09', 'dueDateWithClock uses the production clock');
  eq(dueDateWithClock({ product_lead_days: 1 }, { now: FRI }),
    computeProductDueDate({
      parts: [{ product_lead_days: 1 }], anchor_date: FRI,
      clock: toDueDateClock(DEFAULT_PRODUCTION_HOURS),
    }).due_date, 'standalone helper ≡ engine single-part compute');
  eq(dueDateWithClock({ lead_days: 4 }, { now: 'garbage' }), '', 'unparseable now → ""');
  // Sales clock owns follow-up math, lands inside open hours (snap-forward).
  const fu = followUpDateWithClock(`${FRI}T10:00:00`, 1, DEFAULT_SALES_HOURS);
  eq(toLocalDate(fu).getDay(), 1, 'Fri sent +1 sales day → Monday');
  eq(toLocalDate(fu).getHours(), 10, 'time-of-day preserved when inside hours');
  match(fu, /Z$/, 'follow-up instant serializes as ISO UTC');
  const fuSnap = followUpDateWithClock(`${SAT}T09:00:00`, 0, DEFAULT_SALES_HOURS);
  eq(toLocalDate(fuSnap).getDay(), 1, 'closed-day due → snapped to next open day');
  eq(toLocalDate(fuSnap).getHours(), 8, 'snapped to open-hour boundary (08:00)');
  eq(followUpDateWithClock('garbage', 1, DEFAULT_SALES_HOURS), '', 'unparseable sent_at → ""');
  // Open-day introspection agrees with the clock fields.
  deepEq(openDayIndexes(DEFAULT_PRODUCTION_HOURS), WK, 'openDayIndexes = Mon–Fri');
  deepEq(openDayIndexes(null), [0, 1, 2, 3, 4, 5, 6], 'unrestricted → all days');
  eq(isBusinessDay(SAT, DEFAULT_PRODUCTION_HOURS), false);
  eq(isBusinessDay(SAT, null), true);
  eq(nextOpen(`${SAT}T12:00:00`, DEFAULT_PRODUCTION_HOURS).getDay(), 1, 'nextOpen → Monday');
}

// ===========================================================================
// S9 — edge grid: same-day, past-due, boundaries, DST, malformed leads
// ===========================================================================
{
  eq(computeProductDueDate({ parts: [{ product_lead_days: 0 }], anchor_date: MON }).due_date, MON,
    'same-day (0-lead) → anchor');
  // Past-due stored dates: default lane pulls to the new compute; the
  // approval lane only pushes forward.
  eq(computeProductDueDate({ parts: [{ product_lead_days: 5 }], anchor_date: MON, product_due_date: '2020-01-01' }).due_date,
    '2026-11-07', 'past-due stored date is recomputed in the default lane');
  eq(recalcOnProofApproval({ product: { product_due_date: '2020-01-01', parts: [{ product_lead_days: 5 }] }, approval_date: MON }).pushed,
    true, 'past-due stored + approval recalc → pushed forward');
  // Month/year boundaries + leap day (2028 is a leap year).
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: '2026-12-31' }).due_date,
    '2027-01-01', 'year rollover');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: '2028-02-28' }).due_date,
    '2028-02-29', 'leap-day landing');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 2 }], anchor_date: '2028-02-28', clock: { business_days: WK } }).due_date,
    '2028-03-01', 'business mode across Feb 29 (Tue 29th + Wed 1st)');
  // DST boundary (America/New_York falls back 2026-11-01): setDate math is
  // wall-clock safe across the transition.
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: '2026-10-31' }).due_date,
    '2026-11-01', 'calendar add across the DST boundary lands on the DST day');
  eq(computeProductDueDate({ parts: [{ product_lead_days: 1 }], anchor_date: '2026-10-30', clock: { business_days: WK } }).due_date,
    '2026-11-02', 'business add Fri→Mon across the DST boundary');
  // Malformed lead/day inputs degrade, never throw.
  eq(toDateOnly(addLeadDays(toLocalDate(MON), -3, null)), MON, 'negative lead → 0');
  eq(toDateOnly(addLeadDays(toLocalDate(MON), 'abc', null)), MON, 'non-numeric lead → 0');
  eq(toDateOnly(addLeadDays(toLocalDate(MON), 2.4, null)), '2026-11-04', 'fractional lead rounds');
  const bare = computeProductDueDate({});
  eq(bare.due_date, '', 'fully-empty input → empty envelope, no throw');
  ok(Array.isArray(bare.trace), 'trace always an array');
  // ISO-vs-date-only stored inputs compare at day granularity everywhere.
  eq(computeOrderDueDate({ products: [{ product_due_date: '2026-11-10T00:00:00.000Z' }] }).due_date,
    parseDateOnly('2026-11-10T00:00:00.000Z'), 'order rollup normalizes ISO product dates to local days');
}

for (const t of TMP) rmSync(t, { force: true });
console.log(`PASS due-date-suite (${n} asserts)`);
