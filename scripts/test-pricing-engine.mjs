import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pricing-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  TIER_PRECEDENCE, round2, round4, pickUnitBreak, applyFormulaModifiers,
  resolveTier, pricePart, priceLines, rowIsEffective,
} = await import(pathToFileURL(out).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };

// --- Shared fixtures ----------------------------------------------------------
const tierGold = { id: 't1', tier_name: 'Gold', tier_number: 2 };
const RULES = [
  { id: 'r-tier', name: 'Gold banner', customer_tier: 'Gold', category: 'banner', markup_pct: 50, minimum_charge: 25 },
  { id: 'r-tier2', name: 'Gold flat', customer_tier: 2, markup_pct: 40 },               // tier-only
  { id: 'r-cat', name: 'Banner default', category: 'banner', markup_pct: 30 },          // category default
  { id: 'r-blank', name: 'Shop default', markup_pct: 20 },                              // blank/blank
  { id: 'zz-id', name: 'Id-keyed', customer_tier: 't1', markup_pct: 33 },               // pins the tier by record id (id sorts last in tiebreaks)
  { id: 'r-off', name: 'Inactive', customer_tier: 'Gold', markup_pct: 999, status: 'inactive' },
];

// --- TIER_PRECEDENCE order ------------------------------------------------------
eq([...TIER_PRECEDENCE].join('>'), 'global_default>customer_tier>part_tier>part_fixed>machine_override',
  'precedence ladder is base->override');

// --- resolveTier: each layer demonstrably wins ---------------------------------
let t = resolveTier({ tierRules: RULES, defaultMarkupPct: 10 });
eq(t.source, 'global_default', 'no rules hit -> global default');
eq(t.rule.markupPct, 20, 'blank chart row supplies default markup');
eq(t.trace.filter((s) => s.won).length, 1, 'exactly one trace step wins');

t = resolveTier({ tierRules: RULES, category: 'banner', defaultMarkupPct: 10 });
eq(t.trace[0].detail, 'category_row', 'category default row beats blank row');
eq(t.rule.markupPct, 30, 'category row markup wins default layer');

t = resolveTier({ tierRules: RULES, category: 'banner', customerTier: tierGold });
eq(t.source, 'customer_tier', 'tier-pinning row beats category default');
eq(t.rule.markupPct, 50, 'category+tier row markup used');
eq(t.rule.minimumCharge, 25, 'row minimum carried into rule');
eq(t.matchedRow.id, 'r-tier', 'matched row echoed for audit');

t = resolveTier({ tierRules: RULES, category: 'shirts', customerTier: tierGold });
eq(t.source, 'customer_tier', 'tier-only row wins when no category row fits');
eq(t.rule.markupPct, 40, 'tier-only markup used (banner cat row does not fit shirts)');

t = resolveTier({ tierRules: RULES, category: 'shirts', customerTier: { tier_number: 2 } });
eq(t.source, 'customer_tier', 'bare tier_number still reaches the tier layer');
eq(t.rule.markupPct, 40, 'tier key matches on tier_number (number-keyed row)');
t = resolveTier({ tierRules: RULES, customerTier: 't1' });
eq(t.source, 'customer_tier', 'bare record id reaches the tier layer');
eq(t.rule.markupPct, 33, 'tier key matches on id');

t = resolveTier({
  tierRules: RULES, category: 'banner', customerTier: tierGold,
  part: { tier_ref: 'r-blank' },
});
eq(t.source, 'part_tier', 'part tier ref beats customer tier');
eq(t.rule.markupPct, 20, 'part-bound chart row supplies markup');

t = resolveTier({
  tierRules: RULES, category: 'banner', customerTier: tierGold,
  part: { tier_ref: 'r-blank', fixed_price: 7.5 },
});
eq(t.source, 'part_fixed', 'part fixed price beats part tier');
eq(t.rule.kind, 'fixed');
eq(t.rule.fixedPrice, 7.5);

t = resolveTier({
  tierRules: RULES, category: 'banner', customerTier: tierGold,
  part: { fixed_price: 7.5 },
  machine: { markup_pct: 90 },
});
eq(t.source, 'machine_override', 'machine override beats part fixed');
eq(t.rule.markupPct, 90);

t = resolveTier({ machine: { fixed_price: 3 }, part: { fixed_price: 5 }, customerTier: tierGold, tierRules: RULES });
eq(t.source, 'machine_override', 'machine fixed is the strongest layer');
eq(t.trace[3].won, true, 'machine step marked won in trace');
eq(t.trace[2].hit, true, 'part step still records a hit (overridden, not hidden)');

t = resolveTier({ part: { tier_ref: 'ghost-tier' }, customerTier: tierGold, tierRules: RULES });
eq(t.source, 'part_tier', 'dangling part tier ref still claims the layer');
eq(t.rule.danglingTierRef, 'ghost-tier', 'dangling ref reported, not silently dropped');

// --- F-27 k1 parity locks: chart rows resolve on legacy matchSpecificity -----
// cat+tier (3) > cat-only (2) > tier-only (1) > blank (0) — a category row
// outranks a BARE customer_tier row (the old engine reversed this pair).
t = resolveTier({ tierRules: RULES, category: 'banner', customerTier: { tier_number: 2 } });
eq(t.source, 'global_default', 'F-27 k1: cat-only row outranks tier-only row');
eq(t.rule.markupPct, 30, 'F-27 k1: category markup 30 wins, not tier markup 40');
eq(t.matchedRow.id, 'r-cat', 'F-27 k1: matched row echoed is the category row');
t = resolveTier({
  tierRules: [
    { id: 'a-cat', category: 'banner', markup_pct: 30 },
    { id: 'z-tier', customer_tier: 'Gold', markup_pct: 99, effective_from: '2026-01-01' },
  ],
  category: 'banner', customerTier: tierGold, now: '2026-06-01',
});
eq(t.rule.markupPct, 30, 'F-27 k1: newer tier-only row still loses to category row');
t = resolveTier({ tierRules: RULES, category: 'banner', customerTier: tierGold });
eq(t.matchedRow.id, 'r-tier', 'F-27 k1: cat+tier (3) still outranks cat-only (2)');

// F-23 markup-0: an explicit markup_pct:0 part descriptor is a REAL override —
// sell at cost (0% markup), beating chart tiers and the shop default markup.
t = resolveTier({ part: { markup_pct: 0 }, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(t.rule.markupPct, 0, 'explicit markup_pct 0 -> 0% markup rule');
eq(t.source, 'part_tier', 'part markup layer claims the win over the tier chart');
eq(t.trace.find((s) => s.layer === 'part').hit, true, 'part layer marked hit');

t = resolveTier({ machine: { markup_pct: 0 }, part: { markup_pct: 50 }, tierRules: RULES });
eq(t.rule.markupPct, 0, 'machine markup_pct 0 overrides part markup');
eq(t.source, 'machine_override');

// --- pricePart: markup / fixed / breaks / market --------------------------------
let p = pricePart({ qty: 4, unitCost: 10, tierRules: RULES, defaultMarkupPct: 10 });
eq(p.unitPrice, 12, 'blank-row markup: 10 x 1.20');
eq(p.extended, 48);
eq(p.total, 48);
eq(p.priceSource, 'markup');

p = pricePart({ qty: 2, unitCost: 10, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(p.unitPrice, 15, 'tier markup 50% -> 15');
eq(p.extended, 30);
eq(p.minimumApplied, false, 'extension 30 >= minimum 25 -> no floor');

// markup_pct:0 on the part descriptor pins the unit price at cost — the
// explicit sell-at-cost signal replaces (not blends with) the tier chart.
p = pricePart({ qty: 2, unitCost: 10, part: { markup_pct: 0 }, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(p.unitPrice, 10, 'explicit markup_pct 0 sells at cost, not tier markup 50%');
eq(p.priceSource, 'markup');
eq(p.tier.source, 'part_tier', 'part_tier provenance');
eq(p.extended, 20, 'extension = raw cost');

// A bare markup_pct:0 descriptor against an empty chart: cost passthrough of
// the sell price via the markup rule (0% = cost, still an authored override).
p = pricePart({ qty: 1, unitCost: 10, part: { markup_pct: 0 }, tierRules: [], defaultMarkupPct: 75 });
eq(p.unitPrice, 10, 'markup_pct 0 beats the shop default markup too');
eq(p.tier.source, 'part_tier');

// Wire spelling parity (F-23 residual): the detection layer counts markup /
// markup_percent as config — the engine must PRICE them identically or a
// descriptor carrying a tolerated spelling repriced at the default markup.
p = pricePart({ qty: 1, unitCost: 10, part: { markup: 25 }, tierRules: [], defaultMarkupPct: 75 });
eq(p.unitPrice, 12.5, 'markup spelling prices at 25%, not default 75%');
eq(p.priceSource, 'markup');
p = pricePart({ qty: 1, unitCost: 10, part: { markup_percent: 40 }, tierRules: [], defaultMarkupPct: 75 });
eq(p.unitPrice, 14, 'markup_percent spelling prices at 40%, not default 75%');
eq(p.priceSource, 'markup');
p = pricePart({ qty: 1, unitCost: 10, part: { markup: 0 }, tierRules: [], defaultMarkupPct: 75 });
eq(p.unitPrice, 10, 'markup:0 spelling also pins sell-at-cost');

p = pricePart({ qty: 1, unitCost: 10, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(p.extension, 15);
eq(p.minimumApplied, true, 'extension 15 < minimum 25 -> floored');
eq(p.extended, 25);

p = pricePart({ qty: 0, unitCost: 10, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(p.extended, 0, 'zero qty -> zero extension, minimum never fires');
eq(p.minimumApplied, false);

p = pricePart({ qty: 1, unitCost: 10, minimumCharge: 100, tierRules: [] });
eq(p.extended, 100, 'caller minimumCharge floors extension with no rules');
p = pricePart({ qty: 1, unitCost: 10, minimumCharge: 5, customerTier: tierGold, category: 'banner', tierRules: RULES });
eq(p.minimumCharge, 25, 'rule minimum outranks a lower caller floor');

// qty-break chart: highest qualifying bracket wins
const BREAKS = [{ qty: 10, unit_price: 8 }, { qty: 50, unit_price: 6 }, { qty: 100, unit_price: 5 }];
eq(pickUnitBreak(BREAKS, 75).unit_price, 6, 'qty 75 -> 50-bracket');
eq(pickUnitBreak(BREAKS, 5), null, 'below first bracket -> no break');

const BREAK_RULE = [{ id: 'rb', customer_tier: 'Gold', markup_pct: 100, per_unit_breaks: BREAKS }];
p = pricePart({ qty: 60, unitCost: 10, customerTier: tierGold, tierRules: BREAK_RULE });
eq(p.priceSource, 'qty_break', 'qualifying break beats markup outright');
eq(p.unitPrice, 6);
eq(p.extended, 360);
p = pricePart({ qty: 3, unitCost: 10, customerTier: tierGold, tierRules: BREAK_RULE });
eq(p.priceSource, 'markup', 'no qualifying break -> markup fallback');

// fixed price ignores breaks entirely
p = pricePart({ qty: 60, unitCost: 10, part: { fixed_price: 9, per_unit_breaks: BREAKS } });
eq(p.priceSource, 'fixed_price');
eq(p.unitPrice, 9, 'fixed unit price wins over the part break chart');

// part-level break chart as its own override layer
p = pricePart({ qty: 60, unitCost: 10, customerTier: tierGold, tierRules: RULES, part: { per_unit_breaks: BREAKS } });
eq(p.tier.source, 'part_tier');
eq(p.priceSource, 'qty_break');
eq(p.unitPrice, 6, 'part break chart prices the line');

// market mode: retail x (1 - discount) ; break wins only when cheaper
const MKT = [{
  id: 'rm', customer_tier: 'Gold', pricing_mode: 'market',
  market_retail: 20, market_discount_pct: 10, per_unit_breaks: BREAKS, minimum_charge: 0,
}];
p = pricePart({ qty: 5, unitCost: 10, customerTier: tierGold, tierRules: MKT });
eq(p.priceSource, 'market');
eq(p.unitPrice, 18, 'market unit = 20 x 0.90');
p = pricePart({ qty: 60, unitCost: 10, customerTier: tierGold, tierRules: MKT });
eq(p.priceSource, 'qty_break');
eq(p.unitPrice, 6, 'break undercuts market -> wins');
const MKT_EXPENSIVE_BREAK = [{
  id: 'rm2', customer_tier: 'Gold', pricing_mode: 'market',
  market_retail: 20, market_discount_pct: 10, per_unit_breaks: [{ qty: 1, unit_price: 19 }],
}];
p = pricePart({ qty: 5, unitCost: 10, customerTier: tierGold, tierRules: MKT_EXPENSIVE_BREAK });
eq(p.priceSource, 'market', 'break above market price loses');
eq(p.unitPrice, 18);

// --- F-27 k2 parity locks: market_retail <= 0 / non-finite is absent ---------
// Legacy requires retail > 0 to take the market path; a zero/negative retail
// falls back to the row's markup — never prices the unit at $0.
p = pricePart({ qty: 2, unitCost: 10, tierRules: [{ id: 'mz0', pricing_mode: 'market', market_retail: 0, market_discount_pct: 10, markup_pct: 30 }] });
eq(p.priceSource, 'markup', 'F-27 k2: market_retail 0 treated as absent');
eq(p.unitPrice, 13, 'F-27 k2: markup_pct 30 prices the unit, not $0 retail');
p = pricePart({ qty: 2, unitCost: 10, tierRules: [{ id: 'mzn', pricing_mode: 'market', market_retail: -50, markup_pct: 30 }] });
eq(p.priceSource, 'markup', 'F-27 k2: negative market_retail also absent');
eq(p.unitPrice, 13);
p = pricePart({ qty: 2, unitCost: 10, part: { pricing_mode: 'market', market_retail: 0, markup_pct: 25 } });
eq(p.priceSource, 'markup', 'F-27 k2: part-descriptor retail 0 falls to markup');
eq(p.unitPrice, 12.5);
p = pricePart({ qty: 2, unitCost: 10, tierRules: [{ id: 'mzx', pricing_mode: 'market', market_retail: 'x', markup_pct: 30 }] });
eq(p.priceSource, 'markup', 'F-27 k2: non-finite market_retail absent too');

// --- modifiers ------------------------------------------------------------------
let m = applyFormulaModifiers(100, [
  { type: 'add_pct', value: 10 }, { type: 'mul', value: 0.5 },
  { type: 'add_flat', value: 5 }, { type: 'min', value: 70 }, { type: 'max', value: 65 },
]);
eq(m.unitPrice, 65, 'modifiers run left-to-right: 110 -> 55 -> 60 -> 70 -> 65');
eq(m.applied.length, 5, 'audit entry per applied modifier');
m = applyFormulaModifiers(10, [{ type: 'add_pct', value: -200 }]);
eq(m.unitPrice, 0, 'modifiers clamp at zero');
m = applyFormulaModifiers(10, [{ type: 'bogus', value: 5 }, { value: 'x' }]);
eq(m.unitPrice, 10, 'unknown/non-finite modifiers skipped');

const MOD_RULE = [{ id: 'rmod', customer_tier: 'Gold', markup_pct: 0, formula_modifiers: [{ type: 'add_flat', value: 2 }] }];
p = pricePart({ qty: 1, unitCost: 10, customerTier: tierGold, tierRules: MOD_RULE, modifiers: [{ type: 'mul', value: 2 }] });
eq(p.unitPrice, 24, 'rule modifiers run before caller modifiers: (10+2) x 2');
eq(p.modifiersApplied.length, 2);

// --- minimums / setup fee / tax ---------------------------------------------------
p = pricePart({ qty: 1, unitCost: 10, customerTier: tierGold, category: 'banner', tierRules: RULES, setupFee: 40 });
eq(p.extended, 25, 'minimum floors the goods extension');
eq(p.subtotal, 65, 'setup fee added after the floor');
p = pricePart({ qty: 1, unitCost: 10, tierRules: [], setupFee: 40, taxPercent: 6 });
eq(p.subtotal, 50);
eq(p.tax, 3, 'tax applies to extension + setup fee');
eq(p.total, 53);
p = pricePart({ qty: 1, unitCost: 10, tierRules: [], taxable: false, taxPercent: 6 });
eq(p.tax, 0, 'taxable:false exempts the line');
eq(p.total, 10);
p = pricePart({ qty: 3, unitCost: 10, tierRules: [], taxPercent: 8.25 });
eq(p.subtotal, 30);
eq(p.tax, 2.48, 'tax rounds to cents');
eq(p.total, 32.48);

// --- effective windows / inactive rows ---------------------------------------------
ok(rowIsEffective({ effective_from: '2026-01-01', effective_to: '2026-12-31' }, '2026-06-01'), 'inside window');
ok(!rowIsEffective({ effective_from: '2026-07-01' }, '2026-06-01'), 'before window');
ok(!rowIsEffective({ effective_to: '2026-05-31' }, '2026-06-01'), 'after window');
t = resolveTier({ tierRules: RULES, customerTier: tierGold, defaultMarkupPct: 10 });
ok(t.rule.markupPct !== 999, 'inactive tier row never wins');

// --- priceLines roll-up --------------------------------------------------------------
const agg = priceLines({
  customerTier: tierGold, tierRules: RULES, taxPercent: 6,
  lines: [
    { label: 'A', category: 'banner', qty: 1, unitCost: 10 },              // min-floored 25
    { label: 'B', category: 'other', qty: 2, unitCost: 10, taxable: false }, // 2 x 14 = 28
  ],
});
eq(agg.lines.length, 2);
eq(agg.extended, 53);
eq(agg.tax, 1.5, 'tax only on the taxable line (25 x 6%)');
eq(agg.total, 54.5);
eq(agg.minimumsApplied.length, 1);
eq(agg.minimumsApplied[0].label, 'A');

// --- determinism / robustness ---------------------------------------------------------
const input = { qty: 12, unitCost: 3.33, customerTier: tierGold, category: 'banner', tierRules: RULES, taxPercent: 7 };
assert.deepEqual(pricePart(input), pricePart(input), 'same input -> identical output'); n += 1;
p = pricePart({ qty: 'x', unitCost: 'y', tierRules: RULES });
eq(p.total, 0, 'non-finite inputs coerce to 0, never NaN');

// --- F-27 k3 parity locks: negative qty/cost pass through unclamped ----------
// Legacy num() never clamps — a negative qty (or cost) produces a negative
// extension; minimums still never fire on extension <= 0.
p = pricePart({ qty: -5, unitCost: 10 });
eq(p.extended, -50, 'F-27 k3: negative qty -> negative extension');
eq(p.qty, -5, 'F-27 k3: qty echoed unclamped');
eq(p.minimumApplied, false, 'F-27 k3: minimum never fires on negative extension');
ok(Number.isFinite(p.total), 'F-27 k3: negative extension stays finite, never NaN');
p = pricePart({ qty: 5, unitCost: -10 });
eq(p.extended, -50, 'F-27 k3: negative unitCost passes through too');
p = pricePart({ qty: -5, unitCost: 10, minimumCharge: 100 });
eq(p.extended, -50, 'F-27 k3: caller minimum still never fires on qty <= 0');
eq(p.minimumApplied, false);
eq(round2(2.675), 2.68, 'round2 cents');
eq(round4(1.23456), 1.2346, 'round4 unit precision');

console.log(`PASS pricing engine (${n} assertions)`);
