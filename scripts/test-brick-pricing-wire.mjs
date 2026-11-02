// F-23c suite — brickPricingWire.ts + brickSellPricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23c):
//   * ZERO REGRESSION — a BrickStoneProject record with no engine-vocab
//     config resolves byte-identical economics at the customerPricing seam
//     (verbatim passthrough, no float ops).
//   * Engine config = a record-carried context block (pricing_engine /
//     engine_pricing / pricing_context / engine_context / pricing_tier_config,
//     incl. customer_pricing.engine_context|pricing_engine) or component-
//     scoped descriptors (material/mortar/labor `_pricing` blocks,
//     `<component>_<field>` flat fields, context items-map entries). Context
//     blocks price EVERY component; component config reprices only that
//     component — the rest keep their exact baseline contribution.
//   * The module's cost math stays authoritative (internal cost untouched);
//     brick cost/rate/geometry fields are never scanned for config.
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-brick-pricing-wire.mjs  →  "PASS brick-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-brick-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/brickPricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  brickCostLines, brickPricingContextOf, brickLineDescriptor,
  descriptorHasPricingContent, brickConfigScan, brickEngineConfigured,
  resolveBrickSellPricing,
} = W;

const engineOut = resolve(here, '.tmp-brick-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-brick-wire-tpl.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingTemplateModel.ts')],
  bundle: true, format: 'esm', outfile: tplOut, logLevel: 'silent',
});
const T = await import(pathToFileURL(tplOut).href);

const ENGINE = Object.freeze({
  pricePart: E.pricePart,
  resolveTemplatePrice: T.resolveTemplatePrice,
  templatePartDescriptor: T.templatePartDescriptor,
});

// The seam bundle — exercises the real wiring path end to end.
const seamOut = resolve(here, '.tmp-brick-wire-seam.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: seamOut, logLevel: 'silent',
});
const { sourceProjectEconomics, acceptedCustomerUnitPrice } = await import(pathToFileURL(seamOut).href);

// The glue bundle — seam adapter surface.
const glueOut = resolve(here, '.tmp-brick-wire-glue.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/brick/brickSellPricing.js')],
  bundle: true, format: 'esm', outfile: glueOut, logLevel: 'silent',
});
const GLUE = await import(pathToFileURL(glueOut).href);

// Module cost math — must remain the untouched authority.
const calcOut = resolve(here, '.tmp-brick-wire-calc.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/brick/brickCalc.js')],
  bundle: true, format: 'esm', outfile: calcOut, logLevel: 'silent',
});
const { calcBrickStoneProject } = await import(pathToFileURL(calcOut).href);

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m, eps = 0.005) => { n += 1; assert.ok(Math.abs(a - b) <= eps, `${m}: expected ~${b}, got ${a}`); };

const wire = (record, { baselineSell, internalCost, context } = {}) =>
  resolveBrickSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE });

// ===========================================================================
// Fixtures — subtotal 623, markup 20% -> 124.6, total 747.6.
// Units: material 300/200 = 1.5/brick, mortar 48/4 = 12/bag, labor 275/5 = 55/hr.
// ===========================================================================
const plainProject = () => ({
  project_name: 'Monument Base',
  client_name: 'City Parks',
  base_type: 'hollow_rectangular',
  calculated_bricks: 200,
  mortar_bags_needed: 4,
  labor_hours: 5,
  material_cost: 300,
  mortar_cost: 48,
  labor_cost: 275,
  subtotal: 623,
  markup_percent: 20,
  markup_amount: 124.6,
  total_cost: 747.6,
});

// ===========================================================================
// 1. Cost-line projection + config detection
// ===========================================================================
{
  const lines = brickCostLines(plainProject());
  eq(lines.length, 3, 'three component lines');
  eq(lines[0].key, 'material', 'material first');
  eq(lines[1].key, 'mortar', 'mortar second');
  eq(lines[2].key, 'labor', 'labor third');
  eq(lines[0].cost, 300, 'material cost base');
  eq(lines[0].qty, 200, 'material qty = calculated_bricks');
  eq(lines[1].qty, 4, 'mortar qty = mortar_bags_needed');
  eq(lines[2].qty, 5, 'labor qty = labor_hours');
  eq(lines[0].category_key, 'outsourced_fab', 'materials categorizer parity');
  eq(lines[2].category_key, 'outsourced_services', 'labor categorizer parity');
  eq(lines.reduce((s, l) => s + l.cost, 0), 623, 'sum invariant = subtotal');

  const noMortar = plainProject(); delete noMortar.mortar_cost;
  eq(brickCostLines(noMortar).length, 2, 'absent cost field drops the slot');
  const zeroCost = plainProject(); zeroCost.mortar_cost = 0;
  eq(brickCostLines(zeroCost).length, 3, 'present zero cost is still a line');
  const noQty = plainProject(); delete noQty.calculated_bricks;
  eq(brickCostLines(noQty)[0].qty, 1, 'missing qty field falls back to 1');
  const zeroQty = plainProject(); zeroQty.labor_hours = 0;
  eq(brickCostLines(zeroQty)[2].qty, 0, 'explicit zero qty honored');
  eq(brickCostLines(null).length, 0, 'null record -> no lines');
  eq(brickCostLines({}).length, 0, 'empty record -> no lines');
  eq(brickCostLines({ items: [{ fixed_price: 1 }] }).length, 0, 'items[] is not a brick cost line');
}

{
  // config detection — engine vocab only; brick geometry/cost fields are not.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_brick' }), 'unit enum per_brick not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_bag' }), 'unit enum per_bag not config');
  ok(!descriptorHasPricingContent({ mode: 'per_hour' }), 'per_hour not config');
  ok(!descriptorHasPricingContent({ base_type: 'hollow_rectangular' }), 'base_type enum not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'mason' }), 'bare machine name not config');
  ok(!descriptorHasPricingContent({ fixed_price: 0 }), 'fixed_price 0 not config');
  ok(!descriptorHasPricingContent({ markup_pct: 0 }), 'markup_pct 0 not config');
  ok(!descriptorHasPricingContent({ material_cost: 300, labor_cost: 275, mortar_bag_cost: 12, waste_factor: 1.1 }), 'cost-side fields not config');
  ok(descriptorHasPricingContent({ fixed_price: 2 }), 'fixed_price is config');
  ok(descriptorHasPricingContent({ markup_pct: 60 }), 'markup_pct is config');
  ok(descriptorHasPricingContent({ markup_pct: -15 }), 'nonzero markup (discount) is config');
  ok(descriptorHasPricingContent({ markup_percent: 30 }), 'markup_percent spelling is config');
  ok(descriptorHasPricingContent({ tier_ref: 'Gold' }), 'tier_ref is config');
  ok(descriptorHasPricingContent({ tier: 'Gold' }), 'tier pin is config');
  ok(descriptorHasPricingContent({ customer_tier: 'Gold' }), 'customer_tier pin is config');
  ok(descriptorHasPricingContent({ pricing_template_id: 't1' }), 'template id is config');
  ok(descriptorHasPricingContent({ pricing_template: { breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] } }), 'embedded template is config');
  ok(descriptorHasPricingContent({ per_unit_breaks: [{ qty: 1, unit_price: 5 }] }), 'qty chart is config');
  ok(descriptorHasPricingContent({ market_retail: 2.5 }), 'market_retail is config');
  ok(descriptorHasPricingContent({ market_discount_pct: 10 }), 'market_discount_pct is config');
  ok(descriptorHasPricingContent({ pricing_mode: 'market_based' }), 'market token is config');
  ok(descriptorHasPricingContent({ minimum_charge: 50 }), 'minimum_charge is config');
  ok(descriptorHasPricingContent({ setup_fee: 25 }), 'setup_fee is config');
  ok(descriptorHasPricingContent({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }), 'formula modifiers are config');
  ok(descriptorHasPricingContent({ machine: { markup_pct: 10 } }), 'machine descriptor w/ fields is config');
  ok(descriptorHasPricingContent({ global_pricing_tier_id: 'gpt-1' }), 'tier set link is config');
  ok(descriptorHasPricingContent({ tier_rules: [{ name: 'Gold', markup_pct: 40 }] }), 'embedded tier rules are config');
}

{
  // Record-level fields never engage: a full legacy brick record (incl.
  // markup_percent, which IS engine vocab inside a descriptor but is the
  // record's own cost-side input) scans clean.
  const scan = brickConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 3, 'scan counts component lines');
  eq(brickEngineConfigured(plainProject()), false, 'engagement probe false');

  const cfg = brickConfigScan({ ...plainProject(), labor_pricing: { markup_pct: 80 } });
  eq(cfg.configured, true, 'component block configures');
  eq(cfg.configuredCount, 1, 'one configured component');
  eq(cfg.lines.find((l) => l.key === 'labor').configured, true, 'labor flagged');
  eq(brickEngineConfigured({ ...plainProject(), pricing_engine: {} }), true, 'context block engages');
  eq(brickEngineConfigured({ ...plainProject(), customer_pricing: { engine_context: {} } }), true, 'nested context block engages');
  eq(brickEngineConfigured({ ...plainProject(), labor_markup_pct: 80 }), true, 'flat prefixed field engages');
  // A record carrying vinyl-style items[] config does NOT engage brick —
  // config carriers are component-scoped.
  eq(brickEngineConfigured({ ...plainProject(), items: [{ fixed_price: 1 }] }), false, 'items[] fields are not brick config');
}

{
  // Descriptor merge: flat < inline/nested-on-row < items map < component block.
  const rec = {
    ...plainProject(),
    labor_markup_pct: 10,
    engine_pricing: { items: { labor: { markup_pct: 20 } } },
    labor_pricing: { markup_pct: 30 },
  };
  const d = brickLineDescriptor(brickCostLines(rec)[2], rec);
  eq(d.markup_pct, 30, 'nested component block wins');
  const d2 = brickLineDescriptor(brickCostLines({ ...plainProject(), labor_markup_pct: 10 })[2], { ...plainProject(), labor_markup_pct: 10 });
  eq(d2.markup_pct, 10, 'flat prefixed field supplies descriptor');
  const d3 = brickLineDescriptor(brickCostLines(plainProject())[2], plainProject());
  eq(d3, null, 'no carriers -> null descriptor');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('brick_stone', rec);
  eq(econ.internalCost, 623, 'internal cost = record.subtotal');
  eq(econ.customerPrice, 747.6, 'customer price = record.total_cost verbatim');
  eq(econ.pricing_engine, undefined, 'no engine field on passthrough');

  const legacy = { ...rec }; delete legacy.subtotal;
  const econ2 = sourceProjectEconomics('brick_stone', legacy);
  near(econ2.internalCost, 623, 'internal cost = total - markup_amount', 0.0001);
  eq(econ2.customerPrice, 747.6, 'customer price unchanged without subtotal');

  const res = wire(rec, { baselineSell: 747.6, internalCost: 623 });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === 747.6, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, 747.6, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // Float identity: the passthrough returns the caller's number itself — no
  // float ops may touch it.
  const weird = 747.6000000000001;
  const res = wire(plainProject(), { baselineSell: weird });
  ok(res.customer_price === weird, 'verbatim float passthrough (no ops)');
  const econ = sourceProjectEconomics('brick_stone', { ...plainProject(), total_cost: weird });
  ok(econ.customerPrice === weird, 'seam passthrough keeps the stored float');
}

{
  // Saved Markup-Tier snapshot alone stays the winner (byte-identical).
  const rec = plainProject();
  rec.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econ = sourceProjectEconomics('brick_stone', rec);
  eq(econ.customerPrice, 500, 'saved tier still wins with no engine config');
  eq(econ.pricing_engine, undefined, 'no engine field');
  // customer_pricing.engine_context is the only nested probed block — a plain
  // tier snapshot (applied/tier_number/total/lines) never counts as a block.
  eq(brickEngineConfigured({ ...plainProject(), customer_pricing: { applied: true, total: 500, tier_number: 2 } }), false, 'tier snapshot is not a context block');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveBrickSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveBrickSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveBrickSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  const res = resolveBrickSellPricing({ record: { ...plainProject(), labor_pricing: { markup_pct: 80 } }, baselineSell: 747.6 });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
  ok(res.customer_price === 747.6, 'baseline verbatim without engine');
}

{
  // Module cost math untouched: calcBrickStoneProject stays the authority.
  const material = { length: 7.5, width: 3.5, height: 2.25, cost_per_unit: 1.5 };
  const r = calcBrickStoneProject(
    { mortar_gap: 0.375, layers: 1, courses_high: 5, bricks_along_length: 6, bricks_along_width: 9, waste_factor: 1.1, mortar_bag_cost: 12, bricks_per_hour: 40, labor_rate_per_hour: 55, markup_percent: 20 },
    material,
  );
  ok(r.subtotal === r.material_cost + r.mortar_cost + r.labor_cost, 'module subtotal = components');
  ok(r.total_cost === r.subtotal + r.markup_amount, 'module total = subtotal + markup');
  near(r.markup_amount, r.subtotal * 0.2, 'markup percent path intact', 0.0001);
}

// ===========================================================================
// 3. Engine-priced components — only the configured component reprices
// ===========================================================================
{
  // markup on labor only; material + mortar keep baseline contributions.
  const rec = { ...plainProject(), labor_pricing: { markup_pct: 100 } };
  const res = wire(rec, { baselineSell: 747.6, internalCost: 623 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.reason, 'priced', 'reason priced');
  eq(res.engine_priced_total, 550, 'labor ext 110 x 5');
  near(res.configured_baseline, 330, 'labor baseline = cost x 1.2');
  near(res.remainder_sell, 417.6, 'material+mortar baseline remainder');
  eq(res.customer_price, 967.6, 'remainder 417.6 + 550');
  const labor = res.lines.find((l) => l.key === 'labor');
  eq(labor.priced, true, 'labor priced');
  eq(labor.priced_via, 'descriptor', 'labor priced via own descriptor');
  eq(labor.engine.unit_price, 110, '55 x 2');
  eq(labor.engine.price_source, 'markup', 'markup source');
  eq(res.lines.find((l) => l.key === 'material').priced, false, 'material untouched');
  near(res.lines.find((l) => l.key === 'mortar').baseline_sell, 57.6, 'mortar baseline kept');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // fixed_price pins a per-unit sell on material (qty = calculated_bricks).
  const rec = { ...plainProject(), material_pricing: { fixed_price: 2 } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'material').engine.unit_price, 2, 'fixed unit price');
  eq(res.lines.find((l) => l.key === 'material').engine.price_source, 'fixed_price', 'fixed source');
  eq(res.lines.find((l) => l.key === 'material').engine.tier_source, 'part_fixed', 'part_fixed wins');
  eq(res.engine_priced_total, 400, '2 x 200 bricks');
  eq(res.customer_price, 787.6, 'remainder 387.6 + 400');
}

{
  // market mode: retail minus discount.
  const rec = { ...plainProject(), material_pricing: { pricing_mode: 'market_based', market_retail: 2.5, market_discount_pct: 10 } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'material').engine.unit_price, 2.25, 'retail 2.5 - 10%');
  eq(res.engine_priced_total, 450, '2.25 x 200');
  eq(res.customer_price, 837.6, 'remainder 387.6 + 450');
}

{
  // per_unit_breaks bracket pick at qty 5 labor hours.
  const rec = { ...plainProject(), labor_pricing: { per_unit_breaks: [{ qty: 10, unit_price: 40 }, { qty: 5, unit_price: 60 }] } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 60, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 300, '60 x 5');
  eq(res.customer_price, 717.6, 'remainder 417.6 + 300');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = { ...plainProject(), labor_pricing: { tier_ref: 'Gold' } };
  const res = wire(rec, { baselineSell: 747.6, context: { tierRules: [{ id: 'r1', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 88, '55 x 1.6');
  eq(res.customer_price, 857.6, 'remainder 417.6 + 440');
}

{
  // Machine descriptor override outranks every part layer.
  const rec = { ...plainProject(), labor_pricing: { machine: { markup_pct: 100 }, markup_pct: 5 } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'labor').engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 550, '55 x 2 x 5');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { ...plainProject(), mortar_pricing: { markup_pct: 20, minimum_charge: 80 } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'mortar').engine.minimum_applied, true, 'floor fired');
  eq(res.customer_price, 770, 'extension floored to 80');
  const rec2 = { ...plainProject(), mortar_pricing: { markup_pct: 20, setup_fee: 15 } };
  const res2 = wire(rec2, { baselineSell: 747.6 });
  eq(res2.lines.find((l) => l.key === 'mortar').engine.setup_fee, 15, 'setup fee captured');
  eq(res2.customer_price, 762.6, '57.6 extension + 15 setup');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { ...plainProject(), labor_pricing: { markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 72.6, '66 x 1.10 once — not twice');
  eq(res.customer_price, 780.6, 'labor repriced once');
}

{
  // Flat `<component>_<field>` spellings configure without nesting.
  const rec = { ...plainProject(), labor_markup_pct: 100 };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.customer_price, 967.6, 'labor_markup_pct flat field reprices labor');
}

{
  // Context-block items map: the block engages project-wide; the map entry
  // reprices labor, the other components land on their own baseline via the
  // context default (= record.markup_percent).
  const rec = { ...plainProject(), engine_pricing: { items: { labor: { markup_pct: 100 } } } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.context_engaged, true, 'context engagement recorded');
  eq(res.lines.filter((l) => l.priced).length, 3, 'context prices every component');
  eq(res.lines.find((l) => l.key === 'material').priced_via, 'context', 'material via context');
  eq(res.lines.find((l) => l.key === 'labor').priced_via, 'descriptor', 'labor via map descriptor');
  eq(res.customer_price, 967.6, 'material+mortar baseline via engine + labor 550');
}

// ===========================================================================
// 4. Context-block engagement — the engine owns the whole sell tail
// ===========================================================================
{
  // Context default markup rewrites every component.
  const rec = { ...plainProject(), pricing_engine: { default_markup_pct: 50 } };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.context_engaged, true, 'context engaged');
  eq(res.lines.filter((l) => l.priced).length, 3, 'all three priced');
  // material 1.5 x1.5 x200 = 450; mortar 12 x1.5 x4 = 72; labor 55 x1.5 x5 = 412.5
  eq(res.customer_price, 934.5, 'engine tail at 50%');
}

{
  // Empty block inherits record.markup_percent -> engine lands on baseline.
  const rec = { ...plainProject(), pricing_engine: {} };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.context_engaged, true, 'block engages');
  eq(res.customer_price, 747.6, 'empty block -> record.markup_percent tail');
}

{
  // customer_tier chart via context: every component doubles.
  const rec = {
    ...plainProject(),
    pricing_engine: {
      customer_tier: 'wholesale',
      tier_rules: [{ customer_tier: 'wholesale', markup_pct: 100 }],
    },
  };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.customer_price, 1246, 'wholesale row -> every line x2 (600+96+550)');
}

{
  // customer_pricing.engine_context is a recognized nested context block.
  const rec = {
    ...plainProject(),
    customer_pricing: { applied: true, total: 500, tier_number: 2, engine_context: { default_markup_pct: 50 } },
  };
  const res = wire(rec, { baselineSell: 747.6 });
  eq(res.context_engaged, true, 'nested block engages');
  eq(res.context_used.context_block, 'customer_pricing.engine_context', 'block field echoed');
  eq(res.customer_price, 934.5, 'engine tail replaces the saved snapshot');
}

// ===========================================================================
// 5. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'tpl-1' } };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Mason Chart', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: 747.6, context: ctx });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, true, 'template priced the line');
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 77, '55 x 1.40');
  eq(res.engine_priced_total, 385, 'ext 385');
  eq(res.customer_price, 802.6, 'remainder 417.6 + 385');
}

{
  // Embedded template record inside the component block — no registry needed.
  const rec = {
    ...plainProject(),
    labor_pricing: { pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } },
  };
  const res = wire(rec, { baselineSell: 747.6, context: { customerTier: 'Gold' } });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, true, 'embedded template resolved');
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 68.75, '55 x 1.25');
  eq(res.customer_price, 761.35, 'remainder 417.6 + 343.75');
}

{
  // Dangling template id falls through to remaining part layers.
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'ghost', markup_pct: 10 } };
  const res = wire(rec, { baselineSell: 747.6, context: { templates: [] } });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, false, 'dangling template not applied');
  eq(res.lines.find((l) => l.key === 'labor').engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 60.5, 'part markup survives the miss');
  eq(res.customer_price, 720.1, 'remainder 417.6 + 302.5');
}

{
  // Inactive template: reason recorded; the engine chain prices the line via
  // the remaining layers (default markup — landing back on baseline share).
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'tpl-1' } };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: 747.6, context: ctx });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, 747.6, 'default layer lands back on baseline share');
}

{
  // Dangling tier ref: engine reports the unpriced hit and prices at cost —
  // never silently falls back to a weaker layer.
  const rec = { ...plainProject(), labor_pricing: { tier_ref: 'Platinum' } };
  const res = wire(rec, { baselineSell: 747.6, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines.find((l) => l.key === 'labor').engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.lines.find((l) => l.key === 'labor').engine.extended, 275, 'dangling -> cost');
  eq(res.customer_price, 692.6, 'remainder 417.6 + 275');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 6. Edge cases
// ===========================================================================
{
  // Zero qty: extension 0, engine minimum never fires.
  const rec = { ...plainProject(), labor_hours: 0, labor_pricing: { markup_pct: 50 } };
  const res = wire(rec, { baselineSell: 747.6 });
  const labor = res.lines.find((l) => l.key === 'labor');
  eq(labor.priced, true, 'zero-qty line still resolved');
  eq(labor.engine.extended, 0, 'zero qty -> zero extension');
  eq(res.engine_priced_total, 0, 'no engine dollars');
  eq(res.customer_price, 417.6, 'configured zero-qty sell is remainder only');
}

{
  // Configured component without a cost base is SKIPPED (stays baseline) —
  // reachable via an explicit input.lines[] override.
  const res = resolveBrickSellPricing({
    record: plainProject(),
    lines: [{ key: 'labor', qty: 1, cost: null, markup_pct: 80 }],
    baselineSell: 90,
    engine: ENGINE,
  });
  eq(res.passthrough, true, 'no cost base -> passthrough');
  eq(res.reason, 'no_priced_lines', 'reason recorded');
  ok(res.customer_price === 90, 'baseline verbatim');
  ok(res.warnings.some((w) => /no cost base/.test(w)), 'skip warns');

  // Mixed: skipped line + priced line.
  const res2 = resolveBrickSellPricing({
    record: plainProject(),
    lines: [
      { key: 'labor', qty: 1, cost: null, markup_pct: 80 },
      { key: 'material', qty: 1, cost: 60, fixed_price: 30 },
    ],
    baselineSell: 165,
    engine: ENGINE,
  });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  // markup_factor 1.2: configured baseline 60 x 1.2 = 72 -> 165 - 72 + 30
  eq(res2.customer_price, 123, '165 - 72 configured baseline + 30 engine');
}

{
  // Precedence: engine config owns the sell side and wins over a legacy
  // saved customer_pricing snapshot.
  const rec = { ...plainProject(), labor_pricing: { markup_pct: 100 } };
  rec.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econ = sourceProjectEconomics('brick_stone', rec);
  eq(econ.internalCost, 623, 'internal cost unaffected');
  eq(econ.customerPrice, 967.6, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced component');
}

{
  // Non-finite garbage never throws.
  const res = resolveBrickSellPricing({ record: { labor_cost: 'x', material_cost: 'y', mortar_cost: 'z', labor_pricing: { markup_pct: 50 } }, baselineSell: 10, engine: ENGINE });
  ok(res.passthrough === true || Number.isFinite(res.customer_price), 'garbage costs resolve safely');
}

// ===========================================================================
// 7. sourceProjectEconomics end-to-end (bundled seam graph)
// ===========================================================================
{
  const econ = sourceProjectEconomics('brick_stone', plainProject());
  eq(econ.internalCost, 623, 'seam: internal cost authoritative');
  eq(econ.customerPrice, 747.6, 'seam: baseline verbatim');
  eq(econ.pricing_engine, undefined, 'no engine field');
}

{
  // pricingContext param reaches the wire (registry-backed tier_ref via the
  // flat `labor_tier_ref` field).
  const rec = { ...plainProject(), labor_tier_ref: 'Gold' };
  const econ = sourceProjectEconomics('brick_stone', rec, 0, { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] });
  eq(econ.customerPrice, 857.6, 'seam: caller registries resolve tier refs');
  ok(econ.pricing_engine && econ.pricing_engine.applied, 'engine attached');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    ...plainProject(),
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
  };
  const econ = sourceProjectEconomics('brick_stone', rec);
  // material 1.5x1.6x200=480; mortar 12x1.6x4=76.8; labor 55x1.6x5=440
  eq(econ.customerPrice, 996.8, 'embedded context drives engine price');
}

{
  // Other modules untouched: vinyl/maintenance keep their own math, channel
  // and foundation keep theirs, unknown keys hit the fallback. A record with
  // vinyl-style items[] produces no brick cost lines -> byte-identical.
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50, fixed_price: 1 }] };
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'items[] never configures brick');
  eq(sourceProjectEconomics('brick_stone', rec).internalCost, 100, 'internal = subtotal');
  eq(sourceProjectEconomics('vinyl', { subtotal: 100, markup_amount: 20, total_cost: 120 }).customerPrice, 120, 'vinyl branch math preserved');
  // F-23i: maintenance now scans items[] like vinyl/metal — the fixed_price
  // line legitimately reprices there, so the "untouched" check uses a
  // config-free item.
  eq(sourceProjectEconomics('maintenance', { ...rec, items: [{ id: 'a', item_total_cost: 50 }] }).customerPrice, 120, 'maintenance passthrough on unconfigured record');
  const ch = { total_letters_cost: 140, letters_subtotal: 100, subtotal: 120, total_cost: 120 };
  const econCh = sourceProjectEconomics('channel_letters', ch);
  eq(econCh.customerPrice, 120, 'channel math preserved');
  eq(econCh.internalCost, 80, 'channel internal = subtotal - letter markup');
  const fd = { total_cost: 99, customer_markup_percent: 10, customer_price_override: 0 };
  near(sourceProjectEconomics('foundation', fd, 99).customerPrice, 108.9, 'foundation markup path', 0.001);
  eq(sourceProjectEconomics('mystery', rec, 7).customerPrice, 7, 'fallback module');
  eq(acceptedCustomerUnitPrice({ customer_price_snapshot: 42 }), 42, 'aio seam untouched');
}

{
  // Glue adapter surface (vinyl-parity names).
  eq(GLUE.brickHasEnginePricing(plainProject()), false, 'glue: plain not configured');
  eq(GLUE.brickHasEnginePricing({ ...plainProject(), labor_pricing: { markup_pct: 80 } }), true, 'glue: component config detected');
  eq(GLUE.brickHasEnginePricing({ ...plainProject(), pricing_engine: {} }), true, 'glue: context block detected');
  eq(GLUE.brickEngineCustomerPrice(plainProject(), { baselineSell: 747.6 }), 747.6, 'glue: price verbatim without config');
  eq(GLUE.brickEngineCustomerPrice({ ...plainProject(), labor_pricing: { markup_pct: 100 } }, { baselineSell: 747.6 }), 967.6, 'glue: engine price when configured');
  const wired = GLUE.brickEngineEconomics({ ...plainProject(), labor_pricing: { markup_pct: 100 } }, { baselineSell: 747.6, internalCost: 623 });
  eq(wired.customerPrice, 967.6, 'glue economics wired');
  eq(wired.internalCost, 623, 'glue internalCost echoed');
  ok(wired.resolution && wired.resolution.applied, 'resolution carried');
  eq(GLUE.brickEngineEconomics(plainProject(), { baselineSell: 747.6, internalCost: 623 }), null, 'glue returns null without config');
  eq(GLUE.brickEngineEconomics(null, { baselineSell: 5 }), null, 'glue tolerates null record');
}

{
  // Context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = brickPricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.hasContextBlock, true, 'embedded block detected');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = brickPricingContextOf({ customer_pricing: { tier_number: 2 }, markup_percent: 20 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.hasContextBlock, false, 'no block -> no engagement');
  eq(ctx2.defaultMarkupPct, 20, 'record markup percent is the default');
}

// ===========================================================================
console.log(`PASS brick-pricing-wire (${n} asserts: line projection, detection truth table, verbatim passthrough incl. float-identity, fixed/markup/market/break/tier/machine/min/setup/modifier pricing, context-block engagement, template/dangling/inactive paths, zero-qty, skipped-no-cost, engine-vs-legacy precedence, sourceProjectEconomics end-to-end)`);
