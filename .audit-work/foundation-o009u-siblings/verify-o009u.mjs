// O-009u (CMP-A09 tail) sibling-emitter adoption model verification — runs the
// CANDIDATE emitters bundled with the REMOTE calc graph, and diffs every
// clean/active fixture against a REMOTE-baseline bundle of the same entry.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.resolve('.audit-work/foundation-o009u-siblings/bundle');
const remoteDir = path.resolve('.audit-work/foundation-o009u-siblings/bundle-remote');
const B = await import(pathToFileURL(path.join(dir, 'verify-bundle.mjs')));
const R = await import(pathToFileURL(path.join(remoteDir, 'verify-bundle-remote.mjs')));

let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e?.stack || e)); } };
const codes = (issues) => (issues || []).map(i => i.code).sort();
const stable = (value) => JSON.stringify(value);

// ---------- inventory fixtures ----------
const POLE_ROW = { id: 'po1', material_type: 'pole', cost_per_unit: 12, pole_width_inches: 6 };
const POLE_INACTIVE = { id: 'po2', material_type: 'pole', cost_per_unit: 12, pole_width_inches: 6, show_in_foundation: false };
const POLE_INACTIVE_ACTIVE_FLAG = { id: 'po2b', material_type: 'pole', cost_per_unit: 12, pole_width_inches: 6, is_active: false };
const POLE_DELETED = { id: 'po3', material_type: 'pole', cost_per_unit: 12, pole_width_inches: 6, deleted_at: '2026-11-05' };
const POLE_UNPRICED = { id: 'po4', material_type: 'pole', pole_width_inches: 6 };
const POLE_FREE = { id: 'po5', material_type: 'pole', cost_per_unit: 0, pole_width_inches: 6 };
const POLE_STOCK = { id: 'po6', material_type: 'pole', pole_pricing_mode: 'stock_price', pole_stock_price: 400, pole_stock_length_ft: 20, pole_width_inches: 8 };
const WALL_MAT = { id: 'wm1', material_type: 'wall_material', wall_material_subtype: 'brick', cost_per_unit: 0.8, wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25 };
const WALL_INACTIVE = { id: 'wm2', material_type: 'brick_stone', cost_per_unit: 0.8, wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, show_in_foundation: false };
const WALL_DELETED = { id: 'wm3', material_type: 'wall_material', wall_material_subtype: 'brick', cost_per_unit: 0.8, wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, status: 'deleted' };
const WALL_UNPRICED = { id: 'wm4', material_type: 'brick_stone', wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25 };
const CAP_ROW = { id: 'cap1', material_type: 'wall_cap', cap_stock_price: 60, cap_stock_length_inches: 96 };
const CAP_INACTIVE = { id: 'cap2', material_type: 'wall_cap', cap_stock_price: 60, cap_stock_length_inches: 96, archived: true };
const CAP_DELETED = { id: 'cap3', material_type: 'wall_cap', cap_stock_price: 60, cap_stock_length_inches: 96, is_deleted: true };
const CAP_UNPRICED = { id: 'cap4', material_type: 'wall_cap', cap_stock_length_inches: 96 };
const EQ_ROW = { id: 'eq1', material_type: 'excavation_equipment', cost_per_day: 100, cost_per_week: 500, pickup_delivery_cost: 75 };
const EQ_INACTIVE = { id: 'eq2', material_type: 'excavation_equipment', cost_per_day: 100, show_in_foundation: false };
const EQ_DELETED = { id: 'eq3', material_type: 'excavation_equipment', cost_per_day: 100, deleted: true };
const ATT_ROW = { id: 'att1', material_type: 'attachment', cost_per_day: 10 };
const ATT_INACTIVE = { id: 'att2', material_type: 'attachment', cost_per_day: 10, status: 'discontinued' };
const ATT_DELETED = { id: 'att3', material_type: 'attachment', cost_per_day: 10, status: 'removed' };
const SUB_ROW = { id: 'sub1', material_type: 'sub_attachment', cost_per_day: 5 };
const SUB_INACTIVE = { id: 'sub2', material_type: 'sub_attachment', cost_per_day: 5, active: false };
const SUB_DELETED = { id: 'sub3', material_type: 'sub_attachment', cost_per_day: 5, status: 'removed' };
const BAG = { id: 'bag1', material_type: 'bagged_concrete', cost_per_unit: 6.5 };

const basePole = (over = {}) => ({
  component_id: 'poleA', pole_id: 'po1', height_inches: 120, embedment_inches: 48,
  include_pole_painting: false, ...over,
});
const baseWall = (over = {}) => ({
  component_id: 'w1', materialId: 'wm1', heightInches: 48,
  shape: { segments: [{ length: 120 }] }, includeInternalWall: false, ...over,
});
const baseCap = (over = {}) => ({
  component_id: 'capA', cap_inventory_id: 'cap1', length_inches: 24, ...over,
});
const baseEntry = (over = {}) => ({
  component_id: 'eqA', equipment_id: 'eq1', rental_period: 'day', rental_duration: 3, ...over,
});
const baseProject = (over = {}) => ({
  items: [], poles: [], walls: [], wall_caps: [], selected_equipment: [],
  signage_cabinets: [], project_concrete_type: '4000_ae', ...over,
});
const SETTINGS = { foundation_hand_dig_time_per_cy: 2, foundation_main_labor_rate: 60, foundation_pouring_cost_per_cy: 15 };

// ============ POLE: lifecycle adoption ============
await ok('pole: clean active row prices (parity + no catalog issue)', () => {
  const issues = B.foundationPolePricingIssues(basePole(), [POLE_ROW], 0, {});
  assert.deepEqual(issues, []);
  const calc = B.calcPoles([basePole()], [POLE_ROW], {});
  assert.equal(calc.poles[0].pole_cost, (168 / 12) * 12); // (120+48)/12 * $12
  assert.equal(calc.poles[0].total_cost, 168);
  assert.equal(calc.polePricing[0].available, true);
});
await ok('pole: inactive row -> catalog_item_inactive + held (never $0)', () => {
  const issues = B.foundationPolePricingIssues(basePole({ pole_id: 'po2' }), [POLE_INACTIVE], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_inactive']);
  assert.equal(issues[0].field, 'pole_id');
  assert.equal(issues[0].inventoryId, 'po2');
  const calc = B.calcPoles([basePole({ pole_id: 'po2' })], [POLE_INACTIVE], {});
  assert.equal(calc.polePricing[0].available, false);
  assert.equal('pole_cost' in calc.poles[0], false, 'held pole keeps no minted cost');
});
await ok('pole: inactive via is_active:false -> catalog_item_inactive', () => {
  const issues = B.foundationPolePricingIssues(basePole({ pole_id: 'po2b' }), [POLE_INACTIVE_ACTIVE_FLAG], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_inactive']);
});
await ok('pole: tombstoned row -> catalog_item_deleted', () => {
  const issues = B.foundationPolePricingIssues(basePole({ pole_id: 'po3' }), [POLE_DELETED], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_deleted']);
});
await ok('pole: unpriced row -> existing pole_price_unavailable (parity)', () => {
  const issues = B.foundationPolePricingIssues(basePole({ pole_id: 'po4' }), [POLE_UNPRICED], 0, {});
  assert.deepEqual(codes(issues), ['pole_price_unavailable']);
});
await ok('pole: deliberate $0 row prices as free (parity)', () => {
  const calc = B.calcPoles([basePole({ pole_id: 'po5' })], [POLE_FREE], {});
  assert.equal(calc.poles[0].pole_cost, 0);
  assert.equal(calc.polePricing[0].available, true);
});
await ok('pole: stock mode inactive -> inactive flag (not price issue)', () => {
  const issues = B.foundationPolePricingIssues(basePole({ pole_id: 'po6i' }), [{ ...POLE_STOCK, id: 'po6i', disabled: true }], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_inactive']);
});
await ok('pole: stock mode active prices stock math (parity)', () => {
  const calc = B.calcPoles([basePole({ pole_id: 'po6' })], [POLE_STOCK], {});
  assert.equal(calc.poles[0].stock_pieces, 1); // 168in <= 240in
  assert.equal(calc.poles[0].pole_cost, 400);
});
await ok('pole: missing/ambiguous/wrong-type codes unchanged (parity)', () => {
  assert.deepEqual(codes(B.foundationPolePricingIssues(basePole({ pole_id: 'gone' }), [POLE_ROW], 0, {})), ['catalog_item_unavailable']);
  assert.deepEqual(codes(B.foundationPolePricingIssues(basePole({ pole_id: 'po1' }), [POLE_ROW, POLE_ROW], 0, {})), ['catalog_item_ambiguous']);
  assert.deepEqual(codes(B.foundationPolePricingIssues(basePole({ pole_id: 'wm1' }), [WALL_MAT], 0, {})), ['catalog_item_type_mismatch']);
  assert.deepEqual(codes(B.foundationPolePricingIssues(basePole({ pole_id: '' }), [POLE_ROW], 0, {})), ['catalog_item_unassigned']);
});
await ok('pole: saved snapshot retained under inactive flag', () => {
  const pole = basePole({ pole_id: 'po2' });
  const saved = { ...pole, pole_cost: 321, pole_painting_cost: 12, total_cost: 333, required_length_inches: 200 };
  const calc = B.calcPoles([pole], [POLE_INACTIVE], {}, { savedPoles: [saved] });
  assert.equal(calc.poles[0].pole_cost, 321);
  assert.equal(calc.poles[0].total_cost, 333);
  assert.equal(calc.polePricing[0].available, false);
});

// ============ WALL: lifecycle adoption ============
await ok('wall: clean active material prices (parity)', () => {
  const issues = B.foundationWallPricingIssues(baseWall(), [WALL_MAT], 0, {});
  assert.deepEqual(issues, []);
  const calc = B.calcWalls(baseProject({ walls: [baseWall()] }), [WALL_MAT], {});
  assert.equal(calc.wallPricing[0].available, true);
  assert.ok(calc.walls[0].calculatedCosts.materialCost > 0);
});
await ok('wall: inactive material -> catalog_item_inactive + held', () => {
  const issues = B.foundationWallPricingIssues(baseWall({ materialId: 'wm2' }), [WALL_INACTIVE], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_inactive']);
  assert.equal(issues[0].field, 'materialId');
  const calc = B.calcWalls(baseProject({ walls: [baseWall({ materialId: 'wm2' })] }), [WALL_INACTIVE], {});
  assert.equal(calc.wallPricing[0].available, false);
  assert.deepEqual(calc.walls[0].calculatedCosts, {});
});
await ok('wall: tombstoned material -> catalog_item_deleted', () => {
  const issues = B.foundationWallPricingIssues(baseWall({ materialId: 'wm3' }), [WALL_DELETED], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_deleted']);
});
await ok('wall: internal-wall inactive material -> internal_wall inactive flag', () => {
  const wall = baseWall({ includeInternalWall: true, internalMaterialId: 'wm2', internalWallHeightInches: 36 });
  const issues = B.foundationWallPricingIssues(wall, [WALL_MAT, WALL_INACTIVE], 0, {});
  const internal = issues.filter(i => i.kind === 'internal_wall');
  assert.equal(internal.length, 1);
  assert.equal(internal[0].code, 'catalog_item_inactive');
  assert.equal(internal[0].field, 'internalMaterialId');
});
await ok('wall: internal-wall deleted material -> internal_wall deleted flag', () => {
  const wall = baseWall({ includeInternalWall: true, internalMaterialId: 'wm3', internalWallHeightInches: 36 });
  const issues = B.foundationWallPricingIssues(wall, [WALL_MAT, WALL_DELETED], 0, {});
  assert.deepEqual(codes(issues.filter(i => i.kind === 'internal_wall')), ['catalog_item_deleted']);
});
await ok('wall: unpriced material -> existing wall_material_price_unavailable (parity)', () => {
  const issues = B.foundationWallPricingIssues(baseWall({ materialId: 'wm4' }), [WALL_UNPRICED], 0, {});
  assert.deepEqual(codes(issues), ['wall_material_price_unavailable']);
});
await ok('wall: lifecycle beats consumed basis (inactive+unpriced -> inactive only)', () => {
  const issues = B.foundationWallPricingIssues(baseWall({ materialId: 'wm2' }),
    [{ ...WALL_INACTIVE, cost_per_unit: undefined }], 0, {});
  assert.deepEqual(codes(issues), ['catalog_item_inactive']);
});
await ok('wall: missing/ambiguous/wrong-type codes unchanged (parity)', () => {
  assert.deepEqual(codes(B.foundationWallPricingIssues(baseWall({ materialId: 'gone' }), [WALL_MAT], 0, {})), ['catalog_item_unavailable']);
  assert.deepEqual(codes(B.foundationWallPricingIssues(baseWall({ materialId: 'po1' }), [POLE_ROW], 0, {})), ['catalog_item_type_mismatch']);
  assert.deepEqual(codes(B.foundationWallPricingIssues(baseWall({ materialId: '' }), [WALL_MAT], 0, {})), ['catalog_item_unassigned']);
});
await ok('wall: saved calculatedCosts retained under inactive flag', () => {
  const wall = baseWall({ materialId: 'wm2' });
  const saved = { ...wall, calculatedCosts: { materialCost: 99, totalCost: 222, totalBricks: 40 } };
  const calc = B.calcWalls(baseProject({ walls: [wall] }), [WALL_INACTIVE], {}, { savedWalls: [saved] });
  assert.equal(calc.walls[0].calculatedCosts.totalCost, 222);
  assert.equal(calc.walls[0].calculatedCosts.materialCost, 99);
  assert.equal(calc.wallPricing[0].available, false);
});

// ============ WALL CAP: lifecycle adoption ============
await ok('cap: clean active row prices full stock (parity)', () => {
  const res = B.calcWallCaps([baseCap()], [CAP_ROW], {});
  assert.equal(res.caps[0].cost, 60);
  assert.deepEqual(res.issues, []);
});
await ok('cap: inactive row -> catalog_item_inactive + held', () => {
  const res = B.calcWallCaps([baseCap({ cap_inventory_id: 'cap2' })], [CAP_INACTIVE], {});
  assert.deepEqual(codes(res.issues), ['catalog_item_inactive']);
  assert.equal(res.issues[0].kind, 'wall_cap');
  assert.equal(res.issues[0].field, 'cap_inventory_id');
  assert.equal('cost' in res.caps[0], false, 'held cap keeps no minted cost');
});
await ok('cap: tombstoned row -> catalog_item_deleted', () => {
  const res = B.calcWallCaps([baseCap({ cap_inventory_id: 'cap3' })], [CAP_DELETED], {});
  assert.deepEqual(codes(res.issues), ['catalog_item_deleted']);
});
await ok('cap: unpriced row -> existing wall_cap_stock_price_unavailable (parity)', () => {
  const res = B.calcWallCaps([baseCap({ cap_inventory_id: 'cap4' })], [CAP_UNPRICED], {});
  assert.deepEqual(codes(res.issues), ['wall_cap_stock_price_unavailable']);
});
await ok('cap: deliberate $0 stock stays free-priced (parity)', () => {
  const res = B.calcWallCaps([baseCap()], [{ ...CAP_ROW, cap_stock_price: 0 }], {});
  assert.equal(res.caps[0].cost, 0);
  assert.deepEqual(res.issues, []);
});
await ok('cap: missing/ambiguous/wrong-type codes unchanged (parity)', () => {
  assert.deepEqual(codes(B.calcWallCaps([baseCap({ cap_inventory_id: 'gone' })], [CAP_ROW], {}).issues), ['catalog_item_unavailable']);
  assert.deepEqual(codes(B.calcWallCaps([baseCap({ cap_inventory_id: 'wm1' })], [WALL_MAT], {}).issues), ['catalog_item_type_mismatch']);
  assert.deepEqual(codes(B.calcWallCaps([baseCap({ cap_inventory_id: '' })], [CAP_ROW], {}).issues), ['catalog_item_unassigned']);
});
await ok('cap: saved snapshot retained under inactive flag', () => {
  const cap = baseCap({ cap_inventory_id: 'cap2' });
  const saved = { ...cap, cost: 60, cap_name: 'Acknowledged cap', stock_length_inches: 96 };
  const res = B.calcWallCaps([cap], [CAP_INACTIVE], { savedCaps: [saved] });
  assert.equal(res.caps[0].cost, 60);
  assert.equal(res.caps[0].cap_name, 'Acknowledged cap');
});

// ============ EQUIPMENT: lifecycle adoption ============
await ok('equipment: clean active entry prices (parity)', () => {
  const res = B.calcEquipmentPricing([baseEntry()], [EQ_ROW], {});
  assert.equal(res[0].totalCost, 300); // 100/day * 3 days
  assert.deepEqual(res[0].issues, []);
});
await ok('equipment: inactive row -> catalog_item_inactive + held entry', () => {
  const bindings = B.resolveFoundationEquipment(baseEntry({ equipment_id: 'eq2' }), [EQ_INACTIVE], 0);
  assert.deepEqual(codes(bindings.issues), ['catalog_item_inactive']);
  assert.equal(bindings.issues[0].field, 'equipment_id');
  const res = B.calcEquipmentPricing([baseEntry({ equipment_id: 'eq2' })], [EQ_INACTIVE], {});
  assert.equal('equipment_cost' in res[0].pricedEntry, false);
  assert.equal(res[0].totalCost, null);
});
await ok('equipment: tombstoned row -> catalog_item_deleted', () => {
  const bindings = B.resolveFoundationEquipment(baseEntry({ equipment_id: 'eq3' }), [EQ_DELETED], 0);
  assert.deepEqual(codes(bindings.issues), ['catalog_item_deleted']);
});
await ok('equipment: normalized attachments inactive -> attachment inactive flag', () => {
  const entry = baseEntry({ attachments: [{ id: 'att2', qty: 2 }] });
  const bindings = B.resolveFoundationEquipment(entry, [EQ_ROW, ATT_INACTIVE], 0);
  const att = bindings.issues.filter(i => i.kind === 'attachment');
  assert.equal(att.length, 1);
  assert.equal(att[0].code, 'catalog_item_inactive');
  assert.equal(att[0].field, 'attachments');
  assert.equal(att[0].inventoryId, 'att2');
});
await ok('equipment: attachment_counts inactive -> attachment flag; deleted sub -> sub_attachment flag', () => {
  const entry = baseEntry({ attachment_counts: { att2: 1 }, sub_attachment_counts: { sub3: 1 } });
  const bindings = B.resolveFoundationEquipment(entry, [EQ_ROW, ATT_INACTIVE, SUB_DELETED], 0);
  assert.deepEqual(codes(bindings.issues), ['catalog_item_deleted', 'catalog_item_inactive']);
  assert.ok(bindings.issues.some(i => i.kind === 'sub_attachment' && i.code === 'catalog_item_deleted'));
});
await ok('equipment: zero-count attachment to inactive row stays unconsumed (parity)', () => {
  const entry = baseEntry({ attachment_counts: { att2: 0 }, sub_attachment_counts: { sub2: 0 } });
  const bindings = B.resolveFoundationEquipment(entry, [EQ_ROW, ATT_INACTIVE, SUB_INACTIVE], 0);
  assert.deepEqual(bindings.issues, []);
});
await ok('equipment: unassigned/missing codes unchanged (parity)', () => {
  assert.deepEqual(codes(B.resolveFoundationEquipment(baseEntry({ equipment_id: '' }), [EQ_ROW], 0).issues), ['catalog_item_unassigned']);
  assert.deepEqual(codes(B.resolveFoundationEquipment(baseEntry({ equipment_id: 'gone' }), [EQ_ROW], 0).issues), ['catalog_item_unavailable']);
});
await ok('equipment: unpriced catalog rate -> existing equipment_price_unavailable (parity)', () => {
  const res = B.calcEquipmentPricing([baseEntry()], [{ ...EQ_ROW, cost_per_day: undefined }], {});
  assert.deepEqual(codes(res[0].issues), ['equipment_price_unavailable']);
});
await ok('equipment: saved equipment_cost retained under inactive flag', () => {
  const entry = baseEntry({ equipment_id: 'eq2' });
  const saved = { ...entry, equipment_cost: 300 };
  const res = B.calcEquipmentPricing([entry], [EQ_INACTIVE], { savedEquipment: [saved] });
  assert.equal(res[0].pricedEntry.equipment_cost, 300);
  assert.equal(res[0].totalCost, 300);
});

// ============ byte-parity vs REMOTE baseline on previously-correct rows ============
const cleanInventory = [POLE_ROW, POLE_STOCK, POLE_FREE, WALL_MAT, CAP_ROW, EQ_ROW, ATT_ROW, SUB_ROW, BAG];
const cleanPoles = [basePole(), basePole({ component_id: 'p2', pole_id: 'po6' }), basePole({ component_id: 'p3', pole_id: 'po5', include_pole_painting: true })];
const cleanWalls = [
  baseWall(),
  baseWall({ component_id: 'w2', includeInternalWall: true, internalMaterialId: 'wm1', internalWallHeightInches: 36, internalMortarGapInches: 0.375 }),
];
const cleanCaps = [baseCap(), baseCap({ component_id: 'capB', length_inches: 96 })];
const cleanEquipment = [
  baseEntry(),
  baseEntry({ component_id: 'eqB', attachments: [{ id: 'att1', qty: 2 }], sub_attachment_counts: { sub1: 1 }, include_delivery: true }),
  baseEntry({ component_id: 'eqC', custom_rate: 50, custom_qty: 2 }),
];
for (const [name, fn] of [
  ['calcPoles', () => B.calcPoles(cleanPoles, cleanInventory, {})],
  ['calcWalls', () => B.calcWalls(baseProject({ walls: cleanWalls }), cleanInventory, {})],
  ['calcWallCaps', () => B.calcWallCaps(cleanCaps, cleanInventory, {})],
  ['calcEquipmentPricing', () => B.calcEquipmentPricing(cleanEquipment, cleanInventory, {})],
]) {
  await ok(`parity: ${name} output byte-identical to remote baseline`, () => {
    const cand = fn();
    const rem = name === 'calcPoles' ? R.calcPoles(cleanPoles, cleanInventory, {})
      : name === 'calcWalls' ? R.calcWalls(baseProject({ walls: cleanWalls }), cleanInventory, {})
      : name === 'calcWallCaps' ? R.calcWallCaps(cleanCaps, cleanInventory, {})
      : R.calcEquipmentPricing(cleanEquipment, cleanInventory, {});
    assert.equal(stable(cand), stable(rem), 'outputs diverge on clean fixtures');
  });
}
await ok('parity: held-path codes on missing rows byte-identical to remote', () => {
  const cand = B.foundationPolePricingIssues(basePole({ pole_id: 'gone' }), [POLE_ROW], 0, {});
  const rem = R.foundationPolePricingIssues(basePole({ pole_id: 'gone' }), [POLE_ROW], 0, {});
  assert.equal(stable(cand), stable(rem));
});
await ok('parity: fully-priced calcProject byte-identical to remote baseline', () => {
  const project = baseProject({
    items: [{
      component_id: 'it1', foundation_type: 'spread_foot', quantity: 1,
      length_inches: 48, width_inches: 48, depth_inches: 12,
      selected_concrete_id: 'bag1', include_rebar: false, include_forming: false,
      include_finishing: false, excavation_method: 'hand_dig',
    }],
    poles: cleanPoles, walls: cleanWalls, wall_caps: cleanCaps,
    selected_equipment: cleanEquipment,
  });
  const cand = B.calcProject(project, cleanInventory, SETTINGS);
  const rem = R.calcProject(project, cleanInventory, SETTINGS);
  assert.equal(stable(cand), stable(rem), 'calcProject diverges on a fully-priced project');
});

// ============ calcProject end-to-end ============
await ok('calcProject: inactive pole/wall/cap/equipment surface through catalogIssues once', () => {
  const project = baseProject({
    poles: [basePole({ pole_id: 'po2' })],
    walls: [baseWall({ materialId: 'wm2' })],
    wall_caps: [baseCap({ cap_inventory_id: 'cap2' })],
    selected_equipment: [baseEntry({ equipment_id: 'eq2' })],
  });
  const inv = [POLE_INACTIVE, WALL_INACTIVE, CAP_INACTIVE, EQ_INACTIVE, BAG];
  const calc = B.calcProject(project, inv, SETTINGS);
  const inactive = calc.catalogIssues.filter(i => i.code === 'catalog_item_inactive');
  assert.equal(inactive.length, 4, JSON.stringify(inactive.map(i => [i.kind, i.field])));
  assert.deepEqual([...new Set(inactive.map(i => i.kind))].sort(), ['equipment', 'pole', 'wall', 'wall_cap']);
  // every kind reports exactly once — assembly-scan kinds are filtered for
  // pole/wall/equipment and wall_cap reports via its single emitter channel.
  for (const kind of ['pole', 'wall', 'wall_cap', 'equipment']) {
    assert.equal(inactive.filter(i => i.kind === kind).length, 1, kind);
  }
  assert.equal(calc.polePricing[0].available, false);
  assert.equal(calc.wallPricing[0].available, false);
  assert.equal(calc.equipmentPricing[0].available, false);
  assert.equal(calc.totals.grand_total, null, 'totals withheld, never $0');
});
await ok('calcProject: saved project snapshot retained under lifecycle flags', () => {
  const pole = basePole({ pole_id: 'po2' });
  const cap = baseCap({ cap_inventory_id: 'cap2' });
  const project = baseProject({ poles: [pole], wall_caps: [cap] });
  project.id = 'p1';
  const savedProject = { ...project, poles: [{ ...pole, pole_cost: 321, total_cost: 321 }], wall_caps: [{ ...cap, cost: 60 }] };
  const calc = B.calcProject(project, [POLE_INACTIVE, CAP_INACTIVE, BAG], SETTINGS, { savedProject });
  assert.equal(calc.poles[0].pole_cost, 321);
  assert.equal(calc.wallCaps[0].cost, 60);
});
await ok('calcProject: deleted equipment row flags + equipment total withheld', () => {
  const project = baseProject({ selected_equipment: [baseEntry({ equipment_id: 'eq3' })] });
  const calc = B.calcProject(project, [EQ_DELETED], SETTINGS);
  assert.ok(calc.catalogIssues.some(i => i.code === 'catalog_item_deleted' && i.kind === 'equipment'));
  assert.equal(calc.totals.total_equipment_cost, null);
});
await ok('calcProject: assembly scan keeps its own pole lifecycle guard for other callers', () => {
  const issues = B.foundationAssemblyCatalogIssues(baseProject({ poles: [basePole({ pole_id: 'po2' })] }), [POLE_INACTIVE]);
  assert.ok(issues.some(i => i.kind === 'pole' && i.code === 'catalog_item_inactive'));
});
await ok('calcProject: wall_cap lifecycle issue arrives via the single emitter channel', () => {
  const project = baseProject({ wall_caps: [baseCap({ cap_inventory_id: 'cap2' })] });
  const calc = B.calcProject(project, [CAP_INACTIVE], SETTINGS);
  const capIssues = calc.catalogIssues.filter(i => i.kind === 'wall_cap');
  assert.equal(capIssues.length, 1);
  assert.equal(capIssues[0].code, 'catalog_item_inactive');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
