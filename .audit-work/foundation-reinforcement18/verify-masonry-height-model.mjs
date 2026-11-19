import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(dir + "masonry-height-candidate-wallCalculator.js", "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const basis = JSON.parse(fs.readFileSync(dir + "masonry-material-valid-basis.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const innerSeed = basis.rows.find(r => r.name === "closed outline with internal brick").fixture;
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
  ["NaN", NaN], ["Infinity", Infinity], ["malformed", "9 inches"],
];
for (const [label, value] of invalid) check("outer unknown height: " + label, () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  f.project.walls[0].heightInches = value;
  f.project.walls[0].calculatedCosts = { totalBricks: 6, materialCost: 12, totalCost: 57 };
  const before = structuredClone(f);
  assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory)
    .some(i => i.field === "heightInches" && i.code === "wall_height_unavailable"));
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
    savedWalls[0].calculatedCosts);
  assert.deepEqual(f, before);
});
for (const [label, value] of invalid.filter(([label]) => !["absent", "null"].includes(label)))
  check("internal authored-invalid height: " + label, () => {
    const f = structuredClone(innerSeed), savedWalls = structuredClone(f.project.walls);
    f.project.walls[0].internalWallHeightInches = value;
    f.project.walls[0].calculatedCosts = { totalCost: 999 };
    const before = structuredClone(f);
    assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory)
      .some(i => i.field === "internalWallHeightInches" && i.code === "internal_wall_height_unavailable"));
    assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
      savedWalls[0].calculatedCosts);
    assert.deepEqual(f, before);
  });
for (const height of [9, "9", " 9 ", "9.0", "+9", "9e0", ".9e1"])
  check("valid positive height retains exact numeric basis: " + JSON.stringify(height), () => {
    const f = structuredClone(seed); f.project.walls[0].heightInches = height;
    const wall = api.calcWalls(f.project, f.inventory, f.settings)[0];
    assert.equal(wall.calculatedCosts.totalBricks, 6);
    assert.equal(wall.calculatedCosts.materialCost, 12);
    assert.equal(wall.calculatedCosts.totalCost, 57);
    assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
    assert.equal(wall.heightInches, height, "do not rewrite authored values");
  });
for (const missing of [undefined, null]) check("missing internal height retains explicit outer-height inheritance: " + missing, () => {
  const f = structuredClone(innerSeed);
  f.project.walls[0].internalWallHeightInches = missing;
  const explicit = structuredClone(f);
  explicit.project.walls[0].internalWallHeightInches = explicit.project.walls[0].heightInches;
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts,
    api.calcWalls(explicit.project, explicit.inventory, explicit.settings)[0].calculatedCosts);
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
});
check("new invalid-height row cannot borrow acknowledged costs", () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  Object.assign(f.project.walls[0], { component_id: "new-wall", heightInches: "", calculatedCosts: { totalCost: 57 } });
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts, {});
});
check("invalid height marks BOM rows as acknowledged, not current catalog pricing", () => {
  const f = structuredClone(seed); f.project.walls[0].heightInches = "";
  const rows = api.foundationWallBomRows(f.project.walls, f.inventory);
  assert.equal(rows[0].saved, true); assert.equal(rows[0].cost, 321);
  assert.ok(rows[0].material.includes("saved outer material"));
});
check("zero shop rates remain genuine zeros with a valid height", () => {
  const f = structuredClone(seed);
  Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
  const wall = api.calcWalls(f.project, f.inventory, f.settings)[0];
  assert.equal(wall.calculatedCosts.materialCost, 12);
  assert.equal(wall.calculatedCosts.laborCost, 0);
  assert.equal(wall.calculatedCosts.totalCost, 12);
});
check("disabled internal wall ignores unused invalid internal height", () => {
  const f = structuredClone(seed);
  Object.assign(f.project.walls[0], { includeInternalWall: false, internalWallHeightInches: "" });
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
  assert.equal(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts.totalCost, 57);
});
fs.writeFileSync(dir + "masonry-height-model-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(`masonry-height-model passed=${results.filter(r => r.ok).length} failed=${results.filter(r => !r.ok).length}`);
assert.ok(results.every(r => r.ok));
