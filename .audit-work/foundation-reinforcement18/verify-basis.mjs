import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { priceFoundationReinforcementModel as price } from "../../src/components/estimator/foundation/foundationReinforcementCost.js";

const DIR = ".audit-work/foundation-reinforcement18";
buildSync({ entryPoints: ["src/components/estimator/foundation/foundationReinforcementBasis.js"],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/basis-bundle.mjs` });
const { resolveFoundationReinforcementBasis: resolve } = await import(pathToFileURL(path.resolve(`${DIR}/basis-bundle.mjs`)));
const model = JSON.parse(fs.readFileSync(`${DIR}/cost-model-fixtures.json`, "utf8")).models.single;
const manual = { kind: "manual", unit: "ft", name: "Synthetic material", reason: "Synthetic explicit manual basis, not an engineering recommendation.",
  bar_diameter_inches: 0.5, weight_lb_per_ft: 0.668, cost_per_ft: 2 };
const row = { id: "steel-fixture-1", updated_date: "synthetic-rev-1", material_type: "rebar", rebar_size: "#4",
  material_name: "Synthetic catalog material", unit: "ft", cost_per_unit: 2,
  rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 };
const selected = { kind: "catalog", inventory_id: row.id };
const results = [];
const near = (actual, expected) => assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function evaluate(options = {}) {
  const resolved = resolve({ material: manual, ...options });
  const projected = price(model, resolved.basis);
  return { ...resolved, projected, ready: !resolved.issues.some(i => i.severity === "error") && projected.canApplyToEstimate };
}
function blocked(options, code) {
  const result = evaluate(options);
  assert.equal(result.ready, false);
  if (code) assert.ok(result.issues.some(i => i.code === code), JSON.stringify(result.issues));
  return result;
}
check("manual explicit basis uses documented missing-setting defaults and prices frozen20ft to112", () => {
  const r = evaluate(); assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 112);
  assert.deepEqual(r.rateSources.map(i => [i.key, i.source, i.value]), [
    ["foundation_main_labor_rate", "legacy_default", 60],
    ["foundation_rebar_time_linear_ft", "legacy_default", 0.02],
    ["foundation_rebar_time_cross_section", "legacy_default", 0.05],
  ]);
  assert.equal(r.materialSnapshot.inventory_id, null);
});
check("catalog stableID with explicit nominal metadata prices112", () => {
  const r = evaluate({ material: selected, inventory: [row] });
  assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 112);
  assert.equal(r.materialSnapshot.inventory_id, row.id); assert.equal(r.materialSnapshot.inventory_updated_date, "synthetic-rev-1");
});
check("same-size different-ID rows do not choose first bysize", () => {
  const second = { ...row, id: "steel-fixture-2", cost_per_unit: 9 };
  const r = evaluate({ material: { ...selected, inventory_id: second.id }, inventory: [row, second] });
  assert.equal(r.ready, true); near(r.basis.cost_per_ft, 9); near(r.projected.amounts.steel_cost, 252);
});
check("duplicate stableID fails rather than choosing first revision", () => blocked({ material: selected,
  inventory: [row, { ...row, cost_per_unit: 9 }] }, "reinforcement_material_id_ambiguous"));
for (const unit of ["ft", " Foot ", "FEET", "LF", "linear ft", "linear foot", "linear feet"]) check(`explicit foot alias:${unit}`, () => {
  const r = evaluate({ material: { ...manual, unit } }); assert.equal(r.ready, true); assert.equal(r.basis.unit, "ft");
});
for (const unit of [undefined, "", "each", "20 ft stick", "lb", "m"]) check(`unsupported unit:${unit}`, () =>
  blocked({ material: { ...manual, unit } }, "reinforcement_material_unit_unsupported"));
for (const settings of [null, [], false, new Date(0), new Map()]) check(`malformed settings do not infer defaults:${String(settings)}`, () => {
  const r = blocked({ settings }, "reinforcement_settings_unavailable");
  assert.equal(r.basis.labor_rate_per_hour, undefined); assert.equal(r.projected.amounts, null);
});
for (const value of [null, "", "60USD", "1e2", false, -1, Infinity]) check(`explicit invalid setting:${String(value)}`, () => {
  const r = blocked({ settings: { foundation_main_labor_rate: value } }, "reinforcement_labor_rate_invalid");
  assert.notEqual(r.basis.labor_rate_per_hour, 60);
});
for (const zero of [0, "0"]) check(`explicit zero labor rates:${typeof zero}`, () => {
  const r = evaluate({ settings: { foundation_main_labor_rate: zero, foundation_rebar_time_linear_ft: zero, foundation_rebar_time_cross_section: zero } });
  assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 40);
  assert.ok(r.rateSources.every(i => i.source === "settings" && i.value === 0));
});
check("null-prototype settings record works without hasOwnProperty method", () => {
  const settings = Object.assign(Object.create(null), { foundation_main_labor_rate: "120" });
  const r = evaluate({ settings }); assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 184);
});
check("explicit material zero stays free, never defaults", () => {
  const r = evaluate({ material: { ...manual, cost_per_ft: 0 } });
  assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 72);
});
check("ambiguous zero catalog rate requires explicit confirmation", () => blocked({
  material: selected, inventory: [{ ...row, cost_per_unit: 0 }],
}, "reinforcement_zero_catalog_rate_unconfirmed"));
check("explicit zero override confirms zero catalog rate", () => {
  const r = evaluate({ material: selected, inventory: [{ ...row, cost_per_unit: 0 }], rateOverride: 0 });
  assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 72);
  assert.equal(r.materialSnapshot.rate_source, "custom_rebar_cost_per_ft");
});
check("override0 can replace missing rate, not missing unit/diameter/weight", () => {
  const r = evaluate({ material: { ...manual, cost_per_ft: undefined }, rateOverride: "0" });
  assert.equal(r.ready, true); assert.equal(r.basis.cost_per_ft, 0); near(r.projected.amounts.steel_cost, 72);
  blocked({ material: { ...manual, unit: "each" }, rateOverride: 0 });
});
check("aggregate zero override is preserved separately from geometric20ft", () => {
  const r = evaluate({ quantityOverride: "0" }); assert.equal(r.ready, true);
  near(r.projected.amounts.geometry_feet, 20); near(r.projected.amounts.priced_feet, 0); near(r.projected.amounts.steel_cost, 48);
});
for (const value of ["", "5ft", -1, Infinity]) check(`invalid aggregate override:${String(value)}`, () =>
  blocked({ quantityOverride: value }, "reinforcement_quantity_override_invalid"));
check("missing manual reason blocks acceptance without hiding known preliminary steel112", () => {
  const r = blocked({ material: { ...manual, reason: "" } }, "reinforcement_manual_basis_reason_required");
  assert.equal(r.projected.steelPriceAvailable, true); near(r.projected.amounts.steel_cost, 112);
});
check("unknown weight is null, never0/standard fallback", () => {
  const r = blocked({ material: { ...manual, weight_lb_per_ft: undefined } });
  assert.equal(r.basis.weight_lb_per_ft, null); assert.equal(r.projected.amounts.geometry_weight_lbs, null);
});
check("missing catalog diameter is not inferred from #4", () => blocked({
  material: selected, inventory: [{ ...row, rebar_diameter_inches: undefined }],
}, "reinforcement_material_diameter_required"));
check("#9 label does not invent ninth-eighths diameter or default weight", () => {
  const r = blocked({ material: selected, inventory: [{ ...row, rebar_size: "#9", rebar_diameter_inches: undefined, rebar_weight_lb_per_ft: undefined }] });
  assert.equal(r.basis.bar_diameter_inches, undefined); assert.equal(r.basis.weight_lb_per_ft, null);
});
check("known diameter mismatch is rejected by model/cost compatibility", () => {
  const r = blocked({ material: { ...manual, bar_diameter_inches: 0.625 } });
  assert.ok(r.projected.issues.some(i => i.code === "reinforcement_material_diameter_mismatch"));
});
check("missing catalog and failed catalog read are distinguishable", () => {
  blocked({ material: selected, inventory: [] }, "reinforcement_material_unavailable");
  blocked({ material: selected, inventory: null }, "reinforcement_inventory_unavailable");
});
check("wrong material type cannot borrow matching-looking price metadata", () => blocked({
  material: selected, inventory: [{ ...row, material_type: "forming_material" }],
}, "reinforcement_material_type_invalid"));
check("fresh catalog values are resolved, not stale reference snapshots", () => {
  const r = evaluate({ material: { ...selected, cost_per_ft: 1, bar_diameter_inches: 7 }, inventory: [{ ...row, cost_per_unit: 3 }] });
  assert.equal(r.ready, true); near(r.projected.amounts.steel_cost, 132); assert.equal(r.basis.bar_diameter_inches, 0.5);
});
check("frozen inputs are not mutated and outputs do not share state", () => {
  const m = Object.freeze({ ...manual }), settings = Object.freeze({ foundation_main_labor_rate: 60 });
  const first = evaluate({ material: m, settings }); first.basis.cost_per_ft = -999; first.rateSources[0].value = 999;
  const second = evaluate({ material: m, settings }); assert.equal(second.ready, true); near(second.projected.amounts.steel_cost, 112);
});
fs.writeFileSync(`${DIR}/basis-verification.json`, JSON.stringify({ synthetic: true, localOnly: true, results }, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Reinforcement basis: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
