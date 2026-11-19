import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { priceFoundationReinforcementModel as price } from "../../src/components/estimator/foundation/foundationReinforcementCost.js";

const DIR = ".audit-work/foundation-reinforcement18";
const hashFile = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceHash = hashFile("src/components/estimator/foundation/foundationReinforcementModel.js");
const originalCore = JSON.parse(fs.readFileSync(`${DIR}/core-acceptance.json`, "utf8"));
const seam = fs.existsSync(`${DIR}/validation-seam-acceptance.json`)
  ? JSON.parse(fs.readFileSync(`${DIR}/validation-seam-acceptance.json`, "utf8")) : null;
const compatibleSeam = seam?.verified === true && seam.coreSourceSha256 === originalCore.sha256
  && seam.modelSourceSha256 === sourceHash
  && seam.geometrySourceSha256 === hashFile("src/components/estimator/foundation/foundationGeometryInputs.js");
assert.ok(sourceHash === originalCore.sha256 || compatibleSeam, "Model source changed without a verified compatibility seam.");
const fixtureFile = `${DIR}/cost-model-fixtures.json`;
if (fs.existsSync(`${DIR}/cost-acceptance.json`)) {
  const accepted = JSON.parse(fs.readFileSync(`${DIR}/cost-acceptance.json`, "utf8"));
  assert.ok(fs.existsSync(fixtureFile), "Accepted cost fixtures must be recovered, never silently regenerated.");
  assert.equal(hashFile(fixtureFile), accepted.fixtureSha256, "Accepted input quantities changed.");
}
if (!fs.existsSync(fixtureFile)) {
  const { calculateFoundationReinforcementModel: calculate } = await import(pathToFileURL(path.resolve(`${DIR}/model-bundle.mjs`)));
  const item = { component_id: "f1", foundation_type: "spread_foot", quantity: 1, include_rebar: true,
    length_inches: 36, width_inches: 36, depth_inches: 36 };
  const mat = { id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 };
  const design = { version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "Synthetic explicit support condition; not an engineering recommendation." },
    spread: { mats: [mat], inter_mat_ties: [] } };
  const pillar = { ...item, foundation_type: "pillar", diameter: 24 };
  const pd = { ...design, pillar: { hoops: [{ id: "h1", center_y_inches: 6, centerline_diameter_inches: 17, cut_allowance_inches: 0 }],
    longitudinal: { count: 4, radius_inches: 8, bottom_end_inches: 3, top_end_inches: 33 } } };
  const ties = { ...design, spread: {
    mats: [mat, { ...mat, id: "bottom", bearing_elevation_inches: 3 }],
    inter_mat_ties: [{ id: "t1", from_mat_id: "bottom", to_mat_id: "top", x_inches: 3.25, z_inches: 3.25, cut_length_inches: 29 }],
  } };
  const calc = (it, config) => calculate(it, config, { geometryLimit: 0 });
  const models = {
    single: calc(item, design), triple: calc({ ...item, quantity: 3 }, design),
    off: calc({ ...item, include_rebar: false }), invalid: calc({ ...item, quantity: 0 }, design),
    supportsUnknown: calc(item, { ...design, supports: { mode: "auto" } }),
    pillar: calc(pillar, pd), disconnected: calc(pillar, { ...pd,
      pillar: { ...pd.pillar, longitudinal: { ...pd.pillar.longitudinal, radius_inches: 1 } } }),
    ties: calc(item, ties),
  };
  for (const [name, model] of Object.entries(models)) {
    assert.equal(model.status, name === "off" ? "off" : name === "invalid" ? "invalid" : "valid", JSON.stringify(model.issues));
  }
  fs.writeFileSync(fixtureFile, JSON.stringify({ sourceHash, synthetic: true, models }, null, 2) + "\n");
}
const fixture = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
assert.equal(fixture.sourceHash, originalCore.sha256);
if (process.argv.includes("--check-fixtures-only")) {
  console.log("Frozen cost fixture bytes unchanged; current model/basic-input compatibility receipt matches.");
  process.exit(0);
}
const models = fixture.models;
const basis = { unit: "ft", bar_diameter_inches: 0.5, cost_per_ft: 2, weight_lb_per_ft: 0.668,
  labor_rate_per_hour: 60, labor_hours_per_ft: 0.02, labor_hours_per_connection: 0.05 };
const clone = structuredClone;
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const near = (actual, expected) => assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function unavailable(model = models.single, config = basis, code) {
  const result = price(model, config);
  assert.equal(result.steelPriceAvailable, false);
  assert.equal(result.canApplyToEstimate, false);
  assert.equal(result.amounts, null);
  assert.equal(result.engineeringApproved, false);
  assert.ok(result.issues.some(i => i.severity === "error"));
  if (code) assert.ok(result.issues.some(i => i.code === code), JSON.stringify(result.issues));
}
check("one mat independent expected costs:20ft/16contacts/material40/labor72/steel112", () => {
  const r = price(models.single, basis);
  assert.equal(r.steelPriceAvailable, true); assert.equal(r.canApplyToEstimate, true); assert.equal(r.engineeringApproved, false);
  for (const [field, value] of Object.entries({ geometry_feet: 20, priced_feet: 20, connection_count: 16,
    material_cost: 40, labor_hours: 1.2, labor_cost: 72, steel_cost: 112, priced_weight_lbs: 13.36, geometry_weight_lbs: 13.36 })) near(r.amounts[field], value);
});
check("three foundations:60ft/48contacts/material120/labor216/steel336", () => {
  const r = price(models.triple, basis); assert.equal(r.steelPriceAvailable, true);
  near(r.amounts.geometry_feet, 60); near(r.amounts.connection_count, 48);
  near(r.amounts.material_cost, 120); near(r.amounts.labor_cost, 216); near(r.amounts.steel_cost, 336);
});
check("aggregate10ft override is not multiplied by3 again", () => {
  const r = price(models.triple, { ...basis, quantity_override_ft: 10 });
  near(r.amounts.geometry_feet, 60); near(r.amounts.priced_feet, 10); near(r.amounts.steel_cost, 176);
  near(r.amounts.priced_weight_lbs, 6.68); near(r.amounts.geometry_weight_lbs, 40.08);
  assert.ok(r.issues.some(i => i.code === "reinforcement_priced_quantity_differs"));
});
check("explicit0ft keeps geometric20ft and16connection labor48, not borrowed material", () => {
  const r = price(models.single, { ...basis, quantity_override_ft: 0 });
  near(r.amounts.material_cost, 0); near(r.amounts.priced_feet, 0); near(r.amounts.priced_weight_lbs, 0);
  near(r.amounts.geometry_feet, 20); near(r.amounts.geometry_weight_lbs, 13.36); near(r.amounts.steel_cost, 48);
});
check("explicit free material and zero labor stay zero", () => {
  const r = price(models.single, { ...basis, cost_per_ft: 0, labor_rate_per_hour: 0 });
  assert.equal(r.canApplyToEstimate, true); near(r.amounts.steel_cost, 0);
});
check("null aggregate override means geometric quantity", () => near(price(models.single, { ...basis, quantity_override_ft: null }).amounts.priced_feet, 20));
check("off is real zero without rates/supports", () => {
  const r = price(models.off); assert.equal(r.canApplyToEstimate, true); assert.equal(r.engineeringApproved, false);
  for (const value of Object.values(r.amounts)) assert.equal(value, 0);
});
check("unknown supports have preliminary steel112 but cannot replace totals", () => {
  const r = price(models.supportsUnknown, basis);
  assert.equal(r.steelPriceAvailable, true); assert.equal(r.canApplyToEstimate, false); near(r.amounts.steel_cost, 112);
  assert.ok(r.issues.some(i => i.code === "reinforcement_support_cost_unknown"));
});
for (const weight of [null, undefined]) check(`unknown weight ${weight}:NULL not0, blockshandoff`, () => {
  const r = price(models.single, { ...basis, weight_lb_per_ft: weight });
  assert.equal(r.steelPriceAvailable, true); assert.equal(r.canApplyToEstimate, false);
  assert.equal(r.amounts.priced_weight_lbs, null); assert.equal(r.amounts.geometry_weight_lbs, null); near(r.amounts.steel_cost, 112);
});
check("pillar singlehoop keeps10ft longitudinal steel and4contacts", () => {
  const r = price(models.pillar, basis), feet = 10 + 17 * Math.PI / 12;
  assert.equal(r.canApplyToEstimate, true); near(r.amounts.geometry_feet, feet); near(r.amounts.connection_count, 4);
  near(r.amounts.steel_cost, 2 * feet + 60 * (feet * 0.02 + 0.2));
});
check("disconnected steel preliminary amount cannot imply proven connections", () => {
  const r = price(models.disconnected, basis);
  assert.equal(r.steelPriceAvailable, true); assert.equal(r.canApplyToEstimate, false);
  assert.ok(r.issues.some(i => i.code === "reinforcement_connection_cost_unverified"));
});
check("manual tie path remains fabrication-review gated", () => {
  const r = price(models.ties, basis);
  near(r.amounts.geometry_feet, 40 + 29 / 12); near(r.amounts.connection_count, 34);
  assert.equal(r.canApplyToEstimate, false); assert.ok(r.issues.some(i => i.code === "reinforcement_connection_cost_unverified"));
});
for (const field of ["cost_per_ft", "labor_rate_per_hour", "labor_hours_per_ft", "labor_hours_per_connection"]) {
  for (const value of [undefined, null, "", "0", -1, NaN, Infinity]) check(`invalid ${field}:${String(value)}`, () =>
    unavailable(models.single, { ...basis, [field]: value }, "reinforcement_cost_input_invalid"));
}
for (const unit of [undefined, "each", "ft ", "lb"]) check(`unsupported unit:${unit}`, () => unavailable(models.single, { ...basis, unit }));
for (const value of [0, -1, "0.5", 0.625]) check(`invalid/mismatched diameter:${value}`, () => unavailable(models.single, { ...basis, bar_diameter_inches: value }));
for (const value of [0, -1, "0.668", Infinity]) check(`invalid weight:${value}`, () => unavailable(models.single, { ...basis, weight_lb_per_ft: value }));
for (const value of ["0", -1, NaN, Infinity]) check(`invalid override:${String(value)}`, () => unavailable(models.single, { ...basis, quantity_override_ft: value }));
for (const field of ["cost_per_ft", "labor_rate_per_hour", "labor_hours_per_ft", "labor_hours_per_connection", "weight_lb_per_ft"]) {
  check(`positive arithmetic overflow:${field}`, () => unavailable(models.single, { ...basis, [field]: Number.MAX_VALUE }, "reinforcement_cost_numeric_range_invalid"));
}
check("positive material underflow cannot masquerade as0", () => unavailable(models.single,
  { ...basis, quantity_override_ft: Number.MIN_VALUE, cost_per_ft: 0.5 }, "reinforcement_cost_numeric_range_invalid"));
check("positive weight underflow cannot masquerade as0", () => unavailable(models.single,
  { ...basis, quantity_override_ft: 0.5, weight_lb_per_ft: Number.MIN_VALUE }, "reinforcement_cost_numeric_range_invalid"));
for (const model of [null, { ...models.single, version: 3 }, models.invalid]) check(`invalid current model:${model?.status ?? "missing"}/${model?.version}`, () => unavailable(model));
check("cut schedule and aggregate quantity mismatch fails closed", () => {
  const m = clone(models.single); m.totals.total_steel_feet = 21; unavailable(m, basis, "reinforcement_cost_schedule_mismatch");
});
check("missing connection count is unknown, not0", () => {
  const m = clone(models.single); delete m.totals.hoop_bar_crossings; unavailable(m);
});
check("contradictory off model cannot erase real steel", () => unavailable({ ...models.single, status: "off" }));
check("errored model diagnostics cannot be ignored merely because status says valid", () =>
  unavailable({ ...models.single, issues: [{ severity: "error", code: "broken_model" }] }));
check("malformed model diagnostics fail closed without throwing", () => unavailable({ ...models.single, issues: {} }));
check("unknown cut group role cannot masquerade as complete steel", () => {
  const m = clone(models.single); m.groups[0].role = "unknown"; unavailable(m);
});
check("frozen inputs and separate outputs; no shared state", () => {
  const m = freeze(clone(models.single)), b = freeze(clone(basis)), before = JSON.stringify(m);
  const first = price(m, b); first.amounts.steel_cost = -999; first.issues.push({ code: "caller_mutation" });
  const second = price(m, b); near(second.amounts.steel_cost, 112); assert.equal(JSON.stringify(m), before);
  assert.ok(!second.issues.some(i => i.code === "caller_mutation"));
});
fs.writeFileSync(`${DIR}/cost-verification.json`, JSON.stringify({ localOnly: true, synthetic: true, results }, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Reinforcement cost: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
