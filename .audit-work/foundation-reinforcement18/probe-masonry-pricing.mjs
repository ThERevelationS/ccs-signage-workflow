import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const dir = ".audit-work/foundation-reinforcement18/";
const sources = JSON.parse(fs.readFileSync(dir + "wall-cap-physical-source.json", "utf8"));
const wallSource = sources.files.find(f => f.path.endsWith("/wallCalculator.js")).content;
const scope = JSON.parse(fs.readFileSync(dir + "wall-cap-geometry-sandbox-final-scope.json", "utf8"));
const catalogSource = scope.files.find(f => f.path.endsWith("/foundationCatalogIntegrity.js")).normalized;
const load = source => import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const { calcWalls } = await load(wallSource);
// The fixture has no equipment, caps, or foundation items. Keep this probe
// confined to the actual wall branch, not a claim about page persistence.
const emptyDependencies = `
function foundationEquipmentCatalogIssues(rows) {
  if (rows.length) throw Error("Out-of-scope equipment fixture"); return [];
}
function foundationWallCapCatalogIssues(rows) {
  if (rows.length) throw Error("Out-of-scope cap fixture"); return [];
}
`;
const { foundationAssemblyCatalogIssues } = await load(
  emptyDependencies + catalogSource.replace(/^import .*\r?\n/gm, "")
);
const seed = {
  project: {
    id: "synthetic-masonry-project",
    items: [], poles: [], wall_caps: [], selected_equipment: [],
    walls: [{
      component_id: "synthetic-wall",
      materialId: "synthetic-wall-material",
      heightInches: 9, mortarGapInches: 0, includeInternalWall: false,
      shape: { closed: false, segments: [{ component_id: "synthetic-segment", length: 16 }] },
      calculatedCosts: {
        totalBricks: 6, materialCost: 321, mortarCost: 17, laborCost: 70, totalCost: 408,
      },
    }],
  },
  inventory: [{
    id: "synthetic-wall-material", material_type: "wall_material", material_name: "Synthetic wall units",
    wall_material_subtype: "concrete",
    wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 4,
    cost_per_unit: 2,
  }],
  settings: { wall_labor_rate: 45, wall_minimum_charge: 1, wall_mortar_cost_per_bag: 10 },
};
const cases = [
  { name: "valid legacy baseline", material: 12, total: 57 },
  { name: "missing price", change: f => { delete f.inventory[0].cost_per_unit; }, material: 0, total: 45 },
  { name: "explicit zero price", change: f => { f.inventory[0].cost_per_unit = 0; }, material: 0, total: 45 },
  { name: "explicit zero labor rate", change: f => { f.settings.wall_labor_rate = 0; }, material: 12, total: 57 },
  { name: "explicit zero minimum", change: f => {
    f.settings.wall_labor_rate = 1; f.settings.wall_minimum_charge = 0;
  }, material: 12, total: 162 },
  { name: "explicit zero mortar rate", change: f => {
    f.inventory[0].wall_material_subtype = "brick";
    f.settings.wall_labor_rate = 1; f.settings.wall_mortar_cost_per_bag = 0;
  }, material: 12, total: 23 },
];
const results = [];
for (const c of cases) {
  const fixture = structuredClone(seed);
  c.change?.(fixture);
  const before = JSON.stringify(fixture);
  const walls = calcWalls(fixture.project, fixture.inventory, fixture.settings);
  const issues = foundationAssemblyCatalogIssues(fixture.project, fixture.inventory);
  assert.equal(JSON.stringify(fixture), before, c.name + " must not mutate inputs");
  assert.equal(walls[0].calculatedCosts.materialCost, c.material, c.name);
  assert.equal(walls[0].calculatedCosts.totalCost, c.total, c.name);
  assert.deepEqual(issues, [], c.name + " current wall guard only checks inventory identity");
  results.push({
    name: c.name, ok: true, actual: walls[0].calculatedCosts, issues,
    acknowledgedMaterialCost: fixture.project.walls[0].calculatedCosts.materialCost,
    acknowledgedTotal: fixture.project.walls[0].calculatedCosts.totalCost,
    sourceUnchanged: true,
  });
}
fs.writeFileSync(dir + "masonry-pricing-baseline-probe.json", JSON.stringify({
  sourceHead: scope.head,
  wallSourceSha: createHash("sha256").update(wallSource).digest("hex"),
  syntheticOnly: true, sdkCalls: 0, pageSaveVerified: false,
  fixture: seed,
  catalogProbeScope: "Actual wall branch; empty other-assembly dependency stubs",
  results,
}, null, 2));
for (const r of results) console.log(`${r.name}: material=${r.actual.materialCost} total=${r.actual.totalCost} issues=${r.issues.length}`);
console.log("FROZEN 6 baseline cases; no app, SDK, storage, business-record, or AI operations.");
