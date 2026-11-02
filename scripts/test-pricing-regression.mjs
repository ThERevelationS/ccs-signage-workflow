import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// N-02 — pricing engine regression suite.
//
// Contract under test: the new shared engine (base44/shared/pricingEngine.ts)
// is a drop-in replacement for the existing frontend pricing math. With NO
// tier/matrix/template configuration it must produce IDENTICAL totals to what
// the frontend modules produce on the same cost inputs — and where a legacy
// configuration shape maps into the engine's inputs (PricingTierMatrix rows ->
// tierRules, snapshot price -> part.fixed_price, multiplier -> markup_pct,
// volume discount -> mul modifier, PricingTemplate breaks -> per_unit_breaks),
// the totals must stay identical.
//
// Legacy fixture sources (all esbuild-bundled like test-pricing-engine.mjs):
//   src/components/pricing/pricingEngine.js   resolveEffectivePrice / priceQuote
//   src/components/estimator/aioPricing.js    computePricing waterfall
//   src/components/estimator/customerPricing.js  snapshot + module economics
//   src/components/markup/markupEngine.jsx    applyMarkups / applyCostPlus /
//                                             priceForTargetMargin
//
// Tolerance: delta < $0.005 per case (legacy modules return unrounded floats;
// the shared engine round4s unit prices and round2s money — clean fixtures give
// delta 0, irrational ratios stay under half a cent).
// Known semantic divergences (documented, flagged — NOT parity failures):
//   K1  tier-only chart row vs category-only row on the same request: legacy
//       resolveMatrixRow specificity (cat-only spec 2 > tier-only spec 1) lets
//       the category row win; shared TIER_PRECEDENCE puts any tier-pinning row
//       in the stronger customer_tier layer (pricingEngine.ts:40-47 vs
//       src/components/pricing/pricingEngine.js:66-77).
//   K2  market_retail: 0 — shared marketKind() accepts any finite retail and
//       prices the unit at 0; legacy requires retail > 0 and falls back to the
//       markup path (pricingEngine.ts:185-186 vs pricingEngine.js:288).
//   K3  negative qty/cost — shared clamps to >= 0 (pricingEngine.ts:381-382);
//       legacy num() passes negatives through to negative extensions.

const here = dirname(fileURLToPath(import.meta.url));
const tmpBundles = [];
const bundle = (entry, outName) => {
  const out = resolve(here, outName);
  buildSync({
    entryPoints: [resolve(here, entry)],
    bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  });
  tmpBundles.push(out);
  return out;
};

const eng = await import(pathToFileURL(bundle('../base44/shared/pricingEngine.ts', '.tmp-w27-eng-pricing.mjs')).href);
const fe = await import(pathToFileURL(bundle('../src/components/pricing/pricingEngine.js', '.tmp-w27-fe-pricing.mjs')).href);
const aio = await import(pathToFileURL(bundle('../src/components/estimator/aioPricing.js', '.tmp-w27-aio.mjs')).href);
const cust = await import(pathToFileURL(bundle('../src/components/estimator/customerPricing.js', '.tmp-w27-cust.mjs')).href);
const mk = await import(pathToFileURL(bundle('../src/components/markup/markupEngine.jsx', '.tmp-w27-markup.mjs')).href);

const TOL = 0.005;
let cases = 0;
let maxDelta = 0;
const flags = [];
const fmt = (n) => Number(n).toFixed(4);

// One parity check: engine total vs legacy-produced total on the same inputs.
const check = (id, name, engineTotal, legacyTotal, source, expect = null) => {
  const delta = Math.abs(engineTotal - legacyTotal);
  assert.ok(
    Number.isFinite(engineTotal) && Number.isFinite(legacyTotal),
    `${id} ${name}: non-finite total (engine=${engineTotal}, legacy=${legacyTotal})`,
  );
  assert.ok(
    delta < TOL,
    `${id} ${name}: engine=${engineTotal} vs legacy=${legacyTotal} -> delta ${delta} >= ${TOL}`,
  );
  if (expect != null) {
    assert.ok(
      Math.abs(engineTotal - expect) < TOL,
      `${id} ${name}: expected ~${expect}, engine gave ${engineTotal}`,
    );
  }
  maxDelta = Math.max(maxDelta, delta);
  cases += 1;
  console.log(`  ok ${id} ${name} [${source}] engine=${fmt(engineTotal)} legacy=${fmt(legacyTotal)} Δ=${fmt(delta)}`);
};

// A documented divergence: the engines MUST differ in the expected direction,
// so a future change that silently converges (or widens) the semantics fails.
const diverge = (id, name, engineTotal, legacyTotal, cause, direction = 'gt') => {
  const delta = Math.abs(engineTotal - legacyTotal);
  const holds = direction === 'gt' ? engineTotal > legacyTotal : engineTotal < legacyTotal;
  assert.ok(
    delta >= TOL && holds,
    `${id} ${name}: expected divergence (${direction}) but got engine=${engineTotal} legacy=${legacyTotal}`,
  );
  cases += 1;
  flags.push({ id, name, engineTotal, legacyTotal, delta, cause });
  console.log(`FLAG ${id} ${name} :: engine=${fmt(engineTotal)} legacy=${fmt(legacyTotal)} Δ=${fmt(delta)} — ${cause}`);
};

// Run the same line through both engines. `matrices` feeds legacy `matrices:`
// and shared `tierRules:` verbatim — identical row objects, identical inputs.
const runBoth = (args = {}) => {
  const {
    label = 'L', category = '', qty = 0, unitCost = 0, customerTier = null,
    matrices = [], defaultMarkupPct = 0, modifiers, now,
    // engine-only inputs — caller asserts the legacy equivalent separately
    part, machine, minimumCharge, setupFee, taxPercent, taxable,
  } = args;
  const e = eng.pricePart({
    label, category, qty, unitCost, customerTier, tierRules: matrices,
    defaultMarkupPct, modifiers, now, part, machine, minimumCharge,
    setupFee, taxPercent, taxable,
  });
  const l = fe.resolveEffectivePrice({
    label, category, qty, unitCost, customerTier, matrices,
    defaultMarkupPct, modifiers, now,
  });
  return { e, l };
};

// --- Shared fixtures ----------------------------------------------------------
// MarkupTier-like records (tier_key matching exercises tier_name/id/number).
const GOLD = { id: 't-gold', tier_name: 'Gold', tier_number: 2 };
const SILVER = { id: 't-silver', tier_name: 'Silver', tier_number: 1 };

// PricingTierMatrix-shaped rows (see base44/entities/PricingTierMatrix.jsonc):
const ROW_BANNER = { id: 'p1', name: 'Banner shop default', category: 'banner', markup_pct: 35, minimum_charge: 20 };
const ROW_GOLD_BANNER = {
  id: 'p2', name: 'Gold banner chart', category: 'banner', customer_tier: 'gold',
  markup_pct: 60, minimum_charge: 30,
  per_unit_breaks: [{ qty: 10, unit_price: 8 }, { qty: 50, unit_price: 6 }, { qty: 100, unit_price: 5 }],
};
const ROW_GOLD_TIER = { id: 'p3', name: 'Gold tierwide', customer_tier: 'gold', markup_pct: 45 };
const ROW_BLANK = { id: 'p4', name: 'Global fallback', markup_pct: 15 };
const ROW_GOLD_SIGNS_MARKET = {
  id: 'p5', name: 'Gold signs market', category: 'signs', customer_tier: 'gold',
  pricing_mode: 'market', market_retail: 50, market_discount_pct: 12, minimum_charge: 60,
  per_unit_breaks: [{ qty: 10, unit_price: 40 }, { qty: 5, unit_price: 45 }],
};
const ROW_SIGNS_MARKET = {
  id: 'p6', name: 'Signs market (untiered)', category: 'signs',
  pricing_mode: 'market', market_retail: 50, market_discount_pct: 12,
};

console.log('pricing-regression: shared engine vs legacy frontend modules (tolerance < $0.005)');

// ============================ A. NO-CONFIG BASELINE ==========================
// Headline contract: zero tier/matrix/template config -> identical totals.
// matrices: [] / tierRules: [] on every call; markup only via defaultMarkupPct.
{
  const grid = [
    { qty: 1, unitCost: 10 }, { qty: 3, unitCost: 12.5 }, { qty: 12, unitCost: 33.33 },
    { qty: 250, unitCost: 0.4 }, { qty: 7, unitCost: 0 }, { qty: 1000, unitCost: 1.99 },
  ];
  grid.forEach((g, i) => {
    const { e, l } = runBoth({ ...g, category: 'banner', customerTier: GOLD, matrices: [] });
    check(`a${i + 1}`, `no-config passthrough qty=${g.qty} cost=${g.unitCost}`, e.extended, l.extended, 'pricingEngine.js');
  });
}
// defaultMarkupPct is a scalar fallback both APIs share — flat markup, no rows.
{
  const { e, l } = runBoth({ qty: 4, unitCost: 10, matrices: [], defaultMarkupPct: 50 });
  check('a7', 'no-config default markup 50%', e.extended, l.extended, 'pricingEngine.js', 60);
}
{
  const { e, l } = runBoth({ qty: 7, unitCost: 33.33, matrices: [], defaultMarkupPct: 25 });
  check('a8', 'no-config default markup 25% (round4 unit)', e.extended, l.extended, 'pricingEngine.js', 291.64);
}
// absent config == explicit empty config on the shared engine, and both match legacy.
{
  const omitted = eng.pricePart({ qty: 4, unitCost: 10, defaultMarkupPct: 50 });
  const explicit = eng.pricePart({ qty: 4, unitCost: 10, tierRules: [], defaultMarkupPct: 50 });
  assert.deepEqual(omitted, explicit, 'absent tierRules must equal tierRules: []');
  const { l } = runBoth({ qty: 4, unitCost: 10, matrices: [], defaultMarkupPct: 50 });
  check('a9', 'absent-config == empty-config == legacy', omitted.total, l.extended, 'pricingEngine.js', 60);
}
// non-finite inputs -> both engines produce 0, never NaN.
{
  const { e, l } = runBoth({ qty: 'x', unitCost: 'y', matrices: [] });
  check('a10', 'non-finite inputs -> 0 both', e.extended, l.extended, 'pricingEngine.js', 0);
}
// qty 0 -> extension 0; a configured minimum still never fires.
{
  const e = eng.pricePart({ qty: 0, unitCost: 10, tierRules: [], minimumCharge: 100 });
  const l = fe.resolveEffectivePrice({ qty: 0, unitCost: 10, matrices: [{ markup_pct: 50, minimum_charge: 100 }] });
  check('a11', 'zero qty: minimum never fires', e.extended, l.extended, 'pricingEngine.js', 0);
}
// empty quote roll-up: aioPricing with no line_items vs priceLines with no lines.
{
  const lq = aio.computePricing({ line_items: [], discount_percent: 50 });
  const el = eng.priceLines({ lines: [], tierRules: [] });
  check('a12', 'empty quote -> 0', el.total, lq.quoteTotal, 'aioPricing.js', 0);
}

// ============================ B. FLAT MARKUP PARITY ==========================
{
  const { e, l } = runBoth({ qty: 4, unitCost: 10, category: 'banner', customerTier: SILVER, matrices: [ROW_BANNER] });
  check('b1', 'category row markup 35%', e.extended, l.extended, 'pricingEngine.js', 54);
}
{
  // cat+tier row (spec 3 / scoped tier layer) beats cat row in both engines.
  const { e, l } = runBoth({ qty: 3, unitCost: 10, category: 'banner', customerTier: GOLD, matrices: [ROW_BANNER, ROW_GOLD_BANNER] });
  check('b2', 'cat+tier row beats cat row', e.extended, l.extended, 'pricingEngine.js', 48);
}
{
  // tier-only row vs blank row: identical winner in both semantics.
  const { e, l } = runBoth({ qty: 2, unitCost: 10, category: 'shirts', customerTier: GOLD, matrices: [ROW_GOLD_TIER, ROW_BLANK] });
  check('b3', 'tier-only row beats blank row', e.extended, l.extended, 'pricingEngine.js', 29);
}
{
  const { e, l } = runBoth({ qty: 5, unitCost: 8, category: 'other', customerTier: 'bronze', matrices: [ROW_BLANK] });
  check('b4', 'blank row = global default markup', e.extended, l.extended, 'pricingEngine.js', 46);
}
{
  // No row fits at all -> defaultMarkupPct fallback on both sides.
  const { e, l } = runBoth({ qty: 6, unitCost: 10, category: 'other', customerTier: 'bronze', matrices: [ROW_BANNER, ROW_GOLD_BANNER, ROW_GOLD_TIER], defaultMarkupPct: 70 });
  check('b5', 'no matching row -> defaultMarkupPct', e.extended, l.extended, 'pricingEngine.js', 102);
}
{
  // Engine input aliases (quantity/cost) resolve identically — estimator lines
  // carry those key names; parity holds on the resolved values.
  const e = eng.pricePart({ quantity: 4, cost: 10, tierRules: [{ markup_pct: 50 }] });
  const l = fe.resolveEffectivePrice({ qty: 4, unitCost: 10, matrices: [{ markup_pct: 50 }] });
  check('b6', 'qty/cost input aliases', e.extended, l.extended, 'pricingEngine.js', 60);
}
{
  // Multi-line no-config roll-up: priceLines.extended vs priceQuote.linesSubtotal.
  const el = eng.priceLines({ lines: [{ qty: 2, unitCost: 10 }, { qty: 3, unitCost: 5 }], tierRules: [], defaultMarkupPct: 50 });
  const lq = fe.priceQuote({ lines: [{ qty: 2, unitCost: 10 }, { qty: 3, unitCost: 5 }], matrices: [], defaultMarkupPct: 50 });
  check('b7', 'priceLines vs priceQuote linesSubtotal (no-config)', el.subtotal, lq.linesSubtotal, 'pricingEngine.js', 52.5);
}

// ========================= C. PER_UNIT_BREAKS PARITY =========================
// ROW_GOLD_BANNER breaks: 10->8, 50->6, 100->5; markup 60; minimum 30.
const BREAK_REQ = { category: 'banner', customerTier: GOLD, unitCost: 10, matrices: [ROW_GOLD_BANNER] };
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 9 });
  check('c1', 'below first bracket -> markup fallback', e.extended, l.extended, 'pricingEngine.js', 144);
}
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 10 });
  check('c2', 'exact first bracket', e.extended, l.extended, 'pricingEngine.js', 80);
}
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 75 });
  check('c3', 'mid chart -> highest qualifying bracket', e.extended, l.extended, 'pricingEngine.js', 450);
}
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 150 });
  check('c4', 'top bracket', e.extended, l.extended, 'pricingEngine.js', 750);
}
{
  // Break chart unreachable through a row that does not pin this tier.
  const { e, l } = runBoth({ qty: 10, unitCost: 10, category: 'banner', customerTier: SILVER, matrices: [ROW_BANNER, ROW_GOLD_BANNER] });
  check('c5', 'break chart ignored when tier row unmatched', e.extended, l.extended, 'pricingEngine.js', 135);
}
{
  // Shape map: the same chart as a part-descriptor override (engine) prices
  // identically to the chart as a matrix row (legacy).
  const e = eng.pricePart({ qty: 60, unitCost: 10, tierRules: [], part: { per_unit_breaks: ROW_GOLD_BANNER.per_unit_breaks } });
  const l = fe.resolveEffectivePrice({ qty: 60, unitCost: 10, matrices: [{ markup_pct: 0, per_unit_breaks: ROW_GOLD_BANNER.per_unit_breaks }] });
  check('c6', 'part.per_unit_breaks == row.per_unit_breaks', e.extended, l.extended, 'pricingEngine.js', 360);
}
{
  // pickUnitBreak itself is verbatim-shared math — verify identical bracket picks.
  const chart = [{ qty: 5, unit_price: 9 }, { qty: 25, unit_price: 7 }, { qty: 100, unit_price: 4 }];
  for (const q of [1, 5, 24, 25, 99, 100, 1000]) {
    assert.deepEqual(eng.pickUnitBreak(chart, q), fe.pickUnitBreak(chart, q), `pickUnitBreak(${q})`);
  }
  check('c7', 'pickUnitBreak identical picks (7 qtys)', 1, 1, 'pricingEngine.js', 1);
}

// ======================= D. MINIMUM-CHARGE BOTH-FIRE =========================
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 1 });
  check('d1', 'row minimum floors extension in both', e.extended, l.extended, 'pricingEngine.js', 30);
}
{
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 4 });
  check('d2', 'extension above minimum -> no fire', e.extended, l.extended, 'pricingEngine.js', 64);
}
{
  // Shape map: engine caller-side minimumCharge == a matrix row minimum_charge.
  const e = eng.pricePart({ qty: 1, unitCost: 10, tierRules: [{ markup_pct: 50 }], minimumCharge: 100 });
  const l = fe.resolveEffectivePrice({ qty: 1, unitCost: 10, matrices: [{ markup_pct: 50, minimum_charge: 100 }] });
  check('d3', 'caller minimumCharge == row minimum_charge', e.extended, l.extended, 'pricingEngine.js', 100);
}
{
  // Higher floor wins when both fire.
  const e = eng.pricePart({ qty: 1, unitCost: 10, tierRules: [{ markup_pct: 50, minimum_charge: 60 }], minimumCharge: 100 });
  const l = fe.resolveEffectivePrice({ qty: 1, unitCost: 10, matrices: [{ markup_pct: 50, minimum_charge: 100 }] });
  check('d4', 'higher of two floors wins', e.extended, l.extended, 'pricingEngine.js', 100);
}
{
  // Minimum fires on the market path too.
  const { e, l } = runBoth({ qty: 1, unitCost: 10, category: 'signs', customerTier: GOLD, matrices: [ROW_GOLD_SIGNS_MARKET] });
  check('d5', 'market extension floored by minimum', e.extended, l.extended, 'pricingEngine.js', 60);
}

// ========================= E. MARKET-BASED BOTH ENGINES ======================
// ROW_GOLD_SIGNS_MARKET: retail 50 x (1 - 12%) = marketUnit 44; breaks 5->45, 10->40.
const MKT_REQ = { category: 'signs', customerTier: GOLD, unitCost: 10, matrices: [ROW_GOLD_SIGNS_MARKET] };
{
  const { e, l } = runBoth({ ...MKT_REQ, qty: 2 });
  check('e1', 'market unit = retail x (1-disc)', e.extended, l.extended, 'pricingEngine.js', 88);
}
{
  const { e, l } = runBoth({ ...MKT_REQ, qty: 10 });
  check('e2', 'break undercuts market -> wins', e.extended, l.extended, 'pricingEngine.js', 400);
}
{
  const { e, l } = runBoth({ ...MKT_REQ, qty: 5 });
  check('e3', 'break above market -> loses', e.extended, l.extended, 'pricingEngine.js', 220);
}
{
  // Untiered market row resolves through the category/default layer.
  const { e, l } = runBoth({ qty: 2, unitCost: 10, category: 'signs', customerTier: SILVER, matrices: [ROW_SIGNS_MARKET] });
  check('e4', 'untiered market row (category layer)', e.extended, l.extended, 'pricingEngine.js', 88);
}
{
  // Market mode declared but no market_retail -> markup path in both engines.
  const row = { id: 'pm', pricing_mode: 'market', markup_pct: 30 };
  const { e, l } = runBoth({ qty: 2, unitCost: 10, matrices: [row] });
  check('e5', 'market row w/o retail -> markup fallback', e.extended, l.extended, 'pricingEngine.js', 26);
}
{
  const row = { id: 'pm0', pricing_mode: 'market', market_retail: 25, market_discount_pct: 0 };
  const { e, l } = runBoth({ qty: 4, unitCost: 10, matrices: [row] });
  check('e6', 'market discount 0 -> full retail', e.extended, l.extended, 'pricingEngine.js', 100);
}

// ====================== F. TAX APPLICATION (aioPricing) ======================
// aioPricing.js waterfall: raw = snapshot x qty -> discount -> contingency ->
// fees -> tax (src/components/estimator/aioPricing.js:8-29). The engine maps:
//   snapshot unit price -> part.fixed_price; fees -> setupFee; tax_percent ->
//   taxPercent; line adjustments/discount/contingency -> add_pct modifiers.
{
  const e = eng.pricePart({ qty: 3, part: { fixed_price: 12.5 }, taxPercent: 6 });
  const l = aio.computePricing({ line_items: [{ customer_price_snapshot: 12.5, customer_quantity: 3 }], tax_percent: 6 });
  check('f1', 'single line + 6% tax', e.total, l.quoteTotal, 'aioPricing.js', 39.75);
}
{
  // Full waterfall replica of test-aio-pricing.mjs's first fixture:
  // lines 100x2 (+0%) and 50x4 (+10%); discount 10% -> contingency 5% ->
  // fees 50 -> tax 7%. aio quoteTotal = 478.183 (unrounded); engine rounds
  // tax per line -> 478.18, delta 0.003 < tolerance.
  const estimate = {
    line_items: [
      { customer_price_snapshot: 100, customer_quantity: 2 },
      { customer_price_snapshot: 50, customer_quantity: 4, adjustment_percent: 10 },
    ],
    discount_percent: 10, contingency_percent: 5,
    shipping_fee: 20, permit_fee: 30, tax_percent: 7,
  };
  const l = aio.computePricing(estimate);
  const el = eng.priceLines({
    taxPercent: 7,
    lines: [
      { qty: 2, part: { fixed_price: 100 }, setupFee: 50, modifiers: [{ type: 'add_pct', value: -10 }, { type: 'add_pct', value: 5 }] },
      { qty: 4, part: { fixed_price: 50 }, modifiers: [{ type: 'add_pct', value: 10 }, { type: 'add_pct', value: -10 }, { type: 'add_pct', value: 5 }] },
    ],
  });
  check('f2', 'full aio waterfall -> engine modifier chain', el.total, l.quoteTotal, 'aioPricing.js', 478.18);
}
{
  // adjustment_percent + category_adjustments stack ADDITIVELY in aio
  // (aioPricing.js:15) -> single add_pct of the sum on the engine side.
  const l = aio.computePricing({
    line_items: [{ customer_price_snapshot: 80, customer_quantity: 2, adjustment_percent: 5, product_category: 'mat' }],
    category_adjustments: { mat: 10 },
  });
  const e = eng.pricePart({ qty: 2, part: { fixed_price: 80 }, modifiers: [{ type: 'add_pct', value: 15 }] });
  check('f3', 'line adj + category adj = additive add_pct', e.extended, l.subtotal, 'aioPricing.js', 184);
}
{
  // taxable:false exempts the line — matches aio with no tax_percent.
  const e = eng.pricePart({ qty: 2, part: { fixed_price: 50 }, taxable: false, taxPercent: 7 });
  const l = aio.computePricing({ line_items: [{ customer_price_snapshot: 50, customer_quantity: 2 }] });
  check('f4', 'tax-exempt line == no tax_percent', e.total, l.quoteTotal, 'aioPricing.js', 100);
}
{
  // setupFee == aio shipping/permit fees inside the taxable base.
  const e = eng.pricePart({ qty: 1, part: { fixed_price: 37.5 }, setupFee: 12.5, taxPercent: 8 });
  const l = aio.computePricing({ line_items: [{ customer_price_snapshot: 37.5, customer_quantity: 1 }], shipping_fee: 12.5, tax_percent: 8 });
  check('f5', 'setupFee inside taxable base', e.total, l.quoteTotal, 'aioPricing.js', 54);
}

// ==================== G. MARKUP ENGINE (markupEngine.jsx) ====================
// MarkupTier.markups store MULTIPLIERS (1.5 = x1.5), not percent
// (src/components/markup/markupEngine.jsx:10-14 vs pricingEngine.js:9-10).
// Shape map: markup_pct = (multiplier - 1) x 100.
{
  const lines = [
    { label: 'mat', cost: 100, category_key: 'mat' },
    { label: 'lab', cost: 50, category_key: 'lab' },
  ];
  const tier = { markups: { mat: 1.5, lab: 2.0 } };
  const l = mk.applyMarkups(lines, tier, {});
  const el = eng.priceLines({
    lines: [
      { qty: 1, unitCost: 100, part: { markup_pct: 50 } },
      { qty: 1, unitCost: 50, part: { markup_pct: 100 } },
    ],
    tierRules: [],
  });
  check('g1', 'tier multipliers -> markup_pct per line', el.subtotal, l.totals.grand_total, 'markupEngine.jsx', 250);
}
{
  // Volume discount bracket == a mul modifier on eligible lines only.
  const lines = [
    { label: 'mat', cost: 100, category_key: 'mat' },
    { label: 'lab', cost: 50, category_key: 'lab' },
  ];
  const tier = { markups: { mat: 1.5, lab: 2.0 } };
  const l = mk.applyMarkups(lines, tier, { brackets: [{ min: 100, pct: 10 }], eligibleCategoryKeys: ['mat'], categoryFlags: {} });
  const el = eng.priceLines({
    lines: [
      { qty: 1, unitCost: 100, part: { markup_pct: 50 }, modifiers: [{ type: 'mul', value: 0.9 }] },
      { qty: 1, unitCost: 50, part: { markup_pct: 100 } },
    ],
    tierRules: [],
  });
  check('g2', 'volume discount bracket -> mul modifier', el.subtotal, l.totals.grand_total, 'markupEngine.jsx', 235);
}
{
  // getMarkup falls back to 1.0 on a missing category (markupEngine.jsx:13) —
  // i.e. markup_pct 0 -> cost passthrough.
  const l = mk.applyMarkups([{ label: 'x', cost: 75, category_key: 'zzz' }], { markups: { mat: 1.5 } }, {});
  const e = eng.pricePart({ qty: 1, unitCost: 75, tierRules: [] });
  check('g3', 'unconfigured category -> passthrough', e.total, l.totals.grand_total, 'markupEngine.jsx', 75);
}
{
  // Cost-Plus: category markup then flat overhead/profit percents distribute
  // proportionally -> per-line add_pct chain (markupEngine.jsx:165-214).
  const l = mk.applyCostPlus([{ label: 'a', cost: 100, category_key: 'mat' }], { category_markups: { mat: 50 }, overhead_percent: 10, profit_percent: 20 });
  const e = eng.pricePart({ qty: 1, unitCost: 100, part: { markup_pct: 50 }, modifiers: [{ type: 'add_pct', value: 10 }, { type: 'add_pct', value: 20 }] });
  check('g4', 'cost-plus single line', e.total, l.totals.grand_total, 'markupEngine.jsx', 198);
}
{
  // labor_multiplier applies to is_labor lines only -> per-line mul modifier.
  const l = mk.applyCostPlus(
    [
      { label: 'mat', cost: 100, category_key: 'mat' },
      { label: 'lab', cost: 50, category_key: 'lab', is_labor: true },
    ],
    { category_markups: { mat: 50 }, labor_multiplier: 1.25, overhead_percent: 10, profit_percent: 20 },
  );
  const el = eng.priceLines({
    lines: [
      { qty: 1, unitCost: 100, part: { markup_pct: 50 }, modifiers: [{ type: 'add_pct', value: 10 }, { type: 'add_pct', value: 20 }] },
      { qty: 1, unitCost: 50, modifiers: [{ type: 'mul', value: 1.25 }, { type: 'add_pct', value: 10 }, { type: 'add_pct', value: 20 }] },
    ],
    tierRules: [],
  });
  check('g5', 'cost-plus + labor burden per line', el.subtotal, l.totals.grand_total, 'markupEngine.jsx', 280.5);
}
{
  // Target margin: price = cost / (1 - margin) (markupEngine.jsx:216-228) ==
  // mul modifier by 1/(1 - margin/100). Repeating decimal exercises tolerance.
  const l = mk.priceForTargetMargin(80, 25); // 106.6666...
  const e = eng.pricePart({ qty: 1, unitCost: 80, tierRules: [], modifiers: [{ type: 'mul', value: 1 / (1 - 25 / 100) }] });
  check('g6', 'target margin 25% (irrational price)', e.extended, l, 'markupEngine.jsx');
}
{
  const l = mk.priceForTargetMargin(120, 40); // exactly 200
  const e = eng.pricePart({ qty: 1, unitCost: 120, tierRules: [], modifiers: [{ type: 'mul', value: 1 / (1 - 40 / 100) }] });
  check('g7', 'target margin 40% (exact)', e.extended, l, 'markupEngine.jsx', 200);
}

// ==================== H. CUSTOMER PRICING (customerPricing.js) ===============
// sourceProjectEconomics markup semantics are markup_pct over cost
// (customerPricing.js:47-54); snapshots are fixed sell prices.
{
  const l = cust.sourceProjectEconomics('foundation', { customer_markup_percent: 25 }, 800);
  const e = eng.pricePart({ qty: 1, unitCost: 800, tierRules: [], defaultMarkupPct: 25 });
  check('h1', 'foundation markup_pct', e.total, l.customerPrice, 'customerPricing.js', 1000);
}
{
  const l = cust.sourceProjectEconomics('foundation', { customer_markup_percent: 25, customer_price_override: 1234 }, 800);
  const e = eng.pricePart({ qty: 1, unitCost: 800, tierRules: [], part: { fixed_price: 1234 } });
  check('h2', 'foundation price override -> fixed_price', e.total, l.customerPrice, 'customerPricing.js', 1234);
}
{
  // vinyl economics: customerPrice = total_cost, markup_amount splits cost —
  // implied markup_pct = markup/internalCost x 100 (customerPricing.js:57-62).
  const l = cust.sourceProjectEconomics('vinyl', { total_cost: 900, markup_amount: 200 }, 0);
  const e = eng.pricePart({ qty: 1, unitCost: l.internalCost, tierRules: [], defaultMarkupPct: (200 / 700) * 100 });
  check('h3', 'vinyl implied markup_pct', e.total, l.customerPrice, 'customerPricing.js', 900);
}
{
  // channel_letters: project markup is (subtotal - letters_subtotal) over
  // internal cost — irrational markup_pct exercises round4 (customerPricing.js:64-73).
  const l = cust.sourceProjectEconomics('channel_letters', { total_cost: 1000, subtotal: 800, total_letters_cost: 300, letters_subtotal: 250 }, 0);
  const e = eng.pricePart({ qty: 1, unitCost: l.internalCost, tierRules: [], defaultMarkupPct: (250 / 750) * 100 });
  check('h4', 'channel_letters implied markup_pct', e.total, l.customerPrice, 'customerPricing.js', 1000);
}
{
  // acceptedCustomerUnitPrice snapshot -> fixed sell price x qty (aio raw).
  const unit = cust.acceptedCustomerUnitPrice({ total_snapshot: 55 });
  const l = aio.computePricing({ line_items: [{ total_snapshot: 55, customer_quantity: 3 }] });
  const e = eng.pricePart({ qty: 3, part: { fixed_price: unit }, tierRules: [] });
  check('h5', 'total_snapshot fallback -> fixed price', e.extended, l.subtotal, 'customerPricing.js', 165);
}
{
  // liveCustomerUnitPrice precedence picks the live snapshot; persisted as the
  // accepted snapshot it becomes the fixed sell price.
  const picked = cust.liveCustomerUnitPrice({ live_customer_price_snapshot: 10, customer_price_snapshot: 20 });
  assert.equal(picked, 10, 'live snapshot wins (fixture shape check)');
  const l = aio.computePricing({ line_items: [{ customer_price_snapshot: picked, customer_quantity: 4 }] });
  const e = eng.pricePart({ qty: 4, part: { fixed_price: picked }, tierRules: [] });
  check('h6', 'live-picked snapshot -> fixed price', e.extended, l.subtotal, 'customerPricing.js', 40);
}

// ==================== I. TEMPLATE / GLOBAL-TIER / ROLL-UP ====================
// PricingTemplate shape map (base44/entities/PricingTemplate.jsonc): each
// breaks[] bracket is {qty, tier_markups:{tierName -> markup_pct}}. For a given
// customer tier the chart translates to per_unit_breaks entries
// {qty, unit_price = unitCost x (1 + markup_pct/100)} — fed verbatim into both
// engines so the SAME chart prices identically. (market_based templates have
// no legacy analog — their retail/discount interpretation is engine-defined.)
const TEMPLATE = {
  name: 'Banner SqFt - Standard', unit_category: 'SqFt',
  breaks: [
    { qty: 1, tier_markups: { Gold: 60, Silver: 80 } },
    { qty: 25, tier_markups: { Gold: 45, Silver: 60 } },
    { qty: 100, tier_markups: { Gold: 30, Silver: 40 } },
  ],
};
const templateChart = (tpl, tierName, unitCost) =>
  (tpl.breaks || [])
    .filter((b) => Number.isFinite(Number(b?.tier_markups?.[tierName])))
    .map((b) => ({ qty: b.qty, unit_price: eng.round4(unitCost * (1 + Number(b.tier_markups[tierName]) / 100)) }));
{
  const chart = templateChart(TEMPLATE, 'Gold', 10); // [{1,16},{25,14.5},{100,13}]
  assert.deepEqual(chart, [{ qty: 1, unit_price: 16 }, { qty: 25, unit_price: 14.5 }, { qty: 100, unit_price: 13 }], 'template chart translation');
  const row = { id: 'tpl-row', markup_pct: 0, per_unit_breaks: chart };
  const { e, l } = runBoth({ qty: 50, unitCost: 10, matrices: [row] });
  check('i1', 'PricingTemplate chart -> mid bracket', e.extended, l.extended, 'template shape-map', 725);
}
{
  const chart = templateChart(TEMPLATE, 'Gold', 10);
  const row = { id: 'tpl-row', markup_pct: 0, per_unit_breaks: chart };
  const { e, l } = runBoth({ qty: 10, unitCost: 10, matrices: [row] });
  check('i2', 'PricingTemplate chart -> base bracket', e.extended, l.extended, 'template shape-map', 160);
}
{
  const chart = templateChart(TEMPLATE, 'Silver', 10); // [{1,18},{25,16},{100,14}]
  const row = { id: 'tpl-row', markup_pct: 0, per_unit_breaks: chart };
  const { e, l } = runBoth({ qty: 200, unitCost: 10, matrices: [row] });
  check('i3', 'PricingTemplate chart -> top bracket (Silver)', e.extended, l.extended, 'template shape-map', 2800);
}
{
  // GlobalPricingTier rules[] {tier, markup_pct, market_based} -> chart rows
  // {customer_tier, markup_pct, pricing_mode} (GlobalPricingTier.jsonc).
  const rules = [
    { tier: 'Gold', markup_pct: 55 },
    { tier: 'Silver', markup_pct: 75 },
  ];
  const rows = rules.map((r) => ({ customer_tier: r.tier, markup_pct: r.markup_pct }));
  const g = runBoth({ qty: 4, unitCost: 10, customerTier: GOLD, matrices: rows });
  check('i4a', 'GlobalPricingTier rule -> Gold', g.e.extended, g.l.extended, 'globaltier shape-map', 62);
  const s = runBoth({ qty: 4, unitCost: 10, customerTier: SILVER, matrices: rows });
  check('i4b', 'GlobalPricingTier rule -> Silver', s.e.extended, s.l.extended, 'globaltier shape-map', 70);
}
{
  // market_based rule with no retail field -> both engines take markup path.
  const rows = [{ customer_tier: 'platinum', pricing_mode: 'market', markup_pct: 65 }];
  const { e, l } = runBoth({ qty: 2, unitCost: 10, customerTier: 'platinum', matrices: rows });
  check('i5', 'market_based tier rule w/o retail', e.extended, l.extended, 'globaltier shape-map', 33);
}
{
  // priceQuote roll-up: linesSubtotal + labor + machine. Engine covers the
  // lines portion identically; legacy adders are pure additions on top.
  const lines = [
    { label: 'A', qty: 2, unitCost: 10 },
    { label: 'B', qty: 3, cost: 5 }, // cost alias on both sides
  ];
  const matrices = [ROW_BLANK]; // markup 15
  const lq = fe.priceQuote({
    lines, matrices,
    laborHours: 2, laborLevel: 'journeyman',
    laborLevels: [{ name: 'Journeyman', level_rank: 2, hourly_rate: 65 }],
    machineHours: 1.5, machineType: 'printer',
    machineRates: [{ name: 'HP', machine_type: 'printer', runtime_rate_per_hour: 40, maintenance_rate_per_hour: 5, material_waste_pct: 2, setup_minutes: 30 }],
    materialCost: 200,
  });
  const el = eng.priceLines({ lines, tierRules: matrices });
  check('i6a', 'priceLines == priceQuote linesSubtotal', el.subtotal, lq.linesSubtotal, 'pricingEngine.js', 40.25);
  check('i6b', 'labor+machine adders commute', el.subtotal + lq.laborCost.cost + lq.machineCost.total, lq.subtotal, 'pricingEngine.js', 261.75);
}

// ==================== J. MODIFIER-FREE = BASE PATH ===========================
{
  const base = { qty: 4, unitCost: 10, tierRules: [ROW_BLANK], defaultMarkupPct: 50 };
  assert.deepEqual(eng.pricePart(base), eng.pricePart({ ...base, modifiers: [] }),
    'modifiers: [] must be identical to no modifiers (engine)');
  const legBase = { qty: 4, unitCost: 10, matrices: [ROW_BLANK], defaultMarkupPct: 50 };
  assert.deepEqual(fe.resolveEffectivePrice(legBase), fe.resolveEffectivePrice({ ...legBase, modifiers: [] }),
    'modifiers: [] must be identical to no modifiers (legacy)');
  const { e, l } = runBoth({ ...legBase });
  check('j1', 'modifier-free == empty-modifier == base', e.extended, l.extended, 'pricingEngine.js', 46);
}
{
  // Same modifier chain -> identical totals in both engines.
  const mods = [{ type: 'add_pct', value: 10 }, { type: 'mul', value: 0.5 }, { type: 'add_flat', value: 5 }, { type: 'min', value: 70 }, { type: 'max', value: 65 }];
  const { e, l } = runBoth({ qty: 1, unitCost: 100, matrices: [], modifiers: mods });
  check('j2', 'modifier chain parity', e.extended, l.extended, 'pricingEngine.js', 65);
}
{
  // Row formula_modifiers run before caller modifiers in both engines.
  const row = { id: 'fm', customer_tier: 'gold', markup_pct: 0, formula_modifiers: [{ type: 'add_flat', value: 2 }] };
  const { e, l } = runBoth({ qty: 1, unitCost: 10, customerTier: GOLD, matrices: [row], modifiers: [{ type: 'mul', value: 2 }] });
  check('j3', 'row modifiers before caller modifiers', e.extended, l.extended, 'pricingEngine.js', 24);
}
{
  // Modifiers adjust the break-resolved unit price identically.
  const { e, l } = runBoth({ ...BREAK_REQ, qty: 10, modifiers: [{ type: 'add_flat', value: 0.5 }] });
  check('j4', 'modifier on qty_break price', e.extended, l.extended, 'pricingEngine.js', 85);
}

// ==================== K. KNOWN DIVERGENCES (flagged) =========================
// These are NOT parity failures — they are documented semantic differences
// between the two engines' precedence/clamping rules. The asserts pin the
// direction so any silent convergence or widening fails the suite for review.
{
  // K1: cat-only row vs tier-only row. Legacy specificity: cat (2) > tier (1);
  // shared ladder: customer_tier layer > global_default layer.
  const matrices = [ROW_BANNER, ROW_GOLD_TIER]; // banner mk35 vs gold mk45
  const { e, l } = runBoth({ qty: 2, unitCost: 10, category: 'banner', customerTier: GOLD, matrices });
  diverge('k1', 'tier-only row vs category-only row precedence', e.extended, l.extended,
    'shared customer_tier layer outranks global_default cat row; legacy spec cat(2) > tier(1) — pricingEngine.ts:40-47 vs pricingEngine.js:66-77');
}
{
  // K2: market_retail 0. Shared: finite retail -> market kind -> unit 0.
  // Legacy: requires retail > 0 -> markup fallback.
  const row = { id: 'mz', pricing_mode: 'market', market_retail: 0, market_discount_pct: 10, markup_pct: 30 };
  const { e, l } = runBoth({ qty: 2, unitCost: 10, matrices: [row] });
  diverge('k2', 'market_retail=0', e.extended, l.extended,
    'shared marketKind() accepts finite 0 -> prices unit at 0; legacy needs retail > 0 -> markup path — pricingEngine.ts:185-186 vs pricingEngine.js:288', 'lt');
}
{
  // K3: negative qty. Shared clamps to 0; legacy passes negative extension.
  const { e, l } = runBoth({ qty: -5, unitCost: 10, matrices: [ROW_BLANK] });
  diverge('k3', 'negative qty clamp', e.extended, l.extended,
    'shared clamps qty >= 0 -> extension 0; legacy num() passes through -> negative extension — pricingEngine.ts:381 vs pricingEngine.js:274');
}

// ============================ SUMMARY ========================================
console.log('');
console.log(`${cases} cases run, max parity delta = ${fmt(maxDelta)}`);
if (flags.length) {
  console.log(`${flags.length} documented divergences (asserted direction, review-worthy if they converge):`);
  for (const f of flags) console.log(`  - ${f.id} ${f.name}: engine=${fmt(f.engineTotal)} legacy=${fmt(f.legacyTotal)} :: ${f.cause}`);
}
console.log(`PASS pricing-regression (${cases} cases, ${flags.length} flagged divergences)`);

// Success path cleans the esbuild tmp bundles; on failure they stay for debugging.
for (const f of tmpBundles) rmSync(f, { force: true });
