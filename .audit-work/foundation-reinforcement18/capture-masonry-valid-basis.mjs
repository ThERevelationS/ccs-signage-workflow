import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const dir = ".audit-work/foundation-reinforcement18/";
const output = dir + "masonry-material-valid-basis.json";
assert.ok(!fs.existsSync(output), "Frozen basis already exists; do not recalculate it.");
const probe = JSON.parse(fs.readFileSync(dir + "masonry-pricing-baseline-probe.json", "utf8"));
const sources = JSON.parse(fs.readFileSync(dir + "wall-cap-physical-source.json", "utf8"));
const source = sources.files.find(f => f.path.endsWith("/wallCalculator.js")).content;
const { calcWalls } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const rows = [];
function capture(name, change = () => {}) {
  const fixture = structuredClone(probe.fixture);
  change(fixture);
  const before = JSON.stringify(fixture);
  const expected = calcWalls(fixture.project, fixture.inventory, fixture.settings);
  assert.equal(JSON.stringify(fixture), before, name);
  assert.ok(Number.isFinite(expected[0].calculatedCosts.totalCost), name);
  rows.push({ name, fixture, expected });
}
function internal(f, closed = true) {
  f.project.walls[0].includeInternalWall = true;
  f.project.walls[0].internalMaterialId = "synthetic-inner";
  f.project.walls[0].internalWallHeightInches = 12;
  f.project.walls[0].internalMortarGapInches = 0.375;
  f.project.walls[0].shape.closed = closed;
  f.project.walls[0].shape.segments = [{ component_id: "segment-a", length: 48 }, { component_id: "segment-b", length: 24 }];
  f.inventory.push({
    id: "synthetic-inner", material_type: "brick_stone", material_name: "Synthetic internal brick",
    wall_material_subtype: "brick",
    wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 4,
    cost_per_unit: 3,
  });
}
capture("concrete material, positive settings");
capture("genuine zero material price", f => { f.inventory[0].cost_per_unit = 0; });
capture("brick, explicit dry joint", f => { f.inventory[0].wall_material_subtype = "brick"; });
capture("brick_stone type and mortar joint", f => {
  f.inventory[0].material_type = "brick_stone";
  f.inventory[0].wall_material_subtype = "brick";
  f.project.walls[0].mortarGapInches = 0.375;
});
capture("stone units, two unequal segments", f => {
  Object.assign(f.inventory[0], { wall_material_subtype: "stone", wall_unit_length_inches: 16, wall_unit_height_inches: 8, wall_unit_width_inches: 6 });
  f.project.walls[0].heightInches = 24;
  f.project.walls[0].mortarGapInches = 0.5;
  f.project.walls[0].shape.segments.push({ component_id: "segment-b", length: 40 });
});
capture("closed outline with internal brick", f => internal(f));
capture("open outline with internal brick", f => internal(f, false));
capture("internal concrete units", f => { internal(f); f.inventory[1].wall_material_subtype = "concrete"; });
capture("outer explicit price override", f => { f.inventory[0].custom_cost_per_unit = 5; });
capture("outer explicit free override", f => { f.inventory[0].custom_cost_per_unit = 0; });
capture("internal explicit price override", f => { internal(f); f.project.walls[0].custom_internal_material_cost_per_unit = 7; });
capture("internal explicit free override", f => { internal(f); f.project.walls[0].custom_internal_material_cost_per_unit = 0; });
capture("outer explicit quantity override", f => { f.inventory[0].custom_outer_material_qty = 5; });
capture("outer explicit zero quantity", f => { f.inventory[0].custom_outer_material_qty = 0; });
capture("internal explicit quantity override", f => { internal(f); f.project.walls[0].custom_internal_material_qty = 3; });
capture("internal explicit zero quantity", f => { internal(f); f.project.walls[0].custom_internal_material_qty = 0; });
capture("fractional explicit material price", f => { f.inventory[0].cost_per_unit = 2.125; });
capture("numeric-string material price", f => { f.inventory[0].cost_per_unit = "2.125"; });
capture("numeric-string free price", f => { f.inventory[0].cost_per_unit = " 0 "; });
capture("irrelevant catalog row cannot change wall calculation", f => { f.inventory.push({ id: "unrelated-pole", material_type: "pole", cost_per_unit: null }); });
capture("zero labor setting behavior deliberately unchanged in this unit", f => { f.settings.wall_labor_rate = 0; });
capture("zero minimum setting behavior deliberately unchanged in this unit", f => { f.settings.wall_labor_rate = 1; f.settings.wall_minimum_charge = 0; });
capture("zero mortar setting behavior deliberately unchanged in this unit", f => {
  f.inventory[0].wall_material_subtype = "brick";
  f.settings.wall_labor_rate = 1; f.settings.wall_mortar_cost_per_bag = 0;
});
fs.writeFileSync(output, JSON.stringify({
  sourceHead: probe.sourceHead,
  sourceSha: createHash("sha256").update(source).digest("hex"),
  scope: "Positive/explicit-zero material legacy outputs; zero-setting repair excluded",
  rows,
}, null, 2));
console.log(`FROZEN ${rows.length} synthetic legacy material basis records; no SDK or business operations.`);
