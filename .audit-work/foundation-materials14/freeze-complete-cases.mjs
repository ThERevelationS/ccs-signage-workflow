import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const out = ".audit-work/foundation-materials14/complete-before.json";
if (fs.existsSync(out)) throw new Error("Frozen complete-catalog capture already exists; reuse it.");
const { calcProject } = await import(pathToFileURL(path.resolve(".audit-work/foundation-materials14/calc-before.mjs")));
const bag = { id: "bag", material_type: "bagged_concrete", material_name: "Synthetic bag", cost_per_unit: 5 };
const bar = { id: "bar", material_type: "rebar", material_name: "Synthetic #4", rebar_size: "#4", cost_per_unit: 2 };
const bar5 = { ...bar, id: "bar5", rebar_size: "#5", cost_per_unit: 3 };
const form = { id: "form", material_type: "forming_material", material_name: "Synthetic form", cost_per_unit: 10 };
const ready = {
  id: "ready", material_type: "concrete_service", material_name: "Synthetic supplier",
  mix_3500_price: 180, mix_4000_price: 200, mix_4500_price: 220, mix_5000_price: 240, mix_fast_set_price: 260,
  admix_calcium_chloride_price: 8, admix_set_retarding_price: 4, admix_water_reducing_price: 5,
  admix_fibers_price: 10, admix_winter_service_price: 6,
  small_load_fee_1_1_75: 150, small_load_fee_2_2_75: 120, small_load_fee_3_3_75: 100,
  small_load_fee_4_4_25: 80, small_load_fee_4_5_4_75: 40, fuel_surcharge: 30,
};
const inventory = [bag, bar, bar5, form, ready, { ...ready, id: "ready2", mix_4000_price: 250 }];
const footing = {
  component_id: "f1", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36,
  selected_concrete_id: "bag", include_rebar: false, rebar_size: "#4",
  rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  include_forming: false, selected_forming_id: "form", include_finishing: false,
};
const cases = [];
const add = (name, patches = {}, project = {}, inv = inventory, settings = {}) => {
  const p = { id: `synthetic-${cases.length}`, updated_date: "v1", items: [{ ...footing, ...patches }], ...project };
  cases.push({ name, project: p, inventory: inv, settings, expected: calcProject(p, inv, settings) });
};
add("bag spread");
add("bag spread all options single layer", { include_rebar: true, include_forming: true, include_finishing: true });
add("bag spread multilayer", { include_rebar: true, rebar_layers: 2, include_forming: true });
add("bag pillar default size", { foundation_type: "pillar", diameter: 24, include_rebar: true, include_forming: true, include_finishing: true });
add("bag pillar size5 hoops and quantity", {
  foundation_type: "pillar", diameter: 30, quantity: 3, include_rebar: true,
  pillar_rebar_size: "#5", pillar_rebar_layers: 3, pillar_vertical_rebar_count: 6, pillar_rebar_hoop_diameter: 22,
});
add("ready spread", { selected_concrete_id: "ready" });
add("ready pillar", { foundation_type: "pillar", diameter: 24, selected_concrete_id: "ready", include_rebar: true });
add("ready mix and admixtures", { selected_concrete_id: "ready" }, { project_concrete_type: "3500_ae", project_concrete_admixtures: ["fibers", "water_reducing"] });
add("three delivery trucks", { selected_concrete_id: "ready", quantity: 19 });
add("quarter yard order", { selected_concrete_id: "ready", custom_concrete_qty: 4.25 });
add("multiple service foundations", {}, {
  items: [{ ...footing, selected_concrete_id: "ready" }, { ...footing, component_id: "f2", selected_concrete_id: "ready", length_inches: 18, width_inches: 18, depth_inches: 18 }],
});
add("mixed bag and ready foundations", {}, {
  items: [{ ...footing }, { ...footing, component_id: "f2", selected_concrete_id: "ready" }],
});
add("legacy two supplier grouping unchanged", {}, {
  items: [{ ...footing, selected_concrete_id: "ready" }, { ...footing, component_id: "f2", selected_concrete_id: "ready2" }],
});
add("manual zero rebar and quantity", { include_rebar: true, custom_rebar_cost_per_ft: 0, custom_rebar_qty: 0 });
add("all explicit zero overrides", {
  custom_concrete_cost_per_cy: 0, include_rebar: true, custom_rebar_cost_per_ft: 0, custom_rebar_qty: 0,
  include_forming: true, custom_forming_rate: 0, custom_forming_qty: 0,
  include_finishing: true, custom_finishing_rate: 0, custom_finishing_hours: 0, custom_excavation_rate: 0, custom_excavation_hours: 0,
});
add("free bag catalog rate", {}, {}, inventory.map(row => row.id === "bag" ? { ...row, cost_per_unit: 0 } : row));
const freeReady = Object.fromEntries(Object.entries(ready).map(([key, value]) => [key, typeof value === "number" ? 0 : value]));
add("free ready supplier explicit zero fields", { selected_concrete_id: "ready" }, {}, inventory.map(row => row.id === "ready" ? freeReady : row));
add("inactive dangling selections", { selected_forming_id: "missing", rebar_size: "#99" });
add("manual rebar without matching catalog", { include_rebar: true, custom_rebar_cost_per_ft: 2 }, {}, inventory.filter(row => row.id !== "bar"));
add("manual zero rebar without matching catalog", { include_rebar: true, custom_rebar_cost_per_ft: 0 }, {}, inventory.filter(row => row.id !== "bar"));
add("bag manual quantity legacy units unchanged", { custom_concrete_qty: 45 });
add("unassigned project delivery assumptions unchanged", { selected_concrete_id: "" });
add("new sign stops", { selected_concrete_id: "ready", is_new_sign_location: true, quantity: 2 });
add("project equipment excavation", {}, { excavation_method: "equipment_excavation" });
add("custom settings", { include_rebar: true, include_forming: true, include_finishing: true }, {}, inventory, {
  foundation_main_labor_rate: 75, foundation_hand_dig_time_per_cy: 1.5,
  foundation_forming_cost_per_sqft: 3, foundation_pouring_cost_per_cy: 20, foundation_finishing_cost_per_sqft: 2,
});
assert.equal(cases.length, 25);
assert.equal(cases[0].expected.items[0].concrete_cost, 225);
assert.equal(cases[5].expected.totals.concrete_delivery_cost, 380);
for (const c of cases) assert.deepEqual(c.expected.catalogIssues, []);
fs.writeFileSync(out, JSON.stringify({ synthetic: true, cases }, null, 2));
console.log("Frozen 25 complete-catalog cases with full pre-change rows/totals/delivery. Do not regenerate.");
