import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const root = ".audit-work/foundation-reinforcement18/";
const result = await build({ entryPoints: ["src/components/estimator/foundation/foundationReinforcementPartDescriptors.js"],
  bundle: true, platform: "node", format: "esm", write: false });
const { foundationReinforcementPartDescriptors: parts } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const clone = structuredClone;
const freeze = x => { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const material = { kind: "catalog", inventory_id: "selected-other", inventory_updated_date: "v1", name: "Selected steel",
  pricing_unit: "ft", original_unit: "ft", bar_diameter_inches: 0.5, weight_lb_per_ft: 0.668, cost_per_ft: 2, rate_source: "catalog" };
const base = {
  component_id: "stable-component", include_rebar: true, quantity: 1, rebar_size: "#4",
  reinforcement_calculation_version: 2, reinforcement_design: { version: 2, supports: { mode: "off", reason: "Reviewed separately" } },
  reinforcement_material: { kind: "catalog", inventory_id: "selected-other" }, custom_rebar_qty: null, custom_rebar_cost_per_ft: null,
  rebar_feet: 20, rebar_geometry_feet: 20, rebar_weight_lbs: 13.36, rebar_geometry_weight_lbs: 13.36,
  rebar_rate: 2, rebar_material_cost: 40, rebar_labor_cost: 72, rebar_labor_hours: 1.2, rebar_connection_count: 4, rebar_cost: 112,
  reinforcement_cost_snapshot: { version: 1, calculation_version: 2, engineering_approved: false,
    amounts: { geometry_feet: 20, priced_feet: 20, material_cost: 40, labor_cost: 72, labor_hours: 1.2,
      connection_count: 4, steel_cost: 112, priced_weight_lbs: 13.36, geometry_weight_lbs: 13.36 },
    material, basis: { unit: "ft", cost_per_ft: 2, labor_rate_per_hour: 60 }, rate_sources: [] },
};
const run = item => parts({ item, itemIndex: 3 });
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); } };
check("selected stable ID and exact split, legacy key family, no guessed size", () => {
  const [m, l] = run(base);
  assert.equal(m.inventory_item_id, "selected-other"); assert.equal(m.inventory_entity, "FoundationInventory");
  assert.equal(m.part_key, "foundation:item:3:rebar"); assert.equal(l.part_key, "foundation:item:3:rebar-labor");
  assert.equal(m.quantity, 20); assert.equal(m.unit_cost, 2); assert.equal(m.extended_cost, 40);
  assert.equal(m.part_name, "Selected steel"); assert.equal(m.part_subtype, "rebar");
  assert.equal(m.source_path, "items[3].reinforcement_material.inventory_id");
  assert.equal(l.part_name, "Reinforcement labor"); assert.equal(l.part_subtype, "rebar_labor");
  assert.equal("name" in m, false); assert.equal("subtype" in m, false);
  assert.equal(l.part_type, "labor"); assert.equal(l.quantity, 1.2); assert.equal(l.unit_cost, 60); assert.equal(l.extended_cost, 72);
  assert.equal(m.pricing_basis_snapshot.pricing_mode, "foundation_reinforcement_v2");
  assert.equal(m.pricing_basis_snapshot.reinforcement.physical_quantity_ft, 20);
  assert.equal(m.pricing_basis_snapshot.reinforcement.priced_quantity_ft, 20);
  assert.equal(m.pricing_basis_snapshot.reinforcement.engineering_approved, false);
  assert.equal(m.pricing_basis_snapshot.reinforcement.procurement_ready, false);
});
check("explicit zero rate remains zero and labor remains labor", () => {
  const x = clone(base); x.rebar_rate = 0; x.rebar_material_cost = 0; x.rebar_cost = 72;
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.material.cost_per_ft = 0; x.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  x.custom_rebar_cost_per_ft = 0; x.reinforcement_cost_snapshot.material.rate_source = "custom_rebar_cost_per_ft";
  const [m, l] = run(x); assert.equal(m.unit_cost, 0); assert.equal(m.extended_cost, 0); assert.equal(l.extended_cost, 72);
});
check("zero priced aggregate never becomes one or erases physical geometry", () => {
  const x = clone(base); Object.assign(x, { rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 12, rebar_labor_cost: 12, rebar_labor_hours: 0.2 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, labor_hours: 0.2, labor_cost: 12, steel_cost: 12 });
  x.custom_rebar_qty = 0; x.reinforcement_cost_snapshot.basis.quantity_override_ft = 0;
  const [m, l] = run(x); assert.equal(m.quantity, 0); assert.equal(m.extended_cost, 0); assert.equal(l.extended_cost, 12);
  assert.equal(m.pricing_basis_snapshot.reinforcement.physical_quantity_ft, 20);
});
check("aggregate values are not scaled by foundation count again", () => {
  const x = clone(base); x.quantity = 3; const [m] = run(x); assert.equal(m.quantity, 20); assert.equal(m.extended_cost, 40);
});
check("manual basis never attaches legacy inventory", () => {
  const x = clone(base); x.reinforcement_material = { kind: "manual", reason: "Supplier quote" };
  Object.assign(x.reinforcement_cost_snapshot.material, { kind: "manual", inventory_id: null, reason: "Supplier quote" });
  x.reinforcement_cost_snapshot.material.rate_source = "manual"; x.reinforcement_cost_snapshot.material.inventory_updated_date = null;
  const [m] = run(x); assert.equal(m.inventory_item_id, ""); assert.equal(m.inventory_entity, "");
});
check("off ignores inactive malformed snapshot", () => { const x = clone(base); x.include_rebar = false; x.reinforcement_cost_snapshot = null; assert.deepEqual(run(x), []); });
for (const version of [undefined, 1, "2", 3]) check(`unsupported selector ${String(version)} cannot enter adapter`, () => {
  const x = clone(base); x.reinforcement_calculation_version = version; assert.throws(() => run(x));
});
for (const value of [null, -1, Infinity, "40"]) check(`malformed amount ${String(value)} fails closed`, () => {
  const x = clone(base); x.rebar_material_cost = value; assert.throws(() => run(x));
});
check("inconsistent calculated/snapshot amounts cannot create plausible parts", () => { const x = clone(base); x.reinforcement_cost_snapshot.amounts.material_cost = 41; assert.throws(() => run(x)); });
check("unknown geometric weight cannot become zero", () => { const x = clone(base); x.rebar_geometry_weight_lbs = null; x.reinforcement_cost_snapshot.amounts.geometry_weight_lbs = null; assert.throws(() => run(x)); });
check("wrong selected material identity fails closed", () => { const x = clone(base); x.reinforcement_cost_snapshot.material.inventory_id = "legacy-four"; assert.throws(() => run(x)); });
check("snapshot and configured material kinds cannot disagree", () => {
  const x = clone(base); x.reinforcement_cost_snapshot.material.kind = "manual"; assert.throws(() => run(x));
});
check("record-shaped class instances cannot lose their fields during snapshot cloning", () => {
  const x = clone(base); x.reinforcement_cost_snapshot.amounts = Object.assign(new Date(), x.reinforcement_cost_snapshot.amounts); assert.throws(() => run(x));
});
check("non-numeric hourly rates fail before invoking any coercion", () => {
  const x = clone(base); let coerced = 0;
  x.reinforcement_cost_snapshot.basis.labor_rate_per_hour = { valueOf() { coerced += 1; return 60; } };
  assert.throws(() => run(x)); assert.equal(coerced, 0);
});
check("matching saved totals still cannot contradict represented quantity times unit rate", () => {
  const x = clone(base); x.rebar_labor_cost = 73; x.rebar_cost = 113;
  Object.assign(x.reinforcement_cost_snapshot.amounts, { labor_cost: 73, steel_cost: 113 });
  assert.throws(() => run(x));
});
check("positive multiplication underflow cannot create a free material DTO", () => {
  const x = clone(base); Object.assign(x, { rebar_feet: 1e-300, rebar_rate: 1e-300, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 1e-300, material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.material.cost_per_ft = 1e-300; x.reinforcement_cost_snapshot.basis.cost_per_ft = 1e-300;
  assert.throws(() => run(x));
});
check("unconfirmed zero catalog price cannot create free material", () => {
  const x = clone(base); Object.assign(x, { rebar_rate: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.material.cost_per_ft = 0; x.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  assert.throws(() => run(x));
});
check("bad indices and missing IDs fail closed", () => { assert.throws(() => parts({ item: base, itemIndex: -1 })); const x = clone(base); delete x.component_id; assert.throws(() => run(x)); });
check("frozen input safe and all snapshots isolated", () => {
  const x = freeze(clone(base)), before = JSON.stringify(x), [m, l] = run(x);
  assert.equal(JSON.stringify(x), before); m.calculation_snapshot.amounts.material_cost = 9;
  assert.equal(l.calculation_snapshot.amounts.material_cost, 40); assert.equal(x.reinforcement_cost_snapshot.amounts.material_cost, 40);
});
check("complete active item definition survives part snapshots, but unapplied draft does not", () => {
  const x = clone(base); Object.assign(x, { foundation_type: "spread_foot", length_inches: 48, width_inches: 48, depth_inches: 36,
    position: { x: 12, z: 16 }, notes: "Preserve accepted geometry", reinforcement_proposal: { unapplied: true } });
  const expected = clone(x); delete expected.reinforcement_proposal;
  const [m, l] = run(freeze(x)); assert.deepEqual(m.builder_data, expected); assert.deepEqual(l.builder_data, expected);
  m.builder_data.position.x = 99; assert.equal(l.builder_data.position.x, 12); assert.equal(x.position.x, 12);
});
fs.writeFileSync(root + "part-descriptors-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Part descriptors: ${results.filter(x => x.ok).length}/${results.length}; failed=${results.filter(x => !x.ok).length}`);
process.exitCode = results.some(x => !x.ok) ? 1 : 0;
