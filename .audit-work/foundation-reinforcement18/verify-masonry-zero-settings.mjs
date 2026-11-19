import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(dir + "masonry-rates-candidate-wallCalculator.js", "utf8");
const { calcWalls, foundationWallCatalogIssues } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const frozen = JSON.parse(fs.readFileSync(dir + "masonry-material-valid-basis.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
}
for (const row of frozen.rows.filter(row => !row.name.startsWith("zero "))) {
  check("unchanged: " + row.name, () => {
    const f = structuredClone(row.fixture);
    assert.deepEqual(calcWalls(f.project, f.inventory, f.settings), row.expected);
  });
}
function rectangleWithInternal(f) {
  Object.assign(f.project.walls[0], {
    includeInternalWall: true, internalMaterialId: "inner", internalWallHeightInches: 9,
    shape: { closed: true, segments: [0, 90, 180, 270].map((angle, i) => ({ component_id: "s-" + i, length: 16, angle })) },
  });
  f.inventory.push({ ...f.inventory[0], id: "inner", wall_material_subtype: "brick", cost_per_unit: 3 });
}
const cases = [
  {
    name: "numeric zero labor respects a genuine minimum of one",
    change: f => { f.settings.wall_labor_rate = 0; },
    expected: { materialCost: 12, laborCost: 1, mortarCost: 0, totalCost: 13 },
  },
  {
    name: "numeric zero minimum leaves the actual one-dollar labor charge",
    change: f => { f.settings.wall_labor_rate = 1; f.settings.wall_minimum_charge = 0; },
    expected: { materialCost: 12, laborCost: 1, totalCost: 13 },
  },
  {
    name: "numeric zero mortar rate does not substitute ten dollars",
    change: f => {
      f.inventory[0].wall_material_subtype = "brick";
      f.settings.wall_labor_rate = 1; f.settings.wall_mortar_cost_per_bag = 0;
    },
    expected: { materialCost: 12, laborCost: 1, mortarCost: 0, totalCost: 13 },
  },
  {
    name: "numeric zero labor and minimum leave only concrete wall materials",
    change: f => { f.settings.wall_labor_rate = 0; f.settings.wall_minimum_charge = 0; },
    expected: { materialCost: 12, laborCost: 0, mortarCost: 0, totalCost: 12 },
  },
  {
    name: "all numeric zero shop rates retain the brick material charge",
    change: f => {
      f.inventory[0].wall_material_subtype = "brick";
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { materialCost: 12, laborCost: 0, mortarCost: 0, totalCost: 12 },
  },
  {
    name: "free material and all zero shop rates produce a genuine zero total",
    change: f => {
      f.inventory[0].wall_material_subtype = "brick"; f.inventory[0].cost_per_unit = 0;
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { totalBricks: 6, materialCost: 0, laborCost: 0, mortarCost: 0, totalCost: 0 },
  },
  {
    name: "internal wall uses the same explicit zero labor and mortar settings",
    change: f => {
      rectangleWithInternal(f);
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: {
      totalBricks: 24, materialCost: 48, laborCost: 0, mortarCost: 0,
      internalTotalBricks: 12, internalMaterialCost: 36, internalLaborCost: 0, internalMortarCost: 0, totalCost: 84,
    },
  },
  {
    name: "internal zero mortar preserves positive actual labor quantities",
    change: f => {
      rectangleWithInternal(f);
      Object.assign(f.settings, { wall_labor_rate: 1, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { materialCost: 48, laborCost: 4, internalMaterialCost: 36, internalLaborCost: 2, internalMortarCost: 0, totalCost: 90 },
  },
  {
    name: "numeric-string zero behavior remains unchanged",
    change: f => {
      f.inventory[0].cost_per_unit = 0; f.inventory[0].wall_material_subtype = "brick";
      Object.assign(f.settings, { wall_labor_rate: "0", wall_minimum_charge: "0", wall_mortar_cost_per_bag: "0" });
    },
    expected: { materialCost: 0, laborCost: 0, mortarCost: 0, totalCost: 0 },
  },
  {
    name: "missing shop settings retain the existing documented defaults",
    change: f => { f.settings = {}; },
    expected: { materialCost: 12, laborCost: 150, mortarCost: 0, totalCost: 162 },
  },
  {
    name: "missing brick shop settings retain the existing defaults",
    change: f => { f.settings = {}; f.inventory[0].wall_material_subtype = "brick"; },
    expected: { materialCost: 12, laborCost: 150, mortarCost: 10, totalCost: 172 },
  },
  {
    name: "outer labor override still wins over a zero shop labor rate",
    change: f => {
      f.inventory[0].custom_outer_labor_rate = 7;
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0 });
    },
    expected: { materialCost: 12, laborCost: 7, totalCost: 19 },
  },
  {
    name: "outer mortar override still wins over a zero shop mortar rate",
    change: f => {
      f.inventory[0].wall_material_subtype = "brick"; f.inventory[0].custom_outer_mortar_rate = 4;
      Object.assign(f.settings, { wall_labor_rate: 1, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { materialCost: 12, laborCost: 1, mortarCost: 4, totalCost: 17 },
  },
  {
    name: "internal labor override retains its own basis with zero shop rates",
    change: f => {
      rectangleWithInternal(f); f.project.walls[0].custom_internal_labor_rate = 3;
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { materialCost: 48, laborCost: 0, internalMaterialCost: 36, internalLaborCost: 6, internalMortarCost: 0, totalCost: 90 },
  },
  {
    name: "internal mortar override retains its own basis with zero shop rates",
    change: f => {
      rectangleWithInternal(f); f.project.walls[0].custom_internal_mortar_rate = 5;
      Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
    },
    expected: { materialCost: 48, laborCost: 0, internalMaterialCost: 36, internalLaborCost: 0, internalMortarCost: 5, totalCost: 89 },
  },
];
for (const c of cases) check(c.name, () => {
  const fixture = structuredClone(seed);
  c.change(fixture);
  const before = structuredClone(fixture);
  const wall = calcWalls(fixture.project, fixture.inventory, fixture.settings)[0];
  for (const [key, expected] of Object.entries(c.expected))
    assert.equal(wall.calculatedCosts[key], expected, c.name + " / " + key);
  assert.deepEqual(foundationWallCatalogIssues(fixture.project.walls, fixture.inventory), []);
  assert.deepEqual(fixture, before, "inputs must stay unchanged");
});
check("unavailable material still holds the acknowledged snapshot with zero shop rates", () => {
  const f = structuredClone(seed); delete f.inventory[0].cost_per_unit;
  Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
  const savedWalls = structuredClone(f.project.walls);
  f.project.walls[0].calculatedCosts = { materialCost: 0, totalCost: 0 };
  assert.deepEqual(calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts, savedWalls[0].calculatedCosts);
});
fs.writeFileSync(dir + "masonry-rates-model-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(`masonry-zero-settings passed=${results.filter(r => r.ok).length} failed=${results.filter(r => !r.ok).length}`);
assert.ok(results.every(r => r.ok));
