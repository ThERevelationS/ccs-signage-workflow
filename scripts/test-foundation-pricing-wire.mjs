// F-23h suite — foundationPricingWire.ts + foundationSellPricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23h):
//   * ZERO REGRESSION — a FoundationProject record with no engine-vocab
//     config resolves byte-identical economics at the customerPricing seam
//     (verbatim passthrough, no float ops).
//   * Engine config = a record-carried context block (pricing_engine /
//     engine_pricing / pricing_context / engine_context / pricing_tier_config,
//     incl. customer_pricing.engine_context|pricing_engine) or component-
//     scoped descriptors (<component>_pricing blocks, `<component>_<field>`
//     flat fields, context items-map entries) on the persisted split-total
//     cost components (concrete/rebar/excavation/forming/labor/walls/poles/
//     pole_painting/equipment/wall_caps/signage/landscape). Context blocks
//     price EVERY component; component config reprices only that component —
//     the rest keep their exact baseline contribution.
//   * The module's cost math stays authoritative (internal cost untouched);
//     foundation cost/rate/geometry/sell fields (incl. customer_markup_percent
//     and customer_price_override) are never scanned for config.
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, flat override remainder,
//     embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-foundation-pricing-wire.mjs  →  "PASS foundation-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-foundation-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/foundationPricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  foundationCostLines, foundationPricingContextOf, foundationLineDescriptor,
  descriptorHasPricingContent, foundationConfigScan, foundationEngineConfigured,
  resolveFoundationSellPricing,
} = W;

const engineOut = resolve(here, '.tmp-foundation-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-foundation-wire-tpl.mjs');
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
const seamOut = resolve(here, '.tmp-foundation-wire-seam.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: seamOut, logLevel: 'silent',
});
const { sourceProjectEconomics, acceptedCustomerUnitPrice } = await import(pathToFileURL(seamOut).href);

// The glue bundle — seam adapter surface.
const glueOut = resolve(here, '.tmp-foundation-wire-glue.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/foundation/foundationSellPricing.js')],
  bundle: true, format: 'esm', outfile: glueOut, logLevel: 'silent',
});
const GLUE = await import(pathToFileURL(glueOut).href);

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m, eps = 0.005) => { n += 1; assert.ok(Math.abs(a - b) <= eps, `${m}: expected ~${b}, got ${a}`); };

const wire = (record, { baselineSell, internalCost, markupPercent, context } = {}) =>
  resolveFoundationSellPricing({ record, baselineSell, internalCost, markupPercent, context, engine: ENGINE });

// ===========================================================================
// Fixtures — the sourceProjectTotal "known" split-total partition.
//   concrete 900 + rebar 250 + excavation 180 + forming 120 + labor 640
//   + wall 1240 (= wall_materials 850 + wall_labor 390)
//   + poles 300 + pole_painting 60 + equipment 400 + wall_caps 80
//   + signage 150 + landscape 70                = 4390 total cost
// customer_markup_percent 25 -> baseline sell 5487.5
// ===========================================================================
const plainProject = () => ({
  project_name: 'Monument Sign Base',
  client_name: 'City Parks',
  items: [
    { foundation_type: 'spread_foot', quantity: 2, concrete_volume_cy: 4, rebar_feet: 75, excavation_volume_cy: 5, forming_qty: 20, pouring_hours: 3, finishing_hours: 5, item_total_cost: 1045 },
    { foundation_type: 'pillar', quantity: 1, concrete_volume_cy: 2, rebar_feet: 50, excavation_volume_cy: 2.5, forming_qty: 10, pouring_hours: 1, finishing_hours: 3, item_total_cost: 1025 },
  ],
  walls: [
    { name: 'W1', calculatedCosts: { materialCost: 600, mortarCost: 50, laborCost: 250, laborHours: 4, totalBricks: 800, internalMaterialCost: 150, internalMortarCost: 50, internalLaborCost: 140, internalLaborHours: 2, internalTotalBricks: 200, totalCost: 1240 } },
  ],
  poles: [{ pole_id: 'p1', paint: true, pole_cost: 300, pole_painting_cost: 60, total_cost: 360 }],
  wall_caps: [{ id: 'c1', length_inches: 96 }],
  signage_cabinets: [{ id: 's1', quantity: 2, unit_cost: 75 }],
  selected_equipment: [{ equipment_id: 'e1', equipment_cost: 400 }],
  landscape: { cell_size_inches: 12, cells: { '0,0': 'mulch', '1,0': 'mulch', '0,1': 'stone', '1,1': 'stone', '2,2': 'stone', '3,3': 'stone', '4,4': 'stone' } },
  total_concrete_cost: 900,
  total_rebar_cost: 250,
  total_excavation_cost: 180,
  total_forming_materials_cost: 120,
  total_labor_cost: 640,
  total_wall_cost: 1240,
  total_brick_cost: 600,
  total_fill_cost: 150,
  total_pole_cost: 300,
  total_pole_painting_cost: 60,
  total_equipment_cost: 400,
  total_wall_cap_cost: 80,
  total_signage_cabinet_cost: 150,
  total_landscape_cost: 70,
  customer_markup_percent: 25,
});

const COST_TOTAL = 4390;
const BASELINE = 5487.5; // 4390 x 1.25

// ===========================================================================
// 1. Cost-line projection + config detection
// ===========================================================================
{
  const lines = foundationCostLines(plainProject());
  eq(lines.length, 13, 'twelve split totals -> thirteen lines (wall breakdown)');
  const keys = lines.map((l) => l.key);
  eq(keys.join(','), 'concrete,rebar,excavation,forming,labor,wall_materials,wall_labor,poles,pole_painting,equipment,wall_caps,signage,landscape', 'canonical component order');
  eq(lines[0].cost, 900, 'concrete cost base');
  eq(lines[0].qty, 6, 'concrete qty = Σ items[].concrete_volume_cy');
  eq(lines[1].qty, 125, 'rebar qty = Σ rebar_feet');
  eq(lines[2].qty, 7.5, 'excavation qty = Σ excavation_volume_cy');
  eq(lines[4].qty, 12, 'labor qty = Σ pouring+finishing hours');
  eq(lines[5].cost, 850, 'wall materials = material+mortar+internal material+internal mortar');
  eq(lines[5].qty, 1000, 'wall material qty = bricks + internal bricks');
  eq(lines[6].cost, 390, 'wall labor = labor + internal labor');
  eq(lines[6].qty, 6, 'wall labor qty = hours + internal hours');
  eq(lines[7].qty, 1, 'poles qty = poles.length');
  eq(lines[8].qty, 1, 'pole painting qty = painted poles');
  eq(lines[9].qty, 1, 'equipment qty = selected_equipment.length');
  eq(lines[10].qty, 1, 'wall cap qty = wall_caps.length');
  eq(lines[11].qty, 2, 'signage qty = Σ cabinet quantity');
  eq(lines[12].qty, 7, 'landscape qty = painted cell count');
  eq(lines[0].category_key, 'outsourced_fab', 'concrete categorizer parity');
  eq(lines[2].category_key, 'inhouse_labor', 'excavation -> inhouse_labor parity');
  eq(lines[4].category_key, 'inhouse_labor', 'labor categorizer parity');
  eq(lines[6].category_key, 'outsourced_services', 'wall labor categorizer parity');
  eq(lines[9].category_key, 'outsourced_services', 'equipment categorizer parity');
  eq(lines.reduce((s, l) => s + l.cost, 0), COST_TOTAL, 'sum invariant = sourceProjectTotal partition');

  // No walls[] breakdown -> the aggregate total_wall_cost fills the slot.
  const agg = { ...plainProject() }; delete agg.walls;
  const aggLines = foundationCostLines(agg);
  ok(aggLines.some((l) => l.key === 'walls' && l.cost === 1240), 'aggregate walls line without breakdown');
  ok(!aggLines.some((l) => l.key === 'wall_materials'), 'no materials line without breakdown');
  eq(aggLines.reduce((s, l) => s + l.cost, 0), COST_TOTAL, 'aggregate partition still sums');

  const noExc = plainProject(); delete noExc.total_excavation_cost;
  eq(foundationCostLines(noExc).length, 12, 'absent cost field drops the slot');
  const zeroCost = plainProject(); zeroCost.total_landscape_cost = 0;
  eq(foundationCostLines(zeroCost).length, 13, 'present zero cost is still a line');
  const noItems = { ...plainProject() }; delete noItems.items;
  eq(foundationCostLines(noItems)[0].qty, 1, 'missing items[] falls back to qty 1');
  const qtyField = { ...plainProject(), total_concrete_volume_cy: 9 };
  eq(foundationCostLines(qtyField)[0].qty, 9, 'record-level qty field wins over derived');
  eq(foundationCostLines(null).length, 0, 'null record -> no lines');
  eq(foundationCostLines({}).length, 0, 'empty record -> no lines');
  eq(foundationCostLines({ items: [{ fixed_price: 1 }] }).length, 0, 'items[] is not a cost line');
  // total_brick_cost / total_fill_cost are subsets of total_wall_cost — never lines.
  const subsetOnly = { total_brick_cost: 500, total_fill_cost: 100 };
  eq(foundationCostLines(subsetOnly).length, 0, 'brick/fill subsets are not components');
}

{
  // config detection — engine vocab only; foundation cost/sell fields are not.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_cy' }), 'unit enum per_cy not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_bag' }), 'unit enum per_bag not config');
  ok(!descriptorHasPricingContent({ mode: 'per_truck' }), 'per_truck not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_day' }), 'rental unit per_day not config');
  ok(!descriptorHasPricingContent({ excavation_method: 'hand_dig' }), 'excavation enum not config');
  ok(!descriptorHasPricingContent({ foundation_type: 'pillar' }), 'type enum not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'backhoe' }), 'bare machine name not config');
  ok(!descriptorHasPricingContent({ fixed_price: 0 }), 'fixed_price 0 not config');
  ok(!descriptorHasPricingContent({ markup_pct: 0 }), 'markup_pct 0 not config');
  ok(!descriptorHasPricingContent({ total_concrete_cost: 900, concrete_cost_per_cy: 135, pouring_labor_rate: 60, rental_period: 'day' }), 'cost-side fields not config');
  ok(descriptorHasPricingContent({ fixed_price: 200 }), 'fixed_price is config');
  ok(descriptorHasPricingContent({ markup_pct: 60 }), 'markup_pct is config');
  ok(descriptorHasPricingContent({ markup_pct: -15 }), 'nonzero markup (discount) is config');
  ok(descriptorHasPricingContent({ markup_percent: 30 }), 'markup_percent spelling is config');
  ok(descriptorHasPricingContent({ tier_ref: 'Gold' }), 'tier_ref is config');
  ok(descriptorHasPricingContent({ tier: 'Gold' }), 'tier pin is config');
  ok(descriptorHasPricingContent({ customer_tier: 'Gold' }), 'customer_tier pin is config');
  ok(descriptorHasPricingContent({ pricing_template_id: 't1' }), 'template id is config');
  ok(descriptorHasPricingContent({ pricing_template: { breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] } }), 'embedded template is config');
  ok(descriptorHasPricingContent({ per_unit_breaks: [{ qty: 1, unit_price: 150 }] }), 'qty chart is config');
  ok(descriptorHasPricingContent({ market_retail: 1200 }), 'market_retail is config');
  ok(descriptorHasPricingContent({ market_discount_pct: 10 }), 'market_discount_pct is config');
  ok(descriptorHasPricingContent({ pricing_mode: 'market_based' }), 'market token is config');
  ok(descriptorHasPricingContent({ minimum_charge: 500 }), 'minimum_charge is config');
  ok(descriptorHasPricingContent({ setup_fee: 250 }), 'setup_fee is config');
  ok(descriptorHasPricingContent({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }), 'formula modifiers are config');
  ok(descriptorHasPricingContent({ machine: { markup_pct: 10 } }), 'machine descriptor w/ fields is config');
  ok(descriptorHasPricingContent({ global_pricing_tier_id: 'gpt-1' }), 'tier set link is config');
  ok(descriptorHasPricingContent({ tier_rules: [{ name: 'Gold', markup_pct: 40 }] }), 'embedded tier rules are config');
}

{
  // Record-level fields never engage: a full persisted foundation record
  // (incl. customer_markup_percent + customer_price_override, which ARE
  // engine vocab inside a descriptor but are the record's own sell inputs)
  // scans clean — as do rate/geometry fields sharing component prefixes
  // (forming_labor_rate, equipment_excavation_labor_rate, ...).
  const scan = foundationConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 13, 'scan counts component lines');
  eq(foundationEngineConfigured(plainProject()), false, 'engagement probe false');
  const legacy = { ...plainProject(), customer_price_override: 6000 };
  eq(foundationConfigScan(legacy).configured, false, 'price override alone is not config');
  const rates = { ...plainProject(), forming_labor_rate: 55, equipment_excavation_labor_rate: 35, hand_dig_labor_rate: 45, labor: { rate: 1 } };
  eq(foundationConfigScan(rates).configured, false, 'rate fields sharing prefixes are not config');

  const cfg = foundationConfigScan({ ...plainProject(), labor_pricing: { markup_pct: 80 } });
  eq(cfg.configured, true, 'component block configures');
  eq(cfg.configuredCount, 1, 'one configured component');
  eq(cfg.lines.find((l) => l.key === 'labor').configured, true, 'labor flagged');
  eq(foundationEngineConfigured({ ...plainProject(), pricing_engine: {} }), true, 'context block engages');
  eq(foundationEngineConfigured({ ...plainProject(), customer_pricing: { engine_context: {} } }), true, 'nested context block engages');
  eq(foundationEngineConfigured({ ...plainProject(), labor_markup_pct: 80 }), true, 'flat prefixed field engages');
  eq(foundationEngineConfigured({ ...plainProject(), walls_pricing: { markup_pct: 40 } }), true, 'generic walls carrier configures breakdown');
  eq(foundationConfigScan({ ...plainProject(), walls_markup_pct: 40 }).configuredCount, 2, 'generic walls flat field feeds both breakdown lines');
  // A record carrying vinyl-style items[] config does NOT engage foundation —
  // config carriers are component-scoped.
  eq(foundationEngineConfigured({ ...plainProject(), items: [{ fixed_price: 1 }] }), false, 'items[] fields are not foundation config');
}

{
  // Descriptor merge: flat < inline/nested-on-row < items map < component
  // block; generic walls carriers < specific component keys.
  const rec = {
    ...plainProject(),
    labor_markup_pct: 10,
    engine_pricing: { items: { labor: { markup_pct: 20 } } },
    labor_pricing: { markup_pct: 30 },
  };
  const d = foundationLineDescriptor(foundationCostLines(rec)[4], rec);
  eq(d.markup_pct, 30, 'nested component block wins');
  const d2 = foundationLineDescriptor(foundationCostLines({ ...plainProject(), labor_markup_pct: 10 })[4], { ...plainProject(), labor_markup_pct: 10 });
  eq(d2.markup_pct, 10, 'flat prefixed field supplies descriptor');
  const d3 = foundationLineDescriptor(foundationCostLines(plainProject())[4], plainProject());
  eq(d3, null, 'no carriers -> null descriptor');
  const wallRec = { ...plainProject(), walls_markup_pct: 10, wall_labor_pricing: { markup_pct: 40 } };
  const wl = foundationLineDescriptor(foundationCostLines(wallRec).find((l) => l.key === 'wall_labor'), wallRec);
  eq(wl.markup_pct, 40, 'specific wall_labor block overrides generic walls field');
  const wm = foundationLineDescriptor(foundationCostLines(wallRec).find((l) => l.key === 'wall_materials'), wallRec);
  eq(wm.markup_pct, 10, 'generic walls field reaches materials line');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL);
  eq(econ.internalCost, COST_TOTAL, 'internal cost = caller total');
  eq(econ.customerPrice, BASELINE, 'customer price = markup path verbatim');
  eq(econ.pricing_engine, undefined, 'no engine field on passthrough');

  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === BASELINE, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, BASELINE, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // customer_price_override path stays byte-identical.
  const rec = { ...plainProject(), customer_price_override: 6000 };
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL);
  eq(econ.customerPrice, 6000, 'override path verbatim');
  eq(econ.pricing_engine, undefined, 'no engine field');
  const res = wire(rec, { baselineSell: 6000, internalCost: COST_TOTAL });
  eq(res.reason, 'no_config', 'override alone stays passthrough');
  ok(res.customer_price === 6000, 'override verbatim through wire');
}

{
  // Float identity: the passthrough returns the caller's number itself — no
  // float ops may touch it.
  const weird = 5487.500000000001;
  const res = wire(plainProject(), { baselineSell: weird });
  ok(res.customer_price === weird, 'verbatim float passthrough (no ops)');
  const econ = sourceProjectEconomics('foundation', plainProject(), weird);
  eq(econ.customerPrice, weird * 1.25, 'seam passthrough keeps the stored float');
}

{
  // Saved Markup-Tier snapshot alone stays the winner (byte-identical).
  const rec = plainProject();
  rec.customer_pricing = { applied: true, total: 5000, tier_number: 2 };
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL);
  eq(econ.customerPrice, 5000, 'saved tier still wins with no engine config');
  eq(econ.pricing_engine, undefined, 'no engine field');
  eq(foundationEngineConfigured({ ...plainProject(), customer_pricing: { applied: true, total: 5000, tier_number: 2 } }), false, 'tier snapshot is not a context block');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveFoundationSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveFoundationSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveFoundationSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  const res = resolveFoundationSellPricing({ record: { ...plainProject(), labor_pricing: { markup_pct: 80 } }, baselineSell: BASELINE });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
  ok(res.customer_price === BASELINE, 'baseline verbatim without engine');
}

// ===========================================================================
// 3. Engine-priced components — only the configured component reprices
// ===========================================================================
{
  // markup on labor only; every other component keeps baseline contribution.
  const rec = { ...plainProject(), labor_pricing: { markup_pct: 100 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.reason, 'priced', 'reason priced');
  // labor unit cost = 640/12 h; unit price = unit x 2 -> ext = 640 x 2 = 1280
  eq(res.engine_priced_total, 1280, 'labor ext 640 x 2');
  near(res.configured_baseline, 800, 'labor baseline = cost x 1.25');
  near(res.remainder_sell, 4687.5, 'remainder = baseline - labor baseline');
  eq(res.customer_price, 5967.5, 'remainder 4687.5 + 1280');
  const labor = res.lines.find((l) => l.key === 'labor');
  eq(labor.priced, true, 'labor priced');
  eq(labor.priced_via, 'descriptor', 'labor priced via own descriptor');
  eq(labor.engine.price_source, 'markup', 'markup source');
  eq(res.lines.find((l) => l.key === 'concrete').priced, false, 'concrete untouched');
  near(res.lines.find((l) => l.key === 'rebar').baseline_sell, 312.5, 'rebar baseline kept');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // fixed_price pins a per-unit sell on concrete (qty = Σ volume).
  const rec = { ...plainProject(), concrete_pricing: { fixed_price: 200 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'concrete').engine.unit_price, 200, 'fixed unit price');
  eq(res.lines.find((l) => l.key === 'concrete').engine.price_source, 'fixed_price', 'fixed source');
  eq(res.lines.find((l) => l.key === 'concrete').engine.tier_source, 'part_fixed', 'part_fixed wins');
  eq(res.engine_priced_total, 1200, '200 x 6 cy');
  eq(res.customer_price, 5562.5, 'remainder 4362.5 + 1200');
}

{
  // market mode: retail minus discount on wall materials.
  const rec = { ...plainProject(), wall_materials_pricing: { pricing_mode: 'market_based', market_retail: 1, market_discount_pct: 10 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'wall_materials').engine.unit_price, 0.9, 'retail 1 - 10%');
  eq(res.engine_priced_total, 900, '0.9 x 1000 bricks');
  eq(res.customer_price, 5325, 'remainder 4425 + 900');
}

{
  // per_unit_breaks bracket pick at qty 12 labor hours.
  const rec = { ...plainProject(), labor_pricing: { per_unit_breaks: [{ qty: 20, unit_price: 40 }, { qty: 10, unit_price: 70 }] } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'labor').engine.unit_price, 70, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 840, '70 x 12');
  eq(res.customer_price, 5527.5, 'remainder 4687.5 + 840');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = { ...plainProject(), equipment_pricing: { tier_ref: 'Rental' } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: { tierRules: [{ id: 'r1', name: 'Rental', markup_pct: 50 }] } });
  eq(res.lines.find((l) => l.key === 'equipment').engine.unit_price, 600, '400 x 1.5');
  eq(res.engine_priced_total, 600, 'equipment x1.5');
  eq(res.customer_price, 5587.5, 'remainder 4987.5 + 600');
}

{
  // Machine descriptor override outranks every part layer.
  const rec = { ...plainProject(), equipment_pricing: { machine: { markup_pct: 100 }, markup_pct: 5 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'equipment').engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 800, '400 x 2');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { ...plainProject(), signage_pricing: { markup_pct: 20, minimum_charge: 400 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'signage').engine.minimum_applied, true, 'floor fired');
  eq(res.lines.find((l) => l.key === 'signage').engine.extended, 400, 'extension floored to 400');
  eq(res.customer_price, 5700, 'remainder 5300 + 400');
  const rec2 = { ...plainProject(), landscape_pricing: { markup_pct: 20, setup_fee: 30 } };
  const res2 = wire(rec2, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res2.lines.find((l) => l.key === 'landscape').engine.setup_fee, 30, 'setup fee captured');
  eq(res2.customer_price, 5514, '84 extension + 30 setup + remainder 5400');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { ...plainProject(), poles_pricing: { markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.find((l) => l.key === 'poles').engine.unit_price, 396, '360 x 1.10 once — not twice');
  eq(res.customer_price, 5508.5, 'remainder 5112.5 + 396');
}

{
  // Flat `<component>_<field>` spellings configure without nesting.
  const rec = { ...plainProject(), labor_markup_pct: 100 };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.customer_price, 5967.5, 'labor_markup_pct flat field reprices labor');
}

{
  // Generic walls carrier reprices BOTH breakdown lines; a specific carrier
  // overrides its half.
  const rec = { ...plainProject(), walls_markup_pct: 50 };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.lines.filter((l) => l.priced).length, 2, 'generic walls config prices both halves');
  // wall_materials 850 x 1.5 = 1275 ; wall_labor 390 x 1.5 = 585
  eq(res.engine_priced_total, 1860, 'wall halves at x1.5');
  eq(res.customer_price, 5797.5, 'remainder 3937.5 + 1860');
  const rec2 = { ...plainProject(), walls_markup_pct: 50, wall_labor_markup_pct: 100 };
  const res2 = wire(rec2, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res2.engine_priced_total, 2055, 'materials 1275 + labor 780');
}

{
  // Context-block items map: the block engages project-wide; the map entry
  // reprices labor, other components land on their own baseline via the
  // context default (= record.customer_markup_percent).
  const rec = { ...plainProject(), engine_pricing: { items: { labor: { markup_pct: 100 } } } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.context_engaged, true, 'context engagement recorded');
  eq(res.lines.filter((l) => l.priced).length, 13, 'context prices every component');
  eq(res.lines.find((l) => l.key === 'concrete').priced_via, 'context', 'concrete via context');
  eq(res.lines.find((l) => l.key === 'labor').priced_via, 'descriptor', 'labor via map descriptor');
  // labor baseline 800 -> engine 1280 (+480); every other line lands on its
  // own baseline via the context default (= customer_markup_percent 25).
  eq(res.customer_price, BASELINE + 480, 'every line at own baseline + labor repriced x2');
}

// ===========================================================================
// 4. Context-block engagement — the engine owns the whole sell tail
// ===========================================================================
{
  // Context default markup rewrites every component.
  const rec = { ...plainProject(), pricing_engine: { default_markup_pct: 50 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.context_engaged, true, 'context engaged');
  eq(res.lines.filter((l) => l.priced).length, 13, 'all thirteen priced');
  eq(res.customer_price, 6585, 'engine tail at 50% (4390 x 1.5)');
}

{
  // Empty block inherits record.customer_markup_percent -> engine lands on
  // baseline.
  const rec = { ...plainProject(), pricing_engine: {} };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.context_engaged, true, 'block engages');
  eq(res.customer_price, BASELINE, 'empty block -> customer_markup_percent tail');
}

{
  // Empty block under a flat override keeps the override (the delta rides
  // the remainder).
  const rec = { ...plainProject(), customer_price_override: 6000, pricing_engine: {} };
  const res = wire(rec, { baselineSell: 6000, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.customer_price, 6000, 'override preserved under empty context block');
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
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.customer_price, 8780, 'wholesale row -> every line x2 (4390 x 2)');
}

{
  // customer_pricing.engine_context is a recognized nested context block.
  const rec = {
    ...plainProject(),
    customer_pricing: { applied: true, total: 5000, tier_number: 2, engine_context: { default_markup_pct: 50 } },
  };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(res.context_engaged, true, 'nested block engages');
  eq(res.context_used.context_block, 'customer_pricing.engine_context', 'block field echoed');
  eq(res.customer_price, 6585, 'engine tail replaces the saved snapshot');
}

// ===========================================================================
// 5. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'tpl-1' } };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Crew Chart', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: ctx });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, true, 'template priced the line');
  eq(res.engine_priced_total, 896, '640 x 1.40');
  eq(res.customer_price, 5583.5, 'remainder 4687.5 + 896');
}

{
  // Embedded template record inside the component block — no registry needed.
  const rec = {
    ...plainProject(),
    labor_pricing: { pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } },
  };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: { customerTier: 'Gold' } });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, true, 'embedded template resolved');
  eq(res.engine_priced_total, 800, '640 x 1.25');
  eq(res.customer_price, 5487.5, 'remainder 4687.5 + 800');
}

{
  // Dangling template id falls through to remaining part layers.
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'ghost', markup_pct: 10 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: { templates: [] } });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, false, 'dangling template not applied');
  eq(res.lines.find((l) => l.key === 'labor').engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.engine_priced_total, 704, 'part markup survives the miss (640 x 1.1)');
  eq(res.customer_price, 5391.5, 'remainder 4687.5 + 704');
}

{
  // Inactive template: reason recorded; the engine chain prices the line via
  // the remaining layers (default markup — landing back on baseline share).
  const rec = { ...plainProject(), labor_pricing: { pricing_template_id: 'tpl-1' } };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: ctx });
  eq(res.lines.find((l) => l.key === 'labor').engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines.find((l) => l.key === 'labor').engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, BASELINE, 'default layer lands back on baseline share');
}

{
  // Dangling tier ref: engine reports the unpriced hit and prices at cost —
  // never silently falls back to a weaker layer.
  const rec = { ...plainProject(), labor_pricing: { tier_ref: 'Platinum' } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines.find((l) => l.key === 'labor').engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.lines.find((l) => l.key === 'labor').engine.extended, 640, 'dangling -> cost');
  eq(res.customer_price, 5327.5, 'remainder 4687.5 + 640');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 6. Edge cases
// ===========================================================================
{
  // Zero qty: extension 0, engine minimum never fires.
  const rec = { ...plainProject(), total_labor_hours: 0, labor_pricing: { markup_pct: 50 } };
  const res = wire(rec, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  const labor = res.lines.find((l) => l.key === 'labor');
  eq(labor.priced, true, 'zero-qty line still resolved');
  eq(labor.engine.extended, 0, 'zero qty -> zero extension');
  eq(res.engine_priced_total, 0, 'no engine dollars');
  eq(res.customer_price, 4687.5, 'configured zero-qty sell is remainder only');
}

{
  // Configured component without a cost base is SKIPPED (stays baseline) —
  // reachable via an explicit input.lines[] override.
  const res = resolveFoundationSellPricing({
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
  const res2 = resolveFoundationSellPricing({
    record: plainProject(),
    lines: [
      { key: 'labor', qty: 1, cost: null, markup_pct: 80 },
      { key: 'concrete', qty: 1, cost: 60, fixed_price: 30 },
    ],
    baselineSell: 165,
    markupPercent: 25,
    engine: ENGINE,
  });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  // markup_factor 1.25: configured baseline 60 x 1.25 = 75 -> 165 - 75 + 30
  eq(res2.customer_price, 120, '165 - 75 configured baseline + 30 engine');
}

{
  // Precedence: engine config owns the sell side and wins over a legacy
  // saved customer_pricing snapshot.
  const rec = { ...plainProject(), labor_pricing: { markup_pct: 100 } };
  rec.customer_pricing = { applied: true, total: 5000, tier_number: 2 };
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL);
  eq(econ.internalCost, COST_TOTAL, 'internal cost unaffected');
  eq(econ.customerPrice, 5967.5, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced component');
}

{
  // Flat override + component config: the override delta rides the remainder.
  const rec = { ...plainProject(), customer_price_override: 6000, poles_pricing: { markup_pct: 100 } };
  const res = wire(rec, { baselineSell: 6000, internalCost: COST_TOTAL, markupPercent: 25 });
  // poles baseline 375 -> remainder 5625 (= override - marked-up poles) + 600
  eq(res.customer_price, 6225, 'override remainder + repriced poles');
}

{
  // Non-finite garbage never throws.
  const res = resolveFoundationSellPricing({ record: { total_labor_cost: 'x', total_concrete_cost: 'y', labor_pricing: { markup_pct: 50 } }, baselineSell: 10, engine: ENGINE });
  ok(res.passthrough === true || Number.isFinite(res.customer_price), 'garbage costs resolve safely');
}

// ===========================================================================
// 7. sourceProjectEconomics end-to-end (bundled seam graph)
// ===========================================================================
{
  const econ = sourceProjectEconomics('foundation', plainProject(), COST_TOTAL);
  eq(econ.internalCost, COST_TOTAL, 'seam: internal cost authoritative');
  eq(econ.customerPrice, BASELINE, 'seam: baseline verbatim');
  eq(econ.pricing_engine, undefined, 'no engine field');
}

{
  // pricingContext param reaches the wire (registry-backed tier_ref via the
  // flat `equipment_tier_ref` field).
  const rec = { ...plainProject(), equipment_tier_ref: 'Rental' };
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL, { tierRules: [{ id: 'r', name: 'Rental', markup_pct: 50 }] });
  eq(econ.customerPrice, 5587.5, 'seam: caller registries resolve tier refs');
  ok(econ.pricing_engine && econ.pricing_engine.applied, 'engine attached');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    ...plainProject(),
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
  };
  const econ = sourceProjectEconomics('foundation', rec, COST_TOTAL);
  eq(econ.customerPrice, 7024, 'embedded context drives engine price (4390 x 1.6)');
}

{
  // Other modules untouched: vinyl/maintenance keep their own math, channel
  // and brick keep theirs, unknown keys hit the fallback.
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50, fixed_price: 1 }] };
  eq(sourceProjectEconomics('foundation', rec, 100).customerPrice, 100, 'items[] never configures foundation (and fallback total flows)');
  eq(sourceProjectEconomics('vinyl', { subtotal: 100, markup_amount: 20, total_cost: 120 }).customerPrice, 120, 'vinyl branch math preserved');
  eq(sourceProjectEconomics('maintenance', rec).customerPrice, 120, 'maintenance untouched');
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'brick untouched');
  const ch = { total_letters_cost: 140, letters_subtotal: 100, subtotal: 120, total_cost: 120 };
  const econCh = sourceProjectEconomics('channel_letters', ch);
  eq(econCh.customerPrice, 120, 'channel math preserved');
  eq(econCh.internalCost, 80, 'channel internal = subtotal - letter markup');
  eq(sourceProjectEconomics('mystery', rec, 7).customerPrice, 7, 'fallback module');
  eq(acceptedCustomerUnitPrice({ customer_price_snapshot: 42 }), 42, 'aio seam untouched');
}

{
  // Glue adapter surface (brick-parity names).
  eq(GLUE.foundationHasEnginePricing(plainProject()), false, 'glue: plain not configured');
  eq(GLUE.foundationHasEnginePricing({ ...plainProject(), labor_pricing: { markup_pct: 80 } }), true, 'glue: component config detected');
  eq(GLUE.foundationHasEnginePricing({ ...plainProject(), pricing_engine: {} }), true, 'glue: context block detected');
  eq(GLUE.foundationEngineCustomerPrice(plainProject(), { baselineSell: BASELINE }), BASELINE, 'glue: price verbatim without config');
  eq(GLUE.foundationEngineCustomerPrice({ ...plainProject(), labor_pricing: { markup_pct: 100 } }, { baselineSell: BASELINE, markupPercent: 25 }), 5967.5, 'glue: engine price when configured');
  const wired = GLUE.foundationEngineEconomics({ ...plainProject(), labor_pricing: { markup_pct: 100 } }, { baselineSell: BASELINE, internalCost: COST_TOTAL, markupPercent: 25 });
  eq(wired.customerPrice, 5967.5, 'glue economics wired');
  eq(wired.internalCost, COST_TOTAL, 'glue internalCost echoed');
  ok(wired.resolution && wired.resolution.applied, 'resolution carried');
  eq(GLUE.foundationEngineEconomics(plainProject(), { baselineSell: BASELINE, internalCost: COST_TOTAL }), null, 'glue returns null without config');
  eq(GLUE.foundationEngineEconomics(null, { baselineSell: 5 }), null, 'glue tolerates null record');
}

{
  // Context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = foundationPricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.hasContextBlock, true, 'embedded block detected');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = foundationPricingContextOf({ customer_pricing: { tier_number: 2 }, customer_markup_percent: 25 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.hasContextBlock, false, 'no block -> no engagement');
  eq(ctx2.defaultMarkupPct, 25, 'record customer_markup_percent is the default');
}

// ===========================================================================
console.log(`PASS foundation-pricing-wire (${n} asserts: split-total projection + walls breakdown, detection truth table, verbatim passthrough incl. float identity + flat override, fixed/markup/market/break/tier/machine/min/setup/modifier pricing, generic-vs-specific wall carriers, context-block engagement, template/dangling/inactive paths, zero-qty, skipped-no-cost, engine-vs-legacy precedence, sourceProjectEconomics end-to-end)`);
