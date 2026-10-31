import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pricing-engine.mjs');

// The engine is a pure model (no imports), but stub '@/...' anyway so the test
// keeps working if a helper import is ever added.
const stubAtImports = {
  name: 'stub-at-imports',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({ path: args.path, namespace: 'stub-at' }));
    build.onLoad({ filter: /.*/, namespace: 'stub-at' }, () => ({ contents: 'export default {};' }));
  },
};

await build({
  entryPoints: [resolve(here, '../src/components/pricing/pricingEngine.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  plugins: [stubAtImports],
});

const {
  resolveMatrixRow,
  resolveEffectivePrice,
  pickUnitBreak,
  rowIsEffective,
  computeLaborCost,
  resolveLaborLevel,
  computeMachineCost,
  resolveMachineRate,
  priceQuote,
  MATRIX_MATCH,
} = await import(pathToFileURL(out).href);

const NOW = new Date('2026-11-10T12:00:00Z');
const row = (over = {}) => ({ id: 'r', status: 'active', markup_pct: 50, minimum_charge: 0, ...over });

// --- Most-specific-match precedence -------------------------------------------
{
  const matrices = [
    row({ id: 'default', name: 'default', markup_pct: 10 }),                              // blank/blank
    row({ id: 'tierOnly', name: 'tier', customer_tier: 'Retail', markup_pct: 20 }),       // tier only
    row({ id: 'catOnly', name: 'cat', category: 'banners', markup_pct: 30 }),             // category only
    row({ id: 'both', name: 'both', category: 'banners', customer_tier: 'Retail', markup_pct: 40 }), // both
  ];
  const win = resolveMatrixRow({ category: 'banners', customerTier: 'Retail', matrices, now: NOW });
  assert.equal(win.row.id, 'both', 'category+tier beats everything');
  assert.equal(win.specificity, MATRIX_MATCH.CATEGORY_AND_TIER);

  const catWin = resolveMatrixRow({ category: 'banners', customerTier: 'Wholesale', matrices, now: NOW });
  assert.equal(catWin.row.id, 'catOnly', 'category-only beats tier-only');

  const tierWin = resolveMatrixRow({ category: 'channel_letters', customerTier: 'Retail', matrices, now: NOW });
  assert.equal(tierWin.row.id, 'tierOnly', 'tier-only beats blank default');

  const defWin = resolveMatrixRow({ category: 'channel_letters', customerTier: 'Wholesale', matrices, now: NOW });
  assert.equal(defWin.row.id, 'default', 'blank/blank default row catches the rest');
  assert.equal(defWin.specificity, MATRIX_MATCH.DEFAULT_ROW);

  // Tier matching also honors tier_number / record objects.
  const byNum = resolveMatrixRow({ category: 'x', customerTier: { tier_name: 'Retail', tier_number: 1 }, matrices: [row({ id: 't', customer_tier: '1' })], now: NOW });
  assert.equal(byNum.row.id, 't', 'tier_number matches row customer_tier');

  // Inactive rows never compete.
  const inact = resolveMatrixRow({ category: 'banners', customerTier: 'Retail', matrices: [row({ id: 'off', category: 'banners', customer_tier: 'Retail', status: 'inactive' })], now: NOW });
  assert.equal(inact, null, 'inactive row skipped');
}

// --- Effective-date windows ----------------------------------------------------
{
  const dated = row({ id: 'dated', category: 'banners', markup_pct: 99, effective_from: '2026-11-01', effective_to: '2026-11-30' });
  const undated = row({ id: 'undated', category: 'banners', markup_pct: 11 });
  assert.equal(resolveMatrixRow({ category: 'banners', matrices: [dated, undated], now: NOW }).row.id, 'dated', 'inside window');
  assert.equal(resolveMatrixRow({ category: 'banners', matrices: [dated, undated], now: new Date('2026-10-01T00:00:00Z') }).row.id, 'undated', 'before window falls back');
  assert.equal(resolveMatrixRow({ category: 'banners', matrices: [dated, undated], now: new Date('2026-12-01T00:00:00Z') }).row.id, 'undated', 'after window falls back');
  assert.equal(rowIsEffective(row({ effective_to: '2026-11-10' }), new Date('2026-11-10T18:00:00Z')), true, 'date-only effective_to is end-of-day inclusive');
  assert.equal(rowIsEffective(row({ effective_from: '2026-11-11' }), NOW), false);

  // Same specificity: the most recently effective row wins.
  const older = row({ id: 'older', category: 'banners', markup_pct: 1, effective_from: '2026-01-01' });
  const newer = row({ id: 'newer', category: 'banners', markup_pct: 2, effective_from: '2026-06-01' });
  assert.equal(resolveMatrixRow({ category: 'banners', matrices: [older, newer], now: NOW }).row.id, 'newer', 'later effective_from breaks the tie');
}

// --- Qty breaks -----------------------------------------------------------------
{
  assert.equal(pickUnitBreak([{ qty: 10, unit_price: 5 }, { qty: 25, unit_price: 4 }], 30).unit_price, 4, 'highest qualifying bracket');
  assert.equal(pickUnitBreak([{ qty: 10, unit_price: 5 }, { qty: 25, unit_price: 4 }], 15).unit_price, 5);
  assert.equal(pickUnitBreak([{ qty: 10, unit_price: 5 }], 5), null, 'below all brackets');
  const matrix = [row({ id: 'm', category: 'banners', markup_pct: 50, per_unit_breaks: [{ qty: 10, unit_price: 4.25 }] })];
  const priced = resolveEffectivePrice({ category: 'banners', qty: 12, unitCost: 3, matrices: matrix, now: NOW });
  assert.equal(priced.source, 'qty_break');
  assert.equal(priced.unitPrice, 4.25);
  assert.equal(priced.extended, 51, '12 x 4.25');
  const under = resolveEffectivePrice({ category: 'banners', qty: 3, unitCost: 10, matrices: matrix, now: NOW });
  assert.equal(under.source, 'matrix_markup');
  assert.equal(under.unitPrice, 15, '10 x 1.50');
  assert.equal(under.extended, 45);
}

// --- Minimum charge -------------------------------------------------------------
{
  const matrix = [row({ id: 'm', category: 'decals', markup_pct: 10, minimum_charge: 25 })];
  const floored = resolveEffectivePrice({ category: 'decals', qty: 1, unitCost: 10, matrices: matrix, now: NOW });
  assert.equal(floored.computedExtended, 11);
  assert.equal(floored.extended, 25, 'floor lifts the extension');
  assert.equal(floored.minimumApplied, true);
  const above = resolveEffectivePrice({ category: 'decals', qty: 5, unitCost: 10, matrices: matrix, now: NOW });
  assert.equal(above.extended, 55, 'above minimum untouched');
  assert.equal(above.minimumApplied, false);
  const zeroQty = resolveEffectivePrice({ category: 'decals', qty: 0, unitCost: 10, matrices: matrix, now: NOW });
  assert.equal(zeroQty.extended, 0, 'minimum never fires on an empty line');
}

// --- Default markup fallback -----------------------------------------------------
{
  const priced = resolveEffectivePrice({ category: 'nope', qty: 2, unitCost: 10, matrices: [], defaultMarkupPct: 25, now: NOW });
  assert.equal(priced.source, 'default_markup');
  assert.equal(priced.unitPrice, 12.5);
  assert.equal(priced.extended, 25);
}

// --- Labor cost ------------------------------------------------------------------
{
  const levels = [
    { id: 'l1', name: 'Apprentice', level_rank: 1, hourly_rate: 35, status: 'active' },
    { id: 'l2', name: 'Journeyman', level_rank: 2, hourly_rate: 55, status: 'active' },
    { id: 'l3', name: 'Retired', level_rank: 3, hourly_rate: 999, status: 'inactive' },
  ];
  assert.equal(resolveLaborLevel('Journeyman', levels).id, 'l2');
  assert.equal(resolveLaborLevel({ level_rank: 1 }, levels).id, 'l1', 'rank lookup');
  assert.equal(resolveLaborLevel('Retired', levels), null, 'inactive level unresolved');
  const labor = computeLaborCost({ hours: 3.5, laborLevel: 'Journeyman', laborLevels: levels });
  assert.equal(labor.rate, 55);
  assert.equal(labor.cost, 192.5, '3.5 x 55');
  const none = computeLaborCost({ hours: 5, laborLevel: 'Ghost', laborLevels: levels });
  assert.equal(none.cost, 0);
  assert.equal(none.levelFound, false);
}

// --- Machine cost ----------------------------------------------------------------
{
  const rates = [
    { id: 'm1', name: 'Plotter A', machine_type: 'vinyl', setup_minutes: 30, runtime_rate_per_hour: 40, maintenance_rate_per_hour: 5, material_waste_pct: 10, status: 'active' },
    { id: 'm2', name: 'Router', machine_type: 'cnc', setup_minutes: 15, runtime_rate_per_hour: 90, maintenance_rate_per_hour: 0, material_waste_pct: 0, status: 'active' },
  ];
  assert.equal(resolveMachineRate({ machineType: 'cnc', machineRates: rates }).id, 'm2');
  assert.equal(resolveMachineRate({ machineType: 'vinyl', machineRate: 'Router', machineRates: rates }).id, 'm2', 'explicit name pins a row over type');
  const mc = computeMachineCost({ machineHours: 2, machineType: 'vinyl', machineRates: rates, materialCost: 200 });
  // setup 0.5h x 40 = 20; runtime 2h x 40 = 80; maintenance 2h x 5 = 10; waste 200 x 10% = 20
  assert.equal(mc.setupCost, 20);
  assert.equal(mc.runtimeCost, 80);
  assert.equal(mc.maintenanceCost, 10);
  assert.equal(mc.wasteCost, 20);
  assert.equal(mc.total, 130);
  const none = computeMachineCost({ machineHours: 2, machineType: 'laser', machineRates: rates });
  assert.equal(none.total, 0, 'no matching machine → no cost');
}

// --- priceQuote end-to-end --------------------------------------------------------
{
  const matrices = [
    row({ id: 'both', name: 'Retail/Banners', category: 'banners', customer_tier: 'Retail', markup_pct: 40, minimum_charge: 30 }),
    row({ id: 'cat', name: 'Decals', category: 'decals', markup_pct: 100, per_unit_breaks: [{ qty: 10, unit_price: 9 }] }),
  ];
  const levels = [{ id: 'l2', name: 'Journeyman', level_rank: 2, hourly_rate: 55, status: 'active' }];
  const rates = [{ id: 'm1', name: 'Plotter A', machine_type: 'vinyl', setup_minutes: 30, runtime_rate_per_hour: 40, maintenance_rate_per_hour: 5, material_waste_pct: 10, status: 'active' }];

  const q = priceQuote({
    lines: [
      { label: 'Banner', category: 'banners', qty: 1, unitCost: 20 },   // 20 x 1.40 = 28 → floor 30
      { label: 'Decals', category: 'decals', qty: 12, unitCost: 4 },    // qty break 12 x 9 = 108
      { label: 'Misc', category: 'other', qty: 2, unitCost: 5 },        // no match → default 50% = 15
    ],
    customerTier: 'Retail',
    laborHours: 2, laborLevel: 'Journeyman',
    machineHours: 2, machineType: 'vinyl', materialCost: 200,
    matrices, laborLevels: levels, machineRates: rates,
    defaultMarkupPct: 50, now: NOW,
  });

  assert.equal(q.linePrices.length, 3);
  assert.equal(q.linePrices[0].extended, 30, 'minimum charge applied');
  assert.equal(q.linePrices[0].minimumApplied, true);
  assert.equal(q.linePrices[1].extended, 108);
  assert.equal(q.linePrices[1].source, 'qty_break');
  assert.equal(q.linePrices[2].extended, 15);
  assert.equal(q.linePrices[2].source, 'default_markup');
  assert.equal(q.linesSubtotal, 153, '30 + 108 + 15');
  assert.equal(q.laborCost.cost, 110, '2 x 55');
  assert.equal(q.machineCost.total, 130, 'same machine math as above');
  assert.equal(q.minimumsApplied.length, 1);
  assert.equal(q.minimumsApplied[0].index, 0);
  assert.equal(q.subtotal, 393, '153 + 110 + 130');
  assert.equal(q.total, 393);
}

rmSync(out);
console.log('PASS pricing-engine');
