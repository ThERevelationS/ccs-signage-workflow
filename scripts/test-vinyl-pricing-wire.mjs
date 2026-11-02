// F-23b suite — vinylPricingWire.ts + vinylEnginePricing.js seam wiring.
//
// Contract under test (ESTIMATOR_MASTERPLAN F-23b):
//   * ZERO REGRESSION — a vinyl record whose lines carry no pricing-engine
//     config resolves byte-identical economics at the customerPricing seam.
//   * Tier/template config changes the sell price ONLY on lines that carry it;
//     the module's cost math stays authoritative (internal cost untouched).
//   * Edge cases: zero qty, dangling tier/template refs, inactive template,
//     missing cost base, saved-tier precedence, embedded registries.
//
// Bundles the .ts/.js with esbuild (pure zero-import shared file; the seam
// bundle pulls the engine + template model + glue transitively).
// Run: node scripts/test-vinyl-pricing-wire.mjs  →  "PASS vinyl-pricing-wire (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const wireOut = resolve(here, '.tmp-vinyl-wire.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/vinylPricingWire.ts')],
  bundle: true, format: 'esm', outfile: wireOut, logLevel: 'silent',
});
const W = await import(pathToFileURL(wireOut).href);
const {
  vinylRecordLines, vinylPricingContextOf, vinylLineDescriptor,
  descriptorHasPricingContent, vinylConfigScan, resolveVinylSellPricing,
} = W;

const engineOut = resolve(here, '.tmp-vinyl-wire-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: engineOut, logLevel: 'silent',
});
const E = await import(pathToFileURL(engineOut).href);

const tplOut = resolve(here, '.tmp-vinyl-wire-tpl.mjs');
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
const seamOut = resolve(here, '.tmp-vinyl-wire-seam.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerPricing.js')],
  bundle: true, format: 'esm', outfile: seamOut, logLevel: 'silent',
});
const { sourceProjectEconomics, acceptedCustomerUnitPrice } = await import(pathToFileURL(seamOut).href);

// Module cost math — must remain the untouched authority.
const calcOut = resolve(here, '.tmp-vinyl-wire-calc.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/vinyl/vinylCalc.js')],
  bundle: true, format: 'esm', outfile: calcOut, logLevel: 'silent',
});
const { calcVinylProject } = await import(pathToFileURL(calcOut).href);

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m, eps = 0.005) => { n += 1; assert.ok(Math.abs(a - b) <= eps, `${m}: expected ~${b}, got ${a}`); };

const wire = (record, { baselineSell, internalCost, context } = {}) =>
  resolveVinylSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE });

// ===========================================================================
// Fixtures
// ===========================================================================
const plainProject = () => ({
  project_name: 'Fleet Decals',
  subtotal: 150,
  markup_percent: 50,
  markup_amount: 75,
  total_cost: 225,
  items: [
    { id: 'a', description: 'Door decal', width_inches: 24, height_inches: 12, quantity: 2, item_total_cost: 100, pricing_mode: 'per_sqft' },
    { id: 'b', description: 'Window sticker', width_inches: 12, height_inches: 12, quantity: 1, item_total_cost: 50 },
  ],
});

// ===========================================================================
// 1. Line normalization + config detection
// ===========================================================================
{
  const lines = vinylRecordLines(plainProject());
  eq(lines.length, 2, 'flat items normalized');
  eq(lines[0].key, 'a', 'item id is line key');
  eq(lines[0].cost, 100, 'item_total_cost is the cost base');
  eq(lines[0].qty, 2, 'qty normalized');
  eq(lines[0].origin, 'items', 'origin items');
}

{
  // workflows[].items supply lines only when the flat list is empty — and are
  // never double-counted when both exist.
  const wf = { subtotal: 100, markup_percent: 0, markup_amount: 0, total_cost: 100, items: [], workflows: [{ id: 'wf1', items: [{ description: 'WF part', quantity: 3, item_total_cost: 40 }] }] };
  const lines = vinylRecordLines(wf);
  eq(lines.length, 1, 'workflow items feed lines');
  eq(lines[0].origin, 'workflows', 'origin workflows');
  eq(lines[0].key.startsWith('wf1:'), true, 'positional workflow key');
  const both = { ...wf, items: [{ id: 'x', item_total_cost: 10 }] };
  eq(vinylRecordLines(both).length, 1, 'flat items win — workflows not double counted');
  eq(vinylRecordLines(both)[0].key, 'x', 'flat item used');
  eq(vinylRecordLines(null).length, 0, 'null record -> no lines');
  eq(vinylRecordLines({}).length, 0, 'empty record -> no lines');
}

{
  // config detection — engine vocab only; vinyl unit enums are NOT config.
  ok(!descriptorHasPricingContent(null), 'null descriptor');
  ok(!descriptorHasPricingContent({}), 'empty descriptor');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_sqft' }), 'unit enum per_sqft not config');
  ok(!descriptorHasPricingContent({ pricing_mode: 'per_roll' }), 'unit enum per_roll not config');
  ok(!descriptorHasPricingContent({ mode: 'per_piece' }), 'per_piece not config');
  ok(!descriptorHasPricingContent({ pricing: {} }), 'empty nested block not config');
  ok(!descriptorHasPricingContent({ machine: 'printer' }), 'bare machine name not config');
  ok(descriptorHasPricingContent({ fixed_price: 10 }), 'fixed_price is config');
  ok(descriptorHasPricingContent({ markup_pct: 0 }), 'explicit markup_pct 0 is config');
  ok(descriptorHasPricingContent({ tier_ref: 'Gold' }), 'tier_ref is config');
  ok(descriptorHasPricingContent({ pricing_template_id: 't1' }), 'template id is config');
  ok(descriptorHasPricingContent({ pricing_template: { breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] } }), 'embedded template is config');
  ok(descriptorHasPricingContent({ per_unit_breaks: [{ qty: 1, unit_price: 5 }] }), 'qty chart is config');
  ok(descriptorHasPricingContent({ market_retail: 20 }), 'market_retail is config');
  ok(descriptorHasPricingContent({ pricing_mode: 'market_based' }), 'market token is config');
  ok(descriptorHasPricingContent({ minimum_charge: 25 }), 'minimum_charge is config');
  ok(descriptorHasPricingContent({ formula_modifiers: [{ type: 'add_pct', value: 5 }] }), 'formula modifiers are config');
  ok(descriptorHasPricingContent({ machine: { markup_pct: 10 } }), 'machine descriptor w/ fields is config');
  ok(descriptorHasPricingContent({ global_pricing_tier_id: 'gpt-1' }), 'tier set link is config');
  ok(descriptorHasPricingContent({ tier_rules: [{ name: 'Gold', markup_pct: 40 }] }), 'embedded tier rules are config');
}

{
  const scan = vinylConfigScan(plainProject());
  eq(scan.configured, false, 'plain project not configured');
  eq(scan.lineCount, 2, 'scan counts lines');
  const cfg = vinylConfigScan({ items: [{ id: 'a', item_total_cost: 10, fixed_price: 9 }] });
  eq(cfg.configured, true, 'configured scan');
  eq(cfg.configuredCount, 1, 'configured count');
}

// ===========================================================================
// 2. ZERO REGRESSION — no config -> byte-identical outputs
// ===========================================================================
{
  const rec = plainProject();
  const econ = sourceProjectEconomics('vinyl', rec);
  eq(econ.internalCost, 150, 'internal cost = record.subtotal');
  eq(econ.customerPrice, 225, 'customer price = record.total_cost verbatim');

  // Legacy subtotal-missing path stays identical too.
  const legacy = { ...rec }; delete legacy.subtotal;
  const econ2 = sourceProjectEconomics('vinyl', legacy);
  eq(econ2.internalCost, 150, 'internal cost = total - markup_amount');
  eq(econ2.customerPrice, 225, 'customer price unchanged');

  const res = wire(rec, { baselineSell: 225, internalCost: 150 });
  eq(res.applied, false, 'no config -> not applied');
  eq(res.passthrough, true, 'passthrough marker');
  eq(res.reason, 'no_config', 'reason no_config');
  ok(res.customer_price === 225, 'customer_price === baseline verbatim');
  eq(res.remainder_sell, 225, 'remainder = whole baseline');
  eq(res.engine_priced_total, 0, 'no engine spend');
  ok(res.chain[0].layer === 'config_scan' && res.chain[0].hit === false, 'scan miss recorded');
}

{
  // Items that merely carry unit enums / empty blocks still passthrough.
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 10, pricing_mode: 'per_roll', pricing: {} }], total_cost: 10, markup_percent: 0 };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'unit-enum-only project passthroughs');
}

{
  // Malformed/absent record shapes never throw and never reprice.
  eq(resolveVinylSellPricing({ engine: ENGINE }).reason, 'no_record', 'missing record');
  eq(resolveVinylSellPricing({ record: {}, engine: ENGINE }).reason, 'no_lines', 'empty record');
  eq(resolveVinylSellPricing({ record: 'junk', engine: ENGINE }).reason, 'no_record', 'non-record');
  const res = resolveVinylSellPricing({ record: { items: [{ id: 'a', item_total_cost: 5, fixed_price: 4 }] }, baselineSell: 7 });
  eq(res.reason, 'no_engine', 'uninjected engine passthroughs safely');
  ok(res.warnings.length > 0, 'no_engine warns');
}

{
  // Module cost math untouched: calcVinylProject output is the cost authority.
  const inv = [{ id: 'v1', vinyl_name: '3M', roll_width_inches: 48, pricing_mode: 'per_roll', cost_per_roll: 150, roll_length_yards: 50, waste_factor_percent: 0 }];
  const r = calcVinylProject({ items: [{ width_inches: 24, height_inches: 12, quantity: 2, vinyl_id: 'v1', apply_print: false, labor_hours_each: 1 }], labor_rate_per_hour: 60, supplies_percent_of_materials: 0, markup_percent: 25 }, inv);
  ok(r.totals.total_cost === r.totals.subtotal + r.totals.markup_amount, 'module total = subtotal + markup');
  ok(r.totals.markup_amount === r.totals.subtotal * 0.25, 'markup percent path intact');
}

// ===========================================================================
// 3. Engine-priced lines — only the configured line reprices
// ===========================================================================
{
  // fixed_price on item a; item b stays baseline.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  const res = wire(rec, { baselineSell: 225, internalCost: 150 });
  eq(res.applied, true, 'configured -> applied');
  eq(res.passthrough, false, 'not passthrough');
  eq(res.reason, 'priced', 'reason priced');
  // engine: 80 * 2 = 160; configured baseline 100 * 1.5 = 150; remainder 75.
  eq(res.engine_priced_total, 160, 'engine extension 80x2');
  near(res.configured_baseline, 150, 'configured baseline = cost x markup factor');
  near(res.remainder_sell, 75, 'remainder keeps item b sell');
  eq(res.customer_price, 235, 'customer price = 75 remainder + 160 engine');
  const la = res.lines.find((l) => l.key === 'a');
  const lb = res.lines.find((l) => l.key === 'b');
  eq(la.priced, true, 'line a priced');
  eq(la.engine.unit_price, 80, 'fixed unit price');
  eq(la.engine.price_source, 'fixed_price', 'price source fixed');
  eq(la.engine.tier_source, 'part_fixed', 'engine ladder part_fixed wins');
  eq(lb.priced, false, 'line b not priced');
  near(lb.baseline_sell, 75, 'line b baseline preserved');
  ok(res.chain.filter((c) => c.won).length === 1, 'exactly one chain winner');
  eq(res.chain.at(-1).layer, 'customer_price', 'customer_price closes the chain');
}

{
  // markup_pct part override.
  const rec = plainProject();
  rec.items[0].markup_pct = 100;
  const res = wire(rec, { baselineSell: 225 });
  // unitCost 50 -> markup 100% -> 100; ext 200. remainder 75 -> 275.
  eq(res.customer_price, 275, 'markup override reprices the line only');
  eq(res.lines[0].engine.price_source, 'markup', 'markup source');
}

{
  // per_unit_breaks bracket pick at qty 2.
  const rec = plainProject();
  rec.items[0].per_unit_breaks = [{ qty: 4, unit_price: 40 }, { qty: 2, unit_price: 60 }];
  const res = wire(rec, { baselineSell: 225 });
  eq(res.lines[0].engine.unit_price, 60, 'highest qualifying bracket wins');
  eq(res.engine_priced_total, 120, '60 x 2');
  eq(res.customer_price, 195, 'remainder 75 + 120');
}

{
  // tier_ref resolves against caller-supplied chart rows.
  const rec = plainProject();
  rec.items[0].tier_ref = 'Gold';
  const ctx = { tierRules: [{ id: 'r1', name: 'Gold', markup_pct: 60 }] };
  const res = wire(rec, { baselineSell: 225, context: ctx });
  // unitCost 50 x 1.6 = 80; ext 160.
  eq(res.lines[0].engine.unit_price, 80, 'bound tier row markup applied');
  eq(res.customer_price, 235, 'remainder 75 + 160');
}

{
  // Machine descriptor override outranks every part layer.
  const rec = plainProject();
  rec.items[0].machine = { markup_pct: 100 };
  const res = wire(rec, { baselineSell: 225 });
  eq(res.lines[0].engine.tier_source, 'machine_override', 'machine layer wins');
  eq(res.engine_priced_total, 200, '50 x 2 x 2');
}

{
  // minimum_charge floors the extension; setup_fee adds on top.
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 10, markup_pct: 0, minimum_charge: 50 }], total_cost: 15, markup_percent: 50, subtotal: 10, markup_amount: 5 };
  const res = wire(rec, { baselineSell: 15 });
  eq(res.lines[0].engine.minimum_applied, true, 'floor fired');
  eq(res.customer_price, 50, 'extension floored to 50');
  const rec2 = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, markup_pct: 20, setup_fee: 25 }], total_cost: 150, markup_percent: 50, subtotal: 100, markup_amount: 50 };
  const res2 = wire(rec2, { baselineSell: 150 });
  eq(res2.lines[0].engine.setup_fee, 25, 'setup fee captured');
  eq(res2.customer_price, 145, '120 extension + 25 setup');
}

{
  // formula_modifiers apply exactly once, after the winning rule.
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, markup_pct: 20, formula_modifiers: [{ type: 'add_pct', value: 10 }] }], total_cost: 150, markup_percent: 50 };
  const res = wire(rec, { baselineSell: 150 });
  eq(res.lines[0].engine.unit_price, 132, '120 x 1.10 once — not twice');
  eq(res.customer_price, 132, 'line repriced once');
}

{
  // Nested item pricing block + project-level engine_pricing.items map.
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, pricing: { fixed_price: 42 } }], total_cost: 150, markup_percent: 50 };
  const res = wire(rec, { baselineSell: 150 });
  eq(res.customer_price, 42, 'nested block wins');
  const rec2 = { engine_pricing: { items: { a: { fixed_price: 33 } } }, items: [{ id: 'a', quantity: 1, item_total_cost: 100 }], total_cost: 150, markup_percent: 50 };
  const res2 = wire(rec2, { baselineSell: 150 });
  eq(res2.customer_price, 33, 'project items map configures the line');
}

// ===========================================================================
// 4. Templates + tiers
// ===========================================================================
{
  // Bound PricingTemplate via declared link field + caller registry.
  const rec = { items: [{ id: 'a', quantity: 10, item_total_cost: 100, pricing_template_id: 'tpl-1' }], total_cost: 150, markup_percent: 50, subtotal: 100, markup_amount: 50 };
  const ctx = {
    customerTier: 'Gold',
    templates: [{ id: 'tpl-1', name: 'Decal Chart', unit_category: 'each', status: 'active', breaks: [{ qty: 1, tier_markups: { Gold: 40 } }] }],
  };
  const res = wire(rec, { baselineSell: 150, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'template priced the line');
  eq(res.lines[0].engine.unit_price, 14, '10 x 1.40');
  eq(res.engine_priced_total, 140, 'ext 140');
  eq(res.customer_price, 140, 'remainder 0 + 140');
}

{
  // Embedded template record on the item itself — no registry needed.
  const rec = { items: [{ id: 'a', quantity: 4, item_total_cost: 80, pricing_template: { name: 'Inline', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] } }], total_cost: 120, markup_percent: 50, customer_pricing: { tier_number: 2 } };
  const ctx = { customerTier: 'Gold' };
  const res = wire(rec, { baselineSell: 120, context: ctx });
  eq(res.lines[0].engine.template_applied, true, 'embedded template resolved');
  eq(res.lines[0].engine.unit_price, 25, '20 x 1.25');
  eq(res.customer_price, 100, 'remainder 0 + 100');
}

{
  // Dangling template id falls through to remaining part layers + warning-free
  // deterministic chain (engine contract).
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, pricing_template_id: 'ghost', markup_pct: 10 }], total_cost: 150, markup_percent: 50 };
  const res = wire(rec, { baselineSell: 150, context: { templates: [] } });
  eq(res.lines[0].engine.template_applied, false, 'dangling template not applied');
  eq(res.lines[0].engine.template_reason, 'template_not_found', 'reason recorded');
  eq(res.lines[0].engine.unit_price, 110, 'part markup survives the miss');
}

{
  // Inactive template: resolution records the reason; the line then prices via
  // the remaining engine layers (here the default markup — landing on its own
  // baseline contribution).
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, pricing_template_id: 'tpl-1' }], total_cost: 150, markup_percent: 50, subtotal: 100, markup_amount: 50 };
  const ctx = { templates: [{ id: 'tpl-1', name: 'Off', status: 'inactive', breaks: [{ qty: 1, tier_markups: { Gold: 900 } }] }] };
  const res = wire(rec, { baselineSell: 150, context: ctx });
  eq(res.lines[0].engine.template_reason, 'template_inactive', 'inactive reason recorded');
  eq(res.lines[0].engine.template_applied, false, 'inactive not applied');
  eq(res.customer_price, 150, 'default layer lands back on baseline share');
}

{
  // Missing tier row / dangling tier ref: engine contract prices at cost and
  // reports the unpriced hit — it must NOT silently fall back to markup.
  const rec = { items: [{ id: 'a', quantity: 1, item_total_cost: 100, tier_ref: 'Platinum' }], total_cost: 150, markup_percent: 50, subtotal: 100, markup_amount: 50 };
  const res = wire(rec, { baselineSell: 150, context: { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] } });
  eq(res.lines[0].engine.dangling_tier_ref, 'platinum', 'dangling ref reported');
  eq(res.customer_price, 100, 'engine prices at cost, chain shows it');
  ok(res.warnings.some((w) => /Platinum|tier ref/i.test(w)), 'dangling warns');
}

// ===========================================================================
// 5. Edge cases
// ===========================================================================
{
  // Zero qty: extension 0, engine minimum never fires.
  const rec = { items: [{ id: 'a', quantity: 0, item_total_cost: 80, markup_pct: 50 }], total_cost: 120, markup_percent: 50, subtotal: 80, markup_amount: 40 };
  const res = wire(rec, { baselineSell: 120 });
  eq(res.lines[0].priced, true, 'zero-qty line still resolved');
  eq(res.engine_priced_total, 0, 'zero qty -> zero extension');
  eq(res.customer_price, 0, 'configured zero-qty sell is $0');
}

{
  // Configured line without a cost base is SKIPPED (stays baseline) — never
  // repriced blind. When nothing else is configured the whole result is a
  // byte-identical passthrough.
  const rec = { items: [{ id: 'a', quantity: 1, markup_pct: 80 }], total_cost: 90, markup_percent: 50 };
  const res = wire(rec, { baselineSell: 90 });
  eq(res.passthrough, true, 'no cost base -> passthrough');
  eq(res.reason, 'no_priced_lines', 'reason recorded');
  ok(res.customer_price === 90, 'baseline verbatim');
  ok(res.warnings.some((w) => /no cost base/.test(w)), 'skip warns');

  // Mixed: skipped line + priced line.
  const rec2 = {
    items: [
      { id: 'a', quantity: 1, markup_pct: 80 },
      { id: 'c', quantity: 1, item_total_cost: 60, fixed_price: 30 },
    ],
    total_cost: 165, markup_percent: 50,
  };
  const res2 = wire(rec2, { baselineSell: 165 });
  eq(res2.lines[0].skipped, 'skipped_no_cost', 'skip reason');
  eq(res2.customer_price, 105, '165 - 90 configured baseline + 30 engine');
}

{
  // Precedence (parity with the F-23a channel wire): engine config owns the
  // sell side and wins over a legacy saved customer_pricing snapshot; a saved
  // snapshot with NO engine config still applies verbatim.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  rec.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econ = sourceProjectEconomics('vinyl', rec);
  eq(econ.internalCost, 150, 'internal cost unaffected');
  // configured line a: qty 2 x fixed 80 = 160; remainder 225 - 150 = 75 -> 235
  eq(econ.customerPrice, 235, 'engine wins over saved snapshot when configured');
  ok(econ.pricing_engine && econ.pricing_engine.applied === true, 'resolution attached');
  eq(econ.pricing_engine.lines.filter((l) => l.priced).length, 1, 'one engine-priced line');

  const recNoCfg = plainProject();
  recNoCfg.customer_pricing = { applied: true, total: 500, tier_number: 2 };
  const econNoCfg = sourceProjectEconomics('vinyl', recNoCfg);
  eq(econNoCfg.customerPrice, 500, 'saved tier still wins with no engine config');
  ok(econNoCfg.pricing_engine === undefined, 'no engine field on passthrough');
}

{
  // Other modules untouched: brick/maintenance keep flat economics, channel
  // and foundation keep their own math, unknown keys hit the fallback.
  const rec = { subtotal: 100, markup_amount: 20, total_cost: 120, items: [{ id: 'a', item_total_cost: 50, fixed_price: 1 }] };
  eq(sourceProjectEconomics('brick_stone', rec).customerPrice, 120, 'brick untouched by engine');
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
  // The seam end to end: engine sell lands on the estimate-line economics.
  const rec = plainProject();
  rec.items[0].fixed_price = 80;
  const econ = sourceProjectEconomics('vinyl', rec);
  eq(econ.internalCost, 150, 'seam: internal cost authoritative');
  eq(econ.customerPrice, 235, 'seam: engine sell total');

  // pricingContext param reaches the wire (registry-backed tier_ref).
  const rec2 = plainProject();
  rec2.items[0].tier_ref = 'Gold';
  const econ2 = sourceProjectEconomics('vinyl', rec2, 0, { tierRules: [{ id: 'r', name: 'Gold', markup_pct: 60 }] });
  eq(econ2.customerPrice, 235, 'seam: caller registries resolve tier refs');
}

{
  // Record-embedded engine_pricing context block resolves without a caller.
  const rec = {
    items: [{ id: 'a', quantity: 1, item_total_cost: 100, tier_ref: 'Gold' }],
    engine_pricing: { customer_tier: 'Gold', tier_rules: [{ name: 'Gold', markup_pct: 60 }] },
    total_cost: 150, markup_percent: 50, subtotal: 100, markup_amount: 50,
  };
  const econ = sourceProjectEconomics('vinyl', rec);
  eq(econ.customerPrice, 160, 'embedded context drives engine price');
}

{
  // context merge: caller beats embedded; saved tier_number is weakest.
  const rec = { customer_pricing: { tier_number: 2 }, engine_pricing: { customer_tier: 'Silver', tier_rules: [{ name: 'S' }], default_markup_pct: 33 } };
  const ctx = vinylPricingContextOf(rec, { customerTier: 'Gold' });
  eq(ctx.customerTier, 'Gold', 'caller tier wins');
  eq(ctx.tierRules.length, 1, 'embedded rules picked up');
  eq(ctx.defaultMarkupPct, 33, 'embedded default markup');
  const ctx2 = vinylPricingContextOf({ customer_pricing: { tier_number: 2 }, markup_percent: 50 });
  eq(ctx2.customerTier, 2, 'saved tier_number feeds context');
  eq(ctx2.defaultMarkupPct, 50, 'record markup percent is the default');
}

{
  // Descriptor merge precedence: flat < project map < nested block.
  const rec = {
    engine_pricing: { items: { a: { fixed_price: 20, markup_pct: 5 } } },
    items: [{ id: 'a', quantity: 1, item_total_cost: 10, fixed_price: 15, pricing: { fixed_price: 42 } }],
  };
  const line = vinylRecordLines(rec)[0];
  const d = vinylLineDescriptor(line, rec);
  eq(d.fixed_price, 42, 'nested block wins');
  eq(d.markup_pct, 5, 'project map fills gaps');
}

{
  // Interpolated breaks honor the descriptor flag; customer-tier chart rows
  // hit when a line opts in via an embedded rule + tier pin.
  const rec = {
    items: [{ id: 'a', quantity: 3, item_total_cost: 30, tier_rules: [{ customer_tier: 'Gold', markup_pct: 50 }], customer_tier: 'Gold' }],
    total_cost: 45, markup_percent: 50,
  };
  const res = wire(rec, { baselineSell: 45 });
  eq(res.lines[0].engine.tier_source, 'customer_tier', 'embedded tier row hits customer_tier layer');
  eq(res.lines[0].engine.unit_price, 15, 'unit cost 10 x 1.5');
  eq(res.engine_priced_total, 45, '15 x qty 3');
  eq(res.customer_price, 45, 'row happens to match baseline here');
}

{
  // Non-finite garbage never throws; negative qty passes through like the
  // engine (documented F-27 parity).
  const rec = { items: [{ id: 'a', quantity: 'x', item_total_cost: 'y', fixed_price: 5 }] };
  const res = wire(rec, { baselineSell: 10 });
  eq(res.passthrough, true, 'garbage line has no finite cost -> passthrough');
  const rec2 = { items: [{ id: 'a', quantity: -2, item_total_cost: 100, markup_pct: 10 }] };
  const res2 = wire(rec2, { baselineSell: 150 });
  ok(Number.isFinite(res2.customer_price), 'negative qty resolves finite');
}

// ===========================================================================
console.log(`PASS vinyl-pricing-wire (${n} asserts)`);
