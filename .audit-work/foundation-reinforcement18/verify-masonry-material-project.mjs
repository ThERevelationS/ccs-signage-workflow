import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMasonryFixtureModule } from "./masonry-fixture-bundle.mjs";

const dir = ".audit-work/foundation-reinforcement18/";
const seed = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8")).fixture;
const build = await loadMasonryFixtureModule();
const { calcProject } = build.api;
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
}
function fixture() {
  const f = structuredClone(seed);
  f.savedProject = structuredClone(f.project);
  f.project.walls[0].calculatedCosts = { totalBricks: 6, materialCost: 12, totalCost: 57 };
  return f;
}
const calculate = f => calcProject(f.project, f.inventory, f.settings, { savedProject: f.savedProject });
const unavailable = f => { delete f.inventory[0].cost_per_unit; return f; };
function unknownTotals(value) {
  assert.equal(value.totals.total_wall_cost, null);
  assert.equal(value.totals.total_brick_cost, null);
  assert.equal(value.totals.grand_total, null);
}
check("valid current wall and project totals remain exact", () => {
  const r = calculate(fixture());
  assert.equal(r.totals.total_wall_cost, 57);
  assert.equal(r.totals.total_brick_cost, 12);
  assert.equal(r.totals.total_fill_cost, 0);
  assert.equal(r.totals.grand_total, 57);
  assert.deepEqual(r.catalogIssues, []);
});
check("empty walls have genuine zero totals", () => {
  const f = fixture(); f.project.walls = [];
  const r = calculate(f);
  assert.equal(r.totals.total_wall_cost, 0);
  assert.equal(r.totals.total_brick_cost, 0);
  assert.equal(r.totals.total_fill_cost, 0);
  assert.equal(r.totals.grand_total, 0);
});
check("unknown material rate holds acknowledged 408, not rendered 57", () => {
  const f = unavailable(fixture()), before = structuredClone(f), r = calculate(f);
  assert.deepEqual(r.walls[0].calculatedCosts, f.savedProject.walls[0].calculatedCosts);
  assert.equal(r.totals.total_wall_cost, 408);
  assert.equal(r.totals.total_brick_cost, 321);
  assert.equal(r.totals.total_fill_cost, null);
  assert.equal(r.totals.grand_total, 408);
  assert.ok(r.catalogIssues.some(i => i.kind === "wall" && i.code === "wall_material_price_unavailable"));
  assert.deepEqual(f, before);
});
check("new row cannot manufacture zero totals from a preview", () => {
  const f = unavailable(fixture()); f.savedProject.walls = [];
  unknownTotals(calculate(f));
});
check("different source project cannot supply wall history", () => {
  const f = unavailable(fixture()); f.savedProject.id = "different-source";
  unknownTotals(calculate(f));
});
check("new component cannot borrow the removed wall amount", () => {
  const f = unavailable(fixture()); f.project.walls[0].component_id = "replacement";
  unknownTotals(calculate(f));
});
check("ambiguous current component identity remains unknown", () => {
  const f = unavailable(fixture()); f.project.walls.push(structuredClone(f.project.walls[0]));
  unknownTotals(calculate(f));
});
check("ambiguous saved component identity remains unknown", () => {
  const f = unavailable(fixture()); f.savedProject.walls.push(structuredClone(f.savedProject.walls[0]));
  unknownTotals(calculate(f));
});
check("known section total does not invent a missing material breakdown", () => {
  const f = unavailable(fixture()); delete f.savedProject.walls[0].calculatedCosts.materialCost;
  const r = calculate(f);
  assert.equal(r.totals.total_wall_cost, 408);
  assert.equal(r.totals.total_brick_cost, null);
  assert.equal(r.totals.grand_total, 408);
});
check("missing section total does not invent one from partial components", () => {
  const f = unavailable(fixture()); delete f.savedProject.walls[0].calculatedCosts.totalCost;
  const r = calculate(f);
  assert.equal(r.totals.total_wall_cost, null);
  assert.equal(r.totals.total_brick_cost, 321);
  assert.equal(r.totals.grand_total, null);
});
check("genuine zero price remains current and save-gate eligible", () => {
  const f = fixture(); f.inventory[0].cost_per_unit = 0;
  const r = calculate(f);
  assert.equal(r.walls[0].calculatedCosts.materialCost, 0);
  assert.equal(r.totals.total_brick_cost, 0);
  assert.equal(r.totals.total_wall_cost, 45);
  assert.equal(r.totals.grand_total, 45);
  assert.deepEqual(r.catalogIssues, []);
});
check("internal missing price uses the complete acknowledged basis", () => {
  const f = fixture();
  Object.assign(f.project.walls[0], { includeInternalWall: true, internalMaterialId: "inner" });
  f.inventory.push({ ...f.inventory[0], id: "inner", cost_per_unit: null });
  const r = calculate(f);
  assert.equal(r.totals.total_wall_cost, 408);
  assert.ok(r.catalogIssues.some(i => i.kind === "internal_wall"));
});
check("one unknown wall prevents a partially known total from appearing complete", () => {
  const f = fixture();
  f.project.walls.push({ ...structuredClone(f.project.walls[0]), component_id: "new", materialId: "unpriced" });
  f.inventory.push({ ...f.inventory[0], id: "unpriced", cost_per_unit: null });
  unknownTotals(calculate(f));
});
check("aggregate overflow is unknown rather than infinity", () => {
  const f = unavailable(fixture());
  f.savedProject.walls[0].calculatedCosts.totalCost = 1e308;
  f.savedProject.walls[0].calculatedCosts.materialCost = 1e308;
  const second = { ...structuredClone(f.savedProject.walls[0]), component_id: "second" };
  f.savedProject.walls.push(second); f.project.walls.push(structuredClone(second));
  unknownTotals(calculate(f));
});
fs.writeFileSync(dir + "masonry-material-project-verification.json", JSON.stringify({ results, loaded: build.loaded }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? "\n" + r.error : ""}`);
console.log(`${results.filter(r => r.ok).length}/${results.length} project cases; ${Object.keys(build.loaded).length} frozen source modules; zero SDK/business operations.`);
assert.ok(results.every(r => r.ok), "masonry project financial checks failed");
