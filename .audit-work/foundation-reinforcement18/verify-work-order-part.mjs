import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js"],
  bundle: true, platform: "node", format: "esm", write: false, outdir: "out", metafile: true,
});
const { projectFoundationReinforcementWorkOrderPart: project, readFoundationReinforcementWorkOrderPart: read } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const { foundationReinforcementPartDescriptors: descriptors } =
  await import("../../src/components/estimator/foundation/foundationReinforcementPartDescriptors.js");
const { captureFoundationReinforcementFrozenPricing: capture } =
  await import("../../src/components/estimator/foundation/foundationReinforcementFrozenPricing.js");
const base = JSON.parse(fs.readFileSync(dir + "part-descriptors-fixture.json", "utf8"));
const clone = structuredClone;
const make = (item = base) => descriptors({ item, itemIndex: 0 }).map(descriptor => {
  const part = { ...descriptor, id: "synthetic-" + descriptor.part_type, builder_sync_state: "linked",
    current_unit_cost: descriptor.unit_cost, current_extended_cost: descriptor.extended_cost,
    frozen_unit_cost: descriptor.unit_cost, frozen_extended_cost: descriptor.extended_cost,
    pricing_basis_snapshot: { ...descriptor.pricing_basis_snapshot, reinforcement_catalog_basis_current: true } };
  part.pricing_basis_snapshot.reinforcement_frozen_pricing = capture(part);
  return part;
});
const manifestRow = part => ({ part_type: part.part_type, ...project(part) });
const roundTrip = row => JSON.parse(JSON.stringify(row));
const frozen = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const invalid = fn => assert.throws(fn, error => error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID");
const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
};
check("recorded material keeps exact frozen financial fields and provenance through JSON", () => {
  const row = roundTrip(manifestRow(make()[0])), value = read(row);
  assert.equal(row.quantity, 20); assert.equal(row.unit, "ft");
  assert.equal(row.unit_cost, 2); assert.equal(row.extended_cost, 40);
  assert.equal(row.inventory_item_id, "selected-other"); assert.equal(row.inventory_item_name, "Selected steel");
  assert.equal(value.physical_quantity_ft, 20); assert.equal(value.physical_weight_lbs, 13.36);
  assert.equal(value.frozenStatus, "recorded");
  assert.deepEqual(value.purchasing, { state: "unplanned" }); assert.equal(value.procurement_ready, false);
});
check("recorded labor remains hourly without pretending that hours are physical steel", () => {
  const row = manifestRow(make()[1]), value = read(roundTrip(row));
  assert.equal(row.quantity, 1.2); assert.equal(row.unit, "hr");
  assert.equal(row.unit_cost, 60); assert.equal(row.extended_cost, 72);
  assert.equal(row.inventory_item_id, ""); assert.equal(row.inventory_item_name, "");
  assert.equal(value.physical_quantity_ft, 20); assert.equal(value.last_priced_unit, "hr");
});
check("current40ft does not become the frozen20ft financial or purchasing quantity", () => {
  const item = clone(base), prior = make()[0];
  Object.assign(item, { rebar_feet: 40, rebar_geometry_feet: 40, rebar_weight_lbs: 26.72,
    rebar_geometry_weight_lbs: 26.72, rebar_material_cost: 80, rebar_cost: 152 });
  Object.assign(item.reinforcement_cost_snapshot.amounts, { priced_feet: 40, geometry_feet: 40,
    priced_weight_lbs: 26.72, geometry_weight_lbs: 26.72, material_cost: 80, steel_cost: 152 });
  const part = make(item)[0]; part.frozen_extended_cost = prior.frozen_extended_cost;
  part.pricing_basis_snapshot.reinforcement_frozen_pricing = prior.pricing_basis_snapshot.reinforcement_frozen_pricing;
  const row = roundTrip(manifestRow(part)), value = read(row);
  assert.equal(row.quantity, 20); assert.equal(row.extended_cost, 40);
  assert.equal(value.physical_quantity_ft, 40); assert.equal(value.last_priced_quantity, 40);
  assert.deepEqual(value.purchasing, { state: "unplanned" });
});
check("same-price new material stays separate from frozen inventory identity", () => {
  const prior = make()[0], item = clone(base);
  item.reinforcement_material.inventory_id = "replacement";
  Object.assign(item.reinforcement_cost_snapshot.material, { inventory_id: "replacement", name: "New steel", inventory_updated_date: "v2" });
  const part = make(item)[0]; part.pricing_basis_snapshot.reinforcement_frozen_pricing =
    prior.pricing_basis_snapshot.reinforcement_frozen_pricing;
  const row = manifestRow(part), value = read(roundTrip(row));
  assert.equal(row.inventory_item_id, "selected-other"); assert.equal(row.inventory_item_name, "Selected steel");
  assert.equal(row.extended_cost, 40); assert.equal(value.last_calculated_material.inventory_id, "replacement");
});
check("unrecorded legacy labor preserves72 total without an invented per-hour rate or quantity", () => {
  const part = make()[1]; delete part.pricing_basis_snapshot.reinforcement_frozen_pricing;
  part.frozen_unit_cost = 72;
  const row = manifestRow(part), stored = roundTrip(row), value = read(stored);
  assert.equal(row.quantity, undefined); assert.equal(row.unit_cost, undefined); assert.equal(row.unit, "");
  assert.equal(Object.hasOwn(stored, "quantity"), false); assert.equal(Object.hasOwn(stored, "unit_cost"), false);
  assert.equal(stored.extended_cost, 72); assert.equal(value.unit_cost, undefined); assert.equal(value.frozenStatus, "unrecorded");
  assert.equal(value.last_priced_quantity, 1.2); assert.equal(value.last_priced_unit, "hr");
});
check("an explicit zero priced quantity stays distinct from physical20ft", () => {
  const item = clone(base); item.custom_rebar_qty = 0;
  Object.assign(item, { rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(item.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, steel_cost: 72 });
  const row = manifestRow(make(item)[0]), value = read(roundTrip(row));
  assert.equal(row.quantity, 0); assert.equal(row.unit_cost, 2); assert.equal(row.extended_cost, 0);
  assert.equal(value.physical_quantity_ft, 20); assert.equal(value.last_priced_quantity, 0);
});
check("an authored zero rate survives with its provenance", () => {
  const item = clone(base); item.custom_rebar_cost_per_ft = 0;
  Object.assign(item, { rebar_rate: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(item.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  Object.assign(item.reinforcement_cost_snapshot.material, { cost_per_ft: 0, rate_source: "custom_rebar_cost_per_ft" });
  item.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  const row = manifestRow(make(item)[0]);
  assert.equal(row.quantity, 20); assert.equal(row.unit_cost, 0); assert.equal(row.extended_cost, 0);
  assert.equal(read(roundTrip(row)).physical_quantity_ft, 20);
  assert.equal(row.foundation_reinforcement_handoff.frozen_pricing.zero_rate_authored, true);
});
check("manual material has no inherited catalog link", () => {
  const item = clone(base);
  item.reinforcement_material = { kind: "manual", name: "Quoted steel", reason: "Supplier quote" };
  Object.assign(item.reinforcement_cost_snapshot.material, { kind: "manual", inventory_id: null,
    inventory_updated_date: null, name: "Quoted steel", reason: "Supplier quote", rate_source: "manual" });
  for (const part of make(item)) {
    const row = manifestRow(part), value = read(roundTrip(row));
    assert.equal(row.inventory_item_id, ""); assert.equal(value.catalog_basis_current, null);
  }
});
check("stale catalog context is retained as unverified, not repriced or purchasing-approved", () => {
  const part = make()[0]; part.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
  const row = manifestRow(part), value = read(roundTrip(row));
  assert.equal(row.extended_cost, 40); assert.equal(value.catalog_basis_current, false);
  assert.equal(value.procurement_ready, false);
});
check("proposal data is excluded and frozen inputs and returned clones stay isolated", () => {
  const part = make()[0]; part.builder_data.reinforcement_proposal = { do_not_export: true };
  const before = JSON.stringify(part); frozen(part);
  const row = manifestRow(part); assert.equal(JSON.stringify(part), before);
  assert.equal(Object.hasOwn(row.foundation_reinforcement_handoff.definition_reference, "reinforcement_proposal"), false);
  const value = read(roundTrip(row)); value.last_calculated_material.name = "Changed copy";
  assert.equal(row.foundation_reinforcement_handoff.last_calculated.reinforcement_snapshot.material.name, "Selected steel");
  row.foundation_reinforcement_handoff.definition_reference.reinforcement_material.inventory_id = "Changed copy";
  assert.equal(part.builder_data.reinforcement_material.inventory_id, "selected-other");
});
check("ordinary and independently edited parts never acquire authoritative v2 geometry", () => {
  assert.equal(project({}), null); assert.equal(read({ quantity: 1, unit_cost: 72 }), null);
  for (const state of ["independent", "manual", "manual_addon", "detached_override"]) {
    const part = make()[0]; part.builder_sync_state = state; part.builder_data = null;
    assert.equal(project(part), null);
  }
});
check("unresolved removal, unsupported source versions and missing linked state fail closed", () => {
  const removed = make()[0]; removed.builder_data.__builder_pending_removal = true;
  invalid(() => project(removed));
  const future = make()[0]; future.pricing_basis_snapshot.reinforcement.calculation_version = 3;
  invalid(() => project(future));
  const unlinked = make()[0]; delete unlinked.builder_sync_state; invalid(() => project(unlinked));
});
check("stale current quantities, selected ids, amounts or calculations cannot be exported as fresh", () => {
  for (const change of [
    part => { part.quantity = 21; }, part => { part.inventory_item_id = "wrong"; },
    part => { part.current_extended_cost = 41; },
    part => { part.builder_data.reinforcement_material.inventory_id = "wrong"; },
    part => { part.calculation_snapshot.basis.labor_rate_per_hour = 80; },
  ]) { const part = make()[0]; change(part); invalid(() => project(part)); }
});
check("historical corrupt rates and cross-component frozen snapshots are rejected", () => {
  const corrupt = make()[0]; corrupt.pricing_basis_snapshot.reinforcement_frozen_pricing.unit_cost = 3;
  invalid(() => project(corrupt));
  const cross = make()[0]; cross.pricing_basis_snapshot.reinforcement_frozen_pricing.reinforcement_snapshot.component_id = "another";
  invalid(() => project(cross));
});
check("unsafe cents and invalid frozen totals never silently become a financial zero", () => {
  for (const amount of [null, undefined, "", -1, NaN, Infinity, Number.MAX_VALUE]) {
    const part = make()[1]; delete part.pricing_basis_snapshot.reinforcement_frozen_pricing;
    part.frozen_extended_cost = amount; invalid(() => project(part));
  }
});
check("persisted financial edits cannot mix last-calculated quantities with frozen amounts", () => {
  for (const field of ["quantity", "unit", "unit_cost", "extended_cost", "inventory_item_id", "inventory_item_name"]) {
    const row = roundTrip(manifestRow(make()[0]));
    row[field] = typeof row[field] === "number" ? row[field] + 1 : "Changed";
    invalid(() => read(row));
  }
});
check("unknown historical basis cannot be filled with fake zero or current hours", () => {
  const part = make()[1]; delete part.pricing_basis_snapshot.reinforcement_frozen_pricing;
  for (const patch of [{ quantity: 0 }, { quantity: 1.2 }, { unit_cost: 0 }, { unit_cost: 60 }, { unit: "hr" }]) {
    invalid(() => read({ ...roundTrip(manifestRow(part)), ...patch }));
  }
  for (const frame of [null, undefined]) {
    const row = roundTrip(manifestRow(part));
    row.foundation_reinforcement_handoff.frozen_pricing = frame;
    invalid(() => read(roundTrip(row)));
  }
});
check("persisted future versions, malformed provenance and asserted approvals are rejected", () => {
  for (const change of [
    h => { h.version = 2; }, h => { h.engineering_approved = true; }, h => { h.procurement_ready = true; },
    h => { h.purchasing.quantity = 20; }, h => { h.last_calculated.quantity = 21; },
    h => { h.catalog_basis_current = "yes"; }, h => { h.definition_reference.reinforcement_proposal = {}; },
    h => { h.frozen_pricing = null; },
  ]) {
    const row = roundTrip(manifestRow(make()[0])); change(row.foundation_reinforcement_handoff);
    invalid(() => read(row));
  }
});
fs.writeFileSync(dir + "work-order-part-meta.json", JSON.stringify(compiled.metafile, null, 2) + "\n");
fs.writeFileSync(dir + "work-order-part-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Work Order reinforcement projection: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
