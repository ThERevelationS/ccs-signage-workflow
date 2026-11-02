import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-machine-costs.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/machineCosts.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  normalizeMachine, machineUseCost, applyMachineMultipliers,
  machinePartOverride, priceMachineStep, DEFAULT_SECOND_SIDE_PCT,
} = await import(pathToFileURL(bundlePath).href);

const M = {
  id: 'm1', name: 'HP Latex 360', machine_type: 'roll_fed',
  cost_per_hour: 60, disposable_cost_per_unit: 0.5,
  setup_cost: 25, setup_minutes: 30, labor_pct: 50,
  weighted_multiplier: 1.2, income_account: '4100',
};

// ---------------------------------------------------------------- normalizeMachine
{
  const m = normalizeMachine(M);
  assert.equal(m.active, true, 'blank status -> active');
  assert.equal(m.cost_per_hour, 60);
  assert.equal(m.setup_hours, 0.5, 'setup_minutes/60');
  assert.equal(m.setup_billed, true, 'setup time billed by default');
  assert.equal(m.second_side_price_pct, DEFAULT_SECOND_SIDE_PCT, 'default 100');
  assert.equal(m.labor_rate_per_hour, 60, 'labor rate defaults to cost_per_hour');
}
{
  // MachineRate-family aliases + dangling fields tolerated.
  const m = normalizeMachine({
    name: 'Old Plotter', runtime_rate_per_hour: 80, setup_fee: 10,
    setup_time_minutes: 15, disposable_per_unit: 2, labor_percent: 25,
    multiplier: 1.5, pricing_template_id: 'pt-9', margin_mode: 'margin',
    setup_billed: false, setup_hours: 1,
  });
  assert.equal(m.cost_per_hour, 80, 'runtime_rate_per_hour alias');
  assert.equal(m.setup_cost, 10, 'setup_fee alias');
  assert.equal(m.disposable_cost_per_unit, 2, 'disposable_per_unit alias');
  assert.equal(m.weighted_multiplier, 1.5, 'multiplier alias');
  assert.equal(m.margin_chart_id, 'pt-9', 'pricing_template_id alias');
  assert.equal(m.margin_mode, 'margin', 'dangling margin_mode kept');
  assert.equal(m.setup_billed, false, 'dangling setup_billed honored');
  assert.equal(m.setup_hours, 1, 'explicit setup_hours beats minutes/60');
}
{
  const m = normalizeMachine({ name: 'Bad', cost_per_hour: 50, labor_pct: 150, weighted_multiplier: -2 });
  assert.equal(m.labor_pct, 100, 'labor_pct clamped to [0,100]');
  assert.equal(m.weighted_multiplier, 0, 'negative multiplier clamped');
  assert.ok(m.warnings.length >= 2, 'clamps produce warnings');
}
{
  const m = normalizeMachine({
    name: 'P', cost_per_hour: 10,
    profiles: [{ name: 'draft', speed_settings: { sqft_per_hour: 200 } }, 'junk', { name: 'hq' }],
  });
  assert.equal(m.profiles.length, 2, 'non-object profile dropped');
  assert.deepEqual(m.profiles[1].speed_settings, {}, 'missing speed_settings -> {}');
}
assert.equal(normalizeMachine(null), null, 'non-object -> null');
assert.equal(normalizeMachine({ name: 'Off', status: 'inactive' }).active, false, 'inactive detected');
{
  const once = normalizeMachine(M);
  const twice = normalizeMachine(once);
  assert.equal(twice.cost_per_hour, once.cost_per_hour, 'normalize idempotent');
  assert.equal(twice.setup_hours, once.setup_hours);
}

// ---------------------------------------------------------------- machineUseCost
{
  const use = machineUseCost({ machine: M, run_hours: 2, quantity: 10 });
  assert.equal(use.run_cost, 120, '60 x 2h');
  assert.equal(use.setup_cost, 55, '25 flat + 0.5h x 60 billed');
  assert.equal(use.breakdown.setup.time_cost, 30, 'time charge separated in breakdown');
  assert.equal(use.disposable_cost, 5, '0.5 x 10 units');
  assert.equal(use.labor_cost, 60, '2h x 50% x 60 labor share');
  assert.equal(use.total, 240, 'total = run+setup+disposable+labor');
  assert.equal(use.total, use.run_cost + use.setup_cost + use.disposable_cost + use.labor_cost,
    'total consistent with returned components');
}
{
  const off = machineUseCost({ machine: { ...M, setup_billed: false }, run_hours: 2, quantity: 10 });
  assert.equal(off.setup_cost, 25, 'setup_billed:false drops time charge, keeps flat');
  assert.equal(off.breakdown.setup.billed, false);
  const argOff = machineUseCost({ machine: M, run_hours: 2, quantity: 10, setup_billed: false });
  assert.equal(argOff.setup_cost, 25, 'call-level setup_billed also honored');
}
{
  const m = { name: 'Op', cost_per_hour: 40, labor_pct: 100, labor_rate_per_hour: 25 };
  const use = machineUseCost({ machine: m, run_hours: 3 });
  assert.equal(use.labor_cost, 75, '3h x 100% x $25 labor rate');
}
{
  const use = machineUseCost({ machine: { ...M, status: 'inactive' }, run_hours: 2, quantity: 10 });
  assert.equal(use.total, 0, 'inactive machine prices nothing');
  assert.equal(use.inactive, true);
}
{
  const use = machineUseCost({ machine: null, run_hours: 1 });
  assert.equal(use.machine_found, false);
  assert.equal(use.total, 0);
}

// ---------------------------------------------------------------- applyMachineMultipliers
{
  // weighted multiplier applied BEFORE margin: 240 x 1.2 = 288.
  const r = applyMachineMultipliers(240, M, {});
  assert.equal(r.weighted_cost, 288, 'cost x weighted_multiplier');
  assert.equal(r.price, 288, 'no chart -> weighted passthrough');
  assert.equal(r.margin_pct, null);
}
{
  // margin mode: cost / (1 - pct/100) -> 288 / 0.6 = 480.
  const r = applyMachineMultipliers(240, M, {
    quantity: 5,
    margin_chart: { id: 'ch1', breaks: [{ qty: 1, margin_pct: 40 }] },
  });
  assert.equal(r.margin_mode, 'margin', 'margin_pct field infers margin basis');
  assert.equal(r.margin_pct, 40);
  assert.equal(r.price, 480, '288 / (1 - 0.40)');
  assert.equal(r.margin_amount, 192, 'price - weighted cost');
  assert.equal(r.chart_resolved, true);
}
{
  // markup mode: cost x (1 + pct/100) -> 288 x 1.5 = 432.
  const r = applyMachineMultipliers(240, M, {
    quantity: 5,
    margin_chart: { breaks: [{ qty: 1, markup_pct: 50 }] },
  });
  assert.equal(r.margin_mode, 'markup', 'markup_pct field infers markup basis');
  assert.equal(r.price, 432, '288 x 1.50');
}
{
  // bracket pick: highest qualifying qty threshold wins.
  const chart = { breaks: [
    { qty: 1, margin_pct: 50 }, { qty: 10, margin_pct: 40 }, { qty: 100, margin_pct: 25 },
  ] };
  const small = applyMachineMultipliers(240, M, { quantity: 5, margin_chart: chart });
  const mid = applyMachineMultipliers(240, M, { quantity: 50, margin_chart: chart });
  const big = applyMachineMultipliers(240, M, { quantity: 500, margin_chart: chart });
  assert.equal(small.margin_pct, 50, 'qty 5 -> first bracket');
  assert.equal(mid.margin_pct, 40, 'qty 50 -> middle bracket');
  assert.equal(big.margin_pct, 25, 'qty 500 -> top bracket');
  assert.equal(big.price, 384, '288 / 0.75');
}
{
  // PricingTemplate-style tier_markups resolved by customer tier.
  const chart = { breaks: [{ qty: 1, tier_markups: { 'General Public': 50, Wholesale: 25 } }] };
  const pub = applyMachineMultipliers(240, M, { quantity: 3, margin_chart: chart, customer_tier: 'General Public' });
  const whl = applyMachineMultipliers(240, M, { quantity: 3, margin_chart: chart, customer_tier: 'Wholesale' });
  assert.equal(pub.price, 432, 'tier markup 50 -> x1.5');
  assert.equal(whl.price, 360, 'tier markup 25 -> x1.25');
}
{
  // margin_mode precedence: opts > machine > chart > field-name inference.
  const r = applyMachineMultipliers(240, { ...M, margin_mode: 'markup' }, {
    quantity: 1, margin_mode: 'margin',
    margin_chart: { margin_mode: 'markup', breaks: [{ qty: 1, markup_pct: 50 }] },
  });
  assert.equal(r.margin_mode, 'margin', 'opts.margin_mode wins over machine+chart+field');
  assert.equal(r.price, 576, '288 / 0.5 not x1.5');
  const m2 = applyMachineMultipliers(240, { ...M, margin_mode: 'markup' }, {
    quantity: 1, margin_chart: { breaks: [{ qty: 1, margin_pct: 50 }] },
  });
  assert.equal(m2.margin_mode, 'markup', 'machine.margin_mode beats field inference');
  assert.equal(m2.price, 432, 'markup basis despite margin_pct field');
}
{
  // margin_pct >= 100 cannot price -> null + warning (cost/(1-m) undefined).
  const r = applyMachineMultipliers(240, M, {
    quantity: 1, margin_chart: { breaks: [{ qty: 1, margin_pct: 100 }] },
  });
  assert.equal(r.price, null, 'margin 100% unpriceable');
  assert.equal(r.price_valid, false);
  assert.ok(r.warnings.some((w) => />= 100/.test(w)), 'warning emitted');
}
{
  // margin_chart_id alone: caller must supply the record.
  const r = applyMachineMultipliers(240, { ...M, margin_chart_id: 'pt-7' }, { quantity: 5 });
  assert.equal(r.price, 288, 'unresolved chart -> weighted passthrough');
  assert.equal(r.chart_resolved, false);
  assert.equal(r.chart_id, 'pt-7', 'id echoed for audit');
  assert.ok(r.warnings.some((w) => /unresolved/.test(w)));
}
{
  // chart-level flat percent used when brackets do not qualify.
  const r = applyMachineMultipliers(240, M, {
    quantity: 1, margin_chart: { margin_pct: 20, breaks: [{ qty: 50, margin_pct: 60 }] },
  });
  assert.equal(r.margin_pct, 20, 'chart default percent when no bracket qualifies');
  assert.equal(r.source, 'chart_default');
}

// ---------------------------------------------------------------- machinePartOverride
{
  const m = { ...M, part_overrides: [
    { part_id: 'p1', disposable: 3, income_account: '4200', price_calc: 'margin', second_side_price_pct: 60 },
  ] };
  const ov = machinePartOverride(m, 'p1');
  assert.equal(ov.found, true);
  assert.equal(ov.disposable_cost_per_unit, 3, 'override disposable');
  assert.equal(ov.income_account, '4200', 'override income_account');
  assert.equal(ov.price_calc, 'margin');
  assert.equal(ov.second_side_price_pct, 60);
  assert.deepEqual(ov.applied.sort(), ['disposable_cost_per_unit', 'income_account', 'price_calc', 'second_side_price_pct'].sort());
}
{
  const m = { ...M, part_overrides: { 'part-9': { disposable_cost_per_unit: 7 } } };
  const ov = machinePartOverride(m, 'part-9');
  assert.equal(ov.found, true, 'map form matches');
  assert.equal(ov.disposable_cost_per_unit, 7);
}
{
  const ov = machinePartOverride(M, 'nope');
  assert.equal(ov.found, false, 'miss -> machine defaults');
  assert.equal(ov.disposable_cost_per_unit, 0.5);
  assert.equal(ov.income_account, '4100');
  assert.equal(ov.second_side_price_pct, 100);
  const ovObj = machinePartOverride(M, { id: 'p1', name: 'Panel' });
  assert.equal(ovObj.part_id, 'p1', 'part object -> id extracted');
}
{
  const ov = machinePartOverride({ ...M, part_overrides: [{ part_id: 'x', price_calc: 'wat' }] }, 'x');
  assert.equal(ov.price_calc, null, 'unknown price_calc ignored');
  assert.ok(ov.warnings.some((w) => /unknown price_calc/.test(w)));
}

// ---------------------------------------------------------------- priceMachineStep
{
  const chart = { breaks: [{ qty: 1, margin_pct: 40 }] };
  const r = priceMachineStep({ machine: M, part: 'p1', quantity: 10, run_hours: 2, margin_chart: chart });
  assert.equal(r.priced, true);
  assert.equal(r.base_cost, 240, 'cost stack through use cost');
  assert.equal(r.first_side_price, 480, '288 weighted / 0.6');
  assert.equal(r.second_side, false);
  assert.equal(r.price, 480);
  assert.equal(r.unit_price, 48, '480 / 10 units');
  assert.equal(r.income_account, '4100', 'machine income account');
}
{
  // Second-side rule: % of first-side SELL price. 480 + 480 x 60% = 768.
  const m = { ...M, part_overrides: [{ part_id: 'p1', second_side_price_pct: 60 }] };
  const chart = { breaks: [{ qty: 1, margin_pct: 40 }] };
  const r = priceMachineStep({ machine: m, part: 'p1', quantity: 10, run_hours: 2, second_side: true, margin_chart: chart });
  assert.equal(r.second_side, true);
  assert.equal(r.second_side_price_pct, 60);
  assert.equal(r.second_side_price, 288, '60% of 480 sell price');
  assert.equal(r.price, 768);
}
{
  // Default duplex = 100% when nothing configured; call-arg pct wins.
  const chart = { breaks: [{ qty: 1, margin_pct: 40 }] };
  const dbl = priceMachineStep({ machine: M, part: 'p1', quantity: 10, run_hours: 2, second_side: true, margin_chart: chart });
  assert.equal(dbl.price, 960, 'default second_side_price_pct 100 doubles the price');
  const arg = priceMachineStep({ machine: M, part: 'p1', quantity: 10, run_hours: 2,
    second_side: { enabled: true, price_pct: 25 }, margin_chart: chart });
  assert.equal(arg.second_side_price, 120, 'call-arg price_pct beats machine default');
  assert.equal(arg.price, 600);
}
{
  // price_calc 'fixed' pins fixed_price x qty; cost still reported.
  const m = { ...M, part_overrides: [{ part_id: 'p1', price_calc: 'fixed', fixed_price: 20 }] };
  const r = priceMachineStep({ machine: m, part: 'p1', quantity: 10, run_hours: 2 });
  assert.equal(r.price_calc, 'fixed');
  assert.equal(r.price, 200, '20 x 10 fixed unit price');
  assert.equal(r.base_cost, 240, 'cost stack still computed for margin analysis');
  assert.equal(r.price_source, 'fixed_price');
}
{
  // Part override flows into cost (disposable) and audit (income account).
  const m = { ...M, part_overrides: [{ part_id: 'p1', disposable: 2, income_account: '4300' }] };
  const r = priceMachineStep({ machine: m, part: 'p1', quantity: 10, run_hours: 2 });
  assert.equal(r.cost.disposable_cost, 20, 'override disposable 2 x 10');
  assert.equal(r.base_cost, 255, '240 - 5 + 20');
  assert.equal(r.income_account, '4300', 'override income account on the step');
  assert.equal(r.override_applied, true);
}
{
  const r = priceMachineStep({ machine: { ...M, status: 'inactive' }, part: 'p1', quantity: 5, run_hours: 1 });
  assert.equal(r.priced, false, 'inactive machine step does not price');
  assert.equal(r.reason, 'inactive_machine');
  assert.equal(r.price, 0);
}
{
  const r = priceMachineStep({ machine: null, part: 'p1', quantity: 1 });
  assert.equal(r.priced, false);
  assert.equal(r.reason, 'no_machine');
}
{
  // Unpriceable margin (>=100%) propagates null price honestly.
  const r = priceMachineStep({ machine: M, part: 'p1', quantity: 1, run_hours: 1,
    margin_chart: { breaks: [{ qty: 1, margin_pct: 100 }] } });
  assert.equal(r.priced, false);
  assert.equal(r.price, null);
  assert.equal(r.reason, 'unpriceable_margin');
}
{
  // Dangling fields end-to-end: machine row carrying undeclared keys still
  // normalizes, prices, and honors every dangling knob.
  //   run 100x1 + setup 0 (billed=0 -> no time charge, no flat) + disposable 4
  //   = 104 -> markup 20% -> 124.8 -> +75% second side -> 218.4.
  const weird = {
    name: 'Frankenpress', rate: 100, setup_billed: 0, setup_hours: 0.25,
    margin_mode: 'markup', second_side_price_pct: 40, bogus_future_field: { a: 1 },
    part_overrides: [{ part: 'p1', disposable: 1, second_side_price_pct: 75 }],
    margin_chart: { margin_rows: [{ min_qty: 0, markup_pct: 20 }] },
  };
  const r = priceMachineStep({ machine: weird, part: 'p1', quantity: 4, run_hours: 1, second_side: true });
  assert.equal(r.priced, true, 'dangling fields never break the pipeline');
  assert.equal(r.cost.run_cost, 100, 'rate alias -> cost_per_hour');
  assert.equal(r.cost.setup_cost, 0, 'setup_billed=0 kills time charge; no flat');
  assert.equal(r.cost.disposable_cost, 4, 'override disposable 1 x 4');
  assert.equal(r.base_cost, 104);
  assert.equal(r.first_side_price, 124.8, 'markup mode from machine.margin_mode');
  assert.equal(r.second_side_price_pct, 75, 'part override beats machine 40');
  assert.equal(r.price, 218.4);
}

console.log('PASS machine costs (70+ asserts: normalize/aliases/clamps/profiles/idempotent, use-cost components, setup_billed, labor rate, inactive/null, weighted multiplier, margin+markup modes, bracket pick, tier_markups, mode precedence, >=100% guard, unresolved chart, chart default, overrides array/map/miss/unknown, step pipeline, second-side rules, fixed price_calc, disposable+account merge, unpriceable, dangling fields)');
