// F-23f suite — metalPricingWire.ts + metalSellPricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23f):
//   * ZERO REGRESSION — a metal record whose lines carry no pricing-engine
//     config resolves byte-identical economics at the customerPricing seam
//     (verbatim passthrough, no float ops on the outputs).
//   * Tier/template config changes the sell price ONLY on lines that carry
//     it; the module's cost math stays authoritative (internal cost
//     untouched, extra_supplies_cost and un-configured lines preserved in
//     the remainder).
//   * Metal cost-base reality: the page persists PER-UNIT component dollars
//     (material_cost/supplies_cost/fabrication_cost/welding_cost/
//     finishing_cost) extended with (quantity || 1); calcMetalProject's
//     item_total_cost and the page's enriched materials_cost/labor_cost
//     spellings are honored; foreign records with already-extended
//     components are detected against the record's own totals.
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-metal-pricing-wire.mjs  →  "PASS metal-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-metal-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/metalPricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  metalRecordLines, metalPricingContextOf, metalLineDescriptor,
  descriptorHasPricingContent, metalConfigScan, resolveMetalSellPricing,
  metalComponentsAreExtended,
} = W;

const engineOut = resolve(here, '.tmp-metal-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-metal-wire-tpl.mjs');
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
const seamOut = resolve(here, '.tmp-metal-wire-seam.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: seamOut, logLevel: 'silent',
});
const { sourceProjectEconomics, acceptedCustomerUnitPrice } = await import(pathToFileURL(seamOut).href);

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m, eps = 0.005) => { n += 1; assert.ok(Math.abs(a - b) <= eps, `${m}: expected ~${b}, got ${a}`); };

const wire = (record, { baselineSell, internalCost, context } = {}) =>
  resolveMetalSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE });

// ===========================================================================
// Fixtures — the shape MetalEstimator.jsx actually persists: PER-UNIT
// material/supplies/fabrication/welding/finishing cost components, extended
// by the page with (quantity || 1); builder_item_id keys; item_type enums;
// project totals with subtotal === total_cost and markup persisted as 0.
//
//   item a: qty 2, per-unit 100+10+65+37.5+11 = 223.5  -> extended 447
//   item b: qty 1, per-unit 50+5+32.5+0+5.5   = 93     -> extended 93
//   project: subtotal = total_cost = 540, markup 0
// ===========================================================================
const plainProject = () => ({
  project_name: 'Gate Frame Set',
  client_name: 'Acme',
  fabrication_rate: 65,
  welding_rate: 75,
  finishing_rate: 55,
  supplies_percent_of_materials: 8,
  extra_supplies_cost: 0,
  total_material_cost: 250,       // 100*2 + 50
  total_supplies_cost: 25,        // 10*2 + 5
  total_fabrication_cost: 162.5,  // 65*2 + 32.5
  total_welding_cost: 75,         // 37.5*2 + 0
  total_finishing_cost: 27.5,     // 11*2 + 5.5
  subtotal: 540,
  markup_amount: 0,
  markup_percent: 0,
  total_cost: 540,
  items: [
    {
      builder_item_id: 'a', item_type: 'frame_assembly', description: 'Steel frame',
      inventory_item_id: 'inv-1', material_length_ft: 10, quantity: 2,
      fabrication_hours: 1, welding_hours: 0.5, finishing_hours: 0.2,
      material_cost: 100, supplies_cost: 10, fabrication_cost: 65, welding_cost: 37.5, finishing_cost: 11,
    },
    {
      builder_item_id: 'b', item_type: 'custom_brackets', description: 'Mount brackets',
      inventory_item_id: 'inv-2', material_length_ft: 4, quantity: 1,
      fabrication_hours: 0.5, welding_hours: 0, finishing_hours: 0.1,
      material_cost: 50, supplies_cost: 5, fabrication_cost: 32.5, welding_cost: 0, finishing_cost: 5.5,
    },
  ],
});

// ===========================================================================
// 1. Line normalization + config detection
// ===========================================================================
{
  const lines = metalRecordLines(plainProject());
  eq(lines.length, 2, 'flat items normalized');
  eq(lines[0].key, 'a', 'builder_item_id is the line key');
  eq(lines[0].cost, 447, 'per-unit components x (qty||1) = extended cost base');
  eq(lines[0].qty, 2, 'qty normalized');
  eq(lines[0].label, 'Steel frame', 'description is the label');
  eq(lines[0].category_key, 'frame_assembly', 'item_type feeds the pricing category');
  eq(lines[0].origin, 'items', 'origin items');
  eq(lines[1].cost, 93, 'second line extended cost');
}

{
  // Key precedence + cost spellings.
  const rec = {
    items: [
      { builder_item_id: 'bi-1', id: 'x', item_total_cost: 99, material_cost: 10, fabrication_cost: 5 },
      { id: 'i-2', line_cost: 12 },
      { description: 'no key', welding_cost: 5 },
      { builder_item_id: 'i-4', quantity: 2, materials_cost: 200, supplies_cost: 20, labor_cost: 150 },
    ],
  };
  const lines = metalRecordLines(rec);
  eq(lines[0].key, 'bi-1', 'builder_item_id beats id');
  eq(lines[0].cost, 99, 'single-total field beats the components');
  eq(lines[1].key, 'i-2', 'id fallback key');
  eq(lines[1].cost, 12, 'line_cost spelling');
  eq(lines[2].key, 'idx-2', 'positional key when no id');
  eq(lines[2].cost, 5, 'welding_cost alone is a cost base (qty 1)');
  eq(lines[3].cost, 370, 'enriched materials+supplies+labor triple is already extended');
  eq(metalRecordLines(null).length, 0, 'null record -> no lines');
  eq(metalRecordLines({}).length, 0, 'empty record -> no lines');
  eq(metalRecordLines({ items: 'junk' }).length, 0, 'non-array items -> no lines');
}

{
  // Component interpretation disambiguation: a foreign record whose
  // component dollars are already EXTENDED is detected against its own
  // total_*_cost fields.
  const extendedRec = {
    total_material_cost: 250,          // 200 + 50 (already extended)
    total_fabrication_cost: 130,
    items: [
      { builder_item_id: 'a', quantity: 2, material_cost: 200, fabrication_cost: 130 },
      { builder_item_id: 'b', quantity: 1, material_cost: 50 },
    ],
  };
  eq(metalComponentsAreExtended(extendedRec), true, 'extended components detected via totals');
  const lines = metalRecordLines(extendedRec);
  eq(lines[0].cost, 330, 'extended comps taken verbatim, not x qty');
  eq(lines[1].cost, 50, 'second line verbatim');

  // Same component dollars but persisted totals proving the PER-UNIT
  // (canonical page) interpretation.
  const perUnitRec = {
    total_material_cost: 450,          // 200*2 + 50
    total_fabrication_cost: 260,       // 130*2 + 0
    items: extendedRec.items,
  };
  eq(metalComponentsAreExtended(perUnitRec), false, 'per-unit detected via totals');
  eq(metalRecordLines(perUnitRec)[0].cost, 660, 'per-unit comps x qty');

  // No totals at all -> canonical per-unit default.
  eq(metalComponentsAreExtended({ items: extendedRec.items }), false, 'no evidence -> per-unit default');
  // qty 1 rows are ambiguous by nature -> per-unit canonical default.
  const tieRec = { total_material_cost: 100, items: [{ quantity: 1, material_cost: 100 }] };
  eq(metalComponentsAreExtended(tieRec), false, 'tie -> per-unit default');
}

{
  // config detection — engine vocab ONLY; metal type/unit/cost fields are NOT.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ item_type: 'cabinet_sign' }), 'item_type cabinet_sign not config');
  ok(!descriptorHasPricingContent({ item_type: 'monument_sign', material_type: 'steel' }), 'type+material not config');
  ok(!descriptorHasPricingContent({ item_type: 'flat_cut_letters' }), 'flat_cut_letters not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_piece' }), 'unit enum per_piece not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_pound' }), 'unit enum per_pound not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_sqft' }), 'unit enum per_sqft not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_foot' }), 'unit enum per_foot not config');
  ok(!descriptorHasPricingContent({ mode: 'frame_assembly' }), 'mode frame_assembly not config');
  ok(!descriptorHasPricingContent({ unit: 'per_foot' }), 'unit per_foot not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'Miller 252' }), 'bare machine name not config');
  ok(!descriptorHasPricingContent({ fabrication_rate: 65, welding_rate: 75 }), 'rate fields not config');
  ok(!descriptorHasPricingContent({ material_length_ft: 10, fabrication_hours: 1, welding_hours: 0.5, finishing_hours: 0.2 }), 'input fields not config');
  ok(!descriptorHasPricingContent({ material_cost: 100, supplies_cost: 10, fabrication_cost: 65, welding_cost: 37.5, finishing_cost: 11 }), 'cost components not config');
  ok(!descriptorHasPricingContent({ labor_hours: 1.7, dimensions_display: '2x4', stock_length_ft: 20 }), 'display/enriched fields not config');
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
  const scan = metalConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 2, 'scan counts lines');
  ok(scan.lines.every((l) => l.hasCost), 'component costs detected');
  const cfg = metalConfigScan({ items: [{ builder_item_id: 'a', quantity: 1, material_cost: 6, fabrication_cost: 4, fixed_price: 9 }] });
  eq(cfg.configured, true, 'configured scan');
  eq(cfg.configuredCount, 1, 'configured count');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.internalCost, 540, 'internal cost = record.subtotal');
  eq(econ.customerPrice, 540, 'customer price = record.total_cost verbatim');
  ok(econ.pricing_engine === undefined, 'no engine field on passthrough');

  const res = wire(rec, { baselineSell: 540, internalCost: 540 });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === 540, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, 540, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  eq(res.markup_pct, 0, 'page-saved metal records carry no module markup');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // Float identity — the passthrough never touches the number (no round2,
  // no float ops): the exact IEEE-754 value comes back.
  const ugly = 0.1 + 0.2; // 0.30000000000000004
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 0.1, fabrication_cost: 0.2 }], total_cost: ugly, subtotal: ugly };
  const res = wire(rec, { baselineSell: ugly });
  ok(res.customer_price === ugly, 'fractional baseline returned bit-identically');
  ok(res.remainder_sell === ugly, 'remainder bit-identical');
  const econ = sourceProjectEconomics('metal', rec, ugly);
  ok(econ.customerPrice === ugly, 'seam customerPrice bit-identical');
  ok(econ.internalCost === ugly, 'seam internalCost bit-identical');
}

{
  // Saved Markup-Tier snapshot still applies verbatim when nothing is
  // configured — identical to the pre-wire default branch.
  const rec = plainProject();
  rec.customer_pricing = { applied: true, total: 700, tier_number: 2 };
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.internalCost, 540, 'internal cost unaffected by snapshot');
  eq(econ.customerPrice, 700, 'saved tier still wins with no engine config');
  ok(econ.pricing_engine === undefined, 'no engine field on snapshot path');
}

{
  // Items that merely carry metal enums / cost fields / empty blocks passthrough.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 1, item_type: 'pole_sign', material_type: 'aluminum', material_length_ft: 8, fabrication_hours: 1, material_cost: 60, fabrication_cost: 65, pricing_mode: 'per_foot', pricing: {} }],
    total_cost: 125, subtotal: 125,
  };
  const res = wire(rec, { baselineSell: 125 });
  eq(res.passthrough, true, 'metal-enum-only project passthroughs');
  ok(res.customer_price === 125, 'baseline verbatim');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveMetalSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveMetalSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveMetalSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  eq(resolveMetalSellPricing({ record: { items: [] }, engine: ENGINE }).reason, 'no_lines', 'empty items');
  const res = resolveMetalSellPricing({ record: { items: [{ id: 'a', material_cost: 5, fixed_price: 4 }] }, baselineSell: 7 });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
  ok(res.customer_price === 7, 'baseline verbatim on no_engine');
}

{
  // metalCalc-shaped record (extended components + item_total_cost +
  // project markup) — the wire reads the same cost bases.
  const rec = {
    subtotal: 500, markup_amount: 100, markup_percent: 20, total_cost: 600,
    items: [{ builder_item_id: 'a', quantity: 2, item_total_cost: 250, material_cost: 200, fabrication_cost: 50 }],
  };
  const lines = metalRecordLines(rec);
  eq(lines[0].cost, 250, 'item_total_cost wins over components');
  const res = wire(rec, { baselineSell: 600, internalCost: 500 });
  eq(res.markup_pct, 20, 'record markup_percent honored');
  eq(res.passthrough, true, 'no config still passthrough on calc shape');
}

// ===========================================================================
// 3. Engine-priced lines — only the configured line reprices
// ===========================================================================
{
  // fixed_price on item a; item b + everything else stays baseline.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  const res = wire(rec, { baselineSell: 540, internalCost: 540 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.passthrough, false, 'not passthrough');
  eq(res.reason, 'priced', 'reason priced');
  // engine: 80 x qty 2 = 160; configured baseline = 447 (markup factor 1);
  // remainder 93 keeps item b's sell dollars.
  eq(res.engine_priced_total, 160, 'engine extension 80x2');
  near(res.configured_baseline, 447, 'configured baseline = extended line cost');
  near(res.remainder_sell, 93, 'remainder keeps item b sell');
  eq(res.customer_price, 253, 'customer price = 93 remainder + 160 engine');
  const la = res.lines.find((l) => l.key === 'a');
  const lb = res.lines.find((l) => l.key === 'b');
  eq(la.priced, true, 'line a priced');
  eq(la.engine.unit_price, 80, 'fixed unit price');
  eq(la.engine.price_source, 'fixed_price', 'price source fixed');
  eq(la.engine.tier_source, 'part_fixed', 'engine ladder part_fixed wins');
  eq(la.unit_cost, 223.5, 'unit cost = extended cost / qty');
  eq(lb.priced, false, 'line b not priced');
  near(lb.baseline_sell, 93, 'line b baseline preserved');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // Project-level dollars not on any line (extra_supplies_cost inside the
  // baseline) live in the remainder, not on any line — preserved exactly.
  const rec = plainProject();
  rec.extra_supplies_cost = 40;
  rec.total_supplies_cost = 65;
  rec.subtotal = 580;
  rec.total_cost = 580;
  rec.items[0].fixed_price = 80;
  const res = wire(rec, { baselineSell: 580, internalCost: 580 });
  eq(res.engine_priced_total, 160, 'engine extension 80x2');
  near(res.remainder_sell, 133, 'item b (93) + extra supplies (40) preserved');
  eq(res.customer_price, 293, 'remainder 133 + engine 160');
}

{
  // markup_pct part override.
  const rec = plainProject();
  rec.items[0].markup_pct = 100;
  const res = wire(rec, { baselineSell: 540 });
  // unitCost 223.5 -> markup 100% -> 447; ext 894. remainder 93 -> 987.
  eq(res.customer_price, 987, 'markup override reprices the line only');
  eq(res.lines[0].engine.price_source, 'markup', 'markup source');
}

{
  // per_unit_breaks bracket pick at qty 2.
  const rec = plainProject();
  rec.items[0].per_unit_breaks = [{ qty: 4, unit_price: 190 }, { qty: 2, unit_price: 210 }];
  const res = wire(rec, { baselineSell: 540 });
  eq(res.lines[0].engine.unit_price, 210, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 420, '210 x 2');
  eq(res.customer_price, 513, 'remainder 93 + 420');
}

{
  // Market pricing: pricing_mode 'market' + market_retail - discount.
  const rec = plainProject();
  rec.items[0].pricing_mode = 'market';
  rec.items[0].market_retail = 300;
  rec.items[0].market_discount_pct = 25;
  const res = wire(rec, { baselineSell: 540 });
  eq(res.lines[0].engine.unit_price, 225, '300 retail - 25%');
  eq(res.lines[0].engine.price_source, 'market', 'market source');
  eq(res.engine_priced_total, 450, '225 x 2');
  eq(res.customer_price, 543, 'remainder 93 + 450');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = plainProject();
  rec.items[0].tier_ref = 'Gold';
  const ctx = { tierRules: [{ id: 'r1', name: 'Gold', markup_pct: 60 }] };
  const res = wire(rec, { baselineSell: 540, context: ctx });
  // unitCost 223.5 x 1.6 = 357.6; ext 715.2.
  eq(res.lines[0].engine.unit_price, 357.6, 'bound tier row markup applied');
  eq(res.customer_price, 808.2, 'remainder 93 + 715.2');
}

{
  // Machine descriptor override outranks every part layer (a fab/weld
  // station profile rides the same engine vocabulary).
  const rec = plainProject();
  rec.items[0].machine = { markup_pct: 100 };
  const res = wire(rec, { baselineSell: 540 });
  eq(res.lines[0].engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 894, '223.5 x 2 x 2');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 6, fabrication_cost: 4, markup_pct: 0, minimum_charge: 50 }], total_cost: 10, subtotal: 10 };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.lines[0].engine.minimum_applied, true, 'floor fired');
  eq(res.customer_price, 50, 'extension floored to 50');
  const rec2 = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, markup_pct: 20, setup_fee: 25 }], total_cost: 100, subtotal: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.lines[0].engine.setup_fee, 25, 'setup fee captured');
  eq(res2.customer_price, 145, '120 extension + 25 setup');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.lines[0].engine.unit_price, 132, '120 x 1.10 once — not twice');
  eq(res.customer_price, 132, 'line repriced once');
}

{
  // Nested item pricing block + project-level engine_pricing.items map
  // (keyed by builder_item_id).
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, pricing: { fixed_price: 42 } }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.customer_price, 42, 'nested block wins');
  const rec2 = { engine_pricing: { items: { a: { fixed_price: 33 } } }, items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40 }], total_cost: 100, subtotal: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.customer_price, 33, 'project items map configures the line');
}

// ===========================================================================
// 4. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { items: [{ builder_item_id: 'a', quantity: 10, material_cost: 6, fabrication_cost: 4, pricing_template_id: 'tpl-1' }], total_cost: 100, subtotal: 100 };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Fab Chart', unit_category: 'each', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: 100, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'template priced the line');
  eq(res.lines[0].engine.unit_price, 14, '10 x 1.40');
  eq(res.engine_priced_total, 140, 'ext 140');
  eq(res.customer_price, 140, 'remainder 0 + 140');
}

{
  // Embedded template record on the item itself — no registry needed.
  // (per-unit comps 20 x qty 4 = 80 extended == total_cost, page parity.)
  const rec = { items: [{ builder_item_id: 'a', quantity: 4, material_cost: 12.5, fabrication_cost: 7.5, pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } }], total_cost: 80, subtotal: 80, customer_pricing: { tier_number: 2 } };
  const ctx = { customerTier: 'Gold' };
  const res = wire(rec, { baselineSell: 80, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'embedded template resolved');
  eq(res.lines[0].engine.unit_price, 25, '20 x 1.25');
  eq(res.customer_price, 100, 'remainder 0 + 100');
}

{
  // Dangling template id falls through to remaining part layers + reason.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, pricing_template_id: 'ghost', markup_pct: 10 }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100, context: { templates: [] } });
  eq(res.lines[0].engine.template_applied, false, 'dangling template not applied');
  eq(res.lines[0].engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.lines[0].engine.unit_price, 110, 'part markup survives the miss');
}

{
  // Inactive template: resolution records the reason; the line then prices
  // via the remaining engine layers (default markup 0 on page-saved metal —
  // landing on its own cost baseline share).
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, pricing_template_id: 'tpl-1' }], total_cost: 100, subtotal: 100 };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: 100, context: ctx });
  eq(res.lines[0].engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines[0].engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, 100, 'default layer lands back on baseline share');
}

{
  // Missing tier row / dangling tier ref: engine contract prices at cost and
  // reports the unpriced hit — it must NOT silently fall back to markup.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, tier_ref: 'Platinum' }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines[0].engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.customer_price, 100, 'engine prices at cost, chain shows it');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 5. Edge cases
// ===========================================================================
{
  // Zero qty: the page's own (quantity || 1) math still charged the line's
  // per-unit components once — the wire removes exactly that baseline; the
  // engine extension is 0 (minimum never fires on extension <= 0).
  const rec = {
    total_material_cost: 250, total_fabrication_cost: 65, // page math: a comps x1 + b
    items: [
      { builder_item_id: 'a', quantity: 0, material_cost: 200, fabrication_cost: 65, markup_pct: 50 },
      { builder_item_id: 'b', quantity: 1, material_cost: 50 },
    ],
    total_cost: 315, subtotal: 315,
  };
  const res = wire(rec, { baselineSell: 315 });
  eq(res.lines[0].cost, 265, 'zero-qty baseline = comps x (0||1) — page parity');
  eq(res.lines[0].priced, true, 'zero-qty line still resolved');
  eq(res.engine_priced_total, 0, 'zero qty -> zero extension');
  eq(res.customer_price, 50, '315 - 265 configured baseline + 0 engine');
}

{
  // Configured line without a cost base is SKIPPED (stays baseline) — never
  // repriced blind. When nothing else is configured the whole result is a
  // byte-identical passthrough.
  const rec = { items: [{ builder_item_id: 'a', quantity: 1, markup_pct: 80 }], total_cost: 90, subtotal: 90 };
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
      { builder_item_id: 'c', quantity: 1, material_cost: 40, fabrication_cost: 20, fixed_price: 30 },
    ],
    total_cost: 165, subtotal: 165,
  };
  const res2 = wire(rec2, { baselineSell: 165 });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  eq(res2.customer_price, 135, '165 - 60 configured baseline + 30 engine');
}

{
  // markup-carrying record (metalCalc-style): the configured line's baseline
  // contribution is its cost x (1 + markupPct/100), not its raw cost.
  const rec = {
    subtotal: 500, markup_amount: 100, markup_percent: 20, total_cost: 600,
    items: [
      { builder_item_id: 'a', quantity: 1, item_total_cost: 200, fixed_price: 300 },
      { builder_item_id: 'b', quantity: 1, item_total_cost: 300 },
    ],
  };
  const res = wire(rec, { baselineSell: 600, internalCost: 500 });
  eq(res.markup_pct, 20, 'module markup honored');
  near(res.configured_baseline, 240, 'configured baseline = 200 x 1.2');
  near(res.remainder_sell, 360, 'remainder keeps marked-up remainder');
  eq(res.customer_price, 660, '360 remainder + 300 engine');
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.internalCost, 500, 'seam internal = subtotal on markup record');
  eq(econ.customerPrice, 660, 'seam engine sell on markup record');
}

{
  // Precedence (parity with F-23a..F-23e): engine config owns the sell side
  // and wins over a legacy saved customer_pricing snapshot.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  rec.customer_pricing = { applied: true, total: 700, tier_number: 2 };
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.internalCost, 540, 'internal cost unaffected');
  // configured line a: qty 2 x fixed 80 = 160; remainder 540 - 447 = 93 -> 253
  eq(econ.customerPrice, 253, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced line');
}

{
  // Other modules untouched: cnc/vinyl/channel/foundation/brick keep their
  // own math; unknown keys hit the fallback. (No engine config on this
  // record — wired modules passthrough byte-identically too.)
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50 }] };
  eq(sourceProjectEconomics('vinyl', rec).customerPrice, 120, 'vinyl passthrough unaffected');
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'brick untouched');
  eq(sourceProjectEconomics('maintenance', rec).customerPrice, 120, 'maintenance untouched');
  eq(sourceProjectEconomics('cnc', rec).customerPrice, 120, 'cnc passthrough on foreign-shaped record');
  eq(sourceProjectEconomics('metal', rec).customerPrice, 120, 'metal passthrough on foreign-shaped record');
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
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.internalCost, 540, 'seam: internal cost authoritative');
  eq(econ.customerPrice, 253, 'seam: engine sell total');

  // pricingContext param reaches the wire (registry-backed tier_ref).
  const rec2 = plainProject();
  rec2.items[0].tier_ref = 'Gold';
  const econ2 = sourceProjectEconomics('metal', rec2, 0, { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] });
  eq(econ2.customerPrice, 808.2, 'seam: caller registries resolve tier refs');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 1, material_cost: 60, fabrication_cost: 40, tier_ref: 'Gold' }],
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
    total_cost: 100, subtotal: 100,
  };
  const econ = sourceProjectEconomics('metal', rec);
  eq(econ.customerPrice, 160, 'embedded context drives engine price');
}

{
  // context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = metalPricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = metalPricingContextOf({ customer_pricing: { tier_number: 2 }, markup_percent: 50 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.defaultMarkupPct, 50, 'record markup percent is the default');
  const ctx3 = metalPricingContextOf(plainProject());
  eq(ctx3.defaultMarkupPct, 0, 'page-saved metal record -> markup 0');
}

{
  // Descriptor merge precedence: flat < project map < nested block.
  const rec = {
    engine_pricing: { items: { a: { fixed_price: 20, markup_pct: 5 } } },
    items: [{ builder_item_id: 'a', quantity: 1, material_cost: 6, fabrication_cost: 4, fixed_price: 15, pricing: { fixed_price: 42 } }],
  };
  const line = metalRecordLines(rec)[0];
  const d = metalLineDescriptor(line, rec);
  eq(d.fixed_price, 42, 'nested block wins');
  eq(d.markup_pct, 5, 'project map fills gaps');
}

{
  // Embedded customer-tier chart rows hit when a line opts in via an
  // embedded rule + tier pin.
  const rec = {
    items: [{ builder_item_id: 'a', quantity: 3, material_cost: 20, fabrication_cost: 10, tier_rules: [{ customer_tier: 'Gold', markup_pct: 50 }], customer_tier: 'Gold' }],
    total_cost: 90, subtotal: 90,
  };
  const res = wire(rec, { baselineSell: 90 });
  eq(res.lines[0].engine.tier_source, 'customer_tier', 'embedded tier row hits customer_tier layer');
  eq(res.lines[0].engine.unit_price, 45, 'unit cost 30 x 1.5');
  eq(res.engine_priced_total, 135, '45 x qty 3');
  eq(res.customer_price, 135, 'remainder 0 + 135');
}

{
  // Non-finite garbage never throws; negative qty passes through like the
  // engine (documented F-27 parity).
  const rec = { items: [{ builder_item_id: 'a', quantity: 'x', material_cost: 'y', fixed_price: 5 }] };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'garbage line has no finite cost -> passthrough');
  const rec2 = { items: [{ builder_item_id: 'a', quantity: -2, material_cost: 60, fabrication_cost: 40, markup_pct: 10 }] };
  const res2 = wire(rec2, { baselineSell: 100 });
  ok(Number.isFinite(res2.customer_price), 'negative qty resolves finite');
}

{
  // Explicit input.lines rows are tolerated (raw item rows fold qty/cost).
  const raw = { builder_item_id: 'a', quantity: 1, material_cost: 6, fabrication_cost: 4, fixed_price: 25 };
  const res = resolveMetalSellPricing({ record: { items: [] }, lines: [raw], baselineSell: 10, engine: ENGINE });
  eq(res.applied, true, 'raw line rows resolve');
  eq(res.customer_price, 25, 'remainder 0 + engine 25');
}

// ===========================================================================
console.log(`PASS metal-pricing-wire (${n} asserts)`);
