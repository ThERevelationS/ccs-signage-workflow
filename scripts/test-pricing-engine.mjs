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
  resolveMarketPrice,
  applyFormulaModifiers,
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
  // Regression: no modifiers supplied → no audit entries, base === resolved.
  assert.deepEqual(q.linePrices[0].modifiersApplied, []);
  assert.equal(q.linePrices[0].baseUnitPrice, q.linePrices[0].unitPrice);
  assert.equal(q.linePrices[0].pricingMode, 'markup', 'default pricing_mode stays markup');
  assert.equal(q.linePrices[0].market, null);
}

// --- Market-based pricing -----------------------------------------------------
{
  const marketRow = row({ id: 'mkt', category: 'banners', pricing_mode: 'market', market_retail: 100, market_discount_pct: 20, markup_pct: 500 });

  // retail 100 less 20% = 80 — markup_pct is ignored on a market row.
  const priced = resolveEffectivePrice({ category: 'banners', qty: 2, unitCost: 10, matrices: [marketRow], now: NOW });
  assert.equal(priced.pricingMode, 'market');
  assert.equal(priced.source, 'market');
  assert.equal(priced.unitPrice, 80);
  assert.equal(priced.extended, 160);
  assert.equal(priced.market.marketRetail, 100);
  assert.equal(priced.market.marketDiscountPct, 20);

  // A qualifying break only wins when it undercuts the market price.
  const cheapBreak = row({ id: 'cb', category: 'banners', pricing_mode: 'market', market_retail: 100, market_discount_pct: 20, per_unit_breaks: [{ qty: 5, unit_price: 70 }] });
  const broke = resolveEffectivePrice({ category: 'banners', qty: 5, unitCost: 10, matrices: [cheapBreak], now: NOW });
  assert.equal(broke.source, 'qty_break', 'break below market wins');
  assert.equal(broke.unitPrice, 70);
  assert.equal(broke.breakApplied.qty, 5);
  const priceyBreak = row({ id: 'pb', category: 'banners', pricing_mode: 'market', market_retail: 100, market_discount_pct: 20, per_unit_breaks: [{ qty: 5, unit_price: 90 }] });
  const held = resolveEffectivePrice({ category: 'banners', qty: 5, unitCost: 10, matrices: [priceyBreak], now: NOW });
  assert.equal(held.source, 'market', 'break above market loses');
  assert.equal(held.unitPrice, 80);
  assert.equal(held.breakApplied, null);

  // minimum_charge still floors the extension.
  const floored = resolveEffectivePrice({ category: 'banners', qty: 1, unitCost: 10, matrices: [row({ id: 'mm', category: 'banners', pricing_mode: 'market', market_retail: 20, minimum_charge: 25 })], now: NOW });
  assert.equal(floored.source, 'market');
  assert.equal(floored.unitPrice, 20);
  assert.equal(floored.extended, 25);
  assert.equal(floored.minimumApplied, true);

  // Market row without market_retail falls back to the markup path.
  const noRetail = row({ id: 'nr', category: 'banners', pricing_mode: 'market', markup_pct: 50 });
  const back = resolveEffectivePrice({ category: 'banners', qty: 2, unitCost: 10, matrices: [noRetail], now: NOW });
  assert.equal(back.source, 'matrix_markup');
  assert.equal(back.unitPrice, 15);
  // …and an explicit marketRetail arg still routes it through market mode.
  const argd = resolveEffectivePrice({ category: 'banners', qty: 2, unitCost: 10, matrices: [noRetail], marketRetail: 50, marketDiscountPct: 10, now: NOW });
  assert.equal(argd.source, 'market');
  assert.equal(argd.unitPrice, 45, '50 x 0.90');

  // Direct helper: standalone resolveMarketPrice honors row + overrides.
  const direct = resolveMarketPrice({ matrixRow: marketRow, qty: 3 });
  assert.equal(direct.unitPrice, 80);
  assert.equal(direct.source, 'market');
  const override = resolveMarketPrice({ matrixRow: marketRow, marketRetail: 200, marketDiscountPct: 50, qty: 1 });
  assert.equal(override.unitPrice, 100);
  const noRow = resolveMarketPrice({ matrixRow: null, marketRetail: 40, qty: 2 });
  assert.equal(noRow.unitPrice, 40);
  assert.equal(noRow.minimumApplied, false);

  // pricing_mode 'markup' (or absent) ignores market fields entirely.
  const markupRow = row({ id: 'mk', category: 'banners', markup_pct: 50, market_retail: 999, market_discount_pct: 90 });
  const mk = resolveEffectivePrice({ category: 'banners', qty: 1, unitCost: 10, matrices: [markupRow], now: NOW });
  assert.equal(mk.pricingMode, 'markup');
  assert.equal(mk.source, 'matrix_markup');
  assert.equal(mk.unitPrice, 15);
}

// --- Formula modifiers ----------------------------------------------------------
{
  // Each type, applied left-to-right.
  let r = applyFormulaModifiers(100, [{ type: 'add_pct', value: 10 }]);
  assert.equal(r.unitPrice, 110);
  r = applyFormulaModifiers(100, [{ type: 'mul', value: 0.5 }]);
  assert.equal(r.unitPrice, 50);
  r = applyFormulaModifiers(100, [{ type: 'add_flat', value: 7.25 }]);
  assert.equal(r.unitPrice, 107.25);
  r = applyFormulaModifiers(100, [{ type: 'min', value: 120 }]);
  assert.equal(r.unitPrice, 120, 'min floors upward');
  r = applyFormulaModifiers(100, [{ type: 'max', value: 80 }]);
  assert.equal(r.unitPrice, 80, 'max caps downward');

  // Ordered chain: 100 → +10% → 110 → x0.5 → 55 → +5 → 60 → min 70 → 70 → max 65 → 65.
  r = applyFormulaModifiers(100, [
    { type: 'add_pct', value: 10 },
    { type: 'mul', value: 0.5 },
    { type: 'add_flat', value: 5 },
    { type: 'min', value: 70 },
    { type: 'max', value: 65 },
  ]);
  assert.equal(r.unitPrice, 65);
  assert.equal(r.applied.length, 5);
  assert.equal(r.applied[2].before, 55);
  assert.equal(r.applied[2].after, 60);

  // Invalid entries skip; modifiers never push below zero.
  r = applyFormulaModifiers(50, [{ type: 'bogus', value: 5 }, { value: 5 }, { type: 'add_flat' }, { type: 'add_flat', value: -80 }]);
  assert.equal(r.unitPrice, 0, 'clamped at zero');
  assert.equal(r.applied.length, 1);
  r = applyFormulaModifiers(42, null);
  assert.equal(r.unitPrice, 42);
  assert.deepEqual(r.applied, []);

  // Row-level formula_modifiers adjust the resolved unit price before extension.
  const modRow = row({ id: 'fm', category: 'banners', markup_pct: 50, formula_modifiers: [{ type: 'add_pct', value: 10 }, { type: 'min', value: 17 }] });
  const line = resolveEffectivePrice({ category: 'banners', qty: 2, unitCost: 10, matrices: [modRow], now: NOW });
  // cost 10 x 1.50 = 15 → +10% = 16.5 → min 17 = 17 → x2 = 34
  assert.equal(line.baseUnitPrice, 15);
  assert.equal(line.unitPrice, 17);
  assert.equal(line.extended, 34);
  assert.equal(line.modifiersApplied.length, 2);
  assert.equal(line.modifiersApplied[0].type, 'add_pct');
  // …and modifiers stack on market-mode prices too.
  const modMarket = row({ id: 'fmm', category: 'banners', pricing_mode: 'market', market_retail: 100, market_discount_pct: 20, formula_modifiers: [{ type: 'add_flat', value: -30 }] });
  const mline = resolveEffectivePrice({ category: 'banners', qty: 1, unitCost: 10, matrices: [modMarket], now: NOW });
  assert.equal(mline.baseUnitPrice, 80);
  assert.equal(mline.unitPrice, 50);
  assert.equal(mline.extended, 50);
  // …and on qty-break prices (they resolve, then modify).
  const modBreak = row({ id: 'fmb', category: 'banners', markup_pct: 50, per_unit_breaks: [{ qty: 10, unit_price: 9 }], formula_modifiers: [{ type: 'mul', value: 0.9 }] });
  const bline = resolveEffectivePrice({ category: 'banners', qty: 12, unitCost: 4, matrices: [modBreak], now: NOW });
  assert.equal(bline.source, 'qty_break');
  assert.equal(bline.unitPrice, 8.1, '9 x 0.9');
  assert.equal(bline.extended, 97.2);
}

// --- priceQuote-level modifiers -------------------------------------------------
{
  const matrices = [
    row({ id: 'both', name: 'Retail/Banners', category: 'banners', customer_tier: 'Retail', markup_pct: 40 }),
  ];
  const q = priceQuote({
    lines: [
      { label: 'Banner', category: 'banners', qty: 1, unitCost: 20 },  // 28 → +10% = 30.8
      { label: 'Misc', category: 'other', qty: 2, unitCost: 5 },       // default 50% → 7.5 → +10% = 8.25 x2 = 16.5
    ],
    customerTier: 'Retail',
    matrices,
    defaultMarkupPct: 50,
    modifiers: [{ type: 'add_pct', value: 10 }],
    now: NOW,
  });
  assert.equal(q.linePrices[0].unitPrice, 30.8);
  assert.equal(q.linePrices[0].baseUnitPrice, 28);
  assert.equal(q.linePrices[0].modifiersApplied.length, 1);
  assert.equal(q.linePrices[1].unitPrice, 8.25);
  assert.equal(q.linesSubtotal, 47.3, '30.8 + 16.5');
  assert.equal(q.total, 47.3);

  // Quote-level modifiers append AFTER row-level formula_modifiers.
  const stacked = priceQuote({
    lines: [{ label: 'X', category: 'banners', qty: 1, unitCost: 10 }],
    matrices: [row({ id: 's', category: 'banners', markup_pct: 0, formula_modifiers: [{ type: 'add_flat', value: 10 }] })],
    modifiers: [{ type: 'mul', value: 2 }],
    now: NOW,
  });
  // 10 → row +10 flat = 20 → quote x2 = 40
  assert.equal(stacked.linePrices[0].unitPrice, 40);
  assert.equal(stacked.linePrices[0].modifiersApplied.length, 2);
  assert.equal(stacked.linePrices[0].modifiersApplied[0].type, 'add_flat');
  assert.equal(stacked.linePrices[0].modifiersApplied[1].type, 'mul');
}

// --- Unchanged-behavior regressions ----------------------------------------------
{
  // Market fields on a markup row change nothing.
  const plain = row({ id: 'p', category: 'decals', markup_pct: 10, minimum_charge: 25 });
  const a = resolveEffectivePrice({ category: 'decals', qty: 1, unitCost: 10, matrices: [plain], now: NOW });
  assert.equal(a.unitPrice, 11);
  assert.equal(a.extended, 25);
  assert.equal(a.source, 'matrix_markup');
  // An empty modifiers array is a no-op.
  const b = resolveEffectivePrice({ category: 'decals', qty: 1, unitCost: 10, matrices: [plain], modifiers: [], now: NOW });
  assert.equal(b.unitPrice, a.unitPrice);
  assert.equal(b.extended, a.extended);
  assert.deepEqual(b.modifiersApplied, []);
  // resolveMatrixRow matching is untouched by the new row fields.
  const marketDefault = row({ id: 'md', customer_tier: 'Retail', pricing_mode: 'market', market_retail: 50 });
  const win = resolveMatrixRow({ category: 'anything', customerTier: 'Retail', matrices: [marketDefault], now: NOW });
  assert.equal(win.row.id, 'md', 'market row still matches on tier');
}

rmSync(out);
console.log('PASS pricing-engine');