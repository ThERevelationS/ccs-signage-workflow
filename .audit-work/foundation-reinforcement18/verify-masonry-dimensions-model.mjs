import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(dir + "masonry-dimensions-candidate-wallCalculator.js", "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const basis = JSON.parse(fs.readFileSync(dir + "masonry-material-valid-basis.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const innerSeed = basis.rows.find(r => r.name === "closed outline with internal brick").fixture;
const keys = ["wall_unit_length_inches", "wall_unit_width_inches", "wall_unit_height_inches"];
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
}
for (const row of basis.rows.filter(row => !row.name.startsWith("zero "))) check("unchanged: " + row.name, () => {
  const f = structuredClone(row.fixture);
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings), row.expected);
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
});
const invalid = [
  ["absent", undefined], ["null", null], ["empty", ""], ["whitespace", " "],
  ["zero", 0], ["zero string", "0"], ["negative", -1], ["negative string", "-1"],
  ["true", true], ["false", false], ["array", []], ["object", {}],
  ["NaN", NaN], ["Infinity", Infinity], ["malformed", "8 inches"],
];
for (const internal of [false, true]) for (const key of keys) for (const [label, value] of invalid)
  check(`${internal ? "internal" : "outer"} unknown ${key}: ${label}`, () => {
    const f = structuredClone(internal ? innerSeed : seed);
    const savedWalls = structuredClone(f.project.walls);
    const field = internal ? "internalMaterialId" : "materialId";
    const material = f.inventory.find(m => m.id === f.project.walls[0][field]);
    material[key] = value;
    f.project.walls[0].calculatedCosts = { totalCost: 999, materialCost: 12 };
    const before = structuredClone(f);
    assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory)
      .some(i => i.field === field && i.code === key + "_unavailable"));
    assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
      savedWalls[0].calculatedCosts);
    assert.deepEqual(f, before);
  });
for (const internal of [false, true]) for (const format of ["decimal", "fractional", "exponent"])
  check(`${internal ? "internal" : "outer"} numeric-string unit dimensions: ${format}`, () => {
    const f = structuredClone(internal ? innerSeed : seed), numeric = structuredClone(f);
    const field = internal ? "internalMaterialId" : "materialId";
    const material = f.inventory.find(m => m.id === f.project.walls[0][field]);
    for (const key of keys) {
      const value = material[key];
      material[key] = format === "decimal" ? String(value)
        : format === "fractional" ? Number(value).toFixed(3) : value + "e0";
    }
    const before = structuredClone(f);
    assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
    assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts,
      api.calcWalls(numeric.project, numeric.inventory, numeric.settings)[0].calculatedCosts);
    assert.deepEqual(f, before);
  });
check("new invalid-dimension row cannot adopt rendered price history", () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  f.inventory[0].wall_unit_length_inches = "";
  Object.assign(f.project.walls[0], { component_id: "new-dimension-wall", calculatedCosts: { totalCost: 57 } });
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts, {});
});
check("dimension diagnostics have distinct keys for three missing measures", () => {
  const f = structuredClone(seed);
  for (const key of keys) delete f.inventory[0][key];
  const issues = api.foundationWallCatalogIssues(f.project.walls, f.inventory);
  assert.equal(issues.length, 3);
  assert.equal(new Set(issues.map(i => i.field + "-" + i.code)).size, 3);
});
check("invalid dimensions mark BOM material as acknowledged rather than current", () => {
  const f = structuredClone(seed); f.inventory[0].wall_unit_height_inches = null;
  const rows = api.foundationWallBomRows(f.project.walls, f.inventory);
  assert.equal(rows[0].saved, true); assert.equal(rows[0].cost, 321);
  assert.ok(rows[0].material.includes("saved outer material"));
});
check("an irrelevant catalog record cannot invalidate selected dimensions", () => {
  const f = structuredClone(seed);
  f.inventory.push({ id: "unrelated", material_type: "wall_material", cost_per_unit: 0 });
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
  assert.equal(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts.totalCost, 57);
});
check("disabled internal material does not require unused dimensions", () => {
  const f = structuredClone(seed);
  Object.assign(f.project.walls[0], { includeInternalWall: false, internalMaterialId: "unused-internal" });
  f.inventory.push({ id: "unused-internal", material_type: "wall_material", cost_per_unit: 0 });
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
  assert.equal(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts.totalCost, 57);
});
check("valid dimensions with genuine zero unit price and zero shop rates remain free", () => {
  const f = structuredClone(seed); f.inventory[0].cost_per_unit = 0;
  Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
  const wall = api.calcWalls(f.project, f.inventory, f.settings)[0];
  assert.equal(wall.calculatedCosts.totalBricks, 6);
  assert.equal(wall.calculatedCosts.materialCost, 0);
  assert.equal(wall.calculatedCosts.totalCost, 0);
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
});
check("a zero price cannot validate missing physical dimensions", () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  Object.assign(f.inventory[0], { cost_per_unit: 0, wall_unit_length_inches: "" });
  assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory).length > 0);
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
    savedWalls[0].calculatedCosts);
});
for (const height of ["", 0]) check("existing invalid-height guard remains active: " + JSON.stringify(height), () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  f.project.walls[0].heightInches = height;
  assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory)
    .some(i => i.code === "wall_height_unavailable"));
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
    savedWalls[0].calculatedCosts);
});
fs.writeFileSync(dir + "masonry-dimensions-model-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(`masonry-dimensions-model passed=${results.filter(r => r.ok).length} failed=${results.filter(r => !r.ok).length}`);
assert.ok(results.every(r => r.ok));
