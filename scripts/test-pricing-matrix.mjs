// F-04/F-05 hardening suite — PricingTierMatrix activation (entity rows ->
// engine rules, effective windows, interpolated qty breaks) + market-mode
// resolution (resolvePricingMode) for base44/shared/pricingEngine.ts.
//
// Run: node scripts/test-pricing-matrix.mjs  ->  PASS pricing matrix
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pricing-matrix.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PRICING_MODES, pickUnitBreak, interpolateUnitBreak,
  matrixRowsToRules, matrixRowToRule, resolvePricingMode, normalizePricingMode,
  resolveTier, pricePart, rowIsEffective, round4,
} = await import(pathToFileURL(out).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const approx = (a, b, msg, tol = 0.0001) => { assert.ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b})`); n += 1; };

// --- Shared fixtures ----------------------------------------------------------
const NOW = '2026-06-15';
const GOLD = { id: 't-gold', tier_name: 'Gold', tier_number: 2 };
const BREAKS = [{ qty: 10, unit_price: 8 }, { qty: 50, unit_price: 6 }, { qty: 100, unit_price: 5 }];

// PricingTierMatrix.jsonc-shaped rows — entity field names verbatim.
const ENT_ROWS = [
  {
    id: 'mx1', name: 'Gold banner chart', status: 'active', customer_tier: 'Gold', category: 'banner',
    markup_pct: 50, minimum_charge: 25, per_unit_breaks: BREAKS,
    effective_from: '2026-01-01', effective_to: '2026-12-31',
    updated_by: 'admin@ccs.example', updated_note: 'seed row', sort_order: 1,
  },
  { id: 'mx2', name: 'Expired promo', status: 'active', customer_tier: 'Gold', markup_pct: 999, effective_from: '2025-01-01', effective_to: '2025-12-31' },
  { id: 'mx3', name: 'Future promo', status: 'active', customer_tier: 'Gold', markup_pct: 888, effective_from: '2027-01-01' },
  { id: 'mx4', name: 'Disabled row', status: 'inactive', customer_tier: 'Gold', markup_pct: 777 },
  { id: 'mx5', name: 'Shop default', markup_pct: 20 },
];

// ============================ A. matrixRowsToRules ============================
{
  const rules = matrixRowsToRules(ENT_ROWS, { now: NOW });
  eq(rules.length, 2, 'A1 inactive + expired + future rows gated out');
  eq(rules[0].id, 'mx1', 'A2 surviving row order preserved');
  eq(rules[1].id, 'mx5');
  const r = rules[0];
  eq(r.customer_tier, 'Gold', 'A3 entity fields preserved verbatim');
  eq(r.category, 'banner');
  eq(r.markup_pct, 50);
  eq(r.minimum_charge, 25);
  eq(r.per_unit_breaks.length, 3);
  eq(r.sort_order, 1);
  eq(r.updated_by, 'admin@ccs.example');
  eq(r.status, 'active', 'A4 status normalized to canonical token');
}
{
  // Date-window boundary semantics on the adaptor gate itself.
  const rows = [
    { id: 'a', name: 'a', markup_pct: 1, effective_to: '2026-06-15' },     // ends today -> live
    { id: 'b', name: 'b', markup_pct: 2, effective_from: '2026-06-15' },   // starts today -> live
    { id: 'c', name: 'c', markup_pct: 3, effective_to: '2026-06-14' },     // ended yesterday -> dead
    { id: 'd', name: 'd', markup_pct: 4, effective_from: '2026-06-16' },   // starts tomorrow -> dead
  ];
  const ids = matrixRowsToRules(rows, { now: NOW }).map((r) => r.id).join(',');
  eq(ids, 'a,b', 'A5 effective_from/to date boundaries: from inclusive, to inclusive');
  eq(matrixRowsToRules(rows, { now: new Date('2026-06-15T12:00:00Z') }).length, 2, 'A6 now accepts Date objects');
  eq(matrixRowsToRules(rows, { now: '2026-06-16T00:30:00Z' }).map((r) => r.id).join(','), 'b,d', 'A7 rolling window re-evaluates at a later now');
}
{
  eq(matrixRowsToRules(null).length, 0, 'A8 non-array input -> empty rules');
  eq(matrixRowsToRules([null, 'x', 7, undefined]).length, 0, 'A9 non-object rows skipped');
  eq(matrixRowsToRules([{}]).length, 1, 'A10 blank row object survives (implicit global default)');
}
{
  // Field-alias reality: admin/imported rows may spell the chart differently.
  const r = matrixRowToRule({ id: 'al', name: 'alias', unit_breaks: [{ qty: 5, price: 3 }, { min_qty: 9, unit_price: 2.5 }] });
  assert.deepEqual(r.per_unit_breaks, [{ qty: 5, unit_price: 3 }, { qty: 9, unit_price: 2.5 }], 'A11 unit_breaks + price/min_qty aliases normalize');
  n += 1;
  const r2 = matrixRowToRule({ id: 'al2', qty_breaks: [{ quantity: 4, price: 1.5 }] });
  assert.deepEqual(r2.per_unit_breaks, [{ qty: 4, unit_price: 1.5 }], 'A12 qty_breaks + quantity alias normalize');
  n += 1;
  const r3 = matrixRowToRule({ id: 'al3', per_unit_breaks: [{ qty: 0, unit_price: 9 }, { qty: 'x', unit_price: 9 }, { qty: 5, unit_price: 'z' }, { qty: 5, unit_price: 4 }] });
  assert.deepEqual(r3.per_unit_breaks, [{ qty: 5, unit_price: 4 }], 'A13 invalid brackets dropped, valid kept');
  n += 1;
  const r4 = matrixRowToRule({ id: 'al4', per_unit_breaks: [{ qty: 0, unit_price: 9 }] });
  eq(r4.per_unit_breaks, undefined, 'A14 emptied break chart removed (markup path unmasked)');
}
{
  // Market vocabulary: entity 'market_based'/'market-based' spellings + retail aliases.
  const r = matrixRowToRule({ id: 'm1', 'pricing_mode': 'market-based', retail: 40, discount_pct: 15 });
  eq(r.pricing_mode, 'market_based', 'A15 hyphen spelling -> canonical market_based');
  eq(r.market_retail, 40, 'A16 retail alias -> market_retail');
  eq(r.market_discount_pct, 15, 'A17 discount_pct alias -> market_discount_pct');
  const r2 = matrixRowToRule({ id: 'm2', pricing_mode: 'market_based', market_retail: 30 });
  eq(r2.pricing_mode, 'market_based', 'A18 market_based token preserved');
}
{
  // Interpolation spellings all land on the canonical interpolate_breaks flag.
  for (const flag of [
    { interpolate_breaks: true }, { interpolate_breaks: 'true' }, { interpolate_breaks: 'linear' },
    { interpolateBreaks: true }, { interpolate: true }, { break_interpolation: 'linear' },
  ]) {
    const r = matrixRowToRule({ id: 'i', markup_pct: 10, per_unit_breaks: BREAKS, ...flag });
    eq(r.interpolate_breaks, true, `A19 interpolation flag ${JSON.stringify(flag)} -> interpolate_breaks`);
  }
  const forced = matrixRowsToRules([{ id: 'f', markup_pct: 10, per_unit_breaks: BREAKS }], { interpolateBreaks: true });
  eq(forced[0].interpolate_breaks, true, 'A20 opts.interpolateBreaks forces the flag');
  const r2 = matrixRowToRule({ id: 'i2', markup_pct: 10, formula_modifiers: [{ type: 'add_flat', value: 2 }] });
  assert.deepEqual(r2.formula_modifiers, [{ type: 'add_flat', value: 2 }], 'A21 formula_modifiers pass through');
  n += 1;
}

// ============================ B. Interpolated qty breaks ======================
{
  eq(pickUnitBreak(BREAKS, 30).unit_price, 8, 'B1 default pick still the 10-bracket (no flag, no interpolation)');
  eq(pickUnitBreak(BREAKS, 30, { interpolate: false }).unit_price, 8, 'B2 interpolate:false explicit = legacy pick');
  const brk = pickUnitBreak(BREAKS, 30, { interpolate: true });
  eq(brk.unit_price, 7, 'B3 mid-bracket lerp: 8 + (6-8) * (30-10)/(50-10) = 7');
  eq(brk.interpolated, true, 'B4 interpolated hit flagged');
  eq(brk.at_qty, 30, 'B5 requested qty echoed for audit');
  eq(brk.qty, 10, 'B6 qty anchors the lower bracket');
  eq(brk.between[0].qty, 10, 'B7 lower anchor exposed');
  eq(brk.between[1].qty, 50, 'B8 upper anchor exposed');
}
{
  eq(interpolateUnitBreak(BREAKS, 10), BREAKS[0], 'B9 exact lower bracket returns the bracket verbatim');
  eq(interpolateUnitBreak(BREAKS, 50), BREAKS[1], 'B10 exact interior bracket verbatim');
  eq(interpolateUnitBreak(BREAKS, 100), BREAKS[2], 'B11 top bracket verbatim');
  eq(interpolateUnitBreak(BREAKS, 5000), BREAKS[2], 'B12 above top bracket clamps (no extrapolation)');
  eq(interpolateUnitBreak(BREAKS, 5), null, 'B13 below first bracket -> null (markup fallback preserved)');
  eq(interpolateUnitBreak(BREAKS, 0), null, 'B14 qty 0 -> null');
  eq(interpolateUnitBreak(BREAKS, -3), null, 'B15 negative qty -> null');
  eq(interpolateUnitBreak(BREAKS, 75).unit_price, 5.5, 'B16 50..100 segment: 6 + (5-6) * (75-50)/50 = 5.5');
}
{
  const messy = [{ qty: 100, unit_price: 5 }, { qty: 10, unit_price: 8 }, { qty: 50, unit_price: 6 }];
  eq(interpolateUnitBreak(messy, 30).unit_price, 7, 'B17 unsorted chart interpolates correctly');
  const dup = [{ qty: 10, unit_price: 8 }, { qty: 10, unit_price: 9 }, { qty: 50, unit_price: 6 }];
  eq(interpolateUnitBreak(dup, 30).unit_price, 7, 'B18 duplicate qty collapses to first-declared');
  eq(interpolateUnitBreak(dup, 10).unit_price, 8, 'B19 exact dup qty -> first-declared bracket');
  const single = [{ qty: 10, unit_price: 8 }];
  eq(interpolateUnitBreak(single, 50).unit_price, 8, 'B20 single bracket behaves as bracket pick above it');
  eq(interpolateUnitBreak(single, 5), null, 'B21 single bracket below -> null');
  const junk = [{ qty: 'x', unit_price: 8 }, { qty: 0, unit_price: 8 }, { qty: -2, unit_price: 8 }, { qty: 10, unit_price: 8 }, { qty: 20, unit_price: 'y' }];
  eq(interpolateUnitBreak(junk, 15).unit_price, 8, 'B22 invalid brackets skipped; only 10->8 remains');
  eq(interpolateUnitBreak(junk, 5), null, 'B23 junk chart below sole bracket -> null');
}
{
  // round4 precision on irrational t: 10->9, 40->7 at qty 20 -> 9 - 2*(10/30) = 8.3333
  const brk = interpolateUnitBreak([{ qty: 10, unit_price: 9 }, { qty: 40, unit_price: 7 }], 20);
  eq(brk.unit_price, 8.3333, 'B24 interpolated unit price rounds to 4 decimals');
}

// ================= C. Interpolation through pricePart =========================
{
  const row = { id: 'ip', name: 'Gold interp', customer_tier: 'Gold', markup_pct: 100, per_unit_breaks: BREAKS, interpolate_breaks: true };
  const rules = matrixRowsToRules([row], { now: NOW });
  let p = pricePart({ qty: 30, unitCost: 10, customerTier: GOLD, tierRules: rules, now: NOW });
  eq(p.priceSource, 'qty_break', 'C1 interpolated row prices as qty_break');
  eq(p.unitPrice, 7, 'C2 interpolated unit price 7 through the full pipeline');
  eq(p.breakApplied.interpolated, true, 'C3 breakApplied carries the interpolation audit');
  eq(p.extended, 210, 'C4 extension = 7 x 30');
  p = pricePart({ qty: 30, unitCost: 10, customerTier: GOLD, tierRules: [row], now: NOW });
  eq(p.unitPrice, 7, 'C5 raw entity row + interpolate_breaks works without the adaptor too');
  p = pricePart({ qty: 5, unitCost: 10, customerTier: GOLD, tierRules: rules, now: NOW });
  eq(p.priceSource, 'markup', 'C6 below first bracket -> markup fallback (100% -> 20)');
  eq(p.unitPrice, 20);
}
{
  // Part-descriptor break chart opts in via interpolate on the descriptor.
  const p = pricePart({ qty: 30, unitCost: 10, tierRules: [], part: { per_unit_breaks: BREAKS, interpolate: true } });
  eq(p.priceSource, 'qty_break', 'C7 part descriptor interpolate flag reaches the break pick');
  eq(p.unitPrice, 7, 'C8 interpolated part chart prices 7');
}
{
  // Market row + interpolated breaks: break only wins when it undercuts market.
  const row = {
    id: 'mi', name: 'Gold market interp', customer_tier: 'Gold', pricing_mode: 'market',
    market_retail: 20, market_discount_pct: 10, interpolate_breaks: true,
    per_unit_breaks: [{ qty: 10, unit_price: 20 }, { qty: 50, unit_price: 10 }],
  };
  let p = pricePart({ qty: 30, unitCost: 10, customerTier: GOLD, tierRules: [row], now: NOW });
  eq(p.priceSource, 'qty_break', 'C9 interpolated break 15 undercuts market 18 -> wins');
  eq(p.unitPrice, 15);
  p = pricePart({ qty: 11, unitCost: 10, customerTier: GOLD, tierRules: [row], now: NOW });
  eq(p.priceSource, 'market', 'C10 interpolated break 19.75 above market 18 -> market wins');
  eq(p.unitPrice, 18);
}

// ================= D. Adapted rows end-to-end (entity reality) =================
{
  const rules = matrixRowsToRules(ENT_ROWS, { now: NOW });
  let t = resolveTier({ tierRules: rules, customerTier: GOLD, category: 'banner', now: NOW });
  eq(t.source, 'customer_tier', 'D1 adapted tier row wins its layer');
  eq(t.rule.markupPct, 50, 'D2 entity markup_pct flows into the rule');
  let p = pricePart({ qty: 1, unitCost: 10, customerTier: GOLD, category: 'banner', tierRules: rules, now: NOW });
  eq(p.minimumApplied, true, 'D3 entity minimum_charge floors a small extension');
  eq(p.extended, 25);
  p = pricePart({ qty: 1, unitCost: 10, customerTier: GOLD, tierRules: rules, now: '2027-01-01' });
  eq(p.unitPrice, 12, 'D4 expired tier row invisible at a later now -> blank default 20%');
  p = pricePart({ qty: 1, unitCost: 10, part: { tier_ref: 'ghost-tier' }, customerTier: GOLD, category: 'banner', tierRules: rules, now: NOW });
  eq(p.danglingTierRef, 'ghost-tier', 'D5 dangling part tier_ref still surfaces through adapted rules');
}

// ============================ E. resolvePricingMode ===========================
{
  eq(PRICING_MODES.MARKET_BASED, 'market_based', 'E1 activation token exported');
  eq(PRICING_MODES.FIXED, 'fixed');
  eq(normalizePricingMode('tier'), 'cost_plus', 'E2 PricingMode entity tier -> cost_plus');
  eq(normalizePricingMode('market'), 'market_based');
  eq(normalizePricingMode('MARKET_BASED'), 'market_based');
  eq(normalizePricingMode('fixed'), 'fixed');
  eq(normalizePricingMode('per_piece'), null, 'E3 inventory unit enum is NOT a pricing family');
  eq(normalizePricingMode('bogus'), null);
  eq(normalizePricingMode(null), null);
}
{
  let m = resolvePricingMode({});
  eq(m.mode, 'cost_plus', 'E4 no config -> cost_plus fallback');
  eq(m.source, 'default');
  m = resolvePricingMode({ globalDefault: 'market_based' });
  eq(m.mode, 'market_based', 'E5 bare-string global default resolves');
  eq(m.source, 'global');
  eq(m.via, 'value');
  m = resolvePricingMode({ globalDefault: { active_mode: 'tier' } });
  eq(m.mode, 'cost_plus', 'E6 PricingMode entity tier -> cost_plus');
  eq(m.source, 'global');
  eq(m.via, 'active_mode');
  m = resolvePricingMode({ globalDefault: { active_mode: 'cost_plus' } });
  eq(m.mode, 'cost_plus', 'E7 PricingMode entity cost_plus');
}
{
  // Template layer beats global; part layer beats template.
  let m = resolvePricingMode({ template: { market_based: true }, globalDefault: { active_mode: 'tier' } });
  eq(m.mode, 'market_based', 'E8 template market_based beats global tier');
  eq(m.source, 'template');
  eq(m.via, 'market_based');
  m = resolvePricingMode({ template: { pricing_mode: 'market' } });
  eq(m.mode, 'market_based', 'E9 template explicit pricing_mode resolves');
  eq(m.via, 'pricing_mode');
  m = resolvePricingMode({ part: { market_retail: 25 }, template: { market_based: false } });
  eq(m.mode, 'market_based', 'E10 part market_retail signal -> market_based');
  eq(m.source, 'part');
  eq(m.via, 'market_retail');
  m = resolvePricingMode({ part: { fixed_price: 9.5 }, template: { market_based: true }, globalDefault: 'market_based' });
  eq(m.mode, 'fixed', 'E11 part fixed_price beats template + global market');
  eq(m.source, 'part');
  eq(m.via, 'fixed_price');
  m = resolvePricingMode({ part: { pricing_mode: 'cost_plus', market_retail: 25 }, template: { market_based: true }, globalDefault: 'market_based' });
  eq(m.mode, 'cost_plus', 'E12 explicit part token beats part market data + lower layers');
  eq(m.via, 'pricing_mode');
  m = resolvePricingMode({ part: { market_based: true }, template: { pricing_mode: 'cost_plus' } });
  eq(m.mode, 'market_based', 'E13 part market flag beats template cost_plus');
}
{
  // The unit-enum trap: part.pricing_mode='per_piece' must not resolve as a family.
  let m = resolvePricingMode({ part: { pricing_mode: 'per_piece' }, globalDefault: { active_mode: 'tier' } });
  eq(m.mode, 'cost_plus', 'E14 per_piece unit enum falls through to global');
  eq(m.source, 'global');
  m = resolvePricingMode({ part: { pricing_mode: 'per_roll', market_retail: 30 } });
  eq(m.mode, 'market_based', 'E15 unrecognized unit token skipped; market data still resolves');
  eq(m.via, 'market_retail');
}
{
  // Bound tier_ref resolves to the bound chart row's family.
  const rules = matrixRowsToRules([
    { id: 'r-mkt', name: 'market row', customer_tier: 'Gold', pricing_mode: 'market_based', market_retail: 30, market_discount_pct: 10 },
    { id: 'r-mu', name: 'markup row', customer_tier: 'Gold', markup_pct: 40 },
  ], { now: NOW });
  let m = resolvePricingMode({ part: { tier_ref: 'r-mkt' }, tierRules: rules, globalDefault: 'cost_plus' });
  eq(m.mode, 'market_based', 'E16 tier_ref -> bound market row -> market_based');
  eq(m.via, 'tier_ref');
  eq(m.raw.id, 'r-mkt', 'E17 matched row echoed in raw');
  m = resolvePricingMode({ part: { tier_ref: 'r-mu' }, tierRules: rules });
  eq(m.mode, 'cost_plus', 'E18 tier_ref -> bound markup row -> cost_plus');
  m = resolvePricingMode({ part: { tier_ref: 'ghost' }, tierRules: rules, template: { market_based: true } });
  eq(m.mode, 'market_based', 'E19 dangling tier_ref resolves nothing -> template layer');
  eq(m.source, 'template');
  m = resolvePricingMode({ part: 'market_based' });
  eq(m.mode, 'market_based', 'E20 bare-string part descriptor resolves');
  eq(m.source, 'part');
}

// ============================ F. Determinism ===================================
{
  const rules = matrixRowsToRules(ENT_ROWS, { now: NOW });
  assert.deepEqual(matrixRowsToRules(ENT_ROWS, { now: NOW }), rules, 'F1 adaptor deterministic');
  n += 1;
  const input = { qty: 30, unitCost: 10, customerTier: GOLD, category: 'banner', tierRules: rules, now: NOW };
  assert.deepEqual(pricePart(input), pricePart(input), 'F2 pricePart deterministic on adapted rows');
  n += 1;
  assert.deepEqual(
    resolvePricingMode({ part: { market_based: true }, template: { market_based: false }, globalDefault: 'cost_plus' }),
    resolvePricingMode({ part: { market_based: true }, template: { market_based: false }, globalDefault: 'cost_plus' }),
    'F3 resolvePricingMode deterministic',
  );
  n += 1;
}

console.log(`PASS pricing matrix (${n} assertions)`);
