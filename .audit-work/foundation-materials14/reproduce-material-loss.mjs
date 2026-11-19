import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const root = ".audit-work/foundation-materials14";
const before = `${root}/calc-before.mjs`;
if (!fs.existsSync(before)) {
  fs.copyFileSync(".audit-work/foundation-equipment13/calc-b.mjs", before);
}
const { calcProject } = await import(pathToFileURL(path.resolve(before)));
const inventory = [
  { id: "bag", material_type: "bagged_concrete", material_name: "Synthetic bag", cost_per_unit: 5 },
  { id: "bar", material_type: "rebar", rebar_size: "#4", material_name: "Synthetic rebar", cost_per_unit: 2 },
  { id: "form", material_type: "forming_material", material_name: "Synthetic form", cost_per_unit: 10 },
];
const original = {
  id: "synthetic-material-project",
  updated_date: "v1",
  project_concrete_type: "4000_ae",
  items: [{
    _id: "foundation-1", foundation_type: "spread_foot", quantity: 1,
    length_inches: 36, width_inches: 36, depth_inches: 36,
    selected_concrete_id: "bag",
    include_rebar: true, rebar_size: "#4", rebar_layers: 1,
    rebar_spacing_width: 12, rebar_spacing_length: 12,
    include_forming: true, selected_forming_id: "form",
  }],
};
const full = calcProject(original, inventory, {});
const saved = { ...original, ...full.totals, items: full.items };
assert.equal(full.items[0].concrete_volume_cy, 1);
assert.equal(full.items[0].concrete_cost, 225);
assert.equal(full.totals.concrete_delivery_cost, 0);
const results = [];
for (const removed of ["bag", "bar", "form"]) {
  const current = calcProject(saved, inventory.filter(row => row.id !== removed), {});
  assert.equal(current.catalogIssues.length, 0, "Current guard does not cover foundation materials.");
  assert.notEqual(current.totals.grand_total, saved.grand_total);
  if (removed === "bag") {
    assert.equal(current.items[0].concrete_cost, 0);
    assert.equal(current.totals.concrete_delivery_cost, 381, "Missing bags are assumed to be ready-mix with default supplier prices.");
  }
  if (removed === "bar") assert.ok(current.items[0].rebar_cost < saved.items[0].rebar_cost);
  if (removed === "form") assert.ok(current.items[0].forming_cost < saved.items[0].forming_cost);
  results.push({ removed, current });
}
const capture = { synthetic: true, engine: before, inputs: { original, inventory }, full, saved, results };
fs.writeFileSync(`${root}/material-loss-repro.json`, JSON.stringify(capture, null, 2));
console.log("CONFIRMED synthetic: missing concrete/rebar/forming all alter saved costs without a catalog issue.");
console.log("Missing bag selection additionally changes saved delivery 0 to fabricated ready-mix delivery 381.");
