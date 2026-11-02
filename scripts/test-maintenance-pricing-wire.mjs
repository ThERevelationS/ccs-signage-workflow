// F-23i suite — maintenancePricingWire.ts + maintenanceSellPricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23i):
//   * ZERO REGRESSION — a MaintenanceProject record whose service items carry
//     no pricing-engine config resolves byte-identical economics at the
//     customerPricing seam (verbatim passthrough, no float ops on the outputs).
//   * Tier/template config changes the sell price ONLY on items that carry
//     it; the module's cost math stays authoritative (internal cost
//     untouched, and project-level dollars that live outside any line —
//     supplies/equipment/personnel/travel — are preserved in the remainder).
//   * Maintenance cost-base reality: the page persists EXTENDED line costs
//     (calcServiceItem's item_total_cost = labor_cost + materials_cost with
//     the billable unit count already folded in); the labor+materials pair is
//     the fallback spelling; items are one-line-per-sign (materials[] and
//     actions[] stay cost-side detail).
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-maintenance-pricing-wire.mjs  →  "PASS maintenance-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-maintenance-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/maintenancePricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  maintenanceRecordLines, maintenancePricingContextOf, maintenanceLineDescriptor,
  descriptorHasPricingContent, maintenanceConfigScan, resolveMaintenanceSellPricing,
  MAINTENANCE_MODULE_KEYS,
} = W;

const engineOut = resolve(here, '.tmp-maintenance-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-maintenance-wire-tpl.mjs');
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
const seamOut = resolve(here, '.tmp-maintenance-wire-seam.mjs');
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
  resolveMaintenanceSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE });

// ===========================================================================
// Fixtures — the shape MaintenanceEstimator.jsx actually persists
// (calcServiceItem + calcProjectTotals): EXTENDED item_total_cost =
// labor_cost + materials_cost per service item (one sign each), qty = the
// billable unit count (letters / cabinets), nested materials[] rows and
// actions[] id strings, project-level supplies/equipment/personnel/travel
// dollars, markup persisted as markup_percent/markup_amount.
//
//   item a: qty 10 letters, labor 162.5 + materials 60   = 222.5 extended
//   item b: qty 1 cabinet,  labor 260   + materials 140  = 400   extended
//   project: supplies 20 + equipment 75 + travel 40 live OUTSIDE the lines
//   subtotal = total_cost = 757.5, markup 0
// ===========================================================================
const plainProject = () => ({
  project_name: 'Main St Sign — Annual Service',
  client_name: 'Acme',
  labor_rate_per_hour: 65,
  supplies_percent_of_materials: 10,
  extra_supplies_cost: 0,
  markup_percent: 0,
  markup_amount: 0,
  travel_miles_round_trip: 32,
  travel_cost_per_mile: 1.25,
  items: [
    {
      builder_item_id: 'a', description: 'Front channel letters — north elevation',
      sign_type: 'flush_channel', size: 'medium', qty: 10, installation_height_feet: 12,
      actions: ['clean', 'led_retrofit'],
      materials: [
        { maintenance_rule_id: 'r-led', inventory_item_id: 'inv-led', item_name: 'LED modules', pricing_mode: 'per_letter_flat', usage_basis: 'per_letter', unit: 'each', unit_cost: 4, quantity: 10, total_cost: 40 },
        { maintenance_rule_id: 'r-clean', inventory_item_id: 'inv-clean', item_name: 'Cleaning kit', pricing_mode: 'per_project_flat', usage_basis: 'per_service_item', unit: 'unit', unit_cost: 20, quantity: 1, total_cost: 20 },
      ],
      labor_hours: 2.5, labor_cost: 162.5, materials_cost: 60, item_total_cost: 222.5,
    },
    {
      builder_item_id: 'b', description: 'Monument sign repaint',
      sign_type: 'monument_sign', size: 'cab_medium', qty: 1, installation_height_feet: 8, face_sqft: 32,
      actions: ['repaint'],
      materials: [
        { maintenance_rule_id: 'r-paint', inventory_item_id: 'inv-paint', item_name: 'Exterior paint', pricing_mode: 'per_sqft', usage_basis: 'per_sqft', unit: 'sqft', unit_cost: 4.375, quantity: 32, total_cost: 140 },
      ],
      labor_hours: 4, labor_cost: 260, materials_cost: 140, item_total_cost: 400,
    },
  ],
  selected_equipment: [{ equipment_type: 'bucket_truck', total_cost: 75 }],
  personnel: [],
  labor_hours: 6.5,
  labor_cost: 422.5,
  total_materials_cost: 200,
  total_supplies_cost: 20,
  total_equipment_cost: 75,
  total_personnel_cost: 0,
  total_travel_cost: 40,
  subtotal: 757.5,
  total_cost: 757.5,
});

// ===========================================================================
// 1. Line normalization + config detection
// ===========================================================================
{
  ok(MAINTENANCE_MODULE_KEYS.includes('maintenance'), 'module key registered');
  const lines = maintenanceRecordLines(plainProject());
  eq(lines.length, 2, 'flat items normalized');
  eq(lines[0].key, 'a', 'builder_item_id is the line key');
  eq(lines[0].cost, 222.5, 'extended item_total_cost is the cost base');
  eq(lines[0].qty, 10, 'qty normalized (letters)');
  eq(lines[0].label, 'Front channel letters — north elevation', 'description is the label');
  eq(lines[0].category_key, 'flush_channel', 'sign_type feeds the pricing category');
  eq(lines[0].origin, 'items', 'origin items');
  eq(lines[1].cost, 400, 'second line extended cost');
}

{
  // Key precedence + cost spellings + label fallback.
  const rec = {
    items: [
      { builder_item_id: 'bi-1', id: 'x', item_total_cost: 99, labor_cost: 60, materials_cost: 30 },
      { id: 'i-2', line_cost: 12 },
      { sign_type: 'pylon_sign', labor_cost: 40 },                       // no label, no total
      { sign_type: 'capsule_logo', description: '', materials_cost: 15 }, // pair fallback (labor 0)
      { description: 'nothing', qty: 3 },
    ],
  };
  const lines = maintenanceRecordLines(rec);
  eq(lines[0].key, 'bi-1', 'builder_item_id beats id');
  eq(lines[0].cost, 99, 'single-total field beats the component pair');
  eq(lines[1].key, 'i-2', 'id fallback key');
  eq(lines[1].cost, 12, 'line_cost spelling');
  eq(lines[2].key, 'idx-2', 'positional key when no id');
  eq(lines[2].cost, 40, 'labor_cost alone is a cost base (pair fallback)');
  eq(lines[2].label, 'pylon_sign', 'sign_type is the label fallback');
  eq(lines[3].cost, 15, 'materials_cost alone completes the pair');
  eq(lines[4].cost, null, 'no cost fields -> null cost base');
  eq(maintenanceRecordLines(null).length, 0, 'null record -> no lines');
  eq(maintenanceRecordLines({}).length, 0, 'empty record -> no lines');
  eq(maintenanceRecordLines({ items: 'junk' }).length, 0, 'non-array items -> no lines');
  eq(maintenanceRecordLines({ items: ['x', 4, { id: 'ok', item_total_cost: 5 }] }).length, 1, 'non-record rows filtered');
  // materials[]/actions[] are never their own lines, and record-level
  // equipment/personnel arrays are not line sources.
  eq(maintenanceRecordLines(plainProject()).length, 2, 'equipment/personnel/materials not lines');
}

{
  // Legacy maintenanceCalc.js shape (per-action objects + `quantity`) resolves
  // through the same spellings.
  const rec = {
    items: [{
      id: 'svc-1', sign_type: 'raceway_channel', size: 'large', quantity: 2, qty_letters: 14,
      actions: [{ action: 'clean', unit_count: 1, labor_cost: 80, materials_cost: 20, action_total_cost: 100 }],
      labor_hours: 2, labor_cost: 160, materials_cost: 40, item_total_cost: 200,
    }],
    subtotal: 200, markup_amount: 0, total_cost: 200,
  };
  const lines = maintenanceRecordLines(rec);
  eq(lines[0].cost, 200, 'legacy shape item_total_cost honored');
  eq(lines[0].qty, 2, 'legacy quantity is the billable count');
}

{
  // config detection — engine vocab ONLY; maintenance sign/size/unit/cost
  // fields are NOT.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ sign_type: 'monument_sign' }), 'sign_type not config');
  ok(!descriptorHasPricingContent({ sign_type: 'flush_channel', size: 'medium' }), 'type+size not config');
  ok(!descriptorHasPricingContent({ sign_type: 'post_and_panel', size: 'cab_extra_large' }), 'cabinet enum not config');
  ok(!descriptorHasPricingContent({ actions: ['clean', 'led_retrofit', 'repaint'] }), 'action ids not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_letter_flat' }), 'material unit enum per_letter_flat not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_letter_by_size' }), 'material unit enum per_letter_by_size not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_cabinet_flat' }), 'per_cabinet_flat not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_sqft' }), 'per_sqft not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_project_flat' }), 'per_project_flat not config');
  ok(!descriptorHasPricingContent({ mode: 'per_service_item' }), 'usage-basis enum via mode not config');
  ok(!descriptorHasPricingContent({ usage_basis: 'per_letter' }), 'usage_basis not config');
  ok(!descriptorHasPricingContent({ unit: 'per_letter' }), 'unit per_letter not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'Bucket Truck' }), 'bare machine name not config');
  ok(!descriptorHasPricingContent({ labor_rate_per_hour: 65, travel_cost_per_mile: 1.25 }), 'rate fields not config');
  ok(!descriptorHasPricingContent({ supplies_percent_of_materials: 10, extra_supplies_cost: 15 }), 'supplies fields not config');
  ok(!descriptorHasPricingContent({ qty: 10, quantity: 2, qty_letters: 14, unit_count: 3, face_sqft: 32, linear_feet: 12, installation_height_feet: 12 }), 'billable/dimension inputs not config');
  ok(!descriptorHasPricingContent({ labor_hours: 2.5, labor_cost: 162.5, materials_cost: 60, item_total_cost: 222.5, minutes: 150, action_total_cost: 100 }), 'cost fields not config');
  ok(!descriptorHasPricingContent({ materials: [{ pricing_mode: 'per_sqft', unit_cost: 4.375, quantity: 32, total_cost: 140 }] }), 'materials rows not config');
  ok(!descriptorHasPricingContent({ repaint_calc: { labor_hours: 1.2, paint_material_cost: 40 }, repaint_config: { coats: 2 } }), 'repaint blocks not config');
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
  ok(descriptorHasPricingContent({ pricing_mode: 'flat' }), 'flat token is config');
  ok(descriptorHasPricingContent({ minimum_charge: 25 }), 'minimum_charge is config');
  ok(descriptorHasPricingContent({ setup_fee: 15 }), 'setup_fee is config');
  ok(descriptorHasPricingContent({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }), 'formula modifiers are config');
  ok(descriptorHasPricingContent({ machine: { markup_pct: 10 } }), 'machine descriptor w/ fields is config');
  ok(descriptorHasPricingContent({ global_pricing_tier_id: 'gpt-1' }), 'tier set link is config');
  ok(descriptorHasPricingContent({ tier_rules: [{ name: 'Gold', markup_pct: 40 }] }), 'embedded tier rules are config');
  ok(descriptorHasPricingContent({ customer_tier: 'Gold' }), 'line-scoped tier pin is config');
}

{
  const scan = maintenanceConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 2, 'scan counts lines');
  ok(scan.lines.every((l) => l.hasCost), 'extended costs detected');
  const cfg = maintenanceConfigScan({ items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 10, fixed_price: 9 }] });
  eq(cfg.configured, true, 'configured scan');
  eq(cfg.configuredCount, 1, 'configured count');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.internalCost, 757.5, 'internal cost = record.subtotal');
  eq(econ.customerPrice, 757.5, 'customer price = record.total_cost verbatim');
  ok(econ.pricing_engine === undefined, 'no engine field on passthrough');

  const res = wire(rec, { baselineSell: 757.5, internalCost: 757.5 });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === 757.5, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, 757.5, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  eq(res.markup_pct, 0, 'page-saved markup honored (0)');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // Float identity — the passthrough never touches the number (no round2,
  // no float ops): the exact IEEE-754 value comes back.
  const ugly = 0.1 + 0.2; // 0.30000000000000004
  const rec = { items: [{ builder_item_id: 'a', qty: 1, labor_cost: 0.1, materials_cost: 0.2 }], total_cost: ugly, subtotal: ugly };
  const res = wire(rec, { baselineSell: ugly });
  ok(res.customer_price === ugly, 'fractional baseline returned bit-identically');
  ok(res.remainder_sell === ugly, 'remainder bit-identical');
  const econ = sourceProjectEconomics('maintenance', rec, ugly);
  ok(econ.customerPrice === ugly, 'seam customerPrice bit-identical');
  ok(econ.internalCost === ugly, 'seam internalCost bit-identical');
}

{
  // Saved Markup-Tier snapshot still applies verbatim when nothing is
  // configured — identical to the pre-wire default branch.
  const rec = plainProject();
  rec.customer_pricing = { applied: true, total: 900, tier_number: 2 };
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.internalCost, 757.5, 'internal cost unaffected by snapshot');
  eq(econ.customerPrice, 900, 'saved tier still wins with no engine config');
  ok(econ.pricing_engine === undefined, 'no engine field on snapshot path');
}

{
  // Items that merely carry maintenance enums / cost fields / empty blocks passthrough.
  const rec = {
    items: [{ builder_item_id: 'a', qty: 10, sign_type: 'pylon_sign', size: 'cab_large', actions: ['rewire'], face_sqft: 48, linear_feet: 12, installation_height_feet: 20, labor_hours: 1.5, labor_cost: 97.5, materials_cost: 40, item_total_cost: 137.5, pricing_mode: 'per_sqft', pricing: {} }],
    total_cost: 137.5, subtotal: 137.5,
  };
  const res = wire(rec, { baselineSell: 137.5 });
  eq(res.passthrough, true, 'maintenance-enum-only project passthroughs');
  ok(res.customer_price === 137.5, 'baseline verbatim');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveMaintenanceSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveMaintenanceSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveMaintenanceSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  eq(resolveMaintenanceSellPricing({ record: { items: [] }, engine: ENGINE }).reason, 'no_lines', 'empty items');
  const res = resolveMaintenanceSellPricing({ record: { items: [{ id: 'a', item_total_cost: 5, fixed_price: 4 }] }, baselineSell: 7 });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
  ok(res.customer_price === 7, 'baseline verbatim on no_engine');
}

{
  // Markup-carrying record (markup_percent + markup_amount persisted): the
  // wire reads the same cost bases and honors the module markup factor.
  const rec = {
    subtotal: 500, markup_amount: 100, markup_percent: 20, total_cost: 600,
    items: [{ builder_item_id: 'a', qty: 2, item_total_cost: 250, labor_cost: 200, materials_cost: 50 }],
  };
  const lines = maintenanceRecordLines(rec);
  eq(lines[0].cost, 250, 'item_total_cost wins over components');
  const res = wire(rec, { baselineSell: 600, internalCost: 500 });
  eq(res.markup_pct, 20, 'record markup_percent honored');
  eq(res.passthrough, true, 'no config still passthrough on markup record');
  ok(res.customer_price === 600, 'baseline verbatim');
}

// ===========================================================================
// 3. Engine-priced lines — only the configured line reprices
// ===========================================================================
{
  // fixed_price on item a; item b + all project-level dollars stay baseline.
  const rec = plainProject();
  rec.items[0].fixed_price = 30;
  const res = wire(rec, { baselineSell: 757.5, internalCost: 757.5 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.passthrough, false, 'not passthrough');
  eq(res.reason, 'priced', 'reason priced');
  // engine: 30 x qty 10 = 300; configured baseline = 222.5 (markup factor 1);
  // remainder 535 keeps item b (400) + supplies 20 + equipment 75 + travel 40.
  eq(res.engine_priced_total, 300, 'engine extension 30x10');
  near(res.configured_baseline, 222.5, 'configured baseline = extended line cost');
  near(res.remainder_sell, 535, 'remainder keeps item b + project extras');
  eq(res.customer_price, 835, 'customer price = 535 remainder + 300 engine');
  const la = res.lines.find((l) => l.key === 'a');
  const lb = res.lines.find((l) => l.key === 'b');
  eq(la.priced, true, 'line a priced');
  eq(la.engine.unit_price, 30, 'fixed unit price');
  eq(la.engine.price_source, 'fixed_price', 'price source fixed');
  eq(la.engine.tier_source, 'part_fixed', 'engine ladder part_fixed wins');
  eq(la.unit_cost, 22.25, 'unit cost = extended cost / qty');
  eq(lb.priced, false, 'line b not priced');
  near(lb.baseline_sell, 400, 'line b baseline preserved');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // Project-level dollars not on any line (extra supplies + equipment +
  // personnel + travel inside the baseline) live in the remainder, not on
  // any line — preserved exactly.
  const rec = plainProject();
  rec.extra_supplies_cost = 60;
  rec.total_supplies_cost = 80;   // 20 base + 60 extra
  rec.total_personnel_cost = 100;
  rec.personnel = [{ role: 'helper', total_cost: 100 }];
  rec.subtotal = 917.5;
  rec.total_cost = 917.5;
  rec.items[0].fixed_price = 30;
  const res = wire(rec, { baselineSell: 917.5, internalCost: 917.5 });
  eq(res.engine_priced_total, 300, 'engine extension 30x10');
  near(res.remainder_sell, 695, 'item b (400) + supplies (80) + equipment (75) + personnel (100) + travel (40)');
  eq(res.customer_price, 995, 'remainder 695 + engine 300');
}

{
  // markup_pct part override.
  const rec = plainProject();
  rec.items[0].markup_pct = 100;
  const res = wire(rec, { baselineSell: 757.5 });
  // unitCost 22.25 -> markup 100% -> 44.5; ext 445. remainder 535 -> 980.
  eq(res.customer_price, 980, 'markup override reprices the line only');
  eq(res.lines[0].engine.price_source, 'markup', 'markup source');
}

{
  // per_unit_breaks bracket pick at qty 10.
  const rec = plainProject();
  rec.items[0].per_unit_breaks = [{ qty: 12, unit_price: 20 }, { qty: 10, unit_price: 25 }];
  const res = wire(rec, { baselineSell: 757.5 });
  eq(res.lines[0].engine.unit_price, 25, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 250, '25 x 10');
  eq(res.customer_price, 785, 'remainder 535 + 250');
}

{
  // Market pricing: pricing_mode 'market' + market_retail - discount.
  const rec = plainProject();
  rec.items[0].pricing_mode = 'market';
  rec.items[0].market_retail = 30;
  rec.items[0].market_discount_pct = 10;
  const res = wire(rec, { baselineSell: 757.5 });
  eq(res.lines[0].engine.unit_price, 27, '30 retail - 10%');
  eq(res.lines[0].engine.price_source, 'market', 'market source');
  eq(res.engine_priced_total, 270, '27 x 10');
  eq(res.customer_price, 805, 'remainder 535 + 270');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = plainProject();
  rec.items[0].tier_ref = 'Gold';
  const ctx = { tierRules: [{ id: 'r1', name: 'Gold', markup_pct: 60 }] };
  const res = wire(rec, { baselineSell: 757.5, context: ctx });
  // unitCost 22.25 x 1.6 = 35.6; ext 356.
  eq(res.lines[0].engine.unit_price, 35.6, 'bound tier row markup applied');
  eq(res.customer_price, 891, 'remainder 535 + 356');
}

{
  // Machine descriptor override outranks every part layer (a crane/lift
  // profile rides the same engine vocabulary).
  const rec = plainProject();
  rec.items[0].machine = { markup_pct: 100 };
  const res = wire(rec, { baselineSell: 757.5 });
  eq(res.lines[0].engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 445, '22.25 x 2 x 10');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 10, markup_pct: 0, minimum_charge: 50 }], total_cost: 10, subtotal: 10 };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.lines[0].engine.minimum_applied, true, 'floor fired');
  eq(res.customer_price, 50, 'extension floored to 50');
  const rec2 = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, markup_pct: 20, setup_fee: 25 }], total_cost: 100, subtotal: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.lines[0].engine.setup_fee, 25, 'setup fee captured');
  eq(res2.customer_price, 145, '120 extension + 25 setup');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.lines[0].engine.unit_price, 132, '120 x 1.10 once — not twice');
  eq(res.customer_price, 132, 'line repriced once');
}

{
  // Nested item pricing block + project-level engine_pricing.items map
  // (keyed by builder_item_id AND by positional idx-N fallback).
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, pricing: { fixed_price: 42 } }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100 });
  eq(res.customer_price, 42, 'nested block wins');
  const rec2 = { engine_pricing: { items: { a: { fixed_price: 33 } } }, items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100 }], total_cost: 100, subtotal: 100 };
  const res2 = wire(rec2, { baselineSell: 100 });
  eq(res2.customer_price, 33, 'project items map configures the line');
  const rec3 = { engine_pricing: { items: { 'idx-0': { fixed_price: 22 } } }, items: [{ qty: 1, item_total_cost: 100 }], total_cost: 100, subtotal: 100 };
  const res3 = wire(rec3, { baselineSell: 100 });
  eq(res3.customer_price, 22, 'items map hits positional idx-0 key');
}

// ===========================================================================
// 4. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { items: [{ builder_item_id: 'a', qty: 10, item_total_cost: 10, pricing_template_id: 'tpl-1' }], total_cost: 10, subtotal: 10 };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Service Chart', unit_category: 'each', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: 10, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'template priced the line');
  eq(res.lines[0].engine.unit_price, 1.4, '1 x 1.40');
  eq(res.engine_priced_total, 14, 'ext 14');
  eq(res.customer_price, 14, 'remainder 0 + 14');
}

{
  // Embedded template record on the item itself — no registry needed.
  const rec = { items: [{ builder_item_id: 'a', qty: 4, labor_cost: 60, materials_cost: 20, pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } }], total_cost: 80, subtotal: 80, customer_pricing: { tier_number: 2 } };
  const ctx = { customerTier: 'Gold' };
  const res = wire(rec, { baselineSell: 80, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'embedded template resolved');
  eq(res.lines[0].engine.unit_price, 25, '20 x 1.25');
  eq(res.customer_price, 100, 'remainder 0 + 100');
}

{
  // Dangling template id falls through to remaining part layers + reason.
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, pricing_template_id: 'ghost', markup_pct: 10 }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100, context: { templates: [] } });
  eq(res.lines[0].engine.template_applied, false, 'dangling template not applied');
  eq(res.lines[0].engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.lines[0].engine.unit_price, 110, 'part markup survives the miss');
}

{
  // Inactive template: resolution records the reason; the line then prices
  // via the remaining engine layers (default markup = record.markup_percent
  // 0 — landing on its own cost baseline share).
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, pricing_template_id: 'tpl-1' }], total_cost: 100, subtotal: 100, markup_percent: 0 };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: 100, context: ctx });
  eq(res.lines[0].engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines[0].engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, 100, 'default layer lands back on baseline share');
}

{
  // Missing tier row / dangling tier ref: engine contract prices at cost and
  // reports the unpriced hit — it must NOT silently fall back to markup.
  const rec = { items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, tier_ref: 'Platinum' }], total_cost: 100, subtotal: 100 };
  const res = wire(rec, { baselineSell: 100, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines[0].engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.customer_price, 100, 'engine prices at cost, chain shows it');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 5. Edge cases
// ===========================================================================
{
  // Zero qty: the page's own cabinet math (Math.max(qty,1)) still charged the
  // line once — the wire removes exactly that baseline; the engine extension
  // is 0 (minimum never fires on extension <= 0).
  const rec = {
    items: [
      { builder_item_id: 'a', qty: 0, sign_type: 'monument_sign', item_total_cost: 265, markup_pct: 50 },
      { builder_item_id: 'b', qty: 1, item_total_cost: 50 },
    ],
    total_cost: 315, subtotal: 315,
  };
  const res = wire(rec, { baselineSell: 315 });
  eq(res.lines[0].cost, 265, 'zero-qty baseline = extended line cost verbatim');
  eq(res.lines[0].priced, true, 'zero-qty line still resolved');
  eq(res.engine_priced_total, 0, 'zero qty -> zero extension');
  eq(res.customer_price, 50, '315 - 265 configured baseline + 0 engine');
}

{
  // Configured line without a cost base is SKIPPED (stays baseline) — never
  // repriced blind. When nothing else is configured the whole result is a
  // byte-identical passthrough.
  const rec = { items: [{ builder_item_id: 'a', qty: 1, markup_pct: 80 }], total_cost: 90, subtotal: 90 };
  const res = wire(rec, { baselineSell: 90 });
  eq(res.passthrough, true, 'no cost base -> passthrough');
  eq(res.reason, 'no_priced_lines', 'reason recorded');
  ok(res.customer_price === 90, 'baseline verbatim');
  ok(res.warnings.some((w) => /no cost base/.test(w)), 'skip warns');

  // Mixed: skipped line + priced line — only the priced line's baseline is
  // removed; the skipped line's dollars stay in the remainder.
  const rec2 = {
    items: [
      { builder_item_id: 'a', qty: 1, markup_pct: 80 },
      { builder_item_id: 'c', qty: 1, item_total_cost: 60, fixed_price: 30 },
    ],
    total_cost: 165, subtotal: 165,
  };
  const res2 = wire(rec2, { baselineSell: 165 });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  eq(res2.customer_price, 135, '165 - 60 configured baseline + 30 engine');
}

{
  // Markup-carrying record: the configured line's baseline contribution is
  // its cost x (1 + markupPct/100), not its raw cost — and the untouched
  // project-level extras keep their marked-up share in the remainder.
  const rec = {
    subtotal: 500, markup_amount: 100, markup_percent: 20, total_cost: 600,
    items: [
      { builder_item_id: 'a', qty: 1, item_total_cost: 200, fixed_price: 300 },
      { builder_item_id: 'b', qty: 1, item_total_cost: 300 },
    ],
  };
  const res = wire(rec, { baselineSell: 600, internalCost: 500 });
  eq(res.markup_pct, 20, 'module markup honored');
  near(res.configured_baseline, 240, 'configured baseline = 200 x 1.2');
  near(res.remainder_sell, 360, 'remainder keeps marked-up remainder');
  eq(res.customer_price, 660, '360 remainder + 300 engine');
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.internalCost, 500, 'seam internal = subtotal on markup record');
  eq(econ.customerPrice, 660, 'seam engine sell on markup record');
}

{
  // Precedence (parity with F-23a..F-23h): engine config owns the sell side
  // and wins over a legacy saved customer_pricing snapshot.
  const rec = plainProject();
  rec.items[0].fixed_price = 30;
  rec.customer_pricing = { applied: true, total: 900, tier_number: 2 };
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.internalCost, 757.5, 'internal cost unaffected');
  // configured line a: qty 10 x fixed 30 = 300; remainder 757.5 - 222.5 = 535 -> 835
  eq(econ.customerPrice, 835, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced line');
}

{
  // Other modules untouched: vinyl/brick/cnc/metal/channel/foundation keep
  // their own math; unknown keys hit the fallback. (No engine config on
  // this record — wired modules passthrough byte-identically too.)
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50 }] };
  eq(sourceProjectEconomics('vinyl', rec).customerPrice, 120, 'vinyl passthrough unaffected');
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'brick untouched');
  eq(sourceProjectEconomics('maintenance', rec).customerPrice, 120, 'maintenance passthrough on foreign-shaped record');
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
  rec.items[0].fixed_price = 30;
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.internalCost, 757.5, 'seam: internal cost authoritative');
  eq(econ.customerPrice, 835, 'seam: engine sell total');

  // pricingContext param reaches the wire (registry-backed tier_ref).
  const rec2 = plainProject();
  rec2.items[0].tier_ref = 'Gold';
  const econ2 = sourceProjectEconomics('maintenance', rec2, 0, { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] });
  eq(econ2.customerPrice, 891, 'seam: caller registries resolve tier refs');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 100, tier_ref: 'Gold' }],
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
    total_cost: 100, subtotal: 100,
  };
  const econ = sourceProjectEconomics('maintenance', rec);
  eq(econ.customerPrice, 160, 'embedded context drives engine price');
}

{
  // context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = maintenancePricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = maintenancePricingContextOf({ customer_pricing: { tier_number: 2 }, markup_percent: 50 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.defaultMarkupPct, 50, 'record markup percent is the default');
  const ctx3 = maintenancePricingContextOf(plainProject());
  eq(ctx3.defaultMarkupPct, 0, 'page-saved maintenance record -> markup 0');
}

{
  // Descriptor merge precedence: flat < project map < nested block.
  const rec = {
    engine_pricing: { items: { a: { fixed_price: 20, markup_pct: 5 } } },
    items: [{ builder_item_id: 'a', qty: 1, item_total_cost: 10, fixed_price: 15, pricing: { fixed_price: 42 } }],
  };
  const line = maintenanceRecordLines(rec)[0];
  const d = maintenanceLineDescriptor(line, rec);
  eq(d.fixed_price, 42, 'nested block wins');
  eq(d.markup_pct, 5, 'project map fills gaps');
}

{
  // Embedded customer-tier chart rows hit when a line opts in via an
  // embedded rule + tier pin.
  const rec = {
    items: [{ builder_item_id: 'a', qty: 3, item_total_cost: 30, tier_rules: [{ customer_tier: 'Gold', markup_pct: 50 }], customer_tier: 'Gold' }],
    total_cost: 90, subtotal: 90,
  };
  const res = wire(rec, { baselineSell: 90 });
  eq(res.lines[0].engine.tier_source, 'customer_tier', 'embedded tier row hits customer_tier layer');
  eq(res.lines[0].engine.unit_price, 15, 'unit cost 10 x 1.5');
  eq(res.engine_priced_total, 45, '15 x qty 3');
  eq(res.customer_price, 105, 'remainder 60 + 45');
}

{
  // Non-finite garbage never throws; negative qty passes through like the
  // engine (documented F-27 parity).
  const rec = { items: [{ builder_item_id: 'a', qty: 'x', item_total_cost: 'y', fixed_price: 5 }] };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'garbage line has no finite cost -> passthrough');
  const rec2 = { items: [{ builder_item_id: 'a', qty: -2, item_total_cost: 100, markup_pct: 10 }] };
  const res2 = wire(rec2, { baselineSell: 100 });
  ok(Number.isFinite(res2.customer_price), 'negative qty resolves finite');
}

{
  // Explicit input.lines rows are tolerated (raw item rows fold qty/cost).
  const raw = { builder_item_id: 'a', qty: 1, item_total_cost: 10, fixed_price: 25 };
  const res = resolveMaintenanceSellPricing({ record: { items: [] }, lines: [raw], baselineSell: 10, engine: ENGINE });
  eq(res.applied, true, 'raw line rows resolve');
  eq(res.customer_price, 25, 'remainder 0 + engine 25');
}

{
  // A record with NO items but project-level dollars (equipment-only service
  // call) has no lines — passthrough, never repriced.
  const rec = { selected_equipment: [{ total_cost: 200 }], total_equipment_cost: 200, subtotal: 200, total_cost: 200 };
  const res = wire(rec, { baselineSell: 200 });
  eq(res.reason, 'no_lines', 'equipment-only record -> no lines');
  ok(res.customer_price === 200, 'baseline verbatim');
}

// ===========================================================================
console.log(`PASS maintenance-pricing-wire (${n} asserts)`);
