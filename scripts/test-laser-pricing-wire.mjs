// F-23e suite — laserPricingWire.ts + laserSellPricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23e):
//   * ZERO REGRESSION — a laser record whose lines carry no pricing-engine
//     config resolves byte-identical economics at the customerPricing seam
//     (verbatim passthrough, no float ops on the outputs).
//   * Tier/template config changes the sell price ONLY on lines that carry
//     it; the module's cost math stays authoritative (internal cost
//     untouched, fixed-setup labor + material-setup dollars and
//     un-configured lines preserved in the remainder).
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-laser-pricing-wire.mjs  →  "PASS laser-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-laser-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/laserPricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  laserRecordLines, laserPricingContextOf, laserLineDescriptor,
  descriptorHasPricingContent, laserConfigScan, resolveLaserSellPricing,
} = W;

const engineOut = resolve(here, '.tmp-laser-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-laser-wire-tpl.mjs');
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
const seamOut = resolve(here, '.tmp-laser-wire-seam.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: seamOut, logLevel: 'silent',
});
const { sourceProjectEconomics, acceptedCustomerUnitPrice } = await import(pathToFileURL(seamOut).href);

// Module cost math — must remain the untouched authority.
const calcOut = resolve(here, '.tmp-laser-wire-calc.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/laser/laserCalc.js')],
  bundle: true, format: 'esm', outfile: calcOut, logLevel: 'silent',
});
const { calcLaserProject } = await import(pathToFileURL(calcOut).href);

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m, eps = 0.005) => { n += 1; assert.ok(Math.abs(a - b) <= eps, `${m}: expected ~${b}, got ${a}`); };

const wire = (record, { baselineSell, internalCost, context } = {}) =>
  resolveLaserSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE });

// ===========================================================================
// Fixtures — the shape LaserEstimator.jsx actually persists: per-item
// machine_cost / labor_cost components (mm/sec-derived), builder_item_id
// keys, quantity, item_type (panel|lettering|engraving|engrave_and_cut) +
// material_type (Acrylic|Wood|Leather) enums; project total_cost carries the
// fixed-setup labor + material-setup dollars on top of the line costs.
// No markup_percent/subtotal/markup_amount.
// ===========================================================================
const plainProject = () => ({
  project_name: 'Lobby Sign Set',
  client_name: 'Acme',
  machine_rate_per_hour: 100,
  labor_rate: 75,
  engraving_machine_rate_per_hour: 80,
  engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15,
  engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0,
  fixed_material_setup_cost: 0,
  total_machine_cost: 90,
  total_labor_cost: 60,
  total_supplies_cost: 0,
  total_cost: 150,
  items: [
    { builder_item_id: 'a', description: 'Acrylic panel', item_type: 'panel', material_type: 'Acrylic', material_thickness: '1/4', quantity: 2, length: 24, width: 12, cut_speed_ipm: 20, engrave_speed_sqipm: 5, machine_time_hours: 0.5, handling_time_hours: 0.08, machine_cost: 60, labor_cost: 40 },
    { builder_item_id: 'b', description: 'Wood letters', item_type: 'lettering', material_type: 'Wood', quantity: 1, num_letters: 10, letter_height: 12, total_cut_length_inches: 420, machine_time_hours: 0.2, handling_time_hours: 0.03, machine_cost: 30, labor_cost: 20 },
  ],
});

// ===========================================================================
// 1. Line normalization + config detection
// ===========================================================================
{
  const lines = laserRecordLines(plainProject());
  eq(lines.length, 2, 'flat items normalized');
  eq(lines[0].key, 'a', 'builder_item_id is the line key');
  eq(lines[0].cost, 100, 'machine_cost + labor_cost composite cost base');
  eq(lines[0].qty, 2, 'qty normalized');
  eq(lines[0].label, 'Acrylic panel', 'description is the label');
  eq(lines[0].category_key, 'panel', 'item_type feeds the pricing category');
  eq(lines[0].origin, 'items', 'origin items');
  eq(lines[1].cost, 50, 'second line composite cost');
}

{
  // Key precedence + cost spellings.
  const rec = {
    items: [
      { builder_item_id: 'bi-1', id: 'x', item_total_cost: 99, machine_cost: 60, labor_cost: 40 },
      { id: 'i-2', line_cost: 12 },
      { description: 'no key', machine_cost: 5 },
    ],
  };
  const lines = laserRecordLines(rec);
  eq(lines[0].key, 'bi-1', 'builder_item_id beats id');
  eq(lines[0].cost, 99, 'single-total field beats the composite');
  eq(lines[1].key, 'i-2', 'id fallback key');
  eq(lines[1].cost, 12, 'line_cost spelling');
  eq(lines[2].key, 'idx-2', 'positional key when no id');
  eq(lines[2].cost, 5, 'machine_cost alone is a cost base');
  eq(laserRecordLines(null).length, 0, 'null record -> no lines');
  eq(laserRecordLines({}).length, 0, 'empty record -> no lines');
  eq(laserRecordLines({ items: 'junk' }).length, 0, 'non-array items -> no lines');
}

{
  // config detection — engine vocab ONLY; laser type/unit/cost fields are NOT.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ item_type: 'panel' }), 'item_type panel not config');
  ok(!descriptorHasPricingContent({ item_type: 'engraving', material_type: 'Wood' }), 'type+material not config');
  ok(!descriptorHasPricingContent({ item_type: 'engrave_and_cut', material_type: 'Leather' }), 'engrave_and_cut+material not config');
  ok(!descriptorHasPricingContent({ material_thickness: '1/4' }), 'thickness not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_hour' }), 'unit enum per_hour not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_sheet' }), 'unit enum per_sheet not config');
  ok(!descriptorHasPricingContent({ mode: 'lettering' }), 'mode lettering not config');
  ok(!descriptorHasPricingContent({ mode: 'engraving' }), 'mode engraving not config');
  ok(!descriptorHasPricingContent({ unit: 'panel' }), 'unit panel not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'Epilog Fusion Pro' }), 'bare machine name not config');
  ok(!descriptorHasPricingContent({ machine_rate_per_hour: 100, labor_rate: 75 }), 'rate fields not config');
  ok(!descriptorHasPricingContent({
    cut_speed_ipm: 20, engrave_speed_sqipm: 5, machine_time_hours: 0.5,
    handling_time_hours: 0.08, engrave_area_sqin: 288, total_cut_length_inches: 72,
    letter_height: 12, num_letters: 10, engrave_hours: 0.1, cut_hours: 0.4,
    machine_cost: 60, labor_cost: 40, item_total_cost: 100,
  }), 'laser cost-side + geometry fields are not config');
  ok(descriptorHasPricingContent({ fixed_price: 10 }), 'fixed_price is config');
  ok(descriptorHasPricingContent({ markup_pct: 0 }), 'explicit markup_pct 0 is config');
  ok(descriptorHasPricingContent({ markup_pct: 40 }), 'markup_pct is config');
  ok(descriptorHasPricingContent({ tier_ref: 'Gold' }), 'tier_ref is config');
  ok(descriptorHasPricingContent({ pricing_template_id: 't1' }), 'template id is config');
  ok(descriptorHasPricingContent({ pricing_template: { breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] } }), 'embedded template is config');
  ok(descriptorHasPricingContent({ per_unit_breaks: [{ qty: 1, unit_price: 5 }] }), 'qty chart is config');
  ok(descriptorHasPricingContent({ market_retail: 20 }), 'market_retail is config');
  ok(descriptorHasPricingContent({ market_discount_pct: 10 }), 'market_discount_pct is config');
  ok(descriptorHasPricingContent({ pricing_mode: 'market_based' }), 'market token is config');
  ok(descriptorHasPricingContent({ pricing_mode: 'fixed' }), 'fixed token is config');
  ok(descriptorHasPricingContent({ minimum_charge: 25 }), 'minimum_charge is config');
  ok(descriptorHasPricingContent({ setup_fee: 15 }), 'setup_fee is config');
  ok(descriptorHasPricingContent({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }), 'formula modifiers are config');
  ok(descriptorHasPricingContent({ machine: { markup_pct: 10 } }), 'machine descriptor w/ fields is config');
  ok(descriptorHasPricingContent({ global_pricing_tier_id: 'gpt-1' }), 'tier set link is config');
  ok(descriptorHasPricingContent({ tier_rules: [{ name: 'Gold', markup_pct: 40 }] }), 'embedded tier rules are config');
  ok(descriptorHasPricingContent({ customer_tier: 'Gold' }), 'line-scoped tier pin is config');
}

{
  const scan = laserConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 2, 'scan counts lines');
  ok(scan.lines.every((l) => l.hasCost), 'composite costs detected');
  const cfg = laserConfigScan({ items: [{ builder_item_id: 'a', machine_cost: 6, labor_cost: 4, fixed_price: 9 }] });
  eq(cfg.configured, true, 'configured scan');
  eq(cfg.configuredCount, 1, 'configured count');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('laser', rec);
  eq(econ.internalCost, 150, 'internal cost = record.total_cost');
  eq(econ.customerPrice, 150, 'customer price = record.total_cost verbatim');
  ok(econ.pricing_engine === undefined, 'no engine field on passthrough');

  const res = wire(rec, { baselineSell: 150, internalCost: 150 });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === 150, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, 150, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  eq(res.markup_pct, 0, 'laser records carry no module markup');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // Float identity — the passthrough never touches the number (no round2,
  // no float ops): the exact IEEE-754 value comes back.
  const ugly = 0.1 + 0.2; // 0.30000000000000004
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 0.1, labor_cost: 0.2 }], total_cost: ugly };
  const res = wire(rec, { baselineSell: ugly });
  ok(res.customer_price === ugly, 'fractional baseline returned bit-identically');
  ok(res.remainder_sell === ugly, 'remainder bit-identical');
  const econ = sourceProjectEconomics('laser', rec, ugly);
  ok(econ.customerPrice === ugly, 'seam customerPrice bit-identical');
  ok(econ.internalCost === ugly, 'seam internalCost bit-identical');
}

{
  // Saved Markup-Tier snapshot still applies verbatim when nothing is
  // configured — identical to the pre-wire default branch.
  const rec = plainProject();
  rec.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econ = sourceProjectEconomics('laser', rec);
  eq(econ.internalCost, 150, 'internal cost unaffected by snapshot');
  eq(econ.customerPrice, 500, 'saved tier still wins with no engine config');
  ok(econ.pricing_engine === undefined, 'no engine field on snapshot path');
}

{
  // Items that merely carry laser enums / cost fields / empty blocks passthrough.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 1, item_type: 'engraving', material_type: 'Leather', material_thickness: '1/8', engrave_area_sqin: 40, engrave_speed_sqipm: 5, machine_cost: 6, labor_cost: 4, pricing_mode: 'per_hour', pricing: {} }],
    total_cost: 10,
  };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'laser-enum-only project passthroughs');
  ok(res.customer_price === 10, 'baseline verbatim');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveLaserSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveLaserSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveLaserSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  eq(resolveLaserSellPricing({ record: { items: [] }, engine: ENGINE }).reason, 'no_lines', 'empty items');
  const res = resolveLaserSellPricing({ record: { items: [{ id: 'a', machine_cost: 5, fixed_price: 4 }] }, baselineSell: 7 });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
  ok(res.customer_price === 7, 'baseline verbatim on no_engine');
}

{
  // Module cost math untouched: calcLaserProject output is the cost authority —
  // and its item_total_cost spelling is a wire-recognized cost base.
  const r = calcLaserProject({
    items: [{ item_type: 'panel', quantity: 2, length: 12, width: 6, cut_speed_ipm: 20, engrave_speed_sqipm: 5 }],
    machine_rate_per_hour: 75, labor_rate: 45, engraving_machine_rate_per_hour: 80,
    engraving_labor_rate: 40, parameter_handling_time_percentage: 15,
    engraving_handling_time_percentage: 20, fixed_setup_hours: 1, fixed_material_setup_cost: 10,
  });
  const item = r.items[0];
  near(item.item_total_cost, item.machine_cost + item.labor_cost, 'calc total = machine + labor', 0.0001);
  near(r.totals.total_cost, r.totals.total_machine_cost + r.totals.total_labor_cost + r.totals.total_supplies_cost, 'project total = machine + labor + supplies', 0.0001);
  ok(r.totals.fixed_setup_cost > 0, 'fixed setup cost present');
  eq(r.totals.total_supplies_cost, 10, 'fixed material setup lands in supplies');
  const lines = laserRecordLines({ items: [item], total_cost: r.totals.total_cost });
  eq(lines[0].cost, item.item_total_cost, 'wire reads calcLaserProject item_total_cost');
}

// ===========================================================================
// 3. Engine-priced lines — only the configured line reprices
// ===========================================================================
{
  // fixed_price on item a; item b + everything else stays baseline.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  const res = wire(rec, { baselineSell: 150, internalCost: 150 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.passthrough, false, 'not passthrough');
  eq(res.reason, 'priced', 'reason priced');
  // engine: 80 x qty 2 = 160; configured baseline = 100 (markup factor 1);
  // remainder 50 keeps item b's sell dollars.
  eq(res.engine_priced_total, 160, 'engine extension 80x2');
  near(res.configured_baseline, 100, 'configured baseline = raw line cost');
  near(res.remainder_sell, 50, 'remainder keeps item b sell');
  eq(res.customer_price, 210, 'customer price = 50 remainder + 160 engine');
  const la = res.lines.find((l) => l.key === 'a');
  const lb = res.lines.find((l) => l.key === 'b');
  eq(la.priced, true, 'line a priced');
  eq(la.engine.unit_price, 80, 'fixed unit price');
  eq(la.engine.price_source, 'fixed_price', 'price source fixed');
  eq(la.engine.tier_source, 'part_fixed', 'engine ladder part_fixed wins');
  eq(la.unit_cost, 50, 'unit cost = composite cost / qty');
  eq(lb.priced, false, 'line b not priced');
  near(lb.baseline_sell, 50, 'line b baseline preserved');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // Project-level fixed setup labor + material setup dollars live in
  // total_cost but not in any line cost — the remainder preserves them.
  const rec = plainProject();
  rec.fixed_setup_hours = 2;
  rec.fixed_material_setup_cost = 25;
  rec.total_labor_cost = 210;    // 60 dynamic + 150 fixed setup labor (2 x 75)
  rec.total_supplies_cost = 25;
  rec.total_cost = 325;          // 90 machine + 210 labor + 25 supplies
  rec.items[0].fixed_price = 80;
  const res = wire(rec, { baselineSell: 325, internalCost: 325 });
  eq(res.engine_priced_total, 160, 'engine extension 80x2');
  near(res.remainder_sell, 225, 'item b (50) + setup labor (150) + material setup (25) preserved');
  eq(res.customer_price, 385, 'remainder 225 + engine 160');
}

{
  // markup_pct part override.
  const rec = plainProject();
  rec.items[0].markup_pct = 100;
  const res = wire(rec, { baselineSell: 150 });
  // unitCost 50 -> markup 100% -> 100; ext 200. remainder 50 -> 250.
  eq(res.customer_price, 250, 'markup override reprices the line only');
  eq(res.lines[0].engine.price_source, 'markup', 'markup source');
}

{
  // per_unit_breaks bracket pick at qty 2.
  const rec = plainProject();
  rec.items[0].per_unit_breaks = [{ qty: 4, unit_price: 40 }, { qty: 2, unit_price: 60 }];
  const res = wire(rec, { baselineSell: 150 });
  eq(res.lines[0].engine.unit_price, 60, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 120, '60 x 2');
  eq(res.customer_price, 170, 'remainder 50 + 120');
}

{
  // Market pricing: pricing_mode 'market' + market_retail - discount.
  const rec = plainProject();
  rec.items[0].pricing_mode = 'market';
  rec.items[0].market_retail = 120;
  rec.items[0].market_discount_pct = 25;
  const res = wire(rec, { baselineSell: 150 });
  eq(res.lines[0].engine.unit_price, 90, '120 retail - 25%');
  eq(res.lines[0].engine.price_source, 'market', 'market source');
  eq(res.engine_priced_total, 180, '90 x 2');
  eq(res.customer_price, 230, 'remainder 50 + 180');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = plainProject();
  rec.items[0].tier_ref = 'Gold';
  const ctx = { tierRules: [{ id: 'r1', name: 'Gold', markup_pct: 60 }] };
  const res = wire(rec, { baselineSell: 150, context: ctx });
  // unitCost 50 x 1.6 = 80; ext 160.
  eq(res.lines[0].engine.unit_price, 80, 'bound tier row markup applied');
  eq(res.customer_price, 210, 'remainder 50 + 160');
}

{
  // Machine descriptor override outranks every part layer.
  const rec = plainProject();
  rec.items[0].machine = { markup_pct: 100 };
  const res = wire(rec, { baselineSell: 150 });
  eq(res.lines[0].engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 200, '50 x 2 x 2');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 6, labor_cost: 4, markup_pct: 0, minimum_charge: 50 }], total_cost: 10 };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.lines[0].engine.minimum_applied, true, 'floor fired');
  eq(res.customer_price, 50, 'extension floored to 50');
  const rec2 = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, markup_pct: 20, setup_fee: 25 }], total_cost: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.lines[0].engine.setup_fee, 25, 'setup fee captured');
  eq(res2.customer_price, 145, '120 extension + 25 setup');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] }], total_cost: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.lines[0].engine.unit_price, 132, '120 x 1.10 once — not twice');
  eq(res.customer_price, 132, 'line repriced once');
}

{
  // Nested item pricing block + project-level engine_pricing.items map
  // (keyed by builder_item_id).
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, pricing: { fixed_price: 42 } }], total_cost: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.customer_price, 42, 'nested block wins');
  const rec2 = { engine_pricing: { items: { a: { fixed_price: 33 } } }, items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40 }], total_cost: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.customer_price, 33, 'project items map configures the line');
}

// ===========================================================================
// 4. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { items: [{ builder_item_id: 'a', quantity: 10, machine_cost: 60, labor_cost: 40, pricing_template_id: 'tpl-1' }], total_cost: 100 };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Cut Chart', unit_category: 'each', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: 100, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'template priced the line');
  eq(res.lines[0].engine.unit_price, 14, '10 x 1.40');
  eq(res.engine_priced_total, 140, 'ext 140');
  eq(res.customer_price, 140, 'remainder 0 + 140');
}

{
  // Embedded template record on the item itself — no registry needed.
  const rec = { items: [{ builder_item_id: 'a', quantity: 4, machine_cost: 50, labor_cost: 30, pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } }], total_cost: 80, customer_pricing: { tier_number: 2 } };
  const ctx = { customerTier: 'Gold' };
  const res = wire(rec, { baselineSell: 80, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'embedded template resolved');
  eq(res.lines[0].engine.unit_price, 25, '20 x 1.25');
  eq(res.customer_price, 100, 'remainder 0 + 100');
}

{
  // Dangling template id falls through to remaining part layers + reason.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, pricing_template_id: 'ghost', markup_pct: 10 }], total_cost: 100 };
  const res = wire(rec, { baselineSell: 100, context: { templates: [] } });
  eq(res.lines[0].engine.template_applied, false, 'dangling template not applied');
  eq(res.lines[0].engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.lines[0].engine.unit_price, 110, 'part markup survives the miss');
}

{
  // Inactive template: resolution records the reason; the line then prices
  // via the remaining engine layers (default markup 0 on laser — landing on
  // its own cost baseline share).
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, pricing_template_id: 'tpl-1' }], total_cost: 100 };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: 100, context: ctx });
  eq(res.lines[0].engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines[0].engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, 100, 'default layer lands back on baseline share');
}

{
  // Missing tier row / dangling tier ref: engine contract prices at cost and
  // reports the unpriced hit — it must NOT silently fall back to markup.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, tier_ref: 'Platinum' }], total_cost: 100 };
  const res = wire(rec, { baselineSell: 100, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines[0].engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.customer_price, 100, 'engine prices at cost, chain shows it');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 5. Edge cases
// ===========================================================================
{
  // Zero qty: extension 0, engine minimum never fires.
  const rec = { items: [{ builder_item_id: 'a', quantity: 0, machine_cost: 50, labor_cost: 30, markup_pct: 50 }], total_cost: 80 };
  const res = wire(rec, { baselineSell: 80 });
  eq(res.lines[0].priced, true, 'zero-qty line still resolved');
  eq(res.engine_priced_total, 0, 'zero qty -> zero extension');
  eq(res.customer_price, 0, 'configured zero-qty sell is $0');
}

{
  // Configured line without a cost base is SKIPPED (stays baseline) — never
  // repriced blind. When nothing else is configured the whole result is a
  // byte-identical passthrough.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, markup_pct: 80 }], total_cost: 90 };
  const res = wire(rec, { baselineSell: 90 });
  eq(res.passthrough, true, 'no cost base -> passthrough');
  eq(res.reason, 'no_priced_lines', 'reason recorded');
  ok(res.customer_price === 90, 'baseline verbatim');
  ok(res.warnings.some((w) => /no cost base/.test(w)), 'skip warns');

  // Mixed: skipped line + priced line — only the priced line's baseline is
  // removed; the skipped line's dollars stay in the remainder.
  const rec2 = {
    items: [
      { builder_item_id: 'a', quantity: 1, markup_pct: 80 },
      { builder_item_id: 'c', quantity: 1, machine_cost: 40, labor_cost: 20, fixed_price: 30 },
    ],
    total_cost: 165,
  };
  const res2 = wire(rec2, { baselineSell: 165 });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  eq(res2.customer_price, 135, '165 - 60 configured baseline + 30 engine');
}

{
  // Precedence (parity with F-23a…F-23d): engine config owns the sell side
  // and wins over a legacy saved customer_pricing snapshot.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  rec.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econ = sourceProjectEconomics('laser', rec);
  eq(econ.internalCost, 150, 'internal cost unaffected');
  // configured line a: qty 2 x fixed 80 = 160; remainder 150 - 100 = 50 -> 210
  eq(econ.customerPrice, 210, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced line');
}

{
  // Other modules untouched: vinyl/channel/foundation/brick/cnc keep their
  // own math; unknown keys hit the fallback. (No engine config on this
  // record — wired modules passthrough byte-identically too.)
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50 }] };
  eq(sourceProjectEconomics('vinyl', rec).customerPrice, 120, 'vinyl passthrough unaffected');
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'brick untouched');
  eq(sourceProjectEconomics('maintenance', rec).customerPrice, 120, 'maintenance untouched');
  eq(sourceProjectEconomics('cnc', rec).customerPrice, 120, 'cnc passthrough on foreign-shaped record');
  eq(sourceProjectEconomics('laser', rec).customerPrice, 120, 'laser passthrough on foreign-shaped record');
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
  // The seam end to end: engine sell lands on the estimate-line economics.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  const econ = sourceProjectEconomics('laser', rec);
  eq(econ.internalCost, 150, 'seam: internal cost authoritative');
  eq(econ.customerPrice, 210, 'seam: engine sell total');

  // pricingContext param reaches the wire (registry-backed tier_ref).
  const rec2 = plainProject();
  rec2.items[0].tier_ref = 'Gold';
  const econ2 = sourceProjectEconomics('laser', rec2, 0, { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] });
  eq(econ2.customerPrice, 210, 'seam: caller registries resolve tier refs');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 60, labor_cost: 40, tier_ref: 'Gold' }],
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
    total_cost: 100,
  };
  const econ = sourceProjectEconomics('laser', rec);
  eq(econ.customerPrice, 160, 'embedded context drives engine price');
}

{
  // context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = laserPricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = laserPricingContextOf({ customer_pricing: { tier_number: 2 }, markup_percent: 50 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.defaultMarkupPct, 50, 'record markup percent is the default');
  const ctx3 = laserPricingContextOf(plainProject());
  eq(ctx3.defaultMarkupPct, 0, 'laser record without markup fields -> 0');
}

{
  // Descriptor merge precedence: flat < project map < nested block.
  const rec = {
    engine_pricing: { items: { a: { fixed_price: 20, markup_pct: 5 } } },
    items: [{ builder_item_id: 'a', quantity: 1, machine_cost: 6, labor_cost: 4, fixed_price: 15, pricing: { fixed_price: 42 } }],
  };
  const line = laserRecordLines(rec)[0];
  const d = laserLineDescriptor(line, rec);
  eq(d.fixed_price, 42, 'nested block wins');
  eq(d.markup_pct, 5, 'project map fills gaps');
}

{
  // Embedded customer-tier chart rows hit when a line opts in via an
  // embedded rule + tier pin.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 3, machine_cost: 20, labor_cost: 10, tier_rules: [{ customer_tier: 'Gold', markup_pct: 50 }], customer_tier: 'Gold' }],
    total_cost: 30,
  };
  const res = wire(rec, { baselineSell: 30 });
  eq(res.lines[0].engine.tier_source, 'customer_tier', 'embedded tier row hits customer_tier layer');
  eq(res.lines[0].engine.unit_price, 15, 'unit cost 10 x 1.5');
  eq(res.engine_priced_total, 45, '15 x qty 3');
  eq(res.customer_price, 45, 'remainder 0 + 45');
}

{
  // Non-finite garbage never throws; negative qty passes through like the
  // engine (documented F-27 parity).
  const rec = { items: [{ builder_item_id: 'a', quantity: 'x', machine_cost: 'y', fixed_price: 5 }] };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'garbage line has no finite cost -> passthrough');
  const rec2 = { items: [{ builder_item_id: 'a', quantity: -2, machine_cost: 60, labor_cost: 40, markup_pct: 10 }] };
  const res2 = wire(rec2, { baselineSell: 100 });
  ok(Number.isFinite(res2.customer_price), 'negative qty resolves finite');
}

{
  // Explicit input.lines rows are tolerated (raw item rows fold qty/cost).
  const raw = { builder_item_id: 'a', quantity: 1, machine_cost: 6, labor_cost: 4, fixed_price: 25 };
  const res = resolveLaserSellPricing({ record: { items: [] }, lines: [raw], baselineSell: 10, engine: ENGINE });
  eq(res.applied, true, 'raw line rows resolve');
  eq(res.customer_price, 25, 'remainder 0 + engine 25');
}

// ===========================================================================
console.log(`PASS laser-pricing-wire (${n} asserts)`);
