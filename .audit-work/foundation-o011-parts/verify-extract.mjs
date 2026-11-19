// O-011 (CMP-A11) model verification for extractFoundation.
// Bundles the CANDIDATE and BASELINE partSync.js with the REAL foundation calc
// chain (fixture/foundation/*) and stubbed @/ + ./ builder-side imports, then
// asserts the new signage-cabinet + landscape extraction behavior plus
// equipment coverage and a baseline regression diff on all other sections.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const stub = (name) => resolve(here, 'fixture/stubs', name);
const alias = {
  '@/api/base44Client': stub('base44Client.mjs'),
  '@/components/estimator/loadAllEntityRows': stub('loadAllEntityRows.mjs'),
  '@/components/estimator/parts/partState': stub('partState.mjs'),
  '@/components/vinylEstimator/vinylNestingCalculator': stub('vinyl.mjs'),
  '@/components/estimator/brick/brickCalc': stub('brick.mjs'),
  '@/components/signMaintenance/maintenanceCalculator': stub('maintenance.mjs'),
  '@/components/estimator/customerPricing': stub('customerPricing.mjs'),
  '@/components/estimator/estimateMutationGuard': stub('mutationGuard.mjs'),
  '@/components/staff/staffEntities': stub('staffEntities.mjs'),
};
const bundle = (entry, out) => buildSync({
  entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: resolve(here, out),
  logLevel: 'silent', alias, define: { 'import.meta.env': '{}' },
});
bundle('fixture/builder/partSync.js', '.tmp-partSync-candidate.mjs');
bundle('fixture-base/builder/partSync.js', '.tmp-partSync-baseline.mjs');
const candidate = await import(pathToFileURL(resolve(here, '.tmp-partSync-candidate.mjs')).href);
const baseline = await import(pathToFileURL(resolve(here, '.tmp-partSync-baseline.mjs')).href);
const { extractBuilderParts } = candidate;
const extractBaseline = baseline.extractBuilderParts;

const report = { cases: [], generated: new Date().toISOString() };
const ok = (name, fn) => {
  try { fn(); report.cases.push({ name, ok: true }); console.log('ok  -', name); }
  catch (e) { report.cases.push({ name, ok: false, error: String(e.message || e) }); console.log('FAIL-', name, ':', String(e.message || e).slice(0, 400)); }
};

const catalogs = {
  FoundationInventory: { rows: [], byId: new Map() },
  LaborServiceInventory: { rows: [], byId: new Map() },
};
const catOf = (rows) => ({ ...catalogs, FoundationInventory: { rows, byId: new Map(rows.map(r => [r.id, r])) } });
const parts = (project, cat = catalogs) => extractBuilderParts('foundation', project, cat);
const byKey = (list) => Object.fromEntries(list.map(p => [p.part_key, p]));
const cabKeys = (list) => list.filter(p => /^foundation:(cabinet|landscape)/.test(p.part_key));
const money2 = (v) => Math.round(v * 100) / 100;

// ---------- Case 1: cabinets fully priced ----------
ok('cabinets priced -> per-row parts, no adjustment', () => {
  const p = parts({
    signage_cabinets: [
      { id: 'cab_1', description: 'Main ID', quantity: 2, unit_cost: 150 },
      { id: 'cab_2', description: 'Directional', quantity: 1, unit_cost: 80 },
    ],
    total_signage_cabinet_cost: 380,
    builder_calculation: { cabinet_cost: 380 },
  });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:cab_1'].quantity, 2);
  assert.equal(k['foundation:cabinet:cab_1'].unit_cost, 150);
  assert.equal(k['foundation:cabinet:cab_1'].extended_cost, 300);
  assert.equal(k['foundation:cabinet:cab_1'].part_type, 'fabrication');
  assert.equal(k['foundation:cabinet:cab_2'].extended_cost, 80);
  assert.equal(k['foundation:cabinet:saved-adjustment'], undefined, 'no gap -> no adjustment part');
});

// ---------- Case 2: held row + priced row + saved total ----------
ok('held cabinet row mints no $0 part; saved-aggregate adjustment covers the gap', () => {
  const p = parts({
    signage_cabinets: [
      { id: 'cab_1', description: 'Main', quantity: 2, unit_cost: 150 },
      { id: 'cab_2', description: 'Held', quantity: 1 }, // missing unit_cost -> held
    ],
    total_signage_cabinet_cost: 450,
    builder_calculation: { cabinet_cost: 450 },
  });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:cab_1'].extended_cost, 300);
  assert.equal(k['foundation:cabinet:cab_2'], undefined, 'held row mints no per-row part');
  assert.equal(k['foundation:cabinet:saved-adjustment'].extended_cost, 150, '450 saved - 300 represented');
  assert.equal(k['foundation:cabinet:saved-adjustment'].part_type, 'fabrication');
  assert.equal(k['foundation:cabinet:saved-adjustment'].part_subtype, 'signage_cabinet_adjustment');
  p.forEach(part => assert.ok(Number.isFinite(part.extended_cost), 'every minted part carries a finite cost'));
});

// ---------- Case 3: all held, no saved total -> no $0 mint ----------
ok('all cabinets held with no acknowledged total -> zero cabinet parts', () => {
  const p = parts({ signage_cabinets: [{ id: 'cab_1', quantity: 1, description: 'x' }] });
  assert.equal(cabKeys(p).length, 0, 'no cabinet parts minted');
});

// ---------- Case 4: stale saved total, no rows ----------
ok('no cabinet rows + stale saved total -> one aggregate adjustment part', () => {
  const p = parts({ signage_cabinets: [], total_signage_cabinet_cost: 200 });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:saved-adjustment'].extended_cost, 200);
});

// ---------- Case 5: landscape fully priced ----------
ok('landscape priced grid -> one part per material', () => {
  const cells = { a: 'grass', b: 'grass', c: 'concrete' };
  const p = parts({
    landscape: { cell_size_inches: 12, cells },
    total_landscape_cost: 9.5,
    builder_calculation: { landscape_cost: 9.5 },
  });
  const k = byKey(p);
  assert.equal(k['foundation:landscape:grass'].quantity, 2, '2 sq ft');
  assert.equal(k['foundation:landscape:grass'].unit_cost, 0.75);
  assert.equal(k['foundation:landscape:grass'].extended_cost, 1.5);
  assert.equal(k['foundation:landscape:concrete'].quantity, 1);
  assert.equal(k['foundation:landscape:concrete'].extended_cost, 8);
  assert.equal(k['foundation:landscape:concrete'].unit_cost, 8);
  assert.equal(k['foundation:landscape:concrete'].unit, 'sq_ft');
  assert.equal(k['foundation:landscape:saved-adjustment'], undefined, 'no gap -> no adjustment');
});

// ---------- Case 6: landscape held partially + saved total ----------
ok('held landscape line mints no $0 part; adjustment covers gap to saved total', () => {
  const p = parts({
    landscape: { cell_size_inches: 12, cells: { a: 'grass', b: 'mystery-material' } },
    total_landscape_cost: 20,
    builder_calculation: { landscape_cost: 20 },
  });
  const k = byKey(p);
  assert.equal(k['foundation:landscape:grass'].extended_cost, 0.75);
  assert.equal(k['foundation:landscape:mystery-material'], undefined, 'unknown material mints no part');
  assert.equal(money2(k['foundation:landscape:saved-adjustment'].extended_cost), 19.25);
});

// ---------- Case 7: malformed landscape + saved total ----------
ok('malformed landscape record does not crash; saved total preserved as aggregate', () => {
  const p = parts({ landscape: 'corrupt-string', total_landscape_cost: 33 });
  const k = byKey(p);
  assert.equal(k['foundation:landscape:saved-adjustment'].extended_cost, 33);
});

// ---------- Case 8: absent landscape/cabinets ----------
ok('absent cabinets + landscape -> no such parts', () => {
  const p = parts({ signage_cabinets: undefined, landscape: undefined });
  assert.equal(cabKeys(p).length, 0);
});

// ---------- Case 9: recorded 0 quantity is held ----------
ok('cabinet quantity 0 is held (not guessed to 1) -> covered by saved total', () => {
  const p = parts({
    signage_cabinets: [{ id: 'cab_1', description: 'x', quantity: 0, unit_cost: 100 }],
    total_signage_cabinet_cost: 100,
    builder_calculation: { cabinet_cost: 100 },
  });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:cab_1'], undefined, 'qty 0 row mints no part');
  assert.equal(k['foundation:cabinet:saved-adjustment'].extended_cost, 100);
});

// ---------- Case 10: legitimate free cabinet (explicit 0) ----------
ok('explicit $0 unit_cost is a legitimate free cabinet -> priced $0 part', () => {
  const p = parts({
    signage_cabinets: [{ id: 'cab_1', description: 'Free', quantity: 1, unit_cost: 0 }],
    total_signage_cabinet_cost: 0,
  });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:cab_1'].extended_cost, 0, 'legitimate free row at $0');
});

// ---------- Case 11: legacy aggregate-only landscape save ----------
ok('legacy aggregate-only landscape save -> aggregate preserved under new key', () => {
  const p = parts({ landscape: { cell_size_inches: 12, cells: {} }, builder_calculation: { landscape_cost: 55 } });
  const k = byKey(p);
  assert.equal(k['foundation:landscape:saved-adjustment'].extended_cost, 55);
});

// ---------- Case 12: cabinet rows without id -> index key ----------
ok('cabinet without id falls back to index key', () => {
  const p = parts({ signage_cabinets: [{ description: 'x', quantity: 1, unit_cost: 10 }], total_signage_cabinet_cost: 10 });
  const k = byKey(p);
  assert.equal(k['foundation:cabinet:0'].extended_cost, 10);
});

// ---------- Case 13: equipment coverage (recon: attachments/sub/saved-adjustment) ----------
ok('equipment extraction covers base + delivery + attachments + sub-attachments + saved-adjustment', () => {
  const cat = catOf([
    { id: 'eq1', material_name: 'Excavator', material_type: 'excavation_equipment', cost_per_day: 100, pickup_delivery_cost: 20 },
    { id: 'att1', material_name: 'Auger', material_type: 'attachment', cost_per_day: 15 },
    { id: 'sub1', material_name: 'Tip', material_type: 'sub_attachment', cost_per_day: 7 },
  ]);
  const p = parts({
    selected_equipment: [{
      equipment_id: 'eq1', rental_period: 'day', rental_duration: 2,
      include_delivery: true,
      attachments: [{ id: 'att1', qty: 2 }],
      sub_attachment_counts: { sub1: 1 },
      equipment_cost: 400,
    }],
  }, cat);
  const k = byKey(p);
  assert.equal(k['foundation:equipment:0'].extended_cost, 200, 'base rental 100/day x2');
  assert.equal(k['foundation:equipment:0:delivery'].extended_cost, 20);
  assert.equal(k['foundation:equipment:0:attachment:att1'].extended_cost, 60, '15/day x2d x2qty');
  assert.equal(k['foundation:equipment:0:sub-attachment:sub1'].extended_cost, 14, '7/day x2d x1');
  assert.equal(k['foundation:equipment:0:saved-adjustment'].extended_cost, 106, '400 saved - 294 reconstructed');
  const total = p.reduce((s, x) => s + x.extended_cost, 0);
  assert.equal(total, 400, 'equipment parts sum to acknowledged equipment_cost');
});

// ---------- Case 14: part_key uniqueness ----------
ok('all emitted part_keys are unique', () => {
  const p = parts({
    signage_cabinets: [
      { id: 'cab_1', quantity: 2, unit_cost: 100 },
      { description: 'no id', quantity: 1, unit_cost: 50 },
    ],
    landscape: { cell_size_inches: 24, cells: { a: 'grass', b: 'mulch', c: 'water' } },
    total_signage_cabinet_cost: 250,
    total_landscape_cost: 4 * 0.75 + 4 * 1.25 + 4 * 6,
  });
  const keys = p.map(x => x.part_key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate part keys');
  const k = byKey(p);
  assert.equal(k['foundation:landscape:grass'].quantity, 4, '24in cell -> 4 sqft per cell, grass has 1 cell');
});

// ---------- Case 15: regression — everything except cabinet/landscape identical to baseline ----------
ok('regression: non-cabinet/landscape parts identical to baseline on a full project', () => {
  const cat = catOf([
    { id: 'eq1', material_name: 'Excavator', material_type: 'excavation_equipment', cost_per_day: 100, pickup_delivery_cost: 20 },
    { id: 'pole1', material_name: 'Steel Pole', material_type: 'pole', cost_per_unit: 12 },
    { id: 'cap1', material_name: 'Cap Stock', material_type: 'wall_cap' },
    { id: 'brick1', material_name: 'Brick', material_type: 'brick' },
    { id: 'rebar4', material_name: '#4 Rebar', material_type: 'rebar', rebar_size: '#4', cost_per_unit: 1.1 },
  ]);
  const project = {
    selected_concrete_id: '',
    items: [{
      description: 'F1', foundation_type: 'spread_foot', quantity: 1,
      include_rebar: true, rebar_size: '#4', rebar_feet: 40, rebar_rate: 1.1, rebar_cost: 50,
      excavation_cost: 100, pouring_cost: 60, finishing_cost: 40,
    }],
    poles: [{ pole_id: 'pole1', pole_name: 'P1', height_inches: 120, y_offset_inches: 0, pole_cost: 120, pole_painting_cost: 30 }],
    wall_caps: [{ id: 'caprow1', cap_inventory_id: 'cap1', cost: 25 }],
    walls: [{ materialId: 'brick1', name: 'W1', calculatedCosts: { totalBricks: 10, materialCost: 80, mortarCost: 10, laborCost: 30 } }],
    selected_equipment: [{ equipment_id: 'eq1', rental_period: 'day', rental_duration: 1, equipment_cost: 100 }],
    signage_cabinets: [{ id: 'cab_1', quantity: 1, unit_cost: 90 }],
    landscape: { cell_size_inches: 12, cells: { a: 'grass' } },
    total_signage_cabinet_cost: 90,
    total_landscape_cost: 0.75,
    builder_calculation: { cabinet_cost: 90, landscape_cost: 0.75, delivery: {} },
  };
  const strip = (list) => list.filter(x => !/^foundation:(cabinet|landscape)/.test(x.part_key))
    .map(x => JSON.stringify(x));
  assert.deepEqual(strip(parts(project, cat)), strip(extractBaseline('foundation', project, cat)),
    'all non cabinet/landscape parts identical to baseline');
  const candCabKeys = cabKeys(parts(project, cat)).map(x => x.part_key).sort();
  assert.deepEqual(candCabKeys, ['foundation:cabinet:cab_1', 'foundation:landscape:grass'].sort(),
    'candidate emits priced cabinet + landscape-material parts');
});

// ---------- Case 16: baseline emitted $0 for held cabinet (defect documented) ----------
ok('regression note: baseline minted $0 part for held cabinet row (candidate does not)', () => {
  const proj = { signage_cabinets: [{ id: 'cab_1', quantity: 1 }] };
  const base = byKey(extractBaseline('foundation', proj));
  assert.equal(base['foundation:cabinet:cab_1'].extended_cost, 0, 'baseline minted $0 (the defect)');
  const cand = byKey(parts(proj));
  assert.equal(cand['foundation:cabinet:cab_1'], undefined, 'candidate mints no $0 part');
});

const failed = report.cases.filter(c => !c.ok);
writeFileSync(resolve(here, 'verify-extract-results.json'), JSON.stringify(report, null, 1));
if (failed.length) { console.log(`\nFAIL ${failed.length}/${report.cases.length}`); process.exit(1); }
console.log(`\nPASS extract-foundation o011 (${report.cases.length} cases)`);
process.exit(0);
