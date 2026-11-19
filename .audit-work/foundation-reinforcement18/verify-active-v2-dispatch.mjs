import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/foundationCalc.js"],
  bundle: true, platform: "node", format: "esm", write: false, outdir: "out", metafile: true,
});
assert.ok(!Object.keys(compiled.metafile.inputs).some(file =>
  file.includes("base44Client") || file.includes("staffEntities") || file.includes("node_modules/@base44/")));
const { calcItem, calcProject } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
// Frozen accepted projection inputs/results from verify-item-projection.mjs.
// This verifies dispatch, not the already accepted geometry/cost derivation.
const item = {
  component_id: "synthetic", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true, include_finishing: true,
  reinforcement_calculation_version: 2, custom_rebar_qty: null, custom_rebar_cost_per_ft: 2,
  reinforcement_design: { version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "Synthetic explicit exclusion, not structural advice." },
    spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }],
      inter_mat_ties: [] } },
  reinforcement_material: { kind: "manual", name: "Synthetic", reason: "Synthetic explicit per-foot basis",
    unit: "ft", bar_diameter_inches: 0.5, weight_lb_per_ft: 0.668, cost_per_ft: 2 },
  concrete_volume_cy: 1, excavation_volume_cy: 1.25, concrete_bags: null, concrete_cost: 0, concrete_rate: 0,
  rebar_feet: 20, rebar_rate: 2, rebar_weight_lbs: 13.36, rebar_geometry_feet: 20, rebar_geometry_weight_lbs: 13.36,
  rebar_material_cost: 40, rebar_labor_cost: 72, rebar_labor_hours: 1.2, rebar_connection_count: 16,
  rebar_cost: 112, pouring_cost: 15, finishing_cost: 11.25, forming_cost: 0, forming_qty: 0,
  excavation_cost: 150, excavation_hours: 2.5, finishing_hours: 0.1875, item_total_cost: 288.25,
  reinforcement_cost_snapshot: {
    version: 1, calculation_version: 2, engineering_approved: false,
    amounts: { geometry_feet: 20, priced_feet: 20, geometry_weight_lbs: 13.36, priced_weight_lbs: 13.36,
      material_cost: 40, labor_cost: 72, labor_hours: 1.2, connection_count: 16, steel_cost: 112 },
    material: { kind: "manual", name: "Synthetic", reason: "Synthetic explicit per-foot basis", inventory_id: null,
      inventory_updated_date: null, pricing_unit: "ft", original_unit: "ft", bar_diameter_inches: 0.5,
      weight_lb_per_ft: 0.668, cost_per_ft: 2, rate_source: "custom_rebar_cost_per_ft" },
    basis: { unit: "ft", cost_per_ft: 2, labor_rate_per_hour: 60 },
    rate_sources: [],
  },
};
const project = { id: "synthetic-project", items: [item], selected_equipment: [], poles: [], walls: [], wall_caps: [] };
const results = [];
const near = (actual, expected) => assert.ok(typeof actual === "number" &&
  Math.abs(actual - expected) <= 64 * Number.EPSILON * Math.max(1, Math.abs(expected)),
`${actual} does not equal ${expected} within floating-point arithmetic tolerance.`);
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
};
check("accepted version2 dispatch retains20ft112 steel and288.25 item instead of legacy steel math", () => {
  const actual = calcItem(item, project, [], {}, item);
  assert.equal(actual.rebar_feet, 20); near(actual.rebar_cost, 112); near(actual.item_total_cost, 288.25);
  assert.equal(Math.round(actual.rebar_cost * 100), 11200);
  near(actual.rebar_material_cost, 40); near(actual.rebar_labor_cost, 72);
  assert.equal(actual.rebar_geometry_feet, 20);
  assert.equal(actual.reinforcement_cost_snapshot.calculation_version, 2);
});
check("explicit manual version2 selection does not require an unrelated legacy rebar size", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_cost_per_ft = null;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); assert.deepEqual(actual.catalogIssues, []);
  near(actual.items[0].rebar_cost, 112);
});
check("unknown active calculation versions are unavailable rather than silently calculated as legacy", () => {
  const source = structuredClone(project); source.items[0].reinforcement_calculation_version = 3;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false);
  assert.ok(actual.inputIssues.some(issue => issue.code === "foundation_reinforcement_version_unsupported"));
  assert.equal(actual.items[0].rebar_cost, 112);
});
check("unconfigured supports keep acknowledged amounts and block active pricing and saving", () => {
  const source = structuredClone(project); source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.equal(actual.items[0].item_total_cost, 288.25);
  assert.ok(actual.inputIssues.length + actual.catalogIssues.length > 0);
});
check("valid active recalculation returns a new reconciled snapshot instead of reusing an old result", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_cost_per_ft = 0;
  const actual = calcItem(source.items[0], source, [], {}, item);
  assert.equal(actual.rebar_material_cost, 0); near(actual.rebar_labor_cost, 72);
  near(actual.rebar_cost, 72); near(actual.item_total_cost, 248.25);
  assert.equal(Math.round(actual.rebar_cost * 100), 7200);
  assert.equal(actual.reinforcement_cost_snapshot.material.cost_per_ft, 0);
  assert.equal(actual.reinforcement_cost_snapshot.amounts.material_cost, 0);
});
check("disabled version2 steel clears live steel snapshots without requiring a material or design", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { include_rebar: false, reinforcement_design: null, reinforcement_material: null });
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); assert.deepEqual(actual.inputIssues, []);
  assert.equal(actual.items[0].rebar_cost, 0); assert.equal(actual.items[0].rebar_geometry_feet, 0);
  assert.equal(actual.items[0].reinforcement_cost_snapshot, undefined);
  near(actual.items[0].item_total_cost, 176.25);
});
check("zero priced footage keeps physical20 and connection labor48", () => {
  const source = structuredClone(project); source.items[0].custom_rebar_qty = 0;
  const actual = calcItem(source.items[0], source, [], {}, item);
  assert.equal(actual.rebar_feet, 0); assert.equal(actual.rebar_geometry_feet, 20);
  assert.equal(actual.rebar_material_cost, 0); near(actual.rebar_labor_cost, 48);
  near(actual.rebar_cost, 48); near(actual.item_total_cost, 224.25);
});
check("missing selected catalog ID cannot be replaced by legacy size even with a rate override", () => {
  const source = structuredClone(project);
  source.items[0].reinforcement_material = { kind: "catalog", inventory_id: "missing" };
  const inventory = [{ id: "legacy", material_type: "rebar", rebar_size: "#4", cost_per_unit: 999 }];
  const actual = calcProject(source, inventory, {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.ok(actual.catalogIssues.some(issue => issue.field === "reinforcement_material.inventory_id"));
});
check("a current selected ID controls active rate rather than a different legacy size match", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { custom_rebar_cost_per_ft: null, rebar_size: "#4",
    reinforcement_material: { kind: "catalog", inventory_id: "selected" } });
  const inventory = [
    { id: "legacy", material_type: "rebar", rebar_size: "#4", cost_per_unit: 999 },
    { id: "selected", material_name: "Selected", material_type: "rebar", rebar_size: "#8", unit: "ft",
      cost_per_unit: 3, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, updated_date: "synthetic-v1" },
  ];
  const actual = calcProject(source, inventory, {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); near(actual.items[0].rebar_material_cost, 60);
  near(actual.items[0].rebar_cost, 132);
  assert.equal(actual.items[0].reinforcement_cost_snapshot.material.inventory_id, "selected");
});
check("inactive legacy reinforcement fields do not block or influence version2", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { rebar_layers: -999, rebar_spacing_length: "invalid", rebar_spacing_width: -5 });
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, true); near(actual.items[0].rebar_cost, 112);
});
check("unknown material weight cannot become a ready zero-weight active estimate", () => {
  const source = structuredClone(project); source.items[0].reinforcement_material.weight_lb_per_ft = null;
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, 112);
  assert.equal(actual.items[0].rebar_geometry_weight_lbs, 13.36);
  assert.ok(actual.inputIssues.some(issue => issue.code === "foundation_reinforcement_not_ready"));
});
check("unavailable version2 with no acknowledged snapshot never adopts raw999 or fabricates zero", () => {
  const source = structuredClone(project);
  Object.assign(source.items[0], { item_total_cost: 999, rebar_cost: 999 });
  source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  const actual = calcProject(source, [], {}, { savedProject: null });
  assert.equal(actual.itemPricing[0].available, false); assert.equal(actual.items[0].rebar_cost, undefined);
  assert.equal(actual.items[0].reinforcement_cost_snapshot, undefined);
  assert.equal(actual.totals.total_rebar_cost, null); assert.equal(actual.totals.grand_total, null);
});
check("duplicate live component IDs cannot borrow another component's acknowledged amounts", () => {
  const source = structuredClone(project);
  source.items[0].reinforcement_design.supports = { mode: "unconfigured" };
  source.items.push(structuredClone(source.items[0]));
  const actual = calcProject(source, [], {}, { savedProject: project });
  assert.ok(actual.itemPricing.every(value => value.available === false));
  assert.ok(actual.items.every(value => value.rebar_cost === undefined));
  assert.equal(actual.totals.total_rebar_cost, null);
});
fs.writeFileSync(DIR + "active-v2-dispatch-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
fs.writeFileSync(DIR + "active-v2-dispatch-frozen-inputs.json", JSON.stringify({ item, project }, null, 2) + "\n");
console.log(`Active version2 dispatch: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
