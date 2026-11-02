// F-25 suite — marginModel.ts: cent math, part bucketing, machine/labor/
// modifier cost resolution chains, per-line + estimate rollup math,
// missing-registry degradation, margin_pct edge cases.
//
// Bundles the .ts with esbuild (pure TS, zero imports — bundles clean).
// Run: node scripts/test-margin.mjs  →  prints "PASS margin (N asserts)"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-margin.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/marginModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  toCents, fromCents, moneyRound, scaleCents, marginPctOf, markupPctOf,
  MARGIN_COMPONENTS, DEFAULT_LOW_MARGIN_PCT,
  partCostBucket, snapshotPartCostCents, resolveMachineCost, resolveLaborCost,
  resolveModifierCost, partCostBreakdown, lineSellCents, lineMargin,
  estimateMargin, lowMarginLines,
} = M;

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const nearC = (a, b, m) => { n += 1; assert.ok(Math.abs(a - b) <= 1, `${m}: expected ~${b}c, got ${a}c`); };

// ===========================================================================
// 1. Cent conversion — sign-safe convention.
// ===========================================================================
eq(toCents(1.005), 101, 'half-up positive');
eq(toCents(-1.005), -101, 'half-away negative');
eq(toCents('$1,234.56'), 123456, 'decorated string');
eq(toCents('abc'), 0, 'garbage');
eq(toCents(null), 0, 'null');
eq(toCents(''), 0, 'empty string');
eq(toCents(0.1 + 0.2), 30, 'float dust');
eq(fromCents(101), 1.01, 'fromCents');
eq(moneyRound(1.005), 1.01, 'moneyRound');
eq(scaleCents(100, 1.1), 110, 'scale up');
eq(scaleCents(333, 0.1), 33, 'scale percent');
eq(scaleCents(-101, 0.5), -51, 'scale negative half-away');
eq(marginPctOf(35000, 94500), 37.04, 'margin pct of sell');
eq(marginPctOf(100, 0), 0, 'margin pct 0 sell -> 0');
eq(marginPctOf(100, -50), 0, 'margin pct negative sell -> 0');
eq(markupPctOf(35000, 60000), 58.33, 'markup pct of cost');
eq(markupPctOf(100, 0), 0, 'markup pct 0 cost -> 0');
eq(MARGIN_COMPONENTS.join(','), 'material,machine,labor,modifier', 'component order');
eq(DEFAULT_LOW_MARGIN_PCT, 15, 'default threshold mirrors margin floor');

// ===========================================================================
// 2. partCostBucket — type vocabulary, subtype probe, material residual.
// ===========================================================================
eq(partCostBucket({ part_type: 'labor' }), 'labor', 'labor type');
eq(partCostBucket({ part_type: 'equipment' }), 'machine', 'equipment -> machine');
eq(partCostBucket({ part_type: 'modifier' }), 'modifier', 'modifier type');
eq(partCostBucket({ part_type: 'material' }), 'material', 'material type');
eq(partCostBucket({ part_type: 'consumable' }), 'material', 'consumable -> material');
eq(partCostBucket({ part_type: 'pricing', part_subtype: 'markup' }), 'material', 'pricing adjustments are material-ish');
eq(partCostBucket({}), 'material', 'untyped -> material');
eq(partCostBucket({ part_subtype: 'cnc_machine_time' }), 'machine', 'subtype probe -> machine');
eq(partCostBucket({ part_subtype: 'installation_labor' }), 'labor', 'subtype probe -> labor');
eq(partCostBucket({ part_type: 'material', part_subtype: 'painting_labor' }), 'material', 'declared type beats subtype');
eq(partCostBucket(null), 'material', 'null part -> material');
eq(partCostBucket('junk'), 'material', 'non-record -> material');

// ===========================================================================
// 3. snapshotPartCostCents — frozen chain, spellings, negatives.
// ===========================================================================
eq(snapshotPartCostCents({ frozen_extended_cost: 12.34 }), 1234, 'frozen extended');
eq(snapshotPartCostCents({ extended_cost: 12.34 }), 1234, 'makePart spelling');
eq(snapshotPartCostCents({ frozen_unit_cost: 10, quantity: 3 }), 3000, 'unit x qty');
eq(snapshotPartCostCents({ manual_cost: 7, quantity: 2 }), 1400, 'manual cost x qty');
eq(snapshotPartCostCents({ current_extended_cost: 8.5 }), 850, 'current extended fallback');
eq(snapshotPartCostCents({ frozen_extended_cost: -25 }), -2500, 'negative adjustment part');
eq(snapshotPartCostCents({ material_cost: 9 }), 900, 'explicit material_cost wins');
eq(snapshotPartCostCents({ material_cost: 9, frozen_extended_cost: 12 }), 900, 'explicit beats frozen');
eq(snapshotPartCostCents({}), 0, 'empty part');

// ===========================================================================
// 4. resolveMachineCost — rate lookup, setup, disposable, operator labor.
// ===========================================================================
const CNC = {
  id: 'm1', name: 'CNC A', cost_per_hour: 60, setup_minutes: 30,
  setup_cost: 5, disposable_cost_per_unit: 0.5, labor_pct: 50,
  labor_rate_per_hour: 40, status: 'active',
};
{
  const r = resolveMachineCost({ part: { id: 'p1', quantity: 4, machine_ids: ['m1'], run_hours: 2 }, machines: [CNC] });
  eq(r.cost_cents, 15700, 'machine: 2h*60 + 0.5h*60 + 5 + 0.5*4');
  eq(r.lines.length, 1, 'one machine line');
  eq(r.lines[0].run_cost_cents, 12000, 'run cost');
  eq(r.lines[0].setup_cost_cents, 3500, 'setup time + flat');
  eq(r.lines[0].disposable_cost_cents, 200, 'disposable x qty');
  eq(r.operator_labor_cents, 4000, 'operator share -> labor bucket');
  eq(r.lines[0].operator_labor_hours, 1, 'operator hours = 2h * 50%');
}
{
  // setup_billed false skips the time charge, keeps the flat.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: ['m1'], run_hours: 1 }, machines: [{ ...CNC, setup_billed: false }] });
  eq(r.lines[0].setup_cost_cents, 500, 'unbilled setup keeps flat only');
}
{
  // explicit setup_hours on machine overrides minutes.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: ['m1'], run_hours: 0 }, machines: [{ ...CNC, setup_hours: 2, setup_minutes: 30 }] });
  eq(r.lines[0].setup_cost_cents, 12500, 'setup_hours 2*60 + flat 5');
}
{
  // per-ref hours beat part-level hours; machine_id object ref.
  const r = resolveMachineCost({ part: { quantity: 1, run_hours: 9, machine_ids: [{ machine_id: 'm1', run_hours: 1 }] }, machines: [CNC] });
  eq(r.lines[0].run_hours, 1, 'ref hours win over part hours');
  eq(r.lines[0].run_cost_cents, 6000, '1h * 60');
}
{
  // inline machine row in the ref list.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: [{ name: 'Inline', cost_per_hour: 100, run_hours: 0.5 }] }, machines: [] });
  eq(r.lines[0].run_cost_cents, 5000, 'inline machine row');
  eq(r.lines[0].source, 'inline', 'inline source');
}
{
  // MachineRate alias spelling resolves as cost_per_hour.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: ['mr1'], run_hours: 1 }, machines: [{ id: 'mr1', name: 'Legacy', runtime_rate_per_hour: 25 }] });
  eq(r.lines[0].run_cost_cents, 2500, 'MachineRate alias');
}
{
  // machine_hours map keyed by id.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: ['m1'], machine_hours: { m1: 3 } }, machines: [CNC] });
  eq(r.lines[0].run_hours, 3, 'machine_hours map');
}
{
  // machine labor_pct operator defaults labor rate to cost_per_hour.
  const r = resolveMachineCost({ part: { quantity: 1, machine_ids: ['m1'], run_hours: 2 }, machines: [{ ...CNC, labor_rate_per_hour: undefined }] });
  eq(r.operator_labor_cents, 6000, 'operator rate falls back to cost_per_hour');
}

// ===========================================================================
// 5. resolveMachineCost — degradation: missing machine / rate / inactive.
// ===========================================================================
{
  const r = resolveMachineCost({ part: { machine_ids: ['ghost'], run_hours: 2 }, machines: [CNC] });
  eq(r.cost_cents, 0, 'unknown machine -> 0 not crash');
  ok(r.warnings.some((w) => /not found/.test(w)), 'unknown machine warns');
}
{
  const r = resolveMachineCost({ part: { machine_ids: ['m1'], run_hours: 2 }, machines: [{ ...CNC, status: 'inactive' }] });
  eq(r.cost_cents, 0, 'inactive machine -> 0');
  ok(r.warnings.some((w) => /inactive/.test(w)), 'inactive warns');
}
{
  const r = resolveMachineCost({ part: { machine_ids: ['m1'], run_hours: 2 }, machines: [{ id: 'm1', name: 'NoRate' }] });
  eq(r.cost_cents, 0, 'no rate -> run 0 (setup flat only absent)');
  ok(r.warnings.some((w) => /no cost_per_hour/.test(w)), 'missing rate warns');
}
{
  // part-carried rate rescues an unresolvable ref (frozen calc data).
  const r = resolveMachineCost({ part: { machine_ids: ['ghost'], run_hours: 2, machine_rate_per_hour: 75 }, machines: [CNC] });
  eq(r.lines[0].run_cost_cents, 15000, 'part rate rescues missing machine');
  eq(r.lines[0].source, 'part_rate', 'part_rate source');
}
{
  const r = resolveMachineCost({ part: {}, machines: [CNC] });
  eq(r.cost_cents, 0, 'no machine refs -> 0');
  eq(r.lines.length, 0, 'no refs -> no lines');
}
{
  const r = resolveMachineCost({ part: { machine_ids: ['m1'] }, machines: 'junk' });
  eq(r.cost_cents, 0, 'garbage catalog tolerated');
}

// ===========================================================================
// 6. resolveLaborCost — basis math, manual hours, explicit, gates.
// ===========================================================================
const LEVEL = { id: 'lv1', name: 'Journeyman', hourly_rate: 50, rate_basis: 'units_per_hour', rate_value: 5, status: 'active' };
{
  const r = resolveLaborCost({ part: { quantity: 10, labor_level_id: 'lv1' }, labor_levels: [LEVEL] });
  eq(r.cost_cents, 10000, 'units_per_hour: 10/5h * 50');
  eq(r.lines[0].hours, 2, 'computed hours');
}
{
  const r = resolveLaborCost({ part: { quantity: 1, area_sqft: 50, labor_level_id: 'lv2' }, labor_levels: [{ id: 'lv2', name: 'Install', hourly_rate: 60, rate_basis: 'sqft_per_hour', rate_value: 100 }] });
  eq(r.cost_cents, 3000, 'sqft_per_hour: 50/100h * 60');
}
{
  const r = resolveLaborCost({ part: { quantity: 10, labor_level_id: 'lv3' }, labor_levels: [{ id: 'lv3', name: 'Weed', hourly_rate: 20, rate_basis: 'hours_per_unit', rate_value: 0.5 }] });
  eq(r.cost_cents, 10000, 'hours_per_unit: 10*0.5h * 20');
}
{
  const r = resolveLaborCost({ part: { quantity: 99, labor_level_id: 'lv4' }, labor_levels: [{ id: 'lv4', name: 'Setup', hourly_rate: 30, rate_basis: 'flat_hours', rate_value: 3 }] });
  eq(r.cost_cents, 9000, 'flat_hours ignores qty');
}
{
  // labor_levels[] entries — id strings and inline rows.
  const r = resolveLaborCost({
    part: { quantity: 10, labor_levels: ['lv1', { name: 'Inline', hourly_rate: 10, rate_basis: 'flat_hours', rate_value: 1 }] },
    labor_levels: [LEVEL],
  });
  eq(r.cost_cents, 11000, 'composed levels: 100 + 10');
  eq(r.lines.length, 2, 'two labor lines');
}
{
  // manual hours x rate with no level configured.
  const r = resolveLaborCost({ part: { labor_hours: 2, labor_rate: 45 }, labor_levels: [] });
  eq(r.cost_cents, 9000, 'manual hours * rate');
  eq(r.lines[0].source, 'manual_hours', 'manual source');
}
{
  // explicit labor_cost field replaces registry resolution entirely.
  const r = resolveLaborCost({ part: { labor_cost: 77, labor_level_id: 'lv1', quantity: 10 }, labor_levels: [LEVEL] });
  eq(r.cost_cents, 7700, 'explicit labor_cost wins');
  eq(r.lines[0].source, 'explicit', 'explicit source');
}
{
  const r = resolveLaborCost({ part: { quantity: 10, labor_level_id: 'lv1' }, labor_levels: [{ ...LEVEL, status: 'inactive' }] });
  eq(r.cost_cents, 0, 'inactive level skipped');
  ok(r.warnings.some((w) => /inactive/.test(w)), 'inactive warns');
}
{
  const r = resolveLaborCost({ part: { quantity: 10, labor_level_id: 'ghost' }, labor_levels: [LEVEL] });
  eq(r.cost_cents, 0, 'dangling level -> 0 not crash');
  ok(r.warnings.some((w) => /not found/.test(w)), 'dangling warns');
}
{
  const r = resolveLaborCost({
    part: { quantity: 10, labor_level_id: 'lv1', category_key: 'install' },
    labor_levels: [{ ...LEVEL, applies_to_categories: ['design'] }],
  });
  eq(r.cost_cents, 0, 'applies_to mismatch skipped');
}
{
  // machine operator share lands as its own labor line.
  const r = resolveLaborCost({ part: {}, labor_levels: [], machine_labor_cents: 4000, machine_labor_hours: 1 });
  eq(r.cost_cents, 4000, 'operator share added');
  eq(r.lines[0].source, 'machine_operator', 'operator source');
}
{
  // zero rate_value on a divisor basis -> 0 hours, never a throw.
  const r = resolveLaborCost({ part: { quantity: 10, labor_level_id: 'lv1' }, labor_levels: [{ ...LEVEL, rate_value: 0 }] });
  eq(r.cost_cents, 0, 'zero throughput -> 0 hours');
}

// ===========================================================================
// 7. resolveModifierCost — rate.cost by per_unit kind, options, overrides.
// ===========================================================================
const MOD = {
  id: 'mod1', name: 'lam', label: 'Laminate', input_type: 'select',
  can_use_in_pricing: true,
  rates: [
    { label: 'gloss', retail: 10, cost: 3, per_unit: 'per_unit' },
    { label: 'matte', retail: 12, cost: 4, per_unit: 'per_unit' },
  ],
  options: [
    { label: 'Gloss', value: 'gloss', is_default: true, sort: 0, status: 'active' },
    { label: 'Matte', value: 'matte', is_default: false, sort: 1, status: 'active' },
  ],
};
{
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: ['mod1'], modifier_answers: { mod1: 'matte' } }, modifiers: [MOD] });
  eq(r.cost_cents, 4000, 'selected option drives cost row: 4 * 10');
  eq(r.lines[0].rate_label, 'matte', 'option-matched rate row');
}
{
  // default option when no answer.
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: ['mod1'] }, modifiers: [MOD] });
  eq(r.cost_cents, 3000, 'default option (gloss) cost 3 * 10');
}
{
  // option rate_overrides merge over the matched row.
  const omod = { ...MOD, options: [{ label: 'HD', value: 'hd', is_default: true, sort: 0, rate_overrides: { cost: 5 } }] };
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: ['mod1'], modifier_answers: { mod1: 'hd' } }, modifiers: [omod] });
  eq(r.cost_cents, 5000, 'rate_overrides cost wins: 5 * 10');
}
{
  const r = resolveModifierCost({ part: { area_sqft: 10, modifiers: ['mod1'] }, modifiers: [{ id: 'mod1', name: 'm', input_type: 'number', rates: [{ label: 'r', cost: 2, per_unit: 'per_sqft' }] }] });
  eq(r.cost_cents, 2000, 'per_sqft: 2 * 10');
}
{
  const r = resolveModifierCost({ part: { frozen_extended_cost: 200, modifiers: ['mod1'] }, modifiers: [{ id: 'mod1', name: 'm', input_type: 'number', rates: [{ label: 'r', cost: 10, per_unit: 'percent_of_base' }] }] });
  eq(r.cost_cents, 2000, 'percent_of_base: 10% of $200 part cost');
}
{
  const r = resolveModifierCost({ part: { quantity: 99, modifiers: ['mod1'] }, modifiers: [{ id: 'mod1', name: 'm', input_type: 'checkbox', rates: [{ label: 'r', cost: 15, per_unit: 'flat' }] }] });
  eq(r.cost_cents, 1500, 'flat ignores qty');
}
{
  // affects_waste scales the per_unit quantity.
  const r = resolveModifierCost({ part: { quantity: 10, waste_factor: 1.1, modifiers: ['mod1'], modifier_answers: { mod1: 'gloss' } }, modifiers: [{ ...MOD, affects_waste: true }] });
  eq(r.cost_cents, 3300, 'waste-scaled qty: 3 * 11');
}
{
  // explicit modifier_cost replaces resolution.
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: ['mod1'], modifier_cost: 42 }, modifiers: [MOD] });
  eq(r.cost_cents, 4200, 'explicit modifier_cost wins');
}
{
  // formula modifiers carry no cost basis.
  const r = resolveModifierCost({ part: { modifiers: ['mod1'] }, modifiers: [{ id: 'mod1', name: 'm', input_type: 'formula', formula_text: 'Quantity*2' }] });
  eq(r.cost_cents, 0, 'formula modifier -> 0');
  ok(r.warnings.some((w) => /formula/.test(w)), 'formula warns');
}
{
  // catalog modifiers are NOT attached unless the part says so.
  const r = resolveModifierCost({ part: { quantity: 10 }, modifiers: [MOD] });
  eq(r.cost_cents, 0, 'no attachment field -> nothing attached');
}
{
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: [] }, modifiers: [MOD] });
  eq(r.cost_cents, 0, 'explicit empty attachment -> 0');
}
{
  // inline modifier row on the part itself.
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: [{ name: 'inline', input_type: 'number', rates: [{ label: 'r', cost: 1, per_unit: 'per_unit' }] }] }, modifiers: [] });
  eq(r.cost_cents, 1000, 'inline modifier row prices');
}
{
  // inactive modifier in catalog -> skipped silently.
  const r = resolveModifierCost({ part: { quantity: 10, modifiers: ['mod1'] }, modifiers: [{ ...MOD, status: 'archived' }] });
  eq(r.cost_cents, 0, 'inactive modifier skipped');
}
{
  // min_charge is sell-side — never floors cost.
  const r = resolveModifierCost({ part: { quantity: 1, modifiers: ['mod1'], modifier_answers: { mod1: 'gloss' } }, modifiers: [{ ...MOD, min_charge: 999 }] });
  eq(r.cost_cents, 300, 'min_charge does not floor cost');
}

// ===========================================================================
// 8. partCostBreakdown — bucket routing, no double count, extras.
// ===========================================================================
{
  // labor-typed part: frozen IS the labor; level refs must not double count.
  const b = partCostBreakdown({
    part: { part_type: 'labor', frozen_extended_cost: 80, quantity: 10, labor_level_id: 'lv1' },
    labor_levels: [LEVEL],
  });
  eq(b.bucket, 'labor', 'labor bucket');
  eq(b.labor_cents, 8000, 'labor = frozen only');
  eq(b.total_cents, 8000, 'no double count');
}
{
  // equipment part: frozen IS machine cost; machine_ids do not re-resolve.
  const b = partCostBreakdown({
    part: { part_type: 'equipment', frozen_extended_cost: 50, machine_ids: ['m1'], run_hours: 2 },
    machines: [CNC],
  });
  eq(b.machine_cents, 5000, 'equipment frozen -> machine');
  eq(b.total_cents, 5000, 'frozen not re-resolved');
}
{
  // material part with machine ref: material + machine extras + operator labor.
  const b = partCostBreakdown({
    part: { part_type: 'material', frozen_extended_cost: 30, quantity: 4, machine_ids: ['m1'], run_hours: 2 },
    machines: [CNC],
  });
  eq(b.material_cents, 3000, 'material bucket');
  eq(b.machine_cents, 15700, 'machine extras resolved');
  eq(b.labor_cents, 4000, 'operator share lands in labor');
  eq(b.total_cents, 22700, 'total = material + machine + operator labor');
}
{
  // material part with labor level ref.
  const b = partCostBreakdown({
    part: { part_type: 'material', frozen_extended_cost: 30, quantity: 10, labor_level_id: 'lv1' },
    labor_levels: [LEVEL],
  });
  eq(b.labor_cents, 10000, 'level resolved as extra');
  eq(b.total_cents, 13000, 'material + labor');
}
{
  // explicit machine_cost on a material part replaces registry resolution.
  const b = partCostBreakdown({
    part: { part_type: 'material', frozen_extended_cost: 30, machine_cost: 90, machine_ids: ['m1'], run_hours: 2 },
    machines: [CNC],
  });
  eq(b.machine_cents, 9000, 'explicit machine_cost wins');
}
{
  // inactive part -> zero everything.
  const b = partCostBreakdown({ part: { part_type: 'labor', frozen_extended_cost: 80, is_active: false } });
  eq(b.total_cents, 0, 'inactive part excluded');
  ok(b.warnings.some((w) => /inactive/.test(w)), 'inactive warns');
}
{
  // modifier attachments price through on material parts.
  const b = partCostBreakdown({
    part: { part_type: 'material', frozen_extended_cost: 30, quantity: 10, modifiers: ['mod1'], modifier_answers: { mod1: 'matte' } },
    modifiers: [MOD],
  });
  eq(b.modifier_cents, 4000, 'modifier extra');
  eq(b.total_cents, 7000, 'material + modifier');
}
{
  // garbage input never throws.
  const b = partCostBreakdown({ part: 'junk' });
  eq(b.total_cents, 0, 'garbage part -> 0');
}

// ===========================================================================
// 9. lineMargin — sell chain + cost bases.
// ===========================================================================
{
  const l = lineMargin({ line: { line_id: 'l1', total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 1000 } });
  eq(l.cost_basis, 'snapshot', 'snapshot basis');
  eq(l.sell_cents, 100000, 'sell = 1000 x 1');
  eq(l.material_cost_cents, 60000, 'material = frozen snapshot');
  eq(l.margin_cents, 40000, 'margin = sell - cost');
  eq(l.margin_pct, 40, 'margin pct');
}
{
  // line adjustment + category adjustment stack.
  const l = lineMargin({
    line: { line_id: 'l1', total_snapshot: 100, customer_quantity: 1, customer_price_snapshot: 200, adjustment_percent: 10, product_category: 'Signs' },
    estimate: { category_adjustments: { Signs: 5 } },
  });
  eq(l.sell_cents, 23000, 'sell = 200 * 1.15');
  eq(l.adjustment_percent, 15, 'combined adjustment');
}
{
  // no customer snapshot -> total_snapshot is the sell unit (legacy parity).
  const l = lineMargin({ line: { line_id: 'l1', total_snapshot: 80, customer_quantity: 3 } });
  eq(l.sell_cents, 24000, 'legacy fallback sell');
}
{
  // parts basis — Σ part components × customer_quantity.
  const l = lineMargin({
    line: { line_id: 'l1', builder_product_id: 'bp1', customer_quantity: 2, customer_price_snapshot: 500, total_snapshot: 227 },
    parts: [
      { id: 'pa', builder_product_id: 'bp1', part_type: 'material', frozen_extended_cost: 30, quantity: 4, machine_ids: ['m1'], run_hours: 2 },
      { id: 'pb', builder_product_id: 'bp1', part_type: 'labor', frozen_extended_cost: 40 },
      { id: 'pc', builder_product_id: 'bp1', part_type: 'equipment', frozen_extended_cost: 60 },
      { id: 'other', builder_product_id: 'bp2', part_type: 'material', frozen_extended_cost: 999 },
    ],
    machines: [CNC],
  });
  eq(l.cost_basis, 'parts', 'parts basis');
  // per product: material 30 + labor(frozen 40) + equipment(frozen 60) + machine extras 157 + operator 40 = 327 -> x2
  eq(l.material_cost_cents, 6000, 'material x2');
  eq(l.machine_cost_cents, 43400, '(equipment 60 + extras 157) x2');
  eq(l.labor_cost_cents, 16000, '(labor 40 + operator 40) x2');
  eq(l.total_cost_cents, 65400, 'total x2');
  eq(l.sell_cents, 100000, 'sell = 500 x 2');
  eq(l.margin_cents, 34600, 'parts-basis margin');
  eq(l.parts.length, 3, 'three part breakdowns');
}
{
  // project basis — declared material totals reconcile vs snapshot.
  const l = lineMargin({
    line: { line_id: 'l1', project_id: 'proj1', customer_quantity: 1, total_snapshot: 170, customer_price_snapshot: 300 },
    projects: { proj1: { id: 'proj1', total_machine_cost: 40, total_labor_cost: 30, total_material_cost: 100 } },
  });
  eq(l.cost_basis, 'project', 'project basis');
  eq(l.machine_cost_cents, 4000, 'project machine');
  eq(l.labor_cost_cents, 3000, 'project labor');
  eq(l.material_cost_cents, 10000, 'project material');
  eq(l.total_cost_cents, 17000, 'project total');
}
{
  // project basis — no material declared -> residual inside snapshot.
  const l = lineMargin({
    line: { line_id: 'l1', project_id: 'proj1', customer_quantity: 1, total_snapshot: 150, customer_price_snapshot: 300 },
    projects: { proj1: { id: 'proj1', total_machine_cost: 40, total_labor_cost: 30 } },
  });
  eq(l.material_cost_cents, 8000, 'material = residual 150-70');
  eq(l.total_cost_cents, 15000, 'total reconciles to snapshot');
}
{
  // components exceed snapshot -> material floors at 0, resolved wins.
  const l = lineMargin({
    line: { line_id: 'l1', project_id: 'proj1', customer_quantity: 1, total_snapshot: 150, customer_price_snapshot: 300 },
    projects: { proj1: { id: 'proj1', total_machine_cost: 100, total_labor_cost: 80 } },
  });
  eq(l.material_cost_cents, 0, 'material floored');
  eq(l.total_cost_cents, 18000, 'resolved sum exceeds snapshot');
  ok(l.warnings.some((w) => /exceed/.test(w)), 'overflow warns');
}
{
  // embedded project record also resolves.
  const l = lineMargin({
    line: { line_id: 'l1', customer_quantity: 1, total_snapshot: 100, project: { total_machine_cost: 10 } },
  });
  eq(l.machine_cost_cents, 1000, 'embedded project');
}
{
  // zero sell -> margin_pct 0 (spec edge case).
  const l = lineMargin({ line: { line_id: 'l1', total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 0 } });
  eq(l.sell_cents, 0, 'zero sell');
  eq(l.margin_cents, -60000, 'negative margin');
  eq(l.margin_pct, 0, 'margin_pct 0 on 0 sell');
}
{
  const l = lineMargin({ line: null });
  eq(l.total_cost_cents, 0, 'null line -> 0');
  eq(l.margin_cents, 0, 'null line margin 0');
}

// ===========================================================================
// 10. estimateMargin — rollup waterfall + by_component + profitability parity.
// ===========================================================================
{
  // profitability.js parity case: cost 600, sell 1000-100+50=950 -> 350 / 36.84%.
  const r = estimateMargin({
    estimate: { line_items: [{ total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 1000 }] },
    pricing: { subtotal: 1000, discount: 100, contingency: 50 },
  });
  eq(r.gross_sell_cents, 100000, 'gross sell');
  eq(r.discount_cents, 10000, 'discount from pricing');
  eq(r.contingency_cents, 5000, 'contingency from pricing');
  eq(r.total_sell_cents, 95000, 'net sell');
  eq(r.total_cost_cents, 60000, 'snapshot material');
  eq(r.margin_cents, 35000, 'gross profit parity');
  eq(r.margin_pct, 36.84, 'margin pct parity');
  eq(r.markup_on_cost_pct, 58.33, 'markup pct parity');
}
{
  // waterfall recomputed from estimate fields when no pricing passed.
  const r = estimateMargin({
    estimate: {
      line_items: [{ total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 1000 }],
      discount_percent: 10, contingency_percent: 5,
    },
  });
  eq(r.discount_cents, 10000, '10% of 1000');
  eq(r.contingency_cents, 4500, '5% of 900');
  eq(r.total_sell_cents, 94500, 'net = 945');
  eq(r.margin_cents, 34500, 'margin = 945 - 600');
  eq(r.margin_pct, 36.51, 'pct on net');
}
{
  // internal_discount reduces net sell (entity margin-reporting field).
  const r = estimateMargin({
    estimate: { line_items: [{ total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 1000 }], internal_discount: 25 },
  });
  eq(r.internal_discount_cents, 2500, 'internal discount');
  eq(r.total_sell_cents, 97500, 'net after internal discount');
  eq(r.margin_cents, 37500, 'margin reduced');
}
{
  // components roll up across lines.
  const r = estimateMargin({
    estimate: {
      line_items: [
        { line_id: 'a', builder_product_id: 'bp1', customer_quantity: 1, customer_price_snapshot: 500 },
        { line_id: 'b', total_snapshot: 600, customer_quantity: 1, customer_price_snapshot: 1000 },
      ],
    },
    parts: [
      { id: 'pa', builder_product_id: 'bp1', part_type: 'material', frozen_extended_cost: 30, quantity: 4, machine_ids: ['m1'], run_hours: 2 },
      { id: 'pb', builder_product_id: 'bp1', part_type: 'labor', frozen_extended_cost: 40 },
    ],
    machines: [CNC],
  });
  eq(r.by_component.material_cents, 63000, 'material rollup');
  eq(r.by_component.machine_cents, 15700, 'machine rollup');
  eq(r.by_component.labor_cents, 8000, 'labor rollup (frozen 40 + operator 40)');
  eq(r.by_component.modifier_cents, 0, 'no modifiers');
  eq(r.total_cost_cents, 86700, 'total cost rollup');
  eq(r.gross_sell_cents, 150000, 'gross = 500+1000');
  eq(r.gross_margin_cents, 63300, 'gross margin = sum of line margins');
  eq(r.margin_cents, 63300, 'no waterfall -> net margin = gross');
  ok(Math.abs(r.by_component.material_share_pct + r.by_component.machine_share_pct + r.by_component.labor_share_pct - 100) < 0.05, 'component shares ~100%');
  eq(r.line_count, 2, 'line count');
}
{
  // empty estimate -> zeros, never a throw.
  const r = estimateMargin({});
  eq(r.line_count, 0, 'no lines');
  eq(r.total_sell_cents, 0, 'no sell');
  eq(r.margin_cents, 0, 'no margin');
  eq(r.margin_pct, 0, '0 sell -> 0 pct');
  eq(r.by_component.material_cents, 0, 'empty components');
}
{
  // warnings aggregate up with line labels.
  const r = estimateMargin({
    estimate: { line_items: [{ line_id: 'a', builder_product_id: 'bp1', customer_price_snapshot: 100, client_product_name: 'Pylon' }] },
    parts: [{ id: 'pa', builder_product_id: 'bp1', part_type: 'material', machine_ids: ['ghost'], run_hours: 1 }],
  });
  ok(r.warnings.some((w) => /Pylon/.test(w) && /not found/.test(w)), 'warning carries line label');
}
{
  // lowMarginLines helper.
  const r = estimateMargin({
    estimate: {
      line_items: [
        { line_id: 'good', total_snapshot: 100, customer_quantity: 1, customer_price_snapshot: 500 },
        { line_id: 'bad', total_snapshot: 490, customer_quantity: 1, customer_price_snapshot: 500 },
        { line_id: 'zero', total_snapshot: 0, customer_quantity: 1, customer_price_snapshot: 0 },
      ],
    },
  });
  const lows = lowMarginLines(r, 15);
  eq(lows.length, 1, 'one low-margin line');
  eq(lows[0].line_id, 'bad', 'the 2%-margin line flagged');
}

console.log(`PASS margin (${n} asserts)`);
