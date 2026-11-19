import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(dir + "masonry-outline-candidate-wallCalculator.js", "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const basis = JSON.parse(fs.readFileSync(dir + "masonry-material-valid-basis.json", "utf8"));
const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
};
for (const row of basis.rows.filter(r => !r.name.startsWith("zero "))) check("unchanged: " + row.name, () => {
  const f = structuredClone(row.fixture);
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings), row.expected);
  assert.deepEqual(api.foundationWallCatalogIssues(f.project.walls, f.inventory), []);
});
const invalid = [
  ["undefined", undefined], ["null", null], ["blank", ""], ["whitespace", " "],
  ["zero", 0], ["negative", -8], ["boolean", true], ["array", []], ["record", {}],
  ["NaN", NaN], ["Infinity", Infinity], ["malformed", "8 inches"],
];
const invalidShapes = [
  ["missing", undefined], ["null", null], ["empty record", {}], ["array", []],
  ["string", "outline"], ["nonarray segments", { segments: {} }],
  ["empty segments", { segments: [] }], ["nonrecord segment", { segments: [null] }],
  ["nonfinite perimeter", { segments: [{ length: Number.MAX_VALUE }, { length: Number.MAX_VALUE }] }],
  ...invalid.map(([label, length]) => [label + " length", { closed: false, segments: [{ length }] }]),
  ["nonboolean closed", { closed: "false", segments: [{ length: 8 }] }],
  ["nonarray points", { points: {}, closed: false, segments: [{ length: 8 }] }],
  ["string coordinate", { points: [{ x: "0", z: 0 }, { x: 8, z: 0 }], closed: false, segments: [{ length: 8 }] }],
  ["invalid coordinate", { points: [{ x: NaN, z: 0 }, { x: 8, z: 0 }], closed: false, segments: [{ length: 8 }] }],
  ["points disagree", { points: [{ x: 0, z: 0 }, { x: 12, z: 0 }], closed: false, segments: [{ length: 8 }] }],
  ["missing point closure", { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }], segments: [{ length: 8 }] }],
  ["closed two-point shape", { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }], closed: true, segments: [{ length: 8 }] }],
  ["missing point segment", { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }], closed: false, segments: [{ length: 8 }] }],
];
for (const [name, shape] of invalidShapes) check("unknown outline: " + name, () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  f.project.walls[0].shape = shape;
  f.project.walls[0].calculatedCosts = { totalCost: 999 };
  const before = structuredClone(f);
  assert.ok(api.foundationWallCatalogIssues(f.project.walls, f.inventory).some(i => i.field === "shape"));
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts,
    savedWalls[0].calculatedCosts);
  assert.equal(api.foundationWallOutlineBasis(shape).shape, null);
  assert.deepEqual(f, before);
});
for (const [label, value] of invalid) for (const field of ["length", "width"])
  check(`rectangle ${field}: ${label}`, () => {
    assert.equal(api.foundationWallRectangle(field === "length" ? value : 8, field === "width" ? value : 8), null);
  });
check("canonical eight-inch rectangle uses existing financial formulas", () => {
  const shape = api.foundationWallRectangle("8", "8.0");
  assert.deepEqual(shape, {
    points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }],
    closed: true, segments: [{ length: 8 }, { length: 8 }, { length: 8 }, { length: 8 }],
  });
  const f = structuredClone(seed); f.project.walls[0].shape = shape;
  const costs = api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts;
  for (const [key, expected] of Object.entries({ totalBricks: 12, materialCost: 24, laborCost: 90, totalCost: 114, totalLinearInches: 32 }))
    assert.equal(costs[key], expected);
});
check("numeric-string segment lengths normalize only the calculation copy", () => {
  const f = structuredClone(seed);
  f.project.walls[0].shape.segments.forEach(s => { s.length = String(s.length); });
  const before = structuredClone(f), wall = api.calcWalls(f.project, f.inventory, f.settings)[0];
  assert.equal(wall.calculatedCosts.totalCost, 57);
  assert.equal(wall.calculatedCosts.totalLinearInches, 16);
  assert.equal(wall.calculatedCosts.totalBricks, 6);
  assert.deepEqual(wall.shape, before.project.walls[0].shape);
  assert.deepEqual(f, before);
});
check("negative coordinates remain valid recorded positions", () => {
  const shape = { points: [{ x: -8, z: -4 }, { x: 0, z: -4 }, { x: 8, z: -4 }],
    closed: false, segments: [{ length: 8 }, { length: 8 }] };
  assert.deepEqual(api.foundationWallOutlineBasis(shape).issues, []);
  const f = structuredClone(seed); f.project.walls[0].shape = shape;
  assert.equal(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts.totalCost, 57);
});
check("one-point draft remains drawable but not priceable", () => {
  const shape = { points: [{ x: 0, z: 0 }], closed: false, segments: [] };
  const state = api.foundationWallOutlineBasis(shape);
  assert.deepEqual(state.points, shape.points);
  assert.equal(state.shape, null); assert.equal(state.perimeterInches, null);
  assert.ok(state.issues.length > 0);
});
check("malformed points never produce partial invented preview geometry", () => {
  const state = api.foundationWallOutlineBasis({ points: [{ x: 0, z: 0 }, null], closed: false, segments: [{ length: 8 }] });
  assert.deepEqual(state.points, []); assert.equal(state.shape, null);
});
check("legacy positive segments with empty points preserve the recorded length basis", () => {
  const f = structuredClone(seed); f.project.walls[0].shape.points = [];
  const state = api.foundationWallOutlineBasis(f.project.walls[0].shape);
  assert.deepEqual(state.issues, []); assert.equal(state.hasRecordedPoints, false);
  assert.equal(state.perimeterInches, 16);
  assert.equal(api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts.totalCost, 57);
});
check("new unknown outline cannot adopt rendered cost history", () => {
  const f = structuredClone(seed), savedWalls = structuredClone(f.project.walls);
  Object.assign(f.project.walls[0], { component_id: "new-outline", shape: { segments: [] }, calculatedCosts: { totalCost: 57 } });
  assert.deepEqual(api.calcWalls(f.project, f.inventory, f.settings, { savedWalls })[0].calculatedCosts, {});
});
check("unknown outline labels saved BOM material", () => {
  const f = structuredClone(seed); f.project.walls[0].shape = { segments: [] };
  const rows = api.foundationWallBomRows(f.project.walls, f.inventory);
  assert.equal(rows[0].saved, true); assert.equal(rows[0].cost, 321);
});
check("genuinely free known outline remains zero without quantity changes", () => {
  const f = structuredClone(seed); f.inventory[0].cost_per_unit = 0;
  Object.assign(f.settings, { wall_labor_rate: 0, wall_minimum_charge: 0, wall_mortar_cost_per_bag: 0 });
  const costs = api.calcWalls(f.project, f.inventory, f.settings)[0].calculatedCosts;
  assert.equal(costs.totalBricks, 6); assert.equal(costs.totalCost, 0);
});
check("machine-precision-only point length roundoff is tolerated", () => {
  const root = Math.hypot(8, 8);
  const state = api.foundationWallOutlineBasis({ points: [{ x: 0, z: 0 }, { x: 8, z: 8 }], closed: false,
    segments: [{ length: root + Number.EPSILON * root }] });
  assert.deepEqual(state.issues, []);
});
check("rounded physical disagreement is not silently chosen over recorded points", () => {
  assert.equal(api.foundationWallOutlineBasis({ points: [{ x: 0, z: 0 }, { x: 8, z: 8 }], closed: false,
    segments: [{ length: 11.31 }] }).shape, null);
});
fs.writeFileSync(dir + "masonry-outline-model-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(`masonry-outline-model passed=${results.filter(r => r.ok).length} failed=${results.filter(r => !r.ok).length}`);
assert.ok(results.every(r => r.ok));
