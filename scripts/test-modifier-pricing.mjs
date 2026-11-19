import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-08 + F-10 suite — PricingModifier engine + modifier->formula wiring.
// Vite-style extensionless/.ts imports can't be resolved by bare Node —
// bundle first (sibling-suite convention; esbuild resolves the .ts chain:
// modifierPricing -> formulaEval + pricingVariables).
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-modifier-pricing.mjs');
const feBundle = resolve(here, '.tmp-formula-eval.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/modifierPricing.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/formulaEval.ts')],
  bundle: true, format: 'esm', outfile: feBundle, logLevel: 'silent',
});
const {
  MODIFIER_INPUT_TYPES,
  normalizeModifier,
  normalizeModifierOption,
  modifierIsActive,
  modifierCanPrice,
  pricingModifiersFor,
  resolveModifierOption,
  resolveModifierRateRow,
  sanitizeModifierVarName,
  modifierVarsForPart,
  modifierWasteFactor,
  effectiveModifierQuantity,
  priceModifierEffect,
  buildModifierFormulaEnv,
  evaluateModifierFormula,
} = await import(pathToFileURL(bundlePath).href);
const { evaluateFormula } = await import(pathToFileURL(feBundle).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };
const near = (a, b, msg) => { assert.ok(Math.abs(a - b) < 1e-9, `${msg} — expected ${b}, got ${a}`); n++; };

// ------------------------------------------------------------- normalize()
{
  const m = normalizeModifier({
    id: 'mod1', name: ' Lamination ', label: 'Lamination',
    input_type: 'SELECT', can_use_in_pricing: true,
    rates: [{ label: 'Matte', retail: '2.5', cost: '1.1', per_unit: 'per_sqft' }],
    formula_text: ' Quantity * 2 ', include_setup_fee: true, setup_fee: 35,
    min_charge: '15', affects_waste: true, inventoried_part_type: 'vinyl',
    pricing_tier_id: 'tierA', display_order: '3', status: '',
  });
  eq(m.name, 'Lamination', 'name trimmed');
  eq(m.input_type, 'select', 'input_type lowercased');
  eq(m.can_use_in_pricing, true);
  eq(m.rates.length, 1, 'rate row kept');
  eq(m.rates[0].retail, 2.5, 'retail coerced from string');
  eq(m.rates[0].per_unit, 'per_sqft');
  eq(m.min_charge, 15, 'min_charge coerced');
  eq(m.affects_waste, true);
  eq(m.inventoried_part_type, 'vinyl');
  eq(m.display_order, 3, 'display_order coerced');
  eq(m.status, 'active', 'unset status -> active');
  eq(m.setup_fee, 35);
  eq(m.warnings.length, 0, 'clean row -> no warnings');
}
{
  const bad = normalizeModifier('garbage');
  eq(bad.status, 'inactive', 'non-record -> inactive empty row');
  ok(bad.warnings.length > 0, 'non-record carries warning');
  eq(normalizeModifier(null).can_use_in_pricing, false, 'null -> gate closed');
  const neg = normalizeModifier({ name: 'x', min_charge: -5 });
  eq(neg.min_charge, 0, 'negative min_charge clamped');
  ok(neg.warnings.some(w => /min_charge/.test(w)), 'clamp warned');
  const weird = normalizeModifier({ name: 'x', input_type: 'hologram' });
  eq(weird.input_type, 'hologram', 'unknown input_type kept verbatim');
  ok(weird.warnings.some(w => /unknown input_type/.test(w)), 'warned on type');
}

// ----------------------------------------------------- option normalization
{
  const o = normalizeModifierOption({
    id: 'o1', modifier_id: 'mod1', label: 'Gloss', value: 'gloss',
    rate_overrides: { retail: 3 }, is_default: true, sort: '2',
  });
  eq(o.value, 'gloss');
  eq(o.is_default, true);
  eq(o.sort, 2, 'sort coerced');
  eq(o.status, 'active', 'unset status -> active');
  eq(normalizeModifierOption(null).status, 'active', 'null option -> defaults');
}
ok(MODIFIER_INPUT_TYPES.includes('select') && MODIFIER_INPUT_TYPES.includes('formula'),
  'input-type registry covers select + formula');
ok(modifierIsActive({}), 'status unset is active');
ok(!modifierIsActive({ status: 'archived' }), 'archived not active');
ok(modifierCanPrice({ can_use_in_pricing: true }), 'pricing gate open');
ok(!modifierCanPrice({ can_use_in_pricing: false }), 'pricing gate closed');

// --------------------------------------- pricingModifiersFor (gate + order)
{
  const mods = [
    { id: 'a', name: 'A', can_use_in_pricing: true, display_order: 2 },
    { id: 'b', name: 'B', can_use_in_pricing: false, display_order: 1 }, // gate
    { id: 'c', name: 'C', can_use_in_pricing: true, status: 'archived' }, // status
    { id: 'd', name: 'D', can_use_in_pricing: true, display_order: 0 },
    { id: 'e', name: 'E', can_use_in_pricing: true, inventoried_part_type: 'banner' },
  ];
  const out = pricingModifiersFor({ part_type: 'vinyl' }, mods);
  assert.deepEqual(out.map(m => m.id), ['d', 'a'],
    'pricing+status gates filter; display_order sorts'); n++;
  ok(out.every(m => modifierCanPrice(m)), 'only pricing-eligible survive');
}
{
  // attachment list on the part limits the set
  const mods = [
    { id: 'a', name: 'A', can_use_in_pricing: true },
    { id: 'b', name: 'B', can_use_in_pricing: true },
    { id: 'c', name: 'C', can_use_in_pricing: true },
  ];
  const part = { modifier_ids: ['a', 'c'] };
  assert.deepEqual(pricingModifiersFor(part, mods).map(m => m.id), ['a', 'c'],
    'modifier_ids attach by id'); n++;
  const byName = pricingModifiersFor({ modifiers: [{ name: 'B' }] }, mods);
  assert.deepEqual(byName.map(m => m.id), ['b'], 'attach by name record'); n++;
  eq(pricingModifiersFor({ modifiers: [] }, mods).length, 0,
    'explicit empty attachment list -> none');
}
{
  // inventoried_part_type: mismatch excluded, match kept, no-type part excluded
  const mods = [{ id: 'a', name: 'A', can_use_in_pricing: true, inventoried_part_type: 'VINYL' }];
  eq(pricingModifiersFor({ part_type: 'vinyl' }, mods).length, 1, 'ci part-type match');
  eq(pricingModifiersFor({ part_type: 'banner' }, mods).length, 0, 'mismatch excluded');
  eq(pricingModifiersFor({}, mods).length, 0, 'untyped part excluded when pinned');
  // inline modifier records attached on the part pass through the same gates
  const inline = pricingModifiersFor(
    { modifiers: [{ name: 'In', input_type: 'number', can_use_in_pricing: true, rates: [{ retail: 5 }] }] },
    [],
  );
  eq(inline.length, 1, 'inline part-attached modifier included');
  eq(inline[0].name, 'In');
}

// ------------------------------------------------- option/rate resolution
{
  const mod = {
    id: 'm', name: 'Finish', input_type: 'select', can_use_in_pricing: true,
    rates: [
      { label: 'matte', retail: 2, cost: 1, per_unit: 'per_sqft' },
      { label: 'gloss', retail: 3, cost: 1.4, per_unit: 'per_sqft' },
    ],
    options: [
      { label: 'Matte', value: 'matte', sort: 1 },
      { label: 'Gloss', value: 'gloss', sort: 0, is_default: true },
    ],
  };
  const dflt = resolveModifierOption(mod, undefined, undefined);
  eq(dflt.value, 'gloss', 'is_default fallback picks flagged option');
  const picked = resolveModifierOption(mod, undefined, 'matte');
  eq(picked.label, 'Matte', 'answer matches option by value');
  const byLabel = resolveModifierOption(mod, undefined, 'Matte');
  eq(byLabel.value, 'matte', 'answer matches by label');
  const ci = resolveModifierOption(mod, undefined, 'MATTE');
  eq(ci.value, 'matte', 'case-insensitive match');
  const rate = resolveModifierRateRow(mod, picked);
  eq(rate.retail, 2, 'rate row matched by option label/value');
  const withOv = resolveModifierOption(
    { ...mod, options: [{ label: 'UV', value: 'uv', sort: 0, rate_overrides: { retail: 9 } }] },
    undefined, 'uv');
  eq(withOv.value, 'uv');
  const ovRate = resolveModifierRateRow({ ...mod, rates: [{ label: 'uv', retail: 4, cost: 1, per_unit: 'flat_add' }] }, withOv);
  eq(ovRate.retail, 9, 'option rate_overrides beats modifier rate row');
  eq(ovRate.cost, 1, 'non-overridden fields inherit base row');
  eq(ovRate.per_unit, 'flat_add');
}

// --------------------------------------------------------- var-name safety
{
  eq(sanitizeModifierVarName('Ink Coverage %'), 'Ink_Coverage', 'spaces/symbols -> _');
  eq(sanitizeModifierVarName('9lives'), 'M_9lives', 'leading digit prefixed');
  eq(sanitizeModifierVarName(''), 'Modifier', 'blank -> Modifier');
}

// ----------------------------------------------------- modifierVarsForPart
{
  const mod = {
    id: 'm1', name: 'Lam', input_type: 'select', can_use_in_pricing: true,
    rates: [{ label: 'gloss', retail: 3, cost: 1, per_unit: 'per_sqft' }],
    options: [{ label: 'Gloss', value: 'gloss', sort: 0 }],
  };
  const r = modifierVarsForPart({}, mod, { m1: 'gloss' });
  eq(r.option.value, 'gloss', 'answer by modifier.id key');
  eq(r.vars.Lam, 1, 'non-numeric selected value -> 1');
  eq(r.vars.Lam_Retail, 3);
  eq(r.vars.Lam_Rate, 3, '_Rate aliases retail');
  eq(r.vars.Lam_Cost, 1);
  eq(r.vars.Lam_Label, 'Gloss');
  eq(r.vars.Lam_PerUnit, 'per_sqft');
  const byName = modifierVarsForPart({}, mod, { Lam: 'gloss' });
  eq(byName.option.value, 'gloss', 'answer by modifier.name key');
  const cb = modifierVarsForPart({}, { name: 'Rush', input_type: 'checkbox', can_use_in_pricing: true }, { Rush: true });
  eq(cb.vars.Rush, 1, 'checkbox true -> 1');
  eq(modifierVarsForPart({}, { name: 'Rush', input_type: 'checkbox', can_use_in_pricing: true }, {}).vars.Rush, 0,
    'checkbox unanswered -> 0');
  const num5 = modifierVarsForPart({}, { name: 'Coats', input_type: 'number', can_use_in_pricing: true }, { Coats: 5 });
  eq(num5.vars.Coats, 5, 'number answer passes through');
  const builtin = modifierVarsForPart({}, { name: 'Quantity', input_type: 'number', can_use_in_pricing: true }, { Quantity: 9 });
  ok(!('Quantity' in builtin.vars), 'bare <Name> can never shadow a builtin');
}

// --------------------------------------------------------------- waste flag
{
  eq(modifierWasteFactor({ waste_factor: 1.15 }), 1.15, 'waste_factor multiplier verbatim');
  eq(modifierWasteFactor({ waste_factor_percent: 20 }), 1.2, 'percent -> 1+pct/100');
  eq(modifierWasteFactor({}), 1, 'no waste fields -> 1');
  eq(modifierWasteFactor(null), 1, 'null part -> 1');
  const m = { name: 'W', affects_waste: true, can_use_in_pricing: true };
  eq(effectiveModifierQuantity({ waste_factor: 1.5 }, m, 10), 15, 'affects_waste scales qty');
  eq(effectiveModifierQuantity({ waste_factor: 1.5 }, { name: 'N', can_use_in_pricing: true }, 10), 10,
    'unflagged modifier keeps qty');
}

// ------------------------------------------------------ priceModifierEffect
{
  const base = { name: 'M', can_use_in_pricing: true };
  const pu = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 2.5, cost: 1, per_unit: 'per_unit' }] },
    quantity: 4, basePrice: 100, area: 10,
  });
  eq(pu.kind, 'per_unit'); near(pu.amount, 10, 'retail * quantity');
  const sq = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 2.5, per_unit: 'per_sqft' }] },
    quantity: 4, basePrice: 100, area: 12,
  });
  eq(sq.kind, 'per_sqft'); near(sq.amount, 30, 'retail * area');
  const pc = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 15, per_unit: 'percent_of_base' }] },
    quantity: 4, basePrice: 200, area: 12,
  });
  eq(pc.kind, 'percent'); near(pc.amount, 30, 'basePrice * 15%');
  const fl = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 7.25, per_unit: 'flat_add' }] },
    quantity: 99, basePrice: 200, area: 12,
  });
  eq(fl.kind, 'flat'); near(fl.amount, 7.25, 'flat ignores qty/area');
  const blank = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 4 }] }, quantity: 99,
  });
  eq(blank.kind, 'flat', 'missing per_unit -> flat');
  near(blank.amount, 4);
  const weird = priceModifierEffect({
    modifier: { ...base, rates: [{ retail: 4, per_unit: 'per_galaxy' }] },
  });
  eq(weird.kind, 'flat', 'unrecognized per_unit -> flat');
  eq(weird.detail.unrecognized_per_unit, 'per_galaxy', 'flagged in detail');
  const none = priceModifierEffect({ modifier: base, quantity: 5 });
  eq(none.amount, 0, 'no rates -> 0');
  ok(none.detail.no_rate, 'detail marks missing rate');
}

// ----------------------------------------- min_charge + setup flags (effect)
{
  const r = priceModifierEffect({
    modifier: { name: 'M', can_use_in_pricing: true, min_charge: 25,
      include_setup_fee: true, setup_fee: 40,
      rates: [{ retail: 2, per_unit: 'per_unit' }] },
    quantity: 3,
  });
  near(r.detail.raw_amount, 6, 'pre-floor math kept');
  eq(r.amount, 25, 'min_charge floors the modifier amount');
  eq(r.detail.min_charge_applied, true);
  eq(r.detail.include_setup_fee, true, 'flag surfaces for setup compose');
  eq(r.detail.setup_fee, 40, 'configured fee surfaced');
  const over = priceModifierEffect({
    modifier: { name: 'M', can_use_in_pricing: true, min_charge: 5,
      rates: [{ retail: 10, per_unit: 'flat_add' }] },
  });
  eq(over.amount, 10, 'amount above floor untouched');
  eq(over.detail.min_charge_applied, false);
}

// ---------------------------------------------- buildModifierFormulaEnv
{
  const part = { quantity: 10, width: 48, height: 24, base_cost: 3, retail: 8,
    part_type: 'vinyl', waste_factor: 1.2 };
  const modifiers = [
    { id: 'a', name: 'Coats', input_type: 'number', can_use_in_pricing: true, display_order: 1 },
    { id: 'b', name: 'Lam', input_type: 'select', can_use_in_pricing: true, display_order: 0,
      rates: [{ label: 'gloss', retail: 3, cost: 1, per_unit: 'per_sqft' }] },
    { id: 'c', name: 'Hidden', input_type: 'number', can_use_in_pricing: false }, // gated out
  ];
  const options = [
    { modifier_id: 'b', label: 'Gloss', value: 'gloss', sort: 0 },
  ];
  const env = buildModifierFormulaEnv({
    part, modifiers, options,
    answers: { a: 5, b: 'gloss', c: 99 },
    globals: [{ name: 'ShopRate', default_value: 65, status: 'active' }],
  });
  eq(env.Quantity, 10, 'builtin from part');
  eq(env.PartRetail, 8, 'part retail builtin');
  eq(env.ShopRate, 65, 'global layer present');
  eq(env.PartType, 'vinyl', 'part type marker injected');
  eq(env.WasteFactor, 1.2, 'waste factor injected');
  eq(env.Coats, 5, 'answer by modifier.id');
  eq(env.Lam, 1, 'select answer var');
  eq(env.Lam_Retail, 3, 'option-attached rate surfaced via options list');
  eq(env.Hidden, undefined, 'can_use_in_pricing=false contributes nothing');
  eq(env.Hidden_Retail, undefined, 'gated modifier: no rate vars either');
}
{
  // formula modifier depends on earlier answer — order/dependency channel
  const env = buildModifierFormulaEnv({
    part: { quantity: 4 },
    modifiers: [
      { id: 'n', name: 'Num', input_type: 'number', can_use_in_pricing: true, display_order: 0 },
      { id: 'f', name: 'FeeCalc', input_type: 'formula', can_use_in_pricing: true, display_order: 1,
        formula_text: 'Num * Quantity + 2' },
    ],
    answers: { Num: 3 },
  });
  eq(env.FeeCalc, 14, 'formula modifier evaluated in display_order -> 3*4+2');
}
{
  // end-to-end: env feeds the REAL evaluateFormula (F-09 import chain)
  const env = buildModifierFormulaEnv({
    part: { quantity: 30, width: 48, height: 24 },
    modifiers: [{ id: 'x', name: 'Coats', input_type: 'number', can_use_in_pricing: true }],
    answers: { x: 2 },
    globals: [{ name: 'SqFtRate', default_value: 1.5 }],
  });
  const r = evaluateFormula('Width * Height / 144 * SqFtRate * Coats', env);
  eq(r.ok, true, 'formula parses against composed env');
  near(r.value, 24, '48*24/144*1.5*2 = 24');
}

// ------------------------------------------- evaluateModifierFormula flags
{
  const base = { name: 'F', input_type: 'formula', can_use_in_pricing: true };
  const env = { Quantity: 10, WasteFactor: 1.5, PartType: 'vinyl' };

  const plain = evaluateModifierFormula({ ...base, formula_text: 'Quantity * 2' }, env);
  eq(plain.ok, true); near(plain.amount, 20, 'formula evaluates');
  eq(plain.include_setup_fee, false);

  const waste = evaluateModifierFormula(
    { ...base, formula_text: 'Quantity * 2', affects_waste: true }, env);
  near(waste.amount, 30, 'affects_waste: Quantity 10 -> 15 (*1.5 waste) * 2');
  eq(waste.detail.quantity_effective, 15, 'effective qty traced');
  eq(env.Quantity, 10, 'caller env not mutated');

  const floor = evaluateModifierFormula(
    { ...base, formula_text: 'Quantity', min_charge: 25 }, env);
  eq(floor.amount, 25, 'min_charge floors formula amount');
  eq(floor.raw_amount, 10, 'raw preserved');
  eq(floor.detail.min_charge_applied, true);

  const setup = evaluateModifierFormula(
    { ...base, formula_text: '5', include_setup_fee: true, setup_fee: 30 }, env);
  eq(setup.include_setup_fee, true, 'result marked for setup compose');
  eq(setup.setup_fee, 30, 'fee surfaced');

  const gate = evaluateModifierFormula(
    { ...base, formula_text: '1', inventoried_part_type: 'banner' }, env);
  eq(gate.ok, false, 'inventoried_part_type mismatch fails closed');
  assert.match(gate.error, /inventoried_part_type/); n++;
  const gateOk = evaluateModifierFormula(
    { ...base, formula_text: '7', inventoried_part_type: 'VINYL' }, env);
  eq(gateOk.ok, true, 'ci part-type match passes');
  near(gateOk.amount, 7);
  const noMarker = evaluateModifierFormula(
    { ...base, formula_text: '2', inventoried_part_type: 'banner' }, { Quantity: 1 });
  eq(noMarker.ok, true, 'no PartType marker -> cannot verify -> evaluates');

  const noFormula = evaluateModifierFormula({ ...base }, env);
  eq(noFormula.ok, false);
  assert.match(noFormula.error, /formula_text/); n++;
  const badVar = evaluateModifierFormula({ ...base, formula_text: 'Nope * 2' }, env);
  eq(badVar.ok, false, 'unknown var -> clean error');
  assert.match(badVar.error, /unknown variable 'Nope'/); n++;
  const div0 = evaluateModifierFormula({ ...base, formula_text: '1 / 0' }, env);
  eq(div0.ok, false, 'division by zero -> clean error not crash');
  const nullEnv = evaluateModifierFormula({ ...base, formula_text: '1+1' }, null);
  eq(nullEnv.ok, true, 'null env safe');
  near(nullEnv.amount, 2);
}

rmSync(bundlePath, { force: true }); // generated bundles — keep the tree clean
rmSync(feBundle, { force: true });

console.log(`PASS modifier pricing (${n} asserts: normalize/pricing-gate+order/option+rate resolution/var names/waste/rate kinds/min+setup flags/env compose/formula eval/flag semantics)`);
