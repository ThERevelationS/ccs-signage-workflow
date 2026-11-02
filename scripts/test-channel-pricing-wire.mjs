// F-23a suite — channelPricingWire.ts + the customerPricing channel seam.
//
// Covers: engine-config detection (line/record), cost-line projection parity
// with the module rollup, ZERO-REGRESSION passthrough (byte-identical sells
// when no config), tier/fixed/market/break/template pricing only where
// assigned, and edge cases (zero qty, dangling tier_ref, inactive template,
// expired/inactive chart rows, legacy-vs-engine precedence).
//
// Bundles the .ts/.js with esbuild (Vite-style graph can't load in bare Node).
// Run: node scripts/test-channel-pricing-wire.mjs  →  "PASS channel-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (entry, name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};
const W = await import(pathToFileURL(bundle('../base44/shared/channelPricingWire.ts', 'channel-wire')).href);
const P = await import(pathToFileURL(bundle('../base44/shared/pricingEngine.ts', 'pe')).href);
const T = await import(pathToFileURL(bundle('../base44/shared/pricingTemplateModel.ts', 'ptm')).href);
// Bundling the seam consumer proves the whole import graph compiles:
// customerPricing -> channelSellPricing -> pricingEngine/pricingTemplateModel/channelPricingWire.
const CP = await import(pathToFileURL(bundle('../src/components/estimator/customerPricing.js', 'cp')).href);

const ENGINE = { pricePart: P.pricePart, resolveTemplatePrice: T.resolveTemplatePrice, templatePartDescriptor: T.templatePartDescriptor };

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m) => { n += 1; assert.ok(Math.abs(a - b) < 0.005, `${m}: expected ${b}, got ${a}`); };

// ===========================================================================
// 1. channelLinePricingConfig — what counts as engine config on a line.
// ===========================================================================
const cfgOf = W.channelLinePricingConfig;
eq(cfgOf({}).configured, false, 'empty line');
eq(cfgOf({ description: 'x', item_total_cost: 100 }).configured, false, 'plain install item');
eq(cfgOf({ pricing_mode: 'per_letter_flat' }).configured, false, 'inventory unit enum NOT config');
eq(cfgOf({ pricing_mode: 'per_day' }).configured, false, 'equipment duration enum NOT config');
eq(cfgOf({ unit_cost_override: true, unit_cost: 9 }).configured, false, 'cost-side override flag NOT config');
eq(cfgOf({ letters_total_override: true, letters_total: 500 }).configured, false, 'letters total override NOT config');
eq(cfgOf({ qty: 5, unit_cost: 100, total_cost: 500 }).configured, false, 'plain purchase row');
eq(cfgOf({ fixed_price: 25 }).configured, true, 'fixed_price');
eq(cfgOf({ price_override: 0 }).configured, false, 'fixed price must be positive');
eq(cfgOf({ tier_ref: 'gold' }).configured, true, 'tier_ref');
eq(cfgOf({ tier_name: 'gold' }).configured, true, 'tier_name');
eq(cfgOf({ per_unit_breaks: [{ qty: 5, unit_price: 9 }] }).configured, true, 'break chart');
eq(cfgOf({ markup_pct: 50 }).configured, true, 'markup_pct');
eq(cfgOf({ markup_pct: 0 }).configured, false, 'markup_pct 0 is not config (engine parity)');
eq(cfgOf({ pricing_mode: 'market', market_retail: 400 }).configured, true, 'market mode + retail');
eq(cfgOf({ pricing_mode: 'market_based' }).configured, true, 'recognized mode token');
eq(cfgOf({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }).configured, true, 'formula modifiers');
eq(cfgOf({ minimum_charge: 75 }).configured, true, 'minimum charge');
eq(cfgOf({ customer_tier: 'wholesale' }).configured, true, 'line-carried customer tier');
eq(cfgOf({ tier_rules: [{ name: 'g', markup_pct: 10 }] }).configured, true, 'line-carried chart rows');
eq(cfgOf({ part: { markup_pct: 40 } }).configured, true, 'part descriptor markup');
eq(cfgOf({ pricing: { tier_ref: 't1' } }).configured, true, 'pricing descriptor tier_ref');
eq(cfgOf({ pricing_template_id: 'pt-1' }).configured, true, 'template id ref');
eq(cfgOf({ pricing_template: { breaks: [{ qty: 1, markup_pct: 10 }] } }).configured, true, 'embedded template');
eq(cfgOf({ machine: { markup_pct: 10 } }).configured, true, 'machine descriptor');
eq(cfgOf({ fixed_price: 20, part: { markup_pct: 40 } }).part.markup_pct, 40, 'explicit part object wins over inline');
eq(cfgOf({ tier_ref: 'gold' }).part.tier_ref, 'gold', 'inline tier_ref folds into part descriptor');
ok(cfgOf({ pricing_template: { breaks: [{ qty: 1, markup_pct: 5 }] } }).template != null, 'template descriptor echoed');

// ===========================================================================
// 2. channelEngineContext — record-level engine context detection.
// ===========================================================================
const ctxOf = W.channelEngineContext;
eq(ctxOf({}), null, 'empty record -> no context');
eq(ctxOf({ markup_percent: 20 }), null, 'markup_percent alone is NOT context');
eq(ctxOf({ customer_pricing: { applied: true, total: 500, tier_number: 2 } }), null,
  'legacy customer_pricing alone is NOT context (zero-regression gate)');
eq(ctxOf({ pricing_tier: 2 }), null, 'pricing_tier alone is NOT context');
{
  const c = ctxOf({ pricing_engine: { customer_tier: 'wholesale', tier_rules: [{ name: 'g' }] } });
  eq(c.field, 'pricing_engine', 'context field name');
  eq(c.customerTier, 'wholesale', 'context customerTier');
  eq(c.tierRules.length, 1, 'context tierRules');
}
{
  const c = ctxOf({ pricing_engine: {}, markup_percent: 20 });
  eq(c.defaultMarkupPct, 20, 'context defaultMarkupPct falls back to record.markup_percent');
}
{
  const c = ctxOf({ customer_pricing: { engine_context: { default_markup_pct: 33 } } });
  eq(c.field, 'customer_pricing.engine_context', 'nested context field name');
  eq(c.defaultMarkupPct, 33, 'explicit default_markup_pct wins over record markup');
}
{
  const c = ctxOf({ engine_pricing: { tax_percent: 6, setup_fee: 25, minimum_charge: 100, customer_tier: 2 } });
  eq(c.field, 'engine_pricing', 'engine_pricing alias');
  eq(c.taxPercent, 6, 'context taxPercent');
  eq(c.setupFee, 25, 'context setupFee');
  eq(c.minimumCharge, 100, 'context minimumCharge');
  eq(c.customerTier, 2, 'context customerTier number');
}
{
  // Customer tier fallback chain: block > record.customer_tier > customer_pricing tier.
  const c = ctxOf({ pricing_engine: {}, customer_pricing: { tier_number: 2 } });
  eq(c.customerTier, 2, 'customerTier inherits saved tier_number when block omits it');
}

// ===========================================================================
// 3. channelCostLines — projection parity with the module rollup.
// ===========================================================================
const FIXTURE = {
  letter_purchases: [
    { id: 'p1', letter_type: 'channel_flush_mounted', description: 'Channel set', qty: 5, unit_cost: 100, total_cost: 500 },
    {
      id: 'p2', letter_type: 'dimensional_letters', description: 'Dim letters', qty: 2, unit_cost: 60, total_cost: 120,
      fab_config: { material_cost: 40, paint_material_cost: 10, cnc_labor_cost: 20, paint_labor_cost: 10 },
    },
  ],
  letters_delivery_fee: 90, letters_design_fee: 150,
  letters_install_supplies_fee: 0, letters_permitting_fee: 0, letters_other_fee: 0,
  items: [
    { description: 'Flush install', labor_cost: 300, materials_cost: 100, item_total_cost: 400, qty_letters: 5 },
    { description: 'Raceway install', labor_cost: 200, materials_cost: 50, item_total_cost: 250, qty_letters: 4 },
  ],
  selected_equipment: [{ equipment_name: 'Boom lift', total_cost: 400 }],
  personnel: [],
  total_supplies_cost: 75, total_travel_cost: 60,
  letters_markup_percent: 25,
  letters_subtotal: 860,          // 500 + 120 + 240 fees
  total_letters_cost: 1075,       // 860 x 1.25
  labor_cost_in_subtotal: 500, labor_priced_via_personnel: false,
  subtotal: 2260, markup_percent: 20, markup_amount: 452, total_cost: 2712,
};

{
  const lines = W.channelCostLines(FIXTURE);
  eq(lines.length, 12, 'fixture projects 12 granular cost lines');
  const sum = lines.reduce((s, l) => s + l.cost, 0);
  eq(sum, 2045, 'line cost sum == internalCost basis (2045)');
  // letters_subtotal decomposition: purchases 620 + fees 240 = 860.
  const purchaseLines = lines.filter((l) => l.family === 'letter_purchase');
  eq(purchaseLines.length, 4, 'p1 + 3-way dimensional split');
  near(purchaseLines.find((l) => l.key === 'purchase:1:material').cost, 50, 'dimensional material share');
  near(purchaseLines.find((l) => l.key === 'purchase:1:labor').cost, 30, 'dimensional labor share');
  near(purchaseLines.find((l) => l.key === 'purchase:1:other').cost, 40, 'dimensional remainder');
  eq(lines.find((l) => l.key === 'letter_fees').cost, 240, 'delivery+design fees line');
  ok(lines.some((l) => l.key === 'item:0:labor'), 'item labor line present (no crew)');
  eq(lines.find((l) => l.key === 'purchase:0').qty, 5, 'purchase keeps real qty');
  eq(lines.find((l) => l.key === 'purchase:0').unitCost, 100, 'purchase unit cost = cost/qty');
}
{
  // Crew assigned -> item labor drops out, personnel lines carry it instead.
  const lines = W.channelCostLines({
    ...FIXTURE,
    labor_priced_via_personnel: true, labor_cost_in_subtotal: 0,
    personnel: [{ name: 'Crew Lead', total_cost: 600 }],
  });
  eq(lines.some((l) => l.key === 'item:0:labor'), false, 'item labor excluded when crew-priced');
  const sum = lines.reduce((s, l) => s + l.cost, 0);
  eq(sum, 2045 - 500 + 600, 'sum = materials-only items + personnel');
}
{
  // All-dimensional purchases -> delivery fee excluded (lettersCalculator parity).
  const lines = W.channelCostLines({
    ...FIXTURE,
    letter_purchases: [FIXTURE.letter_purchases[1]],
    items: [], selected_equipment: [], total_supplies_cost: 0, total_travel_cost: 0,
  });
  const fees = lines.find((l) => l.key === 'letter_fees');
  eq(fees.cost, 150, 'all-dimensional -> design fee only (delivery skipped)');
}
{
  // Zero-qty purchase: qty coerces to 1, unitCost = whole cost.
  const lines = W.channelCostLines({ letter_purchases: [{ letter_type: 'capsule_logo_pillbox', qty: 0, unit_cost: 0, total_cost: 300 }] });
  eq(lines[0].qty, 1, 'zero qty -> 1');
  eq(lines[0].unitCost, 300, 'zero qty -> unitCost = cost');
}

// ===========================================================================
// 4. wireChannelLineSell — passthrough vs engine-priced lines.
// ===========================================================================
const sell = (o) => W.wireChannelLineSell({ engine: ENGINE, ...o });
{
  const r = sell({ line: { description: 'x' }, cost: 123.456789 });
  eq(r.passthrough, true, 'no config -> passthrough');
  eq(r.reason, 'no_tier_config');
  eq(r.sellPrice, 123.456789, 'passthrough echoes cost VERBATIM (no rounding)');
  ok(r.chain.some((c) => c.step === 'passthrough'), 'chain records passthrough');
}
{
  const r = sell({ line: {}, cost: 200, context: { pricing_engine: {} } });
  eq(r.priced, true, 'context present -> engine prices even unconfigured line');
  eq(r.sellPrice, 200, 'context with no markup -> cost through engine');
}
{
  const r = sell({ line: { markup_pct: 50 }, cost: 200 });
  eq(r.priced, true, 'markup_pct line priced');
  eq(r.sellPrice, 300, '200 x 1.5');
  eq(r.priceSource, 'markup');
}
{
  const r = sell({ line: { fixed_price: 120 }, cost: 500, qty: 5 });
  eq(r.sellPrice, 600, 'fixed unit price x qty');
  eq(r.priceSource, 'fixed_price');
}
{
  const r = sell({ line: { pricing_mode: 'market', market_retail: 400, market_discount_pct: 25 }, cost: 999 });
  eq(r.sellPrice, 300, 'market retail - discount');
  eq(r.priceSource, 'market');
}
{
  const r = sell({ line: { per_unit_breaks: [{ qty: 5, unit_price: 8 }, { qty: 10, unit_price: 7 }] }, cost: 60, qty: 6 });
  eq(r.sellPrice, 48, 'qty-5 break wins -> 8 x 6');
  eq(r.priceSource, 'qty_break');
}
{
  const r = sell({ line: { markup_pct: 10, minimum_charge: 100 }, cost: 50 });
  eq(r.sellPrice, 100, 'minimum charge floors the extension');
  eq(r.engine.minimumApplied, true);
}
{
  const r = sell({ line: { markup_pct: 50, formula_modifiers: [{ type: 'add_pct', value: 10 }] }, cost: 100 });
  eq(r.sellPrice, 165, '150 -> +10% modifier -> 165');
  eq(r.engine.modifiersApplied.length, 1, 'modifier trace recorded');
}
{
  const r = sell({ line: { setup_fee: 25 }, cost: 100 });
  eq(r.sellPrice, 125, 'setup_fee line is config -> engine adds it after floor');
}
{
  const r = sell({ line: { machine: { fixed_price: 44 } }, cost: 100 });
  eq(r.sellPrice, 44, 'machine descriptor overrides the line');
  eq(r.tierSource, 'machine_override');
}
{
  const r = sell({ line: { customer_tier: 'wholesale', markup_pct: 0, tier_rules: [{ customer_tier: 'wholesale', markup_pct: 100 }] }, cost: 200 });
  eq(r.sellPrice, 400, 'line-carried tier + chart -> x2');
  eq(r.tierSource, 'customer_tier');
}
// --- edge cases -------------------------------------------------------------
{
  const r = sell({ line: { markup_pct: 50 }, cost: 200, qty: 0 });
  eq(r.qty, 1, 'zero qty -> single-unit fallback (never zeroes the cost)');
  eq(r.sellPrice, 300, 'zero qty still sells its cost through the engine');
}
{
  const r = sell({ line: { tier_ref: 'ghost' }, cost: 200 });
  eq(r.priced, true, 'dangling tier_ref still claims its layer');
  eq(r.engine.danglingTierRef, 'ghost', 'dangling ref reported');
  eq(r.sellPrice, 200, 'dangling ref prices at cost, not at a weaker layer');
}
{
  const r = sell({ line: { markup_pct: 50 }, cost: 100 });
  eq(r.sellPrice, 150, 'engine unavailable check uses real engine here');
  const r2 = W.wireChannelLineSell({ line: { markup_pct: 50 }, cost: 100 });
  eq(r2.passthrough, true, 'no engine injected -> passthrough');
  eq(r2.reason, 'engine_unavailable');
  eq(r2.sellPrice, 100, 'unavailable engine -> verbatim cost');
}
{
  // Context-level floor/tax applies to engine-priced lines.
  const ctx = { pricing_engine: { tax_percent: 10, minimum_charge: 500 } };
  const r = sell({ line: { markup_pct: 50 }, cost: 100, context: ctx });
  eq(r.sellPrice, 550, 'min 500 floor + 10% tax = 550');
}

// ===========================================================================
// 5. wireChannelProjectSell — rollup + byte-identical all-passthrough.
// ===========================================================================
{
  const lines = [
    { key: 'a', line: {}, cost: 0.1 },
    { key: 'b', line: {}, cost: 0.2 },
    { key: 'c', line: {}, cost: 0.3 },
  ];
  const r = W.wireChannelProjectSell({ lines, engine: ENGINE });
  eq(r.allPassthrough, true, 'no config anywhere -> all passthrough');
  eq(r.priced, false);
  eq(r.sellTotal, 0.1 + 0.2 + 0.3, 'sellTotal is the VERBATIM float sum (byte-identical)');
  eq(r.sellTotal === lines.reduce((s, l) => s + l.cost, 0), true, 'exact same float');
}
{
  const lines = [
    { key: 'priced', line: { markup_pct: 50 }, cost: 100 },
    { key: 'free-a', line: {}, cost: 200 },
    { key: 'free-b', line: {}, cost: 50 },
  ];
  const r = W.wireChannelProjectSell({ lines, engine: ENGINE });
  eq(r.priced, true);
  eq(r.pricedCount, 1, 'one configured line priced');
  eq(r.passthroughCount, 2, 'unassigned lines untouched');
  eq(r.lines[1].sellPrice, 200, 'unassigned line echoes cost verbatim');
  eq(r.lines[2].sellPrice, 50, 'second unassigned line verbatim');
  eq(r.sellTotal, 400, '150 + 200 + 50 — price changed only where assigned');
}
{
  // Context present -> every line goes through the engine.
  const r = W.wireChannelProjectSell({
    lines: [{ key: 'a', line: {}, cost: 100 }, { key: 'b', line: { markup_pct: 100 }, cost: 100 }],
    context: { pricing_engine: { default_markup_pct: 25 } },
    engine: ENGINE,
  });
  eq(r.pricedCount, 2, 'context prices every line');
  eq(r.sellTotal, 325, '125 + 200 (context default + line descriptor)');
}

// ===========================================================================
// 6. channelEngineEconomics + sourceProjectEconomics — the boundary.
// ===========================================================================
const econ = (record, extra = {}) => W.channelEngineEconomics({ record, engine: ENGINE, ...extra });
const INTERNAL = 2045;   // FIXTURE internalCost (computed in section 3)
const CUSTOMER = 2712;   // FIXTURE total_cost (today's customerPrice)

{
  const r = econ(FIXTURE, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, false, 'unconfigured record -> not wired');
  eq(r.passthrough, true);
  eq(r.reason, 'no_tier_config');
}
{
  // Legacy saved tier alone -> still passthrough (old system untouched).
  const r = econ({ ...FIXTURE, customer_pricing: { applied: true, total: 2400, tier_number: 2 } },
    { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, false, 'legacy customer_pricing alone does NOT engage the engine');
}
{
  const r = econ({ ...FIXTURE, pricing_engine: { default_markup_pct: 20 } },
    { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true, 'pricing_engine block engages the engine project-wide');
  eq(r.internalCost, INTERNAL, 'internalCost echoed untouched');
  eq(r.customerPrice, 2454, 'engine sellTotal = 2045 x 1.20 (engine owns the tail)');
  ok(r.sell.pricedCount > 0, 'lines priced');
  ok(r.chain.some((c) => c.step === 'wired'), 'chain records the wire');
}
{
  // markup_percent fallback: empty block inherits the record's legacy tail.
  const r = econ({ ...FIXTURE, pricing_engine: {} }, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true);
  eq(r.customerPrice, 2454, 'empty block -> record.markup_percent (20) supplies the tail');
}
{
  // Engine beats a legacy saved tier when BOTH exist (more specific layer).
  const r = econ({
    ...FIXTURE,
    customer_pricing: { applied: true, total: 2400, tier_number: 2 },
    pricing_engine: { default_markup_pct: 20 },
  }, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true);
  eq(r.customerPrice, 2454, 'engine result wins over saved tier 2400');
}
{
  // One configured purchase, no context -> that purchase repriced, rest passthrough.
  const rec = {
    ...FIXTURE,
    letter_purchases: [
      { ...FIXTURE.letter_purchases[0], fixed_price: 120 },
      FIXTURE.letter_purchases[1],
    ],
  };
  const r = econ(rec, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true, 'single configured line engages the wire');
  const p0 = r.sell.lines.find((l) => l.key === 'purchase:0');
  eq(p0.sellPrice, 600, 'purchase 0 -> fixed 120 x qty 5');
  const untouched = r.sell.lines.filter((l) => l.passthrough);
  ok(untouched.length > 0, 'unassigned lines passthrough at cost');
}
{
  // customer_tier chart via context: every line doubles.
  const r = econ({
    ...FIXTURE,
    pricing_engine: {
      customer_tier: 'wholesale',
      tier_rules: [{ customer_tier: 'wholesale', markup_pct: 100 }],
    },
  }, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true);
  eq(r.customerPrice, 4090, 'wholesale chart row -> every line x2');
}
{
  // INACTIVE chart row -> filtered -> context falls to default markup 0.
  const r = econ({
    ...FIXTURE, markup_percent: 0,
    pricing_engine: {
      customer_tier: 'wholesale',
      tier_rules: [{ customer_tier: 'wholesale', markup_pct: 100, status: 'inactive' }],
    },
  }, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true);
  eq(r.customerPrice, 2045, 'inactive row cannot price -> cost passthrough total');
}
{
  // Expired effective_to row -> filtered the same way.
  const r = econ({
    ...FIXTURE, markup_percent: 0,
    pricing_engine: {
      customer_tier: 'wholesale',
      tier_rules: [{ customer_tier: 'wholesale', markup_pct: 100, effective_to: '2020-01-01' }],
    },
  }, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.customerPrice, 2045, 'expired row cannot price');
}
{
  // PricingTemplate on a purchase line -> template chart prices it.
  const rec = {
    ...FIXTURE, markup_percent: 0,
    letter_purchases: [
      { ...FIXTURE.letter_purchases[0], pricing_template_id: 'tpl-1' },
      FIXTURE.letter_purchases[1],
    ],
    pricing_engine: {
      customer_tier: 'wholesale',
      templates: [{ id: 'tpl-1', status: 'active', breaks: [{ qty: 1, tier_markups: { wholesale: 150 } }] }],
    },
  };
  const r = econ(rec, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  eq(r.wired, true);
  const p0 = r.sell.lines.find((l) => l.key === 'purchase:0');
  eq(p0.sellPrice, 1250, 'template markup 150 -> unit 100 x 2.5 x qty 5');
  ok(p0.chain.some((c) => c.step === 'template' && /template priced/.test(c.detail)), 'template step recorded');
}
{
  // INACTIVE template -> not applied -> engine chain prices the line (context).
  const rec = {
    ...FIXTURE, markup_percent: 10,
    letter_purchases: [
      { ...FIXTURE.letter_purchases[0], pricing_template_id: 'tpl-1' },
      FIXTURE.letter_purchases[1],
    ],
    pricing_engine: {
      customer_tier: 'wholesale',
      templates: [{ id: 'tpl-1', status: 'inactive', breaks: [{ qty: 1, tier_markups: { wholesale: 150 } }] }],
    },
  };
  const r = econ(rec, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  const p0 = r.sell.lines.find((l) => l.key === 'purchase:0');
  eq(p0.priced, true, 'inactive template -> engine chain still prices the line');
  eq(p0.sellPrice, 550, 'context default markup 10 -> 500 x 1.1');
  ok(p0.chain.some((c) => c.step === 'template' && /not applied/.test(c.detail)), 'inactive template reason recorded');
}
{
  // Missing tier row for a bound tier_ref -> dangling, prices at cost.
  const rec = {
    ...FIXTURE,
    letter_purchases: [
      { ...FIXTURE.letter_purchases[0], tier_ref: 'ghost' },
      FIXTURE.letter_purchases[1],
    ],
  };
  const r = econ(rec, { internalCost: INTERNAL, customerPrice: CUSTOMER });
  const p0 = r.sell.lines.find((l) => l.key === 'purchase:0');
  eq(p0.engine.danglingTierRef, 'ghost', 'dangling tier ref surfaces');
  eq(p0.sellPrice, 500, 'dangling ref -> cost, never a weaker layer');
}
{
  eq(econ(null).passthrough, true, 'null record -> passthrough');
  eq(econ({}).reason, 'no_cost_lines', 'record with no cost lines');
}

// ===========================================================================
// 7. sourceProjectEconomics end-to-end (bundled seam graph).
// ===========================================================================
const econOf = CP.sourceProjectEconomics;
{
  const r = econOf('channel_letters', FIXTURE, 0);
  eq(r.internalCost, INTERNAL, 'no-config: internalCost = subtotal - letter markup');
  eq(r.customerPrice, CUSTOMER, 'no-config: customerPrice = total_cost (byte-identical)');
  eq(r.pricing_engine, undefined, 'no-config: no engine field attached');
}
{
  const r = econOf('channel_letters', { ...FIXTURE, customer_pricing: { applied: true, total: 2400, tier_number: 2 } }, 0);
  eq(r.customerPrice, 2400, 'legacy saved tier still wins with no engine config (byte-identical)');
}
{
  const r = econOf('channel_letters', { ...FIXTURE, pricing_engine: { default_markup_pct: 20 } }, 0);
  eq(r.internalCost, INTERNAL, 'wired: internalCost unchanged');
  eq(r.customerPrice, 2454, 'wired: engine sellTotal replaces the markup tail');
  ok(r.pricing_engine && r.pricing_engine.wired, 'wired economics exposed for audit');
}
{
  // Non-channel modules untouched (vinyl branch parity).
  const r = econOf('vinyl', { subtotal: 100, markup_amount: 20, total_cost: 120 }, 0);
  eq(r.internalCost, 100, 'vinyl branch unchanged');
  eq(r.customerPrice, 120);
}
{
  // Fallback record without subtotal: internalCost = total - markup_amount - letterMarkup.
  const r = econOf('channel_letters', { ...FIXTURE, subtotal: undefined, markup_amount: 452, total_cost: 2712 }, 0);
  eq(r.internalCost, 2712 - 452 - 215, 'fallback internalCost math unchanged');
}

console.log(`PASS channel-pricing-wire (${n} asserts: config detection, context blocks, cost-line projection parity, verbatim passthrough, line/project sell, tier/fixed/market/break/template/machine pricing, zero-qty, dangling tier_ref, inactive template/row, expired row, engine-vs-legacy precedence, sourceProjectEconomics end-to-end)`);
