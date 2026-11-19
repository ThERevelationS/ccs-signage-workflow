// O-010 (CMP-A10) model verification — totals reconciliation, cost-category
// partition, snapshot semantics, override-vs-tier-vs-engine precedence, float
// tolerance, and downstream snapshot consumption.
//
// Bundles the CANDIDATE builderService.js plus REAL remote-source modules
// (customerPricing → foundationSellPricing → foundationPricingWire →
// pricingEngine/pricingTemplateModel, useSectionSync, aioPricing,
// customerQuote, workOrderConversion, savedCustomerPricing, markupEngine,
// projectCategorizer, foundationCalc chain) with @/ + stub-only imports
// aliased. No network, no entities.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const F = (p) => resolve(here, 'fixture/src/components', p);
const S = (p) => resolve(here, 'fixture/base44', p);
const stub = (n) => resolve(here, 'fixture/stubs', n);

const alias = {
  '@/api/base44Client': stub('base44Client.mjs'),
  '@/components/staff/staffEntities': stub('staffEntities.mjs'),
  '@/components/estimator/loadAllEntityRows': stub('loadAllEntityRows.mjs'),
  '@/components/estimator/estimateMutationGuard': stub('mutationGuard.mjs'),
  '@/components/estimator/estimatePersistence': stub('estimatePersistence.mjs'),
  '@/components/estimator/moduleRegistry': F('estimator/moduleRegistry.js'),
  '@/components/workflow/NotificationService': stub('notificationService.mjs'),
};

// Relative-path stubs (esbuild alias only matches bare specifiers).
const relStubs = [
  [/^\.\/partSync$/, stub('partSync.mjs')],
  [/^\.\/builderMutationRecovery$/, stub('builderRecovery.mjs')],
  [/^\.\/builderEntityPersistence$/, stub('builderEntityPersistence.mjs')],
  [/^\.\/builderProductPersistence$/, stub('builderProductPersistence.mjs')],
  [/^\.\/(channel|vinyl|brick|cnc|metal|laser|paint|customItems|maintenance)\/.*/, stub('moduleWires.mjs')],
  [/^\.\.\/workflow\/workOrderPersistence$/, stub('workOrderPersistence.mjs')],
  [/^\.\/depositGate$/, stub('depositGate.mjs')],
];
const relPlugin = {
  name: 'rel-stubs',
  setup(b) {
    for (const [filter, target] of relStubs) {
      b.onResolve({ filter }, () => ({ path: target }));
    }
  },
};

const bundle = (entry, out) => build({
  entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: resolve(here, out),
  logLevel: 'silent', alias, plugins: [relPlugin], loader: { '.js': 'jsx', '.jsx': 'jsx' },
  jsx: 'automatic', define: { 'import.meta.env': '{}' },
});

await bundle('fixture/src/components/estimator/builder/builderService.js', '.tmp-builderService-candidate.mjs');
await bundle('fixture/src/components/estimator/builder/builderService-baseline.js', '.tmp-builderService-baseline.mjs');
await bundle('fixture/src/components/estimator/customerPricing.js', '.tmp-customerPricing.mjs');
await bundle('fixture/src/components/estimator/useSectionSync.js', '.tmp-useSectionSync.mjs');
await bundle('fixture/src/components/estimator/workOrderConversion.js', '.tmp-workOrderConversion.mjs');
await bundle('fixture/src/components/estimator/aioPricing.js', '.tmp-aioPricing.mjs');
await bundle('fixture/src/components/estimator/customerQuote.js', '.tmp-customerQuote.mjs');
await bundle('fixture/src/components/markup/savedCustomerPricing.js', '.tmp-savedCustomerPricing.mjs');
await bundle('fixture/src/components/markup/projectCategorizer.jsx', '.tmp-projectCategorizer.mjs');
await bundle('fixture/src/components/markup/markupEngine.jsx', '.tmp-markupEngine.mjs');
await bundle('fixture/src/components/estimator/foundation/foundationCalc.js', '.tmp-foundationCalc.mjs');
await bundle('fixture/src/components/estimator/foundation/foundationSellPricing.js', '.tmp-foundationSellPricing.mjs');

const imp = (f) => import(pathToFileURL(resolve(here, f)).href);
const bs = await imp('.tmp-builderService-candidate.mjs');
const bsBase = await imp('.tmp-builderService-baseline.mjs');
const cp = await imp('.tmp-customerPricing.mjs');
const ss = await imp('.tmp-useSectionSync.mjs');
const wo = await imp('.tmp-workOrderConversion.mjs');
const aio = await imp('.tmp-aioPricing.mjs');
const cq = await imp('.tmp-customerQuote.mjs');
const scp = await imp('.tmp-savedCustomerPricing.mjs');
const cat = await imp('.tmp-projectCategorizer.mjs');
const me = await imp('.tmp-markupEngine.mjs');
const fc = await imp('.tmp-foundationCalc.mjs');
const fsp = await imp('.tmp-foundationSellPricing.mjs');
const clientStub = await import(pathToFileURL(stub('base44Client.mjs')).href);

const { foundationRecordSavedTotal, FOUNDATION_RECORD_TOTAL_FIELDS, sourceProjectTotal } = bs;
const { sourceProjectEconomics, acceptedCustomerUnitPrice, liveCustomerUnitPrice, acceptedInternalEstimateCost } = cp;
const { computePricing } = aio;
const { buildCustomerQuoteRows } = cq;
const { categorizeFoundationProject } = cat;
const { applyMarkups } = me;
const { calcProject } = fc;
const { foundationHasEnginePricing } = fsp;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

const report = { cases: [], generated: new Date().toISOString() };
const ok = (name, fn) => {
  try { const r = fn(); const done = r instanceof Promise ? r : Promise.resolve(r);
    return done.then(() => { report.cases.push({ name, ok: true }); console.log('ok  -', name); })
      .catch((e) => { report.cases.push({ name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.message || e).slice(0, 400)); });
  } catch (e) { report.cases.push({ name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.message || e).slice(0, 400)); return Promise.resolve(); }
};

// ---------------- synthetic persisted-payload record ----------------
// The exact field shape FoundationEstimator.payload() persists on save:
// 12 split-total fields + calc.walls carrying calculatedCosts.
const PERSISTED = {
  total_concrete_cost: 96, total_rebar_cost: 44, total_excavation_cost: 30,
  total_forming_materials_cost: 20, total_labor_cost: 40, total_wall_cost: 120,
  total_pole_cost: 120, total_pole_painting_cost: 35, total_equipment_cost: 50,
  total_wall_cap_cost: 10, total_signage_cabinet_cost: 100, total_landscape_cost: 0.75,
  walls: [{ name: 'W1', calculatedCosts: { materialCost: 80, mortarCost: 10, laborCost: 30 } }],
};
const SECTION_TOTAL = FOUNDATION_RECORD_TOTAL_FIELDS.reduce((s, k) => s + PERSISTED[k], 0); // 665.75

// ================= A. foundationRecordSavedTotal =================
await ok('savedTotal: null/empty/never-priced records -> null (no indicator)', () => {
  assert.equal(foundationRecordSavedTotal(null), null);
  assert.equal(foundationRecordSavedTotal(undefined), null);
  assert.equal(foundationRecordSavedTotal('string'), null);
  assert.equal(foundationRecordSavedTotal({}), null, 'empty record has no persisted totals');
  assert.equal(foundationRecordSavedTotal({ project_name: 'x', items: [] }), null);
});

await ok('savedTotal: 12-field persisted record -> split-field sum', () => {
  assert.equal(foundationRecordSavedTotal(PERSISTED), SECTION_TOTAL);
});

await ok('savedTotal: partial fields present -> sum (absent treated as $0)', () => {
  assert.equal(foundationRecordSavedTotal({ total_wall_cost: 50 }), 50);
  assert.equal(foundationRecordSavedTotal({ total_concrete_cost: '10.5', total_rebar_cost: '2' }), 12.5, 'numeric strings coerce');
});

await ok('savedTotal: grand_total direct field wins when present (sourceProjectTotal parity)', () => {
  assert.equal(foundationRecordSavedTotal({ grand_total: 42, ...PERSISTED }), 42);
});

await ok('savedTotal: excludes wall subsets (brick+fill never double-counted)', () => {
  const list = FOUNDATION_RECORD_TOTAL_FIELDS;
  assert.ok(!list.includes('total_brick_cost') && !list.includes('total_fill_cost'), 'subset fields excluded');
  const withSubsets = { ...PERSISTED, total_brick_cost: 70, total_fill_cost: 20 };
  assert.equal(foundationRecordSavedTotal(withSubsets), SECTION_TOTAL, 'brick/fill fields do not change the sum');
});

// ================= B. sourceProjectTotal parity =================
await ok('sourceProjectTotal: candidate == baseline on all foundation shapes', () => {
  const line = { module_key: 'foundation' };
  for (const rec of [PERSISTED, {}, { grand_total: 42 }, { total_concrete_cost: '10.5' }, null]) {
    assert.equal(sourceProjectTotal(line, rec), bsBase.sourceProjectTotal(line, rec), JSON.stringify(rec));
  }
});

await ok('sourceProjectTotal: null record falls back to line snapshots (live > frozen)', () => {
  assert.equal(sourceProjectTotal({ module_key: 'foundation', live_total_snapshot: 300, total_snapshot: 200 }, null), 300);
  assert.equal(sourceProjectTotal({ module_key: 'foundation', total_snapshot: 200 }, null), 200);
});

// ================= C. section-total partition on the REAL calc =================
await ok('calcProject: 12-field persisted sum == grand_total + cabinets + landscape', () => {
  const project = {
    id: 'p-o010', updated_date: 'v1', project_name: 'O-010', excavation_method: 'hand_dig',
    items: [{
      component_id: 'item-1', description: 'ID Sign Footing', foundation_type: 'spread_foot',
      quantity: 1, length_inches: 48, width_inches: 24, depth_inches: 24,
      selected_concrete_id: 'bag1', concrete_bags: 12, concrete_cost: 96,
      include_rebar: false, include_forming: false,
      excavation_method: 'hand_dig', item_total_cost: 96,
    }],
    walls: [], poles: [], wall_caps: [], selected_equipment: [],
    signage_cabinets: [{ id: 'cab_1', description: 'Main', quantity: 2, unit_cost: 150 }],
    landscape: { cell_size_inches: 12, cells: { a1: 'grass' } },
    total_signage_cabinet_cost: 300, total_landscape_cost: 0.75,
  };
  const inv = [{ id: 'bag1', material_name: '80lb Concrete Bag', material_type: 'bagged_concrete', cost_per_unit: 8 }];
  const calc = calcProject(project, inv, {}, { savedProject: project });
  const t = calc.totals;
  const sectionTotal = t.grand_total + t.total_signage_cabinet_cost + t.total_landscape_cost;
  // Persist-payload shape mirrors FoundationEstimator.payload(): the 12 fields.
  const record = {
    total_concrete_cost: t.total_concrete_cost, total_rebar_cost: t.total_rebar_cost,
    total_excavation_cost: t.total_excavation_cost, total_forming_materials_cost: t.total_forming_materials_cost,
    total_labor_cost: t.total_labor_cost, total_wall_cost: t.total_wall_cost,
    total_pole_cost: t.total_pole_cost, total_pole_painting_cost: t.total_pole_painting_cost,
    total_equipment_cost: t.total_equipment_cost, total_wall_cap_cost: t.total_wall_cap_cost,
    total_signage_cabinet_cost: t.total_signage_cabinet_cost, total_landscape_cost: t.total_landscape_cost,
  };
  assert.ok(Number.isFinite(sectionTotal), 'fixture project fully priced');
  assert.ok(Math.abs(foundationRecordSavedTotal(record) - sectionTotal) <= EPS,
    `record sum ${foundationRecordSavedTotal(record)} == sectionTotal ${sectionTotal}`);
  assert.ok(Math.abs(t.grand_total - (sectionTotal - t.total_signage_cabinet_cost - t.total_landscape_cost)) < 1e-9);
});

// ================= D. cost-category partition =================
await ok('categorizeFoundationProject: line sum == section total (single partition, no double count)', () => {
  const lines = categorizeFoundationProject(PERSISTED);
  const sum = lines.reduce((s, l) => s + num(l.cost), 0);
  assert.ok(Math.abs(sum - SECTION_TOTAL) <= EPS, `${sum} == ${SECTION_TOTAL}`);
  // Wall decomposition equals total_wall_cost exactly (brick+fill are subsets,
  // never summed alongside total_wall_cost).
  const wall = lines.filter(l => /Brick \/ Wall|Masonry Labor/i.test(l.label));
  const wallSum = wall.reduce((s, l) => s + num(l.cost), 0);
  assert.ok(Math.abs(wallSum - PERSISTED.total_wall_cost) <= EPS, `wall lines ${wallSum} == total_wall_cost ${PERSISTED.total_wall_cost}`);
});

// ================= E. precedence: engine > tier > override > markup =================
await ok('precedence: bare record -> baseline = cost', () => {
  const r = sourceProjectEconomics('foundation', {}, 1000);
  assert.equal(r.internalCost, 1000); assert.equal(r.customerPrice, 1000);
  assert.equal(r.pricing_engine, undefined);
});
await ok('precedence: markup only -> cost x (1+markup%)', () => {
  const r = sourceProjectEconomics('foundation', { customer_markup_percent: 25 }, 1000);
  assert.equal(r.customerPrice, 1250); assert.equal(r.internalCost, 1000);
});
await ok('precedence: override only -> override wins over markup-less baseline', () => {
  const r = sourceProjectEconomics('foundation', { customer_price_override: 5000 }, 1000);
  assert.equal(r.customerPrice, 5000);
});
await ok('precedence: override + markup -> override wins', () => {
  const r = sourceProjectEconomics('foundation', { customer_markup_percent: 25, customer_price_override: 5000 }, 1000);
  assert.equal(r.customerPrice, 5000, 'explicit override beats marked-up cost');
});
await ok('precedence: override = 0 falls back to markup', () => {
  const r = sourceProjectEconomics('foundation', { customer_markup_percent: 25, customer_price_override: 0 }, 1000);
  assert.equal(r.customerPrice, 1250);
});
await ok('precedence: applied tier snapshot beats override + markup (internal cost untouched)', () => {
  const r = sourceProjectEconomics('foundation', {
    customer_markup_percent: 25, customer_price_override: 5000,
    customer_pricing: { applied: true, tier_number: 2, total: 9999 },
  }, 1000);
  assert.equal(r.customerPrice, 9999); assert.equal(r.internalCost, 1000);
});
await ok('precedence: applied:true without a numeric total falls back to manual baseline', () => {
  const r = sourceProjectEconomics('foundation', { customer_pricing: { applied: true, tier_number: 2 } }, 1000);
  assert.equal(r.customerPrice, 1000);
});
await ok('precedence: applied:false tier -> manual baseline', () => {
  const r = sourceProjectEconomics('foundation', {
    customer_markup_percent: 10, customer_pricing: { applied: false, tier_number: 2, total: 9999 },
  }, 1000);
  assert.equal(r.customerPrice, 1100);
});

const ENGINE_RECORD = { total_concrete_cost: 100, total_rebar_cost: 50, pricing_engine: { default_markup_pct: 50 } };
await ok('precedence: engine context block -> engine owns sell side over manual baseline', () => {
  const r = sourceProjectEconomics('foundation', ENGINE_RECORD, 150);
  assert.ok(r.pricing_engine, 'engine resolution attached');
  assert.equal(r.internalCost, 150);
  // remainder = baseline(150) - lines*1.0 = 0; engine lines at 50% = 225.
  assert.equal(r.customerPrice, 225);
});
await ok('precedence: engine beats applied tier snapshot AND override', () => {
  const r = sourceProjectEconomics('foundation', {
    ...ENGINE_RECORD,
    customer_price_override: 500,
    customer_pricing: { applied: true, tier_number: 1, total: 999 },
  }, 150);
  // remainder rides the override: (500-150) + engine lines 225 = 575.
  assert.equal(r.customerPrice, 575);
  assert.notEqual(r.customerPrice, 999, 'tier loses');
  assert.notEqual(r.customerPrice, 500, 'override folded into remainder, engine sells lines');
});
await ok('precedence: empty engine context block under override lands back on override verbatim', () => {
  const r = sourceProjectEconomics('foundation', { total_concrete_cost: 150, customer_price_override: 500, pricing_engine: {} }, 150);
  assert.equal(r.customerPrice, 500);
});
await ok('precedence: foundationHasEnginePricing detects config', () => {
  assert.equal(foundationHasEnginePricing(ENGINE_RECORD), true);
  assert.equal(foundationHasEnginePricing({ customer_pricing: { applied: true } }), false);
});

// ================= F. snapshot consumption =================
await ok('acceptedCustomerUnitPrice: customer_price_snapshot > total_snapshot', () => {
  assert.equal(acceptedCustomerUnitPrice({ customer_price_snapshot: 700, total_snapshot: 500 }), 700);
  assert.equal(acceptedCustomerUnitPrice({ total_snapshot: 500 }), 500);
});
await ok('liveCustomerUnitPrice: live > frozen chain both internal+customer', () => {
  assert.equal(liveCustomerUnitPrice({ live_customer_price_snapshot: 800, customer_price_snapshot: 700, live_total_snapshot: 600, total_snapshot: 500 }), 800);
  assert.equal(liveCustomerUnitPrice({ customer_price_snapshot: 700, live_total_snapshot: 600, total_snapshot: 500 }), 700);
  assert.equal(liveCustomerUnitPrice({ live_total_snapshot: 600, total_snapshot: 500 }), 600);
  assert.equal(liveCustomerUnitPrice({ total_snapshot: 500 }), 500);
});
await ok('acceptedInternalEstimateCost: frozen snapshot x quantity', () => {
  const sum = acceptedInternalEstimateCost([{ total_snapshot: 500, customer_quantity: 2 }, { total_snapshot: 100 }]);
  assert.equal(sum, 1100);
});

await ok('computePricing: quantity + adjustments + waterfall, accepted price only', () => {
  const est = {
    line_items: [
      { line_id: 'l1', customer_price_snapshot: 700, total_snapshot: 500, live_customer_price_snapshot: 9999, customer_quantity: 2, adjustment_percent: 10, product_category: 'catA' },
      { line_id: 'l2', total_snapshot: 100, live_total_snapshot: 8888 },
    ],
    category_adjustments: { catA: 5 },
    discount_percent: 10, contingency_percent: 10, shipping_fee: 50, tax_percent: 5, deposit_percent: 50,
  };
  const p = computePricing(est);
  assert.equal(p.sections[0].unitRaw, 700, 'frozen customer price, never live_*');
  assert.equal(p.sections[0].raw, 1400);
  assert.ok(Math.abs(p.sections[0].adjusted - 1610) < 1e-9, '10% line + 5% category adj');
  assert.ok(Math.abs(p.subtotal - 1710) < 1e-9);
  const disc = 171, cont = (1710 - 171) * 0.1, fees = 50, taxBase = 1710 - 171 + cont + fees, tax = taxBase * 0.05;
  assert.ok(Math.abs(p.quoteTotal - (taxBase + tax)) < 1e-9);
  assert.ok(Math.abs(p.deposit - p.quoteTotal / 2) < 1e-6);
});

await ok('buildCustomerQuoteRows: rows carry adjusted (frozen) amounts, never live fields', () => {
  const rows = buildCustomerQuoteRows({ hide_section_prices: false }, {
    sections: [
      { line_id: 'a', project_name: 'Sec A', adjusted: 1610, live_total_snapshot: 9999, include_in_customer: true },
      { line_id: 'b', project_name: 'Sec B', adjusted: 500, include_in_customer: false },
    ],
  });
  assert.equal(rows[0].amount, 1610);
  assert.equal(rows[1].bundled, true);
  assert.equal(rows[1].amount, 500);
});

// ================= G. refreshSectionSnapshots — live recalc + 0.005 tolerance =================
const FOUNDATION_RECORD = { total_concrete_cost: 100, total_rebar_cost: 50 };
const setFoundation = (rec) => clientStub.__setEntity('FoundationProject', { get: async () => rec });

await ok('refreshSectionSnapshots: live_total_snapshot = record split sum; unchanged within 0.005', async () => {
  setFoundation(FOUNDATION_RECORD);
  const [line] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', total_snapshot: 150 }]);
  assert.equal(line.live_total_snapshot, 150);
  assert.equal(line.price_state, 'current');
  assert.equal(line.live_customer_price_snapshot, 150);
});
await ok('refreshSectionSnapshots: |delta| > 0.005 -> changed (both directions, boundary exact)', async () => {
  setFoundation(FOUNDATION_RECORD);
  for (const [frozen, want] of [[149.994, 'changed'], [150.006, 'changed'], [149.995, 'current'], [150.005, 'current']]) {
    const [line] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', total_snapshot: frozen }]);
    assert.equal(line.price_state, want, `frozen ${frozen} vs live 150`);
  }
});
await ok('refreshSectionSnapshots: customer economics propagate (markup on source record)', async () => {
  setFoundation({ ...FOUNDATION_RECORD, customer_markup_percent: 20 });
  const [line] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', total_snapshot: 150 }]);
  assert.equal(line.live_total_snapshot, 150);
  assert.equal(line.live_customer_price_snapshot, 180);
});
await ok('refreshSectionSnapshots: builder-backed lines keep snapshots (no double reprice)', async () => {
  setFoundation(FOUNDATION_RECORD);
  const [line] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', builder_product_id: 'bp1', total_snapshot: 111, live_total_snapshot: 222 }]);
  assert.equal(line.total_snapshot, 111);
  assert.equal(line.live_total_snapshot, 222, 'builder-owned snapshots untouched by refresh');
});
await ok('refreshSectionSnapshots: legacy_frozen + detached states survive', async () => {
  setFoundation(FOUNDATION_RECORD);
  const [leg] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', total_snapshot: 10, price_state: 'legacy_frozen' }]);
  assert.equal(leg.price_state, 'legacy_frozen');
  const [det] = await ss.refreshSectionSnapshots([{ module_key: 'foundation', project_id: 'p', total_snapshot: 150, detached_part_count: 2 }]);
  assert.equal(det.price_state, 'detached_parts');
});

// ================= H. WO conversion reads frozen pricing =================
await ok('buildEstimateWorkOrderProducts: quoted fields come from frozen pricing sections', () => {
  const est = { line_items: [{ line_id: 'l1', module_key: 'foundation', project_name: 'Fdn', customer_price_snapshot: 700, total_snapshot: 500, live_customer_price_snapshot: 9999 }] };
  const products = wo.buildEstimateWorkOrderProducts(est, { sections: [{ line_id: 'l1', unitRaw: 700, quantity: 2, adjusted: 1540 }] }, { now: '2026-01-01' });
  assert.equal(products[0].quoted_unit_price, 700);
  assert.equal(products[0].quoted_total, 1540);
  assert.equal(JSON.stringify(products[0]).includes('9999'), false, 'live snapshot never reaches the WO');
});
await ok('estimateConvertedAmount: pricing waterfall wins, then estimate quote_total, then snapshot sum', () => {
  const est = { quote_total: 50, line_items: [{ customer_price_snapshot: 700, customer_quantity: 2 }] };
  assert.equal(wo.estimateConvertedAmount(est, { quoteTotal: 9999 }), 9999);
  assert.equal(wo.estimateConvertedAmount(est, {}), 50);
  assert.equal(wo.estimateConvertedAmount({ line_items: est.line_items }, {}), 1400);
});

// ================= I. tier engine + resolution order =================
const TIER2 = { tier_number: 2, tier_name: 'Pro', markups: { outsourced_fab: 1.5, inhouse_labor: 1.3, outsourced_services: 1.4 } };
const TIER1 = { tier_number: 1, tier_name: 'Base', markups: { outsourced_fab: 1.2, inhouse_labor: 1.1, outsourced_services: 1.15 } };

await ok('applyMarkups: per-category markup + eligible-only volume discount', () => {
  const lines = [{ label: 'A', cost: 100, category_key: 'outsourced_fab' }, { label: 'B', cost: 100, category_key: 'inhouse_labor' }];
  const r = applyMarkups(lines, TIER2, { brackets: [{ min: 100, pct: 10 }], eligibleCategoryKeys: ['outsourced_fab'] });
  // fab: 100*1.5=150 eligible -> *0.9 = 135; labor: 100*1.3=130 not eligible.
  assert.ok(Math.abs(r.totals.marked_subtotal - 280) < 1e-9);
  assert.ok(Math.abs(r.totals.grand_total - 265) < 1e-9);
  assert.equal(r.totals.volume_discount_pct, 10);
});

await ok('calculateSavedCustomerPricing -> applied snapshot totals tier-mark the same cost partition', async () => {
  clientStub.__setEntity('MarkupTier', { __rows: [TIER1, TIER2] });
  clientStub.__setEntity('MarkupCategory', { __rows: [] });
  clientStub.__setEntity('Settings', { __rows: [] });
  const res = await scp.calculateSavedCustomerPricing({ project: PERSISTED, categorize: categorizeFoundationProject, tierNumber: 2 });
  const expected = categorizeFoundationProject(PERSISTED).reduce((s, l) => s + num(l.cost) * (TIER2.markups[l.category_key] || 1), 0);
  assert.equal(res.applied, true);
  assert.equal(res.tier_number, 2);
  assert.ok(Math.abs(res.total - expected) < 1e-9, `${res.total} == ${expected}`);
  const lineSum = res.lines.reduce((s, l) => s + num(l.final_cost), 0);
  assert.ok(Math.abs(lineSum - res.total) <= EPS, 'snapshot lines sum to snapshot total');
});

await ok('tier resolution: requested > saved tier > customer_pricing_tier > customer default > tier 1', () => {
  const mk = (t) => ({ ...t, markups: { outsourced_fab: 1.0 } });
  const tiers = [mk(TIER1), mk(TIER2), { tier_number: 3, tier_name: 'VIP', markups: { outsourced_fab: 1.0 } }];
  const run = (over) => scp.calculateCustomerPricingFromConfig({ project: PERSISTED, categorize: categorizeFoundationProject, tiers, ...over });
  assert.equal(run({ tierNumber: 3 }).tier_number, 3, 'explicit apply wins');
  assert.equal(run({}).tier_number, 1, 'falls to tier 1 without context');
  const saved = run({ project: { ...PERSISTED, customer_pricing: { tier_number: 2 } } });
  assert.equal(saved.tier_number, 2, 'saved project tier wins over default');
  const custField = run({ project: { ...PERSISTED, customer_pricing_tier: 3 }, customer: { pricing_tier: 2 } });
  assert.equal(custField.tier_number, 3, 'project customer_pricing_tier beats customer default');
  const cust = run({ customer: { pricing_tier: 3 } });
  assert.equal(cust.tier_number, 3, 'customer default tier');
});

await ok('calculateSavedCustomerPricing: no tiers configured -> null (no silent fallback)', async () => {
  clientStub.__setEntity('MarkupTier', { __rows: [] });
  const res = await scp.calculateSavedCustomerPricing({ project: PERSISTED, categorize: categorizeFoundationProject });
  assert.equal(res, null);
});

// ================= J. tolerance edge: float reassociation =================
await ok('float reassociation within $0.005 never flags a delta', () => {
  // Same total computed two ways differs only by ulp-level reassociation.
  const a = 0.1 + 0.2 + 0.3 + 665.15; // 666.25
  const b = (0.3 + 0.1) + (0.2 + 665.15);
  assert.ok(Math.abs(a - b) <= EPS);
  const rec = { total_concrete_cost: a };
  assert.ok(Math.abs(foundationRecordSavedTotal(rec) - a) <= EPS);
  assert.equal(foundationRecordSavedTotal({ total_concrete_cost: 100 }), 100);
  // Boundary semantics used by the indicator: strictly-greater comparison.
  assert.equal(Math.abs(100.005 - 100) > EPS, false);
  assert.equal(Math.abs(100.006 - 100) > EPS, true);
});

const failed = report.cases.filter(c => !c.ok);
writeFileSync(resolve(here, 'verify-totals-model-results.json'), JSON.stringify(report, null, 1));
if (failed.length) { console.log(`\nFAIL ${failed.length}/${report.cases.length}`); process.exit(1); }
console.log(`\nPASS totals-model o010 (${report.cases.length} cases)`);
process.exit(0);
