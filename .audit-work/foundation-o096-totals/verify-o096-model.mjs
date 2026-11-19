// O-096 (CMP-H05) model harness — pure-Node assertions on the candidate
// foundationTotalsSummary.js: sticky cost/sell/margin derivation (incl.
// held-value safety), itemized takeoff construction, and the missing-input
// checklist. No React, no bundling — the helper is import-free by design.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveFoundationStickySummary,
  buildFoundationTakeoff,
  buildFoundationInputChecklist,
  FOUNDATION_STICKY_PARTITION_FIELDS,
} from './candidates/foundationTotalsSummary.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const results = [];
const R = (name, fn) => {
  try { fn(); results.push({ case: name, ok: true }); console.log('ok  -', name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.stack || e).split('\n').slice(0, 6).join('\n')); }
};
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------- fixtures ----------
const TOTALS_FULL = {
  total_concrete_volume_cy: 1.78, total_excavation_volume_cy: 2.22, total_labor_hours: 3.5,
  concrete_delivered_yards: 2.0, concrete_rate_per_yard: 185, concrete_delivery_cost: 75,
  concrete_trucks: [{ yards: 2, rounded_yards: 2, cost: 75 }], additional_stops_cost: 0,
  total_concrete_cost: 96, total_rebar_cost: 44, total_excavation_cost: 30,
  total_forming_materials_cost: 20, total_labor_cost: 40, total_brick_cost: 70,
  total_fill_cost: 15, total_wall_cost: 120, total_pole_cost: 120,
  total_pole_painting_cost: 35, total_equipment_cost: 50, total_wall_cap_cost: 10,
  total_signage_cabinet_cost: 100, total_landscape_cost: 0.75,
  wall_caps_by_material: [{ id: 'cap-1', name: 'Stone cap', qty: 4, cost: 10 }],
  grand_total: 465,
};
const SECTION = 565.75; // grand + cabinet 100 + landscape .75

const CALC_FULL = {
  items: [
    { component_id: 'it1', foundation_type: 'spread_foot', quantity: 2, concrete_volume_cy: 0.89, rebar_feet: 48, forming_qty: 3, excavation_volume_cy: 1.11, item_total_cost: 105 },
    { component_id: 'it2', foundation_type: 'pillar', quantity: 1, concrete_volume_cy: 0.89, rebar_feet: 40, forming_qty: 0, excavation_volume_cy: 1.11, item_total_cost: 96 },
  ],
  itemPricing: [{ available: true, issues: [] }, { available: true, issues: [] }],
  walls: [{ component_id: 'w1', name: 'Front wall', calculatedCosts: { totalBricks: 420, materialCost: 70, laborCost: 50, totalCost: 120, totalLinearInches: 480, internalTotalBricks: 60 } }],
  wallPricing: [{ available: true, issues: [] }],
  poles: [{ component_id: 'p1', pole_name: '20ft pole', required_length_inches: 240, stock_pieces: 1, pole_cost: 120, pole_painting_cost: 35, total_cost: 155 }],
  polePricing: [{ available: true, issues: [] }],
  wallCaps: [{ component_id: 'c1', cap_name: 'Stone cap', length_inches: 36, cost: 2.5 }],
  equipment: [{ component_id: 'e1', rental_period: 'day', rental_duration: 2, include_delivery: true, equipment_cost: 50 }],
  equipmentPricing: [{ available: true, issues: [] }],
  delivery: { concreteTotal: 75, roundedYards: 2.0, ratePerYard: 185, additionalStopsCost: 0, trucksList: [{ yards: 2, rounded_yards: 2, cost: 75 }], pricingUnavailable: false },
  signageCabinetPricing: [{ available: true, issues: [] }],
  landscapePricing: { available: true, issues: [] },
  catalogIssues: [], inputIssues: [], constructionWarnings: [],
};

const PROJECT_PRICED = {
  customer_markup_percent: 20,
  signage_cabinets: [{ component_id: 'sc1', description: 'Lit cabinet', quantity: 2, unit_cost: 50 }],
  landscape: { cell_size_inches: 12, cells: { '0,0': 'grass', '0,1': 'grass', '1,0': 'concrete' } },
};

// =============== sticky: manual markup on live cost ===============
R('sticky: live cost + markup 20 -> cost/sell/margin trio', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION, savedSectionTotal: SECTION,
    project: { customer_markup_percent: 20 },
  });
  assert.equal(s.cost.value, SECTION); assert.equal(s.cost.source, 'live');
  assert.equal(s.sell.source, 'markup'); assert.ok(approx(s.sell.value, SECTION * 1.2));
  assert.equal(s.sell.label, 'Markup 20%');
  assert.ok(approx(s.margin.amount, SECTION * 0.2));
  assert.ok(approx(s.margin.pct, (SECTION * 0.2) / (SECTION * 1.2) * 100));
  assert.equal(s.margin.basis, 'live');
  assert.equal(s.acknowledged, null);
});

R('sticky: override beats markup; override 0 falls back to markup', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION, project: { customer_markup_percent: 20, customer_price_override: 800 },
  });
  assert.equal(s.sell.source, 'override'); assert.equal(s.sell.value, 800);
  const s0 = resolveFoundationStickySummary({
    sectionTotal: SECTION, project: { customer_markup_percent: 20, customer_price_override: 0 },
  });
  assert.equal(s0.sell.source, 'markup'); assert.ok(approx(s0.sell.value, SECTION * 1.2));
});

// =============== sticky: applied tier snapshot ===============
R('sticky: applied tier -> sell = snapshot total + acknowledged margin pair', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION,
    project: { customer_markup_percent: 20, customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 550 } },
  });
  assert.equal(s.sell.source, 'tier'); assert.equal(s.sell.value, 900);
  assert.equal(s.sell.label, 'Tier 2 applied');
  assert.ok(approx(s.margin.amount, 900 - SECTION)); // live pair margin
  // acknowledged pair: 900 - 550 = 350; differs since 550 != 565.75
  assert.ok(approx(s.acknowledged.cost, 550));
  assert.ok(approx(s.acknowledged.marginAmount, 350));
  assert.ok(approx(s.acknowledged.marginPct, 350 / 900 * 100));
  assert.equal(s.acknowledged.differs, true);
});

R('sticky: tier snapshot cost equal to shown cost -> differs false', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: 550,
    project: { customer_pricing: { applied: true, tier_number: 1, total: 900, raw_subtotal: 550 } },
  });
  assert.equal(s.acknowledged.differs, false);
});

R('sticky: applied tier without numeric total falls back to manual', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION,
    project: { customer_markup_percent: 25, customer_pricing: { applied: true, tier_number: 2 } },
  });
  assert.equal(s.sell.source, 'markup'); assert.ok(approx(s.sell.value, SECTION * 1.25));
  assert.equal(s.acknowledged, null);
});

R('sticky: applied=false tier is ignored', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION,
    project: { customer_markup_percent: 10, customer_pricing: { applied: false, tier_number: 2, total: 900 } },
  });
  assert.equal(s.sell.source, 'markup'); assert.ok(approx(s.sell.value, SECTION * 1.1));
});

// =============== sticky: engine ===============
R('sticky: engine resolver wins over tier + override + markup', () => {
  const calls = [];
  const engine = (rec, args) => { calls.push(args); return { internalCost: args.internalCost, customerPrice: 1200 }; };
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION,
    project: { customer_markup_percent: 20, customer_price_override: 800, customer_pricing: { applied: true, total: 900 } },
    engineResolver: engine,
  });
  assert.equal(calls.length, 1);
  assert.ok(approx(calls[0].baselineSell, 800)); // override is the manual baseline
  assert.equal(s.sell.source, 'engine'); assert.equal(s.sell.value, 1200);
  assert.equal(s.sell.label, 'Pricing engine');
});

R('sticky: engine passthrough falls through to tier', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION,
    project: { customer_pricing: { applied: true, tier_number: 3, total: 900 } },
    engineResolver: () => null,
  });
  assert.equal(s.sell.source, 'tier'); assert.equal(s.sell.value, 900);
});

R('sticky: throwing engine resolver degrades to ladder, never crashes', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION, project: { customer_markup_percent: 20 },
    engineResolver: () => { throw new Error('bad config'); },
  });
  assert.equal(s.sell.source, 'markup'); assert.ok(approx(s.sell.value, SECTION * 1.2));
});

// =============== sticky: held states — never fabricate ===============
R('sticky HELD: null live + saved cost -> cost=saved, markup sell suppressed (no fabrication)', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: null, savedSectionTotal: 505.75, pricingUnavailable: true,
    project: { customer_markup_percent: 20 },
  });
  assert.equal(s.cost.value, 505.75); assert.equal(s.cost.source, 'saved');
  assert.equal(s.sell.value, null); assert.equal(s.sell.source, 'none');
  assert.equal(s.margin.amount, null); assert.equal(s.margin.pct, null);
});

R('sticky HELD: saved cost + applied tier -> acknowledged sell shows; margin vs saved', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: null, savedSectionTotal: 505.75, pricingUnavailable: true,
    project: { customer_pricing: { applied: true, tier_number: 2, total: 900, raw_subtotal: 505.75 } },
  });
  assert.equal(s.sell.source, 'tier'); assert.equal(s.sell.value, 900);
  assert.ok(approx(s.margin.amount, 900 - 505.75));
  assert.equal(s.margin.basis, 'saved');
  assert.equal(s.acknowledged.differs, false); // snapshot cost == shown saved cost
});

R('sticky HELD: saved cost + authored override -> override sell + margin vs saved', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: null, savedSectionTotal: 505.75,
    project: { customer_price_override: 800 },
  });
  assert.equal(s.sell.source, 'override'); assert.equal(s.sell.value, 800);
  assert.ok(approx(s.margin.amount, 800 - 505.75));
  assert.equal(s.margin.basis, 'saved');
});

R('sticky HELD: engine NOT invoked while cost held (baseline null guard)', () => {
  let called = 0;
  const s = resolveFoundationStickySummary({
    sectionTotal: null, savedSectionTotal: 505.75,
    project: { customer_markup_percent: 20, pricing_engine: { default_markup_pct: 50 } },
    engineResolver: () => { called++; return { customerPrice: 0 }; },
  });
  assert.equal(called, 0);
  assert.equal(s.sell.value, null);
});

R('sticky: never-priced record -> all none, margin —', () => {
  const s = resolveFoundationStickySummary({ sectionTotal: null, savedSectionTotal: null, project: {} });
  assert.equal(s.cost.value, null); assert.equal(s.sell.value, null);
  assert.equal(s.margin.amount, null); assert.equal(s.margin.pct, null);
});

R('sticky: no project prop -> sell none + projectLinked false (unwired honest state)', () => {
  const s = resolveFoundationStickySummary({ sectionTotal: SECTION });
  assert.equal(s.projectLinked, false);
  assert.equal(s.sell.value, null);
  assert.equal(s.cost.value, SECTION); assert.equal(s.cost.source, 'live');
});

R('sticky: negative margin shown honestly (sell < cost)', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION, project: { customer_price_override: 400 },
  });
  assert.equal(s.sell.source, 'override');
  assert.ok(approx(s.margin.amount, 400 - SECTION)); // negative
  assert.ok(s.margin.pct < 0);
});

R('sticky: sell $0 override -> margin amount shows, pct is null (no fake 0%)', () => {
  const s = resolveFoundationStickySummary({
    sectionTotal: SECTION, project: { customer_pricing: { applied: true, total: 0, raw_subtotal: SECTION } },
  });
  assert.equal(s.sell.value, 0);
  assert.ok(approx(s.margin.amount, -SECTION));
  assert.equal(s.margin.pct, null);
});

R('sticky: markup 0 -> sell = cost, margin $0 · 0.0%', () => {
  const s = resolveFoundationStickySummary({ sectionTotal: SECTION, project: { customer_markup_percent: 0 } });
  assert.equal(s.sell.source, 'markup'); assert.equal(s.sell.label, 'Cost (no markup)');
  assert.ok(approx(s.sell.value, SECTION));
  assert.ok(approx(s.margin.amount, 0)); assert.ok(approx(s.margin.pct, 0));
});

// =============== takeoff ===============
R('takeoff: full wiring -> all groups + per-component rows with qty + amount', () => {
  const t = buildFoundationTakeoff({
    totals: TOTALS_FULL,
    items: CALC_FULL.items, itemPricing: CALC_FULL.itemPricing,
    walls: CALC_FULL.walls, wallPricing: CALC_FULL.wallPricing,
    poles: CALC_FULL.poles, polePricing: CALC_FULL.polePricing,
    wallCaps: CALC_FULL.wallCaps,
    equipment: CALC_FULL.equipment, equipmentPricing: CALC_FULL.equipmentPricing,
    delivery: CALC_FULL.delivery,
    cabinets: PROJECT_PRICED.signage_cabinets,
    cabinetRows: [{ available: true, issues: [], cost: 100 }],
    landscapeLines: [
      { key: 'grass', label: 'Grass', cells: 2, sqft: 2, cost: 1.5 },
      { key: 'concrete', label: 'Concrete', cells: 1, sqft: 1, cost: 8 },
    ],
    landscapePricing: CALC_FULL.landscapePricing,
  });
  const keys = t.groups.map(g => g.key);
  assert.deepEqual(keys, ['foundations', 'masonry', 'poles', 'wall_caps', 'equipment', 'cabinets', 'landscape']);
  const items = t.groups[0].rows;
  assert.equal(items.length, 3); // 2 items + delivery
  assert.ok(items[0].label.includes('spread footing'));
  assert.ok(items[0].qty.includes('0.89 CY'));
  assert.ok(items[0].qty.includes('48 LF rebar'));
  assert.equal(items[0].amount, 105); assert.equal(items[0].held, false);
  assert.equal(items[2].label, 'Concrete delivery');
  assert.ok(items[2].qty.includes('2 yd') && items[2].qty.includes('1 truck'));
  const pole = t.groups.find(g => g.key === 'poles').rows[0];
  assert.equal(pole.label, '20ft pole');
  assert.ok(pole.qty.includes('20 LF billed'));
  assert.ok(pole.qty.includes('+ painting'));
  assert.equal(pole.amount, 155);
  const wall = t.groups.find(g => g.key === 'masonry').rows[0];
  assert.ok(wall.qty.includes('420 units'));
  assert.ok(wall.qty.includes('40 LF outline'));
  assert.ok(wall.qty.includes('+60 units internal'));
  const cab = t.groups.find(g => g.key === 'cabinets').rows[0];
  assert.equal(cab.label, 'Lit cabinet'); assert.equal(cab.amount, 100); assert.ok(cab.qty.includes('2 pcs'));
  const land = t.groups.find(g => g.key === 'landscape').rows;
  assert.equal(land.length, 2); assert.equal(land[0].amount, 1.5);
});

R('takeoff HELD: held item row flags saved snapshot, amount Not saved when absent', () => {
  const t = buildFoundationTakeoff({
    items: [{ component_id: 'it1', foundation_type: 'spread_foot', quantity: 1, concrete_volume_cy: 0.5 }],
    itemPricing: [{ available: false, issues: [{ message: 'x' }] }],
  });
  const row = t.groups[0].rows[0];
  assert.equal(row.held, true);
  assert.equal(row.amount, null); // -> UI renders "Not saved"
  assert.ok(row.qty.includes('0.5 CY'));
});

R('takeoff HELD: pole without required_length falls back to height+embedment', () => {
  const t = buildFoundationTakeoff({
    poles: [{ height_inches: 180, embedment_inches: 60, pole_cost: 100, total_cost: 100 }],
    polePricing: [{ available: false, issues: [] }],
  });
  const row = t.groups.find(g => g.key === 'poles').rows[0];
  assert.equal(row.held, true);
  assert.ok(row.qty.includes('20 LF billed')); // (180+60)/12
});

R('takeoff HELD: cap without cost -> held + null amount; wallCaps absent -> by-material fallback', () => {
  const wired = buildFoundationTakeoff({ totals: TOTALS_FULL, wallCaps: [{ cap_inventory_id: 'x', length_inches: 24 }] });
  assert.equal(wired.groups.find(g => g.key === 'wall_caps').rows[0].held, true);
  const fallback = buildFoundationTakeoff({ totals: TOTALS_FULL });
  const capGroup = fallback.groups.find(g => g.key === 'wall_caps');
  assert.equal(capGroup.rows[0].label, 'Stone cap');
  assert.ok(capGroup.rows[0].qty.includes('4 pcs'));
  assert.equal(capGroup.rows[0].amount, 10);
});

R('takeoff: unwired (totals only) -> delivery + caps-by-material rows, no item detail', () => {
  const t = buildFoundationTakeoff({ totals: TOTALS_FULL });
  const keys = t.groups.map(g => g.key);
  assert.ok(keys.includes('foundations'));
  const fRows = t.groups.find(g => g.key === 'foundations').rows;
  assert.equal(fRows.length, 1); // delivery only
  assert.equal(fRows[0].label, 'Concrete delivery');
  assert.ok(keys.includes('wall_caps'));
  assert.ok(!keys.includes('poles') && !keys.includes('masonry'));
});

R('takeoff: empty everything -> rowCount 0', () => {
  assert.equal(buildFoundationTakeoff({ totals: {} }).rowCount, 0);
  assert.equal(buildFoundationTakeoff({}).rowCount, 0);
});

// =============== checklist ===============
R('checklist: blocking channels enumerate inputIssues + catalogIssues', () => {
  const c = buildFoundationInputChecklist({
    totals: TOTALS_FULL,
    calc: {
      ...CALC_FULL,
      inputIssues: [{ kind: 'foundation', index: 0, code: 'foundation_dimension_invalid', message: 'Foundation 1: length must be a finite positive number.' }],
      catalogIssues: [{ kind: 'equipment', index: 0, code: 'equipment_price_unavailable', message: 'Equipment 1: record a catalog price.' }],
    },
  });
  assert.equal(c.complete, false);
  assert.equal(c.blockingCount, 2);
  const gKeys = c.groups.map(g => g.key);
  assert.deepEqual(gKeys.slice(0, 2), ['inputs', 'catalog']);
  assert.ok(c.groups[0].items[0].message.includes('finite positive'));
});

R('checklist: advisory channels = constructionWarnings + placement', () => {
  const c = buildFoundationInputChecklist({
    totals: TOTALS_FULL,
    calc: { ...CALC_FULL, constructionWarnings: [{ code: 'w1', message: 'verify footing depth' }] },
    assemblyIssues: [{ code: 'dangling-parent', message: 'Pole references a foundation that is not present.' }],
  });
  assert.equal(c.blockingCount, 0);
  assert.equal(c.advisoryCount, 2);
  assert.ok(c.groups.some(g => g.key === 'assembly' && g.severity === 'advisory'));
  assert.ok(c.groups.some(g => g.key === 'checks' && g.severity === 'advisory'));
});

R('checklist HELD: non-finite partition fields enumerate held buckets', () => {
  const heldTotals = { ...TOTALS_FULL, total_rebar_cost: null, total_wall_cap_cost: null, grand_total: null };
  const c = buildFoundationInputChecklist({ totals: heldTotals, calc: { ...CALC_FULL } });
  const held = c.groups.find(g => g.key === 'held');
  assert.ok(held);
  assert.ok(held.items.some(i => i.message.startsWith('Rebar')));
  assert.ok(held.items.some(i => i.message.startsWith('Wall caps')));
  assert.equal(held.items.length, 2); // concrete etc. finite -> absent
});

R('checklist HELD: wall-cap-only hold surfaces even with zero issues (channel the issue lists miss)', () => {
  const heldTotals = { ...TOTALS_FULL, total_wall_cap_cost: null, grand_total: null };
  const c = buildFoundationInputChecklist({ totals: heldTotals, calc: { ...CALC_FULL }, pricingUnavailable: false });
  assert.equal(c.blockingCount, 0);
  assert.equal(c.heldCount, 1);
  assert.equal(c.complete, false);
  assert.ok(c.groups.find(g => g.key === 'held').items[0].message.includes('Wall caps'));
});

R('checklist HELD: saved-snapshot held values still enumerate (finite totals, no extra rows)', () => {
  // Held rows WITH acknowledged snapshots keep finite totals -> no spurious
  // held_amount rows; the issue channels carry the reason instead.
  const c = buildFoundationInputChecklist({ totals: TOTALS_FULL, calc: { ...CALC_FULL } });
  assert.equal(c.heldCount, 0);
});

R('checklist: delivery pricingUnavailable -> held delivery row', () => {
  const c = buildFoundationInputChecklist({
    totals: TOTALS_FULL,
    calc: { ...CALC_FULL, delivery: { ...CALC_FULL.delivery, pricingUnavailable: true } },
  });
  assert.ok(c.groups.find(g => g.key === 'held').items.some(i => i.message.includes('Concrete delivery')));
});

R('checklist: identical issues dedupe across channels', () => {
  const dup = { kind: 'landscape', index: null, code: 'x', message: 'same' };
  const c = buildFoundationInputChecklist({
    totals: TOTALS_FULL,
    calc: { ...CALC_FULL, inputIssues: [dup, dup, { kind: 'foundation', index: 0, code: 'y', message: 'other' }] },
  });
  assert.equal(c.groups.find(g => g.key === 'inputs').items.length, 2);
});

R('checklist: clean wired calc -> complete flag + zero counts', () => {
  const c = buildFoundationInputChecklist({ totals: TOTALS_FULL, calc: { ...CALC_FULL } });
  assert.equal(c.totalCount, 0);
  assert.equal(c.complete, true);
});

R('checklist: unwired -> channelsKnown false, complete never claimed', () => {
  const c = buildFoundationInputChecklist({ totals: TOTALS_FULL });
  assert.equal(c.channelsKnown, false);
  assert.equal(c.complete, false); // never claim "all recorded" on unseen channels
  assert.equal(c.totalCount, 0);
});

R('checklist: unwired but held totals -> held channel still enumerates', () => {
  const c = buildFoundationInputChecklist({ totals: { ...TOTALS_FULL, total_equipment_cost: null } });
  assert.equal(c.heldCount, 1);
  assert.equal(c.complete, false);
});

R('checklist: pricingUnavailable catch-all when no reason enumerable', () => {
  const c = buildFoundationInputChecklist({ totals: TOTALS_FULL, pricingUnavailable: true, calc: { ...CALC_FULL } });
  assert.ok(c.groups.find(g => g.key === 'held').items.some(i => i.code === 'pricing_paused'));
});

R('checklist: issues override prop wins over calc', () => {
  const c = buildFoundationInputChecklist({
    totals: TOTALS_FULL,
    calc: { ...CALC_FULL, inputIssues: [{ code: 'a', message: 'from calc' }] },
    issues: { inputIssues: [{ code: 'b', message: 'from issues' }] },
  });
  const items = c.groups.find(g => g.key === 'inputs').items;
  assert.equal(items.length, 1);
  assert.equal(items[0].message, 'from issues');
});

// =============== partition parity vs builderService ===============
R('partition: FOUNDATION_STICKY_PARTITION_FIELDS == FOUNDATION_RECORD_TOTAL_FIELDS order + set', () => {
  const src = fs.readFileSync(path.join(here, 'fixture-pulls/builderService.js'), 'utf8');
  const m = src.match(/FOUNDATION_RECORD_TOTAL_FIELDS = \[([\s\S]*?)\]/);
  assert.ok(m, 'record total fields found in pulled builderService');
  const remote = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  assert.equal(remote.length, 12);
  assert.deepEqual(FOUNDATION_STICKY_PARTITION_FIELDS.map(([k]) => k), remote);
});

// =============== malformed-input robustness ===============
R('robustness: garbage inputs never throw', () => {
  assert.doesNotThrow(() => resolveFoundationStickySummary({ sectionTotal: 'x', project: 'no' }));
  assert.doesNotThrow(() => resolveFoundationStickySummary({ project: { customer_pricing: 'weird', customer_markup_percent: NaN } }));
  assert.doesNotThrow(() => buildFoundationTakeoff({ totals: null, items: 'x', walls: [null] }));
  assert.doesNotThrow(() => buildFoundationInputChecklist({ totals: undefined, calc: 'x' }));
  const s = resolveFoundationStickySummary({ sectionTotal: NaN, project: { customer_markup_percent: 'abc' } });
  assert.equal(s.cost.value, null);
});

fs.writeFileSync(path.join(here, 'verify-o096-model-results.json'), JSON.stringify({ results }, null, 1));
const failed = results.filter(r => !r.ok);
console.log(`\n${failed.length ? `FAIL ${failed.length}/${results.length}` : `PASS o096-model (${results.length} cases)`}`);
process.exit(failed.length ? 1 : 0);
