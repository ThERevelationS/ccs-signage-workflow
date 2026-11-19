import assert from "node:assert/strict";
import fs from "node:fs";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(dir + "masonry-material-candidate-wallCalculator.js", "utf8");
const { foundationWallBomRows, calcWalls } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const { fixture: seed } = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8"));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
}
const f = () => structuredClone(seed);
const rows = x => foundationWallBomRows(x.project.walls, x.inventory);
check("current valid row retains original caption, quantity, and numeric price", () => {
  const x = f(); x.project.walls = calcWalls(x.project, x.inventory, x.settings);
  assert.deepEqual(rows(x), [{ material: "Wall 1 — Synthetic wall units", quantity: "6 units", cost: 12, saved: false }]);
});
check("current free material row remains present", () => {
  const x = f(); x.inventory[0].cost_per_unit = 0;
  x.project.walls = calcWalls(x.project, x.inventory, x.settings);
  assert.deepEqual(rows(x), [{ material: "Wall 1 — Synthetic wall units", quantity: "6 units", cost: 0, saved: false }]);
});
check("held history cannot claim the replacement catalog material name", () => {
  const x = f(); x.inventory[0].cost_per_unit = null; x.inventory[0].material_name = "Replacement not acknowledged";
  assert.deepEqual(rows(x), [
    { material: "Wall 1 — saved outer material", quantity: "6 units", cost: 321, saved: true },
    { material: "Wall 1 — saved mortar", quantity: "—", cost: 17, saved: true },
  ]);
});
check("new unavailable row remains visible with unknown quantity and amount", () => {
  const x = f(); x.inventory[0].cost_per_unit = null; x.project.walls[0].calculatedCosts = {};
  assert.deepEqual(rows(x), [{ material: "Wall 1 — saved outer material", quantity: "Not saved", cost: "Not saved", saved: true }]);
});
check("missing saved price cannot be displayed as free", () => {
  const x = f(); delete x.inventory[0].cost_per_unit;
  x.project.walls[0].calculatedCosts = { totalBricks: 6 };
  assert.deepEqual(rows(x), [{ material: "Wall 1 — saved outer material", quantity: "6 units", cost: "Not saved", saved: true }]);
});
check("unknown internal history remains visible when currently selected", () => {
  const x = f(); delete x.inventory[0].cost_per_unit;
  Object.assign(x.project.walls[0], { includeInternalWall: true, internalMaterialId: "unavailable", calculatedCosts: {} });
  assert.deepEqual(rows(x), [
    { material: "Wall 1 — saved outer material", quantity: "Not saved", cost: "Not saved", saved: true },
    { material: "Wall 1 — saved internal material", quantity: "Not saved", cost: "Not saved", saved: true },
  ]);
});
check("saved internal quantities are not omitted just because the draft disables them", () => {
  const x = f(); delete x.inventory[0].cost_per_unit;
  x.project.walls[0].calculatedCosts = { totalBricks: 6, materialCost: 321, internalTotalBricks: 3, internalMaterialCost: 9 };
  assert.equal(rows(x)[1].material, "Wall 1 — saved internal material");
  assert.equal(rows(x)[1].cost, 9);
});
check("saved numeric zero remains a numeric zero", () => {
  const x = f(); delete x.inventory[0].cost_per_unit;
  x.project.walls[0].calculatedCosts = { totalBricks: 6, materialCost: 0 };
  assert.equal(rows(x)[0].cost, 0);
});
check("empty wall set remains empty", () => assert.deepEqual(foundationWallBomRows([], []), []));
fs.writeFileSync(dir + "masonry-material-bom-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? "\n" + r.error : ""}`);
assert.ok(results.every(r => r.ok));
