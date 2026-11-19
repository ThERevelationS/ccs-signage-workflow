import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18";
const FILE = "src/components/estimator/foundation/foundationReinforcementItemProjection.js";
buildSync({ entryPoints: [FILE], bundle: true, platform: "node", format: "esm", outfile: `${DIR}/item-projection-bundle.mjs`, metafile: true,
  logLevel: "silent" });
const { calculateFoundationReinforcementItemProjection: project } =
  await import(pathToFileURL(path.resolve(`${DIR}/item-projection-bundle.mjs`)));
const clone = structuredClone;
const base = {
  item: { component_id: "synthetic", foundation_type: "spread_foot", quantity: 1,
    length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true, include_finishing: true },
  design: { version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "Synthetic explicit exclusion, not structural advice." },
    spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] } },
  material: { kind: "manual", name: "Synthetic", reason: "Synthetic explicit per-foot basis", unit: "ft",
    bar_diameter_inches: 0.5, weight_lb_per_ft: 0.668, cost_per_ft: 2 },
  inventory: [], settings: {},
};
const near = (a, b) => assert.ok(typeof a === "number" && Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("independent1CY common costs176.25 plus112steel =288.25", () => {
  const r = project(base); assert.equal(r.canApplyToEstimate, true); assert.equal(r.priceAvailable, true);
  assert.deepEqual(r.commonCost, { concrete: 0, forming: 0, pouring: 15, finishing: 11.25, excavation: 150, total: 176.25 });
  near(r.itemCost.rebar_material_cost, 40); near(r.itemCost.rebar_labor_cost, 72);
  near(r.itemCost.item_total_cost, 288.25); near(r.itemCost.rebar_feet, 20);
  near(r.itemCost.rebar_labor_hours, 1.2); near(r.itemCost.rebar_weight_lbs, 13.36);
});
check("three instances common528.75 andsteel336 =864.75, no double scaling", () => {
  const input = clone(base); input.item.quantity = 3; const r = project(input);
  assert.equal(r.canApplyToEstimate, true); near(r.commonCost.total, 528.75); near(r.itemCost.item_total_cost, 864.75);
  near(r.itemCost.rebar_feet, 60); near(r.itemCost.quantity, 3);
});
check("bagged/forming keep common legacy economics independent of new steel", () => {
  const input = clone(base);
  Object.assign(input.item, { selected_concrete_id: "bag", selected_forming_id: "form", include_forming: true });
  input.inventory = [{ id: "bag", material_type: "bagged_concrete", cost_per_unit: 5 },
    { id: "form", material_type: "forming_material", cost_per_unit: 10 }];
  const r = project(input); assert.equal(r.canApplyToEstimate, true);
  near(r.commonCost.concrete, 225); near(r.commonCost.forming, 212.5);
  near(r.commonCost.total, 613.75); near(r.itemCost.item_total_cost, 725.75); near(r.itemCost.concrete_bags, 45);
});
check("stale/invalid legacy rebar settings do not leak into version2 costing", () => {
  const input = clone(base);
  Object.assign(input.item, { rebar_layers: -999, rebar_spacing_length: "-oops", rebar_size: "#9",
    pillar_rebar_layers: "bad", custom_rebar_qty: 99999, custom_rebar_cost_per_ft: 99999, rebar_cost: 999999 });
  const r = project(input); assert.equal(r.canApplyToEstimate, true); near(r.itemCost.rebar_cost, 112);
  near(r.itemCost.item_total_cost, 288.25); near(r.itemCost.rebar_feet, 20);
});
check("zero aggregate quantity is0ft plus48connectionlabor, not1ft", () => {
  const r = project({ ...base, quantityOverride: 0 }); assert.equal(r.canApplyToEstimate, true);
  near(r.itemCost.rebar_feet, 0); near(r.itemCost.rebar_material_cost, 0); near(r.itemCost.rebar_labor_cost, 48);
  near(r.itemCost.item_total_cost, 224.25); near(r.itemCost.rebar_geometry_feet, 20);
});
check("explicit0 price is0material plus72labor, not a catalog fallback", () => {
  const r = project({ ...base, rateOverride: 0 }); assert.equal(r.canApplyToEstimate, true);
  near(r.itemCost.rebar_rate, 0); near(r.itemCost.rebar_material_cost, 0); near(r.itemCost.rebar_labor_cost, 72);
  near(r.itemCost.item_total_cost, 248.25);
});
check("unknown weight remains null and gates application, known price remains visible", () => {
  const input = clone(base); input.material.weight_lb_per_ft = null; const r = project(input);
  assert.equal(r.priceAvailable, true); assert.equal(r.canApplyToEstimate, false);
  assert.equal(r.itemCost.rebar_weight_lbs, null); assert.equal(r.itemCost.rebar_geometry_weight_lbs, null);
  near(r.itemCost.item_total_cost, 288.25);
});
check("unconfigured supports retain preliminary price but block replacement", () => {
  const input = clone(base); input.design.supports = { mode: "unconfigured" }; const r = project(input);
  assert.equal(r.priceAvailable, true); assert.equal(r.canApplyToEstimate, false); near(r.itemCost.item_total_cost, 288.25);
});
check("missing manual basis reason blocks replacement despite calculable money", () => {
  const input = clone(base); input.material.reason = ""; const r = project(input);
  assert.equal(r.priceAvailable, true); assert.equal(r.canApplyToEstimate, false); near(r.itemCost.rebar_cost, 112);
});
check("missing selected bagged material never becomes a replacement ready-mix amount", () => {
  const input = clone(base); input.item.selected_concrete_id = "missing-bag"; input.item.concrete_cost = 225;
  const r = project(input); assert.equal(r.priceAvailable, false); assert.equal(r.itemCost, null);
  assert.equal(r.canApplyToEstimate, false); assert.equal(input.item.concrete_cost, 225);
});
check("missing active forming row blocks total, disabled forming selection is ignored", () => {
  const input = clone(base); Object.assign(input.item, { include_forming: true, selected_forming_id: "gone" });
  assert.equal(project(input).itemCost, null);
  input.item.include_forming = false; assert.equal(project(input).canApplyToEstimate, true);
});
check("duplicate concrete/forming IDs fail closed", () => {
  const input = clone(base); Object.assign(input.item, { selected_concrete_id: "bag" });
  input.inventory = [{ id: "bag", material_type: "bagged_concrete", cost_per_unit: 5 }, { id: "bag", material_type: "bagged_concrete", cost_per_unit: 6 }];
  const r = project(input); assert.equal(r.itemCost, null); assert.ok(r.issues.some(i => i.code === "reinforcement_common_catalog_ambiguous"));
});
check("failed catalog/settings reads and malformed records don't infer defaults", () => {
  for (const patch of [{ inventory: null }, { inventory: [null] }, { settings: null }, { settings: new Map() }]) {
    const r = project({ ...base, ...patch }); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
  }
});
check("active invalid/negative common overrides block; no partial parse or plausible total", () => {
  for (const value of ["2junk", "", -1, Infinity, true, {}]) {
    const input = clone(base); input.item.custom_excavation_hours = value;
    const r = project(input); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
  }
});
check("inactive malformed forming/finishing override text stays preserved and ignored", () => {
  const input = clone(base); Object.assign(input.item, { include_forming: false, include_finishing: false,
    custom_forming_qty: "-oops", custom_forming_rate: "-oops", custom_finishing_hours: "-oops", custom_finishing_rate: "-oops" });
  const r = project(input); assert.equal(r.canApplyToEstimate, true); near(r.itemCost.item_total_cost, 277);
  assert.equal(input.item.custom_forming_rate, "-oops"); near(r.itemCost.finishing_cost, 0);
});
check("strict common numeric override text is typed without changing the raw item", () => {
  const input = clone(base); Object.assign(input.item, { custom_concrete_qty: "2", custom_excavation_hours: "0",
    custom_finishing_hours: "0", custom_finishing_rate: "0" });
  const r = project(input); assert.equal(r.canApplyToEstimate, true); near(r.itemCost.item_total_cost, 142);
  near(r.itemCost.concrete_volume_cy, 2); assert.equal(input.item.custom_concrete_qty, "2");
});
check("legacy common zero-rate finishing Infinity is unavailable, never silently repaired", () => {
  const input = clone(base); input.settings.foundation_main_labor_rate = "0";
  let r = project(input); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
  input.item.custom_finishing_hours = 0; r = project(input); assert.equal(r.canApplyToEstimate, true);
  near(r.itemCost.rebar_labor_cost, 0); near(r.itemCost.item_total_cost, 55);
});
check("numeric0 labor settings match explicit textual0; no false default60", () => {
  const input = clone(base); input.settings.foundation_main_labor_rate = 0;
  assert.equal(project(input).itemCost, null);
  input.item.custom_finishing_hours = 0; const r = project(input);
  assert.equal(r.canApplyToEstimate, true); near(r.itemCost.item_total_cost, 55); near(r.itemCost.rebar_labor_cost, 0);
  assert.equal(input.settings.foundation_main_labor_rate, 0);
  input.settings = { foundation_pouring_cost_per_cy: 0 };
  near(project(input).commonCost.pouring, 0);
});
check("active common settings reject partial parsing and null instead of inventing defaults", () => {
  for (const value of ["15oops", "", null, false, -1, Infinity]) {
    const input = clone(base); input.settings.foundation_pouring_cost_per_cy = value;
    const r = project(input); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
  }
  const input = clone(base); input.item.include_forming = false; input.settings.foundation_forming_cost_per_sqft = "bad";
  assert.equal(project(input).canApplyToEstimate, true);
});
check("negative/nonfinite catalog costs don't produce a replacement price", () => {
  for (const value of [-1, Infinity, "bad"]) {
    const input = clone(base); input.item.selected_concrete_id = "bag";
    input.inventory = [{ id: "bag", material_type: "bagged_concrete", cost_per_unit: value }];
    const r = project(input); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
  }
});
check("rebaroff preserves common price176.25 with0steel and no inactive design/material", () => {
  const input = clone(base); input.item.include_rebar = false; input.design = null; input.material = null;
  const r = project(input); assert.equal(r.canApplyToEstimate, true); near(r.itemCost.item_total_cost, 176.25);
  near(r.itemCost.rebar_cost, 0); near(r.itemCost.rebar_weight_lbs, 0); assert.equal(r.engineeringApproved, false);
});
check("invalid foundation geometry cannot gain a price from stored totals", () => {
  const input = clone(base); Object.assign(input.item, { quantity: 0, item_total_cost: 500, rebar_cost: 100 });
  const r = project(input); assert.equal(r.itemCost, null); assert.equal(r.canApplyToEstimate, false);
});
check("project excavation fallback is explicit; item method takes precedence", () => {
  const input = clone(base); input.excavationMethod = "equipment";
  let r = project(input); near(r.itemCost.excavation_hours, 0.625); near(r.itemCost.item_total_cost, 175.75);
  input.item.excavation_method = "hand_dig"; r = project(input); near(r.itemCost.item_total_cost, 288.25);
});
check("all frozen raw inputs and outputs remain isolated across fresh calculations", () => {
  const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const input = freeze(clone(base)), before = JSON.stringify(input); const r = project(input);
  r.itemCost.rebar_material_cost = -999; const again = project(input); near(again.itemCost.rebar_material_cost, 40);
  assert.equal(JSON.stringify(input), before);
});
fs.writeFileSync(`${DIR}/item-projection-verification.json`, JSON.stringify({
  synthetic: true, localOnly: true, activeDispatchIntegrated: false,
  sourceSha256: crypto.createHash("sha256").update(fs.readFileSync(FILE)).digest("hex"), results,
}, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Item projection: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
