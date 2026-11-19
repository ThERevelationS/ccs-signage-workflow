import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const basis = JSON.parse(fs.readFileSync(dir + "masonry-material-valid-basis.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const source = fs.readFileSync(dir + "masonry-material-candidate-wallCalculator.js", "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
}
function fixture() {
  const f = structuredClone(seed);
  f.savedWalls = structuredClone(f.project.walls);
  f.project.walls[0].calculatedCosts = {
    totalBricks: 6, materialCost: 12, mortarCost: 0, laborCost: 45, totalCost: 57,
  };
  return f;
}
const calculate = f => api.calcWalls(f.project, f.inventory, f.settings, { savedWalls: f.savedWalls });
const issues = f => api.foundationWallCatalogIssues(f.project.walls, f.inventory);
function missing(f) { delete f.inventory[0].cost_per_unit; return f; }
for (const row of basis.rows) check("legacy: " + row.name, () => {
  const f = structuredClone(row.fixture), before = JSON.stringify(f);
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls: seed.project.walls }), row.expected);
  assert.equal(JSON.stringify(f), before);
});
check("all frozen valid material cases remain available", () => {
  for (const row of basis.rows) assert.deepEqual(issues(structuredClone(row.fixture)), [], row.name);
});
check("per-row pricing diagnostic preserves its actual index and component identity", () => {
  const f = missing(fixture()), row = api.foundationWallPricingIssues(f.project.walls[0], f.inventory, 3)[0];
  assert.equal(row.index, 3);
  assert.equal(row.componentId, "synthetic-wall");
  assert.match(row.message, /^Wall 4:/);
});
const invalid = [
  ["absent", undefined], ["null", null], ["empty", ""], ["whitespace", " "],
  ["malformed", "2x"], ["true", true], ["false", false], ["array", []], ["object", {}],
  ["NaN", NaN], ["Infinity", Infinity], ["negative", -1], ["negative string", "-2"],
];
for (const [label, value] of invalid) check("unknown price: " + label, () => {
  const f = fixture(); f.inventory[0].cost_per_unit = value;
  assert.deepEqual(calculate(f)[0].calculatedCosts, f.savedWalls[0].calculatedCosts);
  assert.ok(issues(f).some(i => i.kind === "wall" && i.index === 0 && i.code === "wall_material_price_unavailable"));
});
check("missing price cannot mutate source or acknowledged history", () => {
  const f = missing(fixture()), before = structuredClone(f);
  calculate(f); issues(f);
  assert.deepEqual(f, before);
});
check("base price zero is current, not held history", () => {
  const f = fixture(); f.inventory[0].cost_per_unit = 0;
  assert.equal(calculate(f)[0].calculatedCosts.materialCost, 0);
  assert.equal(calculate(f)[0].calculatedCosts.totalCost, 45);
  assert.deepEqual(issues(f), []);
});
check("outer override zero is sufficient even without base price", () => {
  const f = missing(fixture()); f.inventory[0].custom_cost_per_unit = 0;
  assert.equal(calculate(f)[0].calculatedCosts.materialCost, 0);
  assert.deepEqual(issues(f), []);
});
check("explicit invalid outer override cannot borrow valid base price", () => {
  const f = fixture(); f.inventory[0].custom_cost_per_unit = "";
  assert.deepEqual(calculate(f)[0].calculatedCosts, f.savedWalls[0].calculatedCosts);
  assert.ok(issues(f).some(i => i.code === "wall_material_price_unavailable"));
});
check("null override keeps legacy base-price precedence", () => {
  const f = fixture(); f.inventory[0].custom_cost_per_unit = null;
  assert.equal(calculate(f)[0].calculatedCosts.materialCost, 12);
  assert.deepEqual(issues(f), []);
});
for (const [label, alter, code] of [
  ["unassigned", f => { f.project.walls[0].materialId = ""; }, "catalog_item_unassigned"],
  ["deleted", f => { f.inventory = []; }, "catalog_item_unavailable"],
  ["ambiguous", f => { f.inventory.push(structuredClone(f.inventory[0])); }, "catalog_item_ambiguous"],
  ["wrong type", f => { f.inventory[0].material_type = "pole"; }, "catalog_item_type_mismatch"],
]) check("catalog " + label + " holds one acknowledged vector", () => {
  const f = fixture(); alter(f);
  assert.deepEqual(calculate(f)[0].calculatedCosts, f.savedWalls[0].calculatedCosts);
  assert.ok(issues(f).some(i => i.code === code));
});
function withInner(f) {
  Object.assign(f.project.walls[0], { includeInternalWall: true, internalMaterialId: "inner", internalWallHeightInches: 12 });
  f.inventory.push({ ...f.inventory[0], id: "inner", cost_per_unit: 3 });
  return f;
}
check("missing inner price cannot mix new outer and old inner amounts", () => {
  const f = withInner(fixture()); delete f.inventory[1].cost_per_unit;
  assert.deepEqual(calculate(f)[0].calculatedCosts, f.savedWalls[0].calculatedCosts);
  assert.ok(issues(f).some(i => i.kind === "internal_wall" && i.field === "internalMaterialId"));
});
check("wall-owned internal zero override survives absent catalog rate", () => {
  const f = withInner(fixture()); delete f.inventory[1].cost_per_unit;
  f.project.walls[0].custom_internal_material_cost_per_unit = 0;
  assert.equal(calculate(f)[0].calculatedCosts.internalMaterialCost, 0);
  assert.deepEqual(issues(f), []);
});
check("invalid wall-owned internal override cannot borrow catalog rate", () => {
  const f = withInner(fixture()); f.project.walls[0].custom_internal_material_cost_per_unit = "bad";
  assert.deepEqual(calculate(f)[0].calculatedCosts, f.savedWalls[0].calculatedCosts);
  assert.ok(issues(f).some(i => i.kind === "internal_wall"));
});
for (const [label, alter] of [
  ["new identity", f => { f.project.walls[0].component_id = "new"; }],
  ["missing identity", f => { delete f.project.walls[0].component_id; }],
  ["duplicate current identity", f => { f.project.walls.push(structuredClone(f.project.walls[0])); }],
  ["duplicate saved identity", f => { f.savedWalls.push(structuredClone(f.savedWalls[0])); }],
  ["no saved row", f => { f.savedWalls = []; }],
  ["explicit null saved rows", f => { f.savedWalls = null; }],
]) check("unmatched history remains unknown: " + label, () => {
  const f = missing(fixture()); alter(f);
  for (const w of calculate(f)) assert.deepEqual(w.calculatedCosts, {});
});
check("missing acknowledged cost field cannot inherit a draft preview", () => {
  const f = missing(fixture()); delete f.savedWalls[0].calculatedCosts.materialCost;
  const c = calculate(f)[0].calculatedCosts;
  assert.equal(Object.hasOwn(c, "materialCost"), false);
  assert.equal(c.totalCost, 408);
});
check("acknowledged genuine zero is not discarded", () => {
  const f = missing(fixture()); f.savedWalls[0].calculatedCosts.materialCost = 0;
  assert.equal(calculate(f)[0].calculatedCosts.materialCost, 0);
});
check("saved identity matching is independent of row order", () => {
  const f = missing(fixture());
  f.savedWalls.unshift({ component_id: "other", calculatedCosts: { totalCost: 999 } });
  assert.equal(calculate(f)[0].calculatedCosts.totalCost, 408);
});
check("legacy standalone caller retains its own snapshot when option omitted", () => {
  const f = missing(fixture());
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts, f.project.walls[0].calculatedCosts);
});
fs.writeFileSync(dir + "masonry-material-model-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(`${results.filter(r => r.ok).length}/${results.length} material model cases`);
assert.ok(results.every(r => r.ok), "masonry material model checks failed");
