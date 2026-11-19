// O-009t (CMP-A09) classification model verification — runs the CANDIDATE
// foundationCatalogIntegrity.js bundled with the REMOTE calc graph.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.resolve('.audit-work/foundation-o009t-classification/bundle');
const I = await import(pathToFileURL(path.join(dir, 'integrity-bundle.mjs')));
const C = await import(pathToFileURL(path.join(dir, 'calc-bundle.mjs')));

let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e?.message || e)); } };
const codes = (issues) => issues.map(i => i.code).sort();
const byCode = (issues, code) => issues.filter(i => i.code === code);

// ---------- inventory fixtures ----------
const READY = { id: 'sup1', material_type: 'concrete_service', cost_per_unit: 150, show_in_foundation: true };
const BAG = { id: 'bag1', material_type: 'bagged_concrete', cost_per_unit: 6.5 };
const BAG_FREE = { id: 'bagf', material_type: 'bagged_concrete', cost_per_unit: 0 };
const BAG_UNPRICED = { id: 'bagu', material_type: 'bagged_concrete' }; // cost_per_unit absent
const FORM = { id: 'fm1', material_type: 'forming_material', cost_per_unit: 3 };
const FORM_INACTIVE = { id: 'fm2', material_type: 'forming_material', cost_per_unit: 3, show_in_foundation: false };
const REBAR4 = { id: 'rb4', material_type: 'rebar', rebar_size: '#4', cost_per_unit: 0.6 };
const REBAR4_UNPRICED = { id: 'rb4u', material_type: 'rebar', rebar_size: '#4' };
const REBAR4_INACTIVE = { id: 'rb4i', material_type: 'rebar', rebar_size: '#4', cost_per_unit: 0.6, is_active: false };
const REBAR5 = { id: 'rb5', material_type: 'rebar', rebar_size: '#5', cost_per_unit: 0.9 };
const SUP_INACTIVE = { id: 'sup2', material_type: 'concrete_service', cost_per_unit: 150, show_in_foundation: false, is_active: true };
const SUP_DELETED = { id: 'sup3', material_type: 'concrete_service', cost_per_unit: 150, deleted_at: '2026-11-01' };
const POLE_ROW = { id: 'po1', material_type: 'pole', cost_per_unit: 12 };

const baseItem = (over = {}) => ({
  component_id: 'it1', foundation_type: 'spread_foot', quantity: 1,
  length_inches: 48, width_inches: 48, depth_inches: 12,
  selected_concrete_id: 'bag1', include_rebar: false, include_forming: false, include_finishing: false,
  rebar_size: '#4', pillar_rebar_size: '#4', excavation_method: 'hand_dig', ...over,
});
const baseProject = (over = {}) => ({
  items: [], poles: [], walls: [], wall_caps: [], selected_equipment: [],
  signage_cabinets: [], project_concrete_type: '4000_ae', ...over,
});

// ============ lifecycle classifier ============
await ok('rowAvailability: active default', () => {
  assert.equal(I.foundationCatalogRowAvailability({ id: 'x' }), 'active');
  assert.equal(I.foundationCatalogRowAvailability({ show_in_foundation: true, is_active: true }), 'active');
});
await ok('rowAvailability: inactive markers', () => {
  for (const row of [
    { show_in_foundation: false }, { is_active: false }, { active: false },
    { archived: true }, { is_archived: true }, { disabled: true },
    { status: 'inactive' }, { status: 'DISCONTINUED' }, { status: ' archived ' },
  ]) assert.equal(I.foundationCatalogRowAvailability(row), 'inactive', JSON.stringify(row));
});
await ok('rowAvailability: deleted tombstones win', () => {
  for (const row of [
    { deleted: true }, { is_deleted: true }, { deleted_at: 'x' },
    { status: 'deleted' }, { status: 'deleted', is_active: false }, // deleted > inactive
  ]) assert.equal(I.foundationCatalogRowAvailability(row), 'deleted', JSON.stringify(row));
});
await ok('priceClass: free vs unpriced vs priced', () => {
  assert.equal(I.foundationCatalogPriceClass(0), 'free');
  assert.equal(I.foundationCatalogPriceClass('0'), 'free');
  assert.equal(I.foundationCatalogPriceClass(12.5), 'priced');
  assert.equal(I.foundationCatalogPriceClass(null), 'unpriced');
  assert.equal(I.foundationCatalogPriceClass(undefined), 'unpriced');
  assert.equal(I.foundationCatalogPriceClass(''), 'unpriced');
  assert.equal(I.foundationCatalogPriceClass('abc'), 'unpriced');
  assert.equal(I.foundationCatalogPriceClass(-4), 'unpriced');
});

// ============ item scan: parity where previously correct ============
await ok('item: unselected concrete now flags unassigned', () => {
  const item = baseItem({ selected_concrete_id: '' });
  const iss = I.foundationItemCatalogIssues(item, [BAG], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned']);
  assert.equal(iss[0].field, 'selected_concrete_id');
});
await ok('item: missing concrete row -> unavailable w/ deleted-or-deactivated msg', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'gone' }), [BAG], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unavailable']);
  assert.match(iss[0].message, /may have been deleted or deactivated/);
});
await ok('item: inactive concrete row -> catalog_item_inactive', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'sup2' }), [SUP_INACTIVE], 0);
  assert.deepEqual(codes(iss), ['catalog_item_inactive']);
  assert.match(iss[0].message, /inactive/);
});
await ok('item: tombstoned concrete row -> catalog_item_deleted', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'sup3' }), [SUP_DELETED], 0);
  assert.deepEqual(codes(iss), ['catalog_item_deleted']);
});
await ok('item: wrong-type row still type_mismatch (parity)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'po1' }), [POLE_ROW], 0);
  assert.deepEqual(codes(iss), ['catalog_item_type_mismatch']);
});
await ok('item: unpriced bagged concrete -> catalog_item_unpriced', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'bagu' }), [BAG_UNPRICED], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unpriced']);
});
await ok('item: deliberate $0 bagged concrete is NOT unpriced (free distinct)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'bagf' }), [BAG_FREE], 0);
  assert.deepEqual(iss, []);
});
await ok('item: unpriced bagged + authored custom cost -> no flag (override wins)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'bagu', custom_concrete_cost_per_cy: 200 }), [BAG_UNPRICED], 0);
  assert.deepEqual(iss, []);
});
await ok('item: ready-mix service row never item-level unpriced (delivery owns mixes)', () => {
  const svc = { id: 'supx', material_type: 'concrete_service' }; // no cost_per_unit
  const iss = I.foundationItemCatalogIssues(baseItem({ selected_concrete_id: 'supx' }), [svc], 0);
  assert.deepEqual(iss, []);
});
await ok('item: unassigned forming + include_forming -> unassigned', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_forming: true, selected_forming_id: null }), [BAG, FORM], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned']);
  assert.equal(iss[0].field, 'selected_forming_id');
});
await ok('item: unassigned forming + authored custom rate -> silent (not consumed)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_forming: true, selected_forming_id: null, custom_forming_rate: 4 }), [BAG, FORM], 0);
  assert.deepEqual(iss, []);
});
await ok('item: unpriced forming row -> unpriced; free forming row ok', () => {
  const unp = { id: 'fmu', material_type: 'forming_material' };
  const free = { id: 'fmf', material_type: 'forming_material', cost_per_unit: 0 };
  assert.deepEqual(codes(I.foundationItemCatalogIssues(baseItem({ include_forming: true, selected_forming_id: 'fmu' }), [BAG, unp], 0)), ['catalog_item_unpriced']);
  assert.deepEqual(I.foundationItemCatalogIssues(baseItem({ include_forming: true, selected_forming_id: 'fmf' }), [BAG, free], 0), []);
});
await ok('item: inactive forming row -> inactive flag', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_forming: true, selected_forming_id: 'fm2' }), [BAG, FORM_INACTIVE], 0);
  assert.deepEqual(codes(iss), ['catalog_item_inactive']);
});

// ============ rebar paths ============
await ok('item: spread_foot rebar unassigned stays unassigned (parity)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_rebar: true, rebar_size: '' }), [BAG, REBAR4], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned']);
  assert.equal(iss[0].field, 'rebar_size');
});
await ok('item: spread_foot rebar missing size row -> unavailable (parity)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_rebar: true, rebar_size: '#7' }), [BAG, REBAR4], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unavailable']);
});
await ok('item: rebar row resolved but inactive -> inactive flag', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_rebar: true, rebar_size: '#4' }), [BAG, REBAR4_INACTIVE], 0);
  assert.deepEqual(codes(iss), ['catalog_item_inactive']);
});
await ok('item: rebar row resolved, unpriced -> unpriced', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_rebar: true, rebar_size: '#4' }), [BAG, REBAR4_UNPRICED], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unpriced']);
});
await ok('item: rebar unpriced + authored custom rate -> silent', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ include_rebar: true, rebar_size: '#4', custom_rebar_cost_per_ft: 0.7 }), [BAG, REBAR4_UNPRICED], 0);
  assert.deepEqual(iss, []);
});
await ok('item: pillar empty size + #4 exists -> catalog_item_unassigned_default', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '' }), [BAG, REBAR4], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned_default']);
  assert.equal(iss[0].inventoryId, 'rb4');
  assert.match(iss[0].message, /#4 default is consumed/);
});
await ok('item: pillar empty size + inactive #4 row -> unassigned_default names the inactive default', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '' }), [BAG, REBAR4_INACTIVE], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned_default']);
  assert.match(iss[0].message, /resolves to an inactive row/);
});
await ok('item: pillar empty size + no #4 row -> unassigned_default (missing default)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: null }), [BAG, REBAR5], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned_default']);
  assert.equal(iss[0].inventoryId, null);
});
await ok('item: pillar explicit size resolves -> clean', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '#5' }), [BAG, REBAR5], 0);
  assert.deepEqual(iss, []);
});
await ok('item: manual rebar snapshot suppresses all rebar catalog flags (parity)', () => {
  const iss = I.foundationItemCatalogIssues(baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '', custom_rebar_cost_per_ft: 0.7 }), [BAG, REBAR5], 0);
  assert.deepEqual(iss, []);
});

// ============ v2 reinforcement catalog basis ============
await ok('item v2: catalog reinforcement inactive -> inactive flag', () => {
  const item = baseItem({ include_rebar: true, reinforcement_calculation_version: 2, reinforcement_material: { kind: 'catalog', inventory_id: 'rb4i' } });
  const iss = I.foundationItemCatalogIssues(item, [BAG, REBAR4_INACTIVE], 0);
  assert.deepEqual(codes(iss), ['catalog_item_inactive']);
});
await ok('item v2: catalog reinforcement resolves active -> clean (parity)', () => {
  const item = baseItem({ include_rebar: true, reinforcement_calculation_version: 2, reinforcement_material: { kind: 'catalog', inventory_id: 'rb4' } });
  const iss = I.foundationItemCatalogIssues(item, [BAG, REBAR4], 0);
  assert.deepEqual(iss, []);
});
await ok('item v2: missing catalog basis -> unavailable (parity)', () => {
  const item = baseItem({ include_rebar: true, reinforcement_calculation_version: 2, reinforcement_material: { kind: 'catalog', inventory_id: 'nope' } });
  const iss = I.foundationItemCatalogIssues(item, [BAG, REBAR4], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unavailable']);
});
await ok('item v2: unassigned basis -> unassigned (parity)', () => {
  const item = baseItem({ include_rebar: true, reinforcement_calculation_version: 2, reinforcement_material: { kind: 'catalog', inventory_id: null } });
  const iss = I.foundationItemCatalogIssues(item, [BAG, REBAR4], 0);
  assert.deepEqual(codes(iss), ['catalog_item_unassigned']);
});

// ============ assembly scan: poles + mix default ============
await ok('assembly: pole unassigned/unavailable/inactive classify distinctly', () => {
  const p = baseProject({ poles: [
    { component_id: 'a', pole_id: '' },
    { component_id: 'b', pole_id: 'gone' },
    { component_id: 'c', pole_id: 'po2' },
  ] });
  const inv = [{ id: 'po2', material_type: 'pole', show_in_foundation: false }];
  const iss = I.foundationAssemblyCatalogIssues(p, inv).filter(i => i.kind === 'pole');
  assert.deepEqual(iss.map(i => i.code), ['catalog_item_unassigned', 'catalog_item_unavailable', 'catalog_item_inactive']);
});
await ok('assembly: unassigned mix + service supplier -> unassigned_default on project_concrete_type', () => {
  const p = baseProject({ project_concrete_type: '', items: [baseItem({ selected_concrete_id: 'sup1' })] });
  const iss = I.foundationAssemblyCatalogIssues(p, [READY]);
  const mix = iss.filter(i => i.kind === 'concrete_delivery');
  assert.equal(mix.length, 1);
  assert.equal(mix[0].code, 'catalog_item_unassigned_default');
  assert.equal(mix[0].field, 'project_concrete_type');
  assert.equal(mix[0].inventoryId, 'sup1');
});
await ok('assembly: unassigned mix + NO service supplier -> no default flag', () => {
  const p = baseProject({ project_concrete_type: '', items: [baseItem({ selected_concrete_id: 'bag1' })] });
  const iss = I.foundationAssemblyCatalogIssues(p, [BAG]);
  assert.equal(iss.filter(i => i.kind === 'concrete_delivery').length, 0);
});
await ok('assembly: authored mix -> no default flag', () => {
  const p = baseProject({ project_concrete_type: '5000', items: [baseItem({ selected_concrete_id: 'sup1' })] });
  const iss = I.foundationAssemblyCatalogIssues(p, [READY]);
  assert.equal(iss.filter(i => i.field === 'project_concrete_type').length, 0);
});
await ok('assembly: unassigned mix + inactive service supplier -> flag still fires (delivery consumes it)', () => {
  const p = baseProject({ project_concrete_type: null, items: [baseItem({ selected_concrete_id: 'sup2' })] });
  const iss = I.foundationAssemblyCatalogIssues(p, [SUP_INACTIVE]);
  const mix = iss.filter(i => i.kind === 'concrete_delivery');
  assert.equal(mix.length, 1);
  // and the item-level inactive flag on the same row
  assert.ok(iss.some(i => i.code === 'catalog_item_inactive' && i.field === 'selected_concrete_id'));
});

// ============ audit export: distinct downstream classes ============
await ok('audit: free vs unpriced vs priced vs override vs deferred', () => {
  const inv = [BAG, BAG_FREE, BAG_UNPRICED, READY, FORM, REBAR4];
  const audit = (item) => I.foundationItemCatalogAudit(item, inv, 0);
  const forBag = (id, extra = {}) => audit(baseItem({ selected_concrete_id: id, ...extra })).find(r => r.field === 'selected_concrete_id');
  assert.equal(forBag('bag1').priceClass, 'priced');
  assert.equal(forBag('bagf').priceClass, 'free');
  assert.equal(forBag('bagu').priceClass, 'unpriced');
  assert.equal(forBag('bag1', { custom_concrete_cost_per_cy: 100 }).priceClass, 'override');
  assert.equal(forBag('sup1').priceClass, 'deferred');
  assert.equal(forBag('gone').availability, 'missing');
  const un = audit(baseItem({ selected_concrete_id: '' })).find(r => r.field === 'selected_concrete_id');
  assert.equal(un.selection, 'unassigned');
  assert.equal(un.availability, 'unassigned');
});
await ok('audit: pillar default marks selection defaulted', () => {
  const a = I.foundationItemCatalogAudit(
    baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '' }), [REBAR4], 0);
  const r = a.find(x => x.field === 'pillar_rebar_size');
  assert.equal(r.selection, 'defaulted');
  assert.equal(r.availability, 'active');
  assert.equal(r.priceClass, 'priced');
});

// ============ calcProject end-to-end (remote calc graph + candidate) ============
await ok('calcProject: inactive supplier row blocks item pricing + holds delivery', () => {
  const project = baseProject({
    items: [baseItem({ selected_concrete_id: 'sup2', include_rebar: false })],
  });
  const calc = C.calcProject(project, [SUP_INACTIVE], { foundation_hand_dig_time_per_cy: 2 });
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_inactive'), 'inactive issue surfaced');
  assert.equal(calc.itemPricing[0].available, false);
});
await ok('calcProject: unpriced bagged row blocks pricing (was silent $0)', () => {
  const project = baseProject({ items: [baseItem({ selected_concrete_id: 'bagu' })] });
  const calc = C.calcProject(project, [BAG_UNPRICED], { foundation_hand_dig_time_per_cy: 2 });
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_unpriced'));
  assert.equal(calc.itemPricing[0].available, false);
});
await ok('calcProject: free ($0) bagged row stays priceable', () => {
  const project = baseProject({ items: [baseItem({ selected_concrete_id: 'bagf' })] });
  const calc = C.calcProject(project, [BAG_FREE], { foundation_hand_dig_time_per_cy: 2, foundation_main_labor_rate: 60, foundation_pouring_cost_per_cy: 15 });
  assert.equal(calc.itemPricing[0].available, true, JSON.stringify(calc.catalogIssues));
});
await ok('calcProject: unassigned concrete blocks + delivery rides flagged supplier', () => {
  const project = baseProject({ items: [baseItem({ selected_concrete_id: '' })] });
  const calc = C.calcProject(project, [READY], { foundation_hand_dig_time_per_cy: 2 });
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_unassigned' && i.field === 'selected_concrete_id'));
  assert.equal(calc.itemPricing[0].available, false);
});
await ok('calcProject: saved snapshot retained under new classifications', () => {
  const saved = baseItem({ selected_concrete_id: 'sup2', concrete_cost: 321, item_total_cost: 999 });
  const project = baseProject({ items: [baseItem({ selected_concrete_id: 'sup2' })] });
  const savedProject = { ...project, id: project.id ?? 'p', items: [saved] };
  project.id = 'p';
  const calc = C.calcProject(project, [SUP_INACTIVE], { foundation_hand_dig_time_per_cy: 2 }, { savedProject });
  assert.equal(calc.items[0].concrete_cost, 321, 'saved concrete held');
  assert.equal(calc.items[0].item_total_cost, 999, 'saved total held');
});
await ok('calcProject: mix default flag reaches catalogIssues through assembly scan', () => {
  const project = baseProject({ project_concrete_type: '', items: [baseItem({ selected_concrete_id: 'sup1' })] });
  const calc = C.calcProject(project, [READY], { foundation_hand_dig_time_per_cy: 2 });
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_unassigned_default' && i.field === 'project_concrete_type'));
});
await ok('calcProject: fully-priced project parity — no catalog issues', () => {
  const inv = [READY, BAG, FORM, REBAR4];
  const project = baseProject({
    items: [baseItem({ selected_concrete_id: 'bag1', include_rebar: true, include_forming: true, selected_forming_id: 'fm1' })],
  });
  const calc = C.calcProject(project, inv, { foundation_hand_dig_time_per_cy: 2, foundation_main_labor_rate: 60, foundation_pouring_cost_per_cy: 15 });
  const itemIssues = calc.catalogIssues.filter(i => i.kind === 'foundation' || i.kind === 'concrete_delivery');
  assert.deepEqual(itemIssues, [], JSON.stringify(itemIssues));
});
await ok('calcProject: pillar implicit #4 default flags and blocks', () => {
  const project = baseProject({ items: [baseItem({ foundation_type: 'pillar', include_rebar: true, pillar_rebar_size: '' })] });
  const calc = C.calcProject(project, [BAG, REBAR4], { foundation_hand_dig_time_per_cy: 2 });
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_unassigned_default' && i.field === 'pillar_rebar_size'));
  assert.equal(calc.itemPricing[0].available, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
