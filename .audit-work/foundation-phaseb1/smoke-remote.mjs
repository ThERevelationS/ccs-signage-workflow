import { calcItem, calcProject } from "/tmp/phaseb1-calc.bundle.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const { item, project } = JSON.parse(readFileSync("node_modules/.phaseb1-smoke/fixture.json", "utf8"));
const clone = v => JSON.parse(JSON.stringify(v));
const near = (a, e) => assert.ok(typeof a === "number" && Math.abs(a - e) < 1e-6, a + " != " + e);

// 1) minimal legacy project - must not throw; legacy item prices via ported formula
const legacyItem = clone(item);
delete legacyItem.reinforcement_calculation_version;
delete legacyItem.reinforcement_design;
delete legacyItem.reinforcement_material;
delete legacyItem.reinforcement_cost_snapshot;
Object.assign(legacyItem, { rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1 });
const legacyCost = calcItem(legacyItem, clone(project), [], {}, clone(legacyItem));
near(legacyCost.rebar_feet, 64); near(legacyCost.rebar_cost, 252.8);
assert.ok(Number.isFinite(legacyCost.item_total_cost), "legacy item_total_cost not finite");
const legacyProject = calcProject({ id: "smoke", items: [clone(legacyItem)] }, [], {});
assert.ok(Number.isFinite(legacyProject.items[0].item_total_cost), "calcProject legacy item_total_cost not finite");
console.log("legacy ok: feet=" + legacyCost.rebar_feet + " rebar=" + legacyCost.rebar_cost + " total=" + legacyCost.item_total_cost + " project_total=" + legacyProject.items[0].item_total_cost);

// 2) v2-marked item routes through the versioned dispatch
const v2 = calcProject(clone(project), [], {}, { savedProject: clone(project) });
near(v2.items[0].rebar_cost, 112); assert.equal(Math.round(v2.items[0].rebar_cost * 100), 11200);
near(v2.items[0].rebar_material_cost, 40); near(v2.items[0].rebar_labor_cost, 72);
assert.equal(v2.items[0].reinforcement_cost_snapshot.calculation_version, 2);
assert.equal(v2.items[0].reinforcement_cost_snapshot.engineering_approved, false);
assert.equal(v2.itemPricing[0].available, true);
console.log("v2 ok: rebar=" + v2.items[0].rebar_cost + " mat=" + v2.items[0].rebar_material_cost + " labor=" + v2.items[0].rebar_labor_cost + " snap_v=" + v2.items[0].reinforcement_cost_snapshot.calculation_version);

// 3) unsupported version is held, never silently legacy
const bad = clone(project); bad.items[0].reinforcement_calculation_version = 3;
const held = calcProject(bad, [], {}, { savedProject: clone(project) });
assert.equal(held.itemPricing[0].available, false);
assert.ok(held.inputIssues.some(i => i.code === "foundation_reinforcement_version_unsupported"), "missing unsupported-version issue");
near(held.items[0].rebar_cost, 112);
console.log("unsupported-version hold ok");

console.log("SMOKE PASS");
