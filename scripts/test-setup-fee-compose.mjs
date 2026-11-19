import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-15 suite — setup fees + minimums compose (pure TS, zero imports).
// Bundle first: bare Node can't run .ts (sibling-suite convention).
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-setup-fee-compose.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/setupFeeCompose.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  MINIMUM_FLOOR_MODES,
  MINIMUM_VALUE_FIELDS,
  SETUP_FEE_VALUE_FIELDS,
  SETUP_FEE_THRESHOLD_FIELDS,
  normalizeFloorMode,
  normalizeMinimumCandidate,
  normalizeSetupFee,
  applyMinimum,
  composeOrderMinimums,
  evaluateMinimums,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };
const near = (a, b, msg) => { assert.ok(Math.abs(a - b) < 1e-9, `${msg} — expected ${b}, got ${a}`); n++; };

// ------------------------------------------------------------- applyMinimum
{
  const r = applyMinimum(40, 50);
  eq(r.adjusted, 50, 'floor raises subtotal');
  eq(r.delta, 10, 'delta = floor - subtotal');
  eq(r.applied, true, 'applied marks the raise');
  const under = applyMinimum(60, 50);
  eq(under.adjusted, 60, 'subtotal above floor untouched');
  eq(under.delta, 0, 'no delta above floor');
  eq(under.applied, false);
  eq(applyMinimum(40, 0).adjusted, 40, 'zero floor ignored');
  eq(applyMinimum(40, -10).applied, false, 'negative floor ignored');
  eq(applyMinimum(NaN, 50).adjusted, 0, 'NaN subtotal -> 0, never floored');
  eq(applyMinimum(0, 50).applied, false, 'non-positive base never floored (D4)');
}

// ------------------------------------------------- largest-wins compose (D1)
{
  const r = composeOrderMinimums({
    line_subtotal: 100,
    part_minimums: [30],
    modifier_minimums: [15, { min_charge: 25 }],
    minimums: [50],
  });
  eq(r.floor, 50, 'largest minimum wins');
  eq(r.floor_source.source, 'line', 'winner is the line bucket entry');
  eq(r.floor_source.minimum, 50);
  eq(r.applied_minimums.length, 4, 'all positive candidates listed');
  eq(r.applied_minimums.filter((m) => m.winning).length, 1, 'exactly one winner');
  eq(r.final_subtotal, 100, 'floor below total -> no bind');
  eq(r.minimum_applied, false);
  eq(r.minimum_delta, 0);

  const bind = composeOrderMinimums({
    line_subtotal: 30, part_minimums: [70], setup_fees: [10, 20],
  });
  eq(bind.final_subtotal, 70, '60 < 70 -> floor binds on the inclusive total');
  near(bind.minimum_delta, 10, 'delta lifts 60 -> 70');
}

// ----------------------------------------------------- additive setups (D2)
{
  const r = composeOrderMinimums({ line_subtotal: 10, setup_fees: [10, 20, { setup_fee: 5 }] });
  eq(r.total_setup_fees, 35, 'setup fees sum additively');
  eq(r.setup_fees.length, 3);
  eq(r.final_subtotal, 45, 'fees add on top');
}

// ------------------------------------------- floor scope: inclusive (default)
{
  const r = composeOrderMinimums({
    line_subtotal: 40, setup_fees: [15], part_minimums: [60],
  });
  eq(r.floor_mode, 'inclusive', 'default floor_mode is inclusive (D3)');
  eq(r.floor_base, 55, 'floor measured against S + F');
  eq(r.final_subtotal, 60, 'inclusive: max(40+15, 60) = 60');
  near(r.minimum_delta, 5, 'setup absorbed: delta = 60 - 55');

  const under = composeOrderMinimums({
    line_subtotal: 40, setup_fees: [15], part_minimums: [50],
  });
  eq(under.final_subtotal, 55, 'floor below S+F -> no bind');
  eq(under.minimum_applied, false);
}

// ------------------------------- floor scope: exclusive (engine parity path)
{
  const r = composeOrderMinimums({
    line_subtotal: 40, setup_fees: [15], part_minimums: [50], floor_mode: 'exclusive',
  });
  eq(r.floor_mode, 'exclusive');
  eq(r.floor_base, 40, 'floor measured against S alone');
  // engine parity: pricePart extended=max(40,50)=50, +setupFee 15 -> 65
  eq(r.final_subtotal, 65, 'exclusive: max(40,50)+15 = 65 (pricePart parity)');
  near(r.minimum_delta, 10, 'fee never eaten: delta = 50 - 40');

  const tok = composeOrderMinimums({
    line_subtotal: 40, setup_fees: [15], part_minimums: [60], floor_mode: 'pre_setup',
  });
  eq(tok.floor_mode, 'exclusive', 'pre_setup token -> exclusive');
  eq(tok.final_subtotal, 75, 'max(40,60)+15 = 75');
  eq(normalizeFloorMode('total'), 'inclusive', 'total token -> inclusive');
  eq(normalizeFloorMode('garbage'), 'inclusive', 'unknown token -> default');
}

// ---------------------------------------------------- qty-threshold fees (D2)
{
  const fee = { setup_fee: 25, setup_fee_threshold_qty: 10 };
  const below = composeOrderMinimums({ line_subtotal: 40, qty: 5, setup_fees: [fee] });
  eq(below.total_setup_fees, 25, 'qty < threshold -> fee charges');
  eq(below.final_subtotal, 65);
  const at = composeOrderMinimums({ line_subtotal: 40, qty: 10, setup_fees: [fee] });
  eq(at.total_setup_fees, 0, 'qty >= threshold -> waived');
  eq(at.setup_fees[0].threshold_waived, true, 'waiver surfaced in audit');
  eq(at.setup_fees[0].configured_amount, 25, 'configured amount kept on waiver');
  eq(at.setup_fees[0].amount, 0);
  eq(at.final_subtotal, 40, 'waived fee adds nothing');
  const above = composeOrderMinimums({ line_subtotal: 40, qty: 12, setup_fees: [fee] });
  eq(above.total_setup_fees, 0, 'above threshold -> waived');
  const noQty = composeOrderMinimums({ line_subtotal: 40, setup_fees: [fee] });
  eq(noQty.total_setup_fees, 25, 'missing qty -> charged (conservative)');
  const noThresh = composeOrderMinimums({ line_subtotal: 40, qty: 5, setup_fees: [{ setup_fee: 8 }] });
  eq(noThresh.total_setup_fees, 8, 'no threshold -> always applies');
}

// ----------------------------------- evaluateMinimums: part + qty + modifiers
{
  const r = evaluateMinimums({
    line_subtotal: 40, qty: 5,
    part: { min_charge: 30, setup_fee: 25, setup_fee_threshold_qty: 10 },
    modifiers: [
      { name: 'lam', min_charge: 15, setup_fee: 10, include_setup_fee: true },
      { name: 'coat', min_charge: 0, setup_fee: 20, include_setup_fee: false },
    ],
  });
  eq(r.floor, 30, 'part min beats smaller modifier min');
  eq(r.floor_source.source, 'part');
  eq(r.total_setup_fees, 35, 'part 25 (below thresh) + lam 10 (flagged); coat suppressed');
  eq(r.skipped_setup_fees, 1, 'include_setup_fee:false suppresses the fee');
  eq(r.skipped_minimums, 1, 'coat min_charge 0 skipped');
  eq(r.final_subtotal, 75, 'base 75 >= floor 30 -> passthrough');
  eq(r.part_minimums.length, 1);
  eq(r.modifier_minimums.length, 2);

  const unflagged = evaluateMinimums({
    line_subtotal: 10, modifiers: [{ setup_fee: 12 }],
  });
  eq(unflagged.total_setup_fees, 12, 'absent flag + positive fee -> counts');

  const narrowed = evaluateMinimums({
    line_subtotal: 10, part: { amount: 999, value: 888, min_charge: 30 },
  });
  eq(narrowed.floor, 30, 'generic amount/value fields on part never misfire');
  eq(narrowed.total_setup_fees, 0, 'generic fields never read as a fee');

  const bare = evaluateMinimums({ line_subtotal: 10, part: 45 });
  eq(bare.floor, 45, 'bare-number part = its min_charge');
  eq(bare.final_subtotal, 45, 'floor binds 10 -> 45');
}

// ------------------------------------------------------------- edge guards
{
  const junk = composeOrderMinimums({
    line_subtotal: 'abc',
    setup_fees: [{ setup_fee: 'x' }, NaN, -5],
    part_minimums: [NaN, -2, 'z'],
  });
  eq(junk.line_subtotal, 0, 'NaN subtotal -> 0');
  eq(junk.skipped_setup_fees, 3, 'non-finite/non-positive fees skipped');
  eq(junk.skipped_minimums, 3, 'non-finite/non-positive minimums skipped');
  eq(junk.floor, 0);
  eq(junk.final_subtotal, 0);

  eq(composeOrderMinimums({ line_subtotal: 42 }).final_subtotal, 42,
    'empty arrays -> passthrough');
  eq(composeOrderMinimums().floor, 0, 'no input -> floor 0');
  eq(composeOrderMinimums('junk').final_subtotal, 0, 'non-record input safe');

  const negBase = composeOrderMinimums({ line_subtotal: -5, part_minimums: [50] });
  eq(negBase.final_subtotal, -5, 'negative base never floored (pass-through)');
  eq(negBase.minimum_applied, false);

  const zeroLine = composeOrderMinimums({ line_subtotal: 0, setup_fees: [10], part_minimums: [50] });
  eq(zeroLine.final_subtotal, 50, 'inclusive: 0+10 base >0 -> floor binds');
  const zeroEx = composeOrderMinimums({
    line_subtotal: 0, setup_fees: [10], part_minimums: [50], floor_mode: 'exclusive',
  });
  eq(zeroEx.final_subtotal, 10, 'exclusive: S=0 -> floor cannot bind, fees still add');

  const suppressed = composeOrderMinimums({
    line_subtotal: 10,
    part_minimums: [{ value: 70, applies: false }, 20],
  });
  eq(suppressed.floor, 20, 'applies:false candidate suppressed');
  eq(suppressed.skipped_minimums, 1);
}

// ----------------------------------------------------- aliases + ties + misc
{
  const r = composeOrderMinimums({
    subtotal: 30,
    part_minimums: [{ minimum_charge: 45 }],
    setup_fees: [{ setup_fee_amount: 8 }, { fee: 4 }],
  });
  eq(r.line_subtotal, 30, 'subtotal alias read');
  eq(r.floor, 45, 'minimum_charge alias read');
  eq(r.total_setup_fees, 12, 'setup_fee_amount + fee aliases read');
  eq(r.final_subtotal, 45, 'base 42 < 45 -> floor binds');

  eq(composeOrderMinimums({ extension: 10, minimum: 25 }).floor, 25,
    'extension alias + scalar minimum');
  eq(composeOrderMinimums({ extended: 10, line_minimum: 25 }).floor, 25,
    'line_minimum scalar alias');

  const tie = composeOrderMinimums({
    line_subtotal: 10, part_minimums: [40], modifier_minimums: [40],
  });
  eq(tie.floor_source.source, 'part', 'tie -> earliest bucket wins');
  eq(tie.applied_minimums[0].winning, true);
  eq(tie.applied_minimums[1].winning, false, 'second tie entry not marked');

  eq(normalizeMinimumCandidate(50).minimum, 50, 'bare number normalizes');
  eq(normalizeMinimumCandidate(-3), null, 'negative -> null');
  eq(normalizeMinimumCandidate({ min_charge: '15', name: 'M' }).minimum, 15,
    'string coerces; record resolves min_charge');
  eq(normalizeSetupFee({ setup_fee: 12 }).amount, 12);
  eq(normalizeSetupFee({ setup_fee: 12, include_setup_fee: false }), null,
    'flag false suppresses');

  ok(MINIMUM_FLOOR_MODES.includes('inclusive') && MINIMUM_FLOOR_MODES.includes('exclusive'),
    'floor-mode registry');
  ok(MINIMUM_VALUE_FIELDS.includes('min_charge'), 'minimum field registry');
  ok(SETUP_FEE_VALUE_FIELDS.includes('setup_fee'), 'fee field registry');
  ok(SETUP_FEE_THRESHOLD_FIELDS.includes('setup_fee_threshold_qty'), 'threshold registry');
}

// --------------------------------------------------------------- idempotency
{
  const a1 = applyMinimum(40, 60);
  const a2 = applyMinimum(a1.adjusted, 60);
  eq(a2.delta, 0, 'second applyMinimum is a no-op');
  eq(a2.adjusted, a1.adjusted, 'apply twice = same result');

  const inp = {
    line_subtotal: 33.33, qty: 7,
    part_minimums: [45], modifier_minimums: [{ min_charge: 20 }],
    setup_fees: [12.5, { setup_fee: 6, setup_fee_threshold_qty: 10 }],
  };
  assert.deepEqual(composeOrderMinimums(inp), composeOrderMinimums(inp),
    'compose is deterministic'); n++;

  const c = composeOrderMinimums({ line_subtotal: 40, setup_fees: [15], part_minimums: [60] });
  const replay = composeOrderMinimums({ line_subtotal: c.final_subtotal, part_minimums: [60] });
  eq(replay.final_subtotal, c.final_subtotal,
    're-composing the result with the same floor changes nothing');
  eq(replay.minimum_delta, 0);
}

rmSync(bundlePath, { force: true }); // generated bundle — keep the tree clean

console.log(`PASS setup-fee-compose (${n} asserts: applyMinimum/largest-wins/additive fees/inclusive+exclusive floor scope/qty thresholds/evaluateMinimums gating+aliasing/NaN+negative+empty guards/ties/idempotency)`);
