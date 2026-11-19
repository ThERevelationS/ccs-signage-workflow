import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18";
for (const [name, source] of [["draft", "foundationReinforcementDraft"], ["projection", "foundationReinforcementProjection"]]) {
  buildSync({ entryPoints: [`src/components/estimator/foundation/${source}.js`],
    bundle: true, platform: "node", format: "esm", outfile: `${DIR}/${name}-integration-bundle.mjs` });
}
const { createFoundationReinforcementDraft: create, prepareFoundationReinforcementDraft: prepare } =
  await import(pathToFileURL(path.resolve(`${DIR}/draft-integration-bundle.mjs`)));
const { calculateFoundationReinforcementProjection: project } =
  await import(pathToFileURL(path.resolve(`${DIR}/projection-integration-bundle.mjs`)));
const item = { component_id: "foundation-synthetic", foundation_type: "spread_foot", quantity: 1,
  include_rebar: true, length_inches: 36, width_inches: 36, depth_inches: 36 };
const draft = create(item);
Object.assign(draft.design, { bar_diameter_inches: ".5", cover_inches: { side: "3", top: "3", bottom: "3" },
  supports: { mode: "off", reason: "Synthetic support condition, not an engineering recommendation." },
  spread: { mats: [{ id: "top", bearing_elevation_inches: "32", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] } });
draft.material = { kind: "manual", unit: "ft", name: "Synthetic manual steel", reason: "Synthetic explicit manual basis.",
  bar_diameter_inches: "0.5", weight_lb_per_ft: ".668", cost_per_ft: "2" };
const clone = structuredClone;
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const near = (actual, expected) => assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function preview(raw = draft, source = item, options = {}) {
  const preparation = prepare(raw);
  if (!preparation.prepared) return { preparation, projection: null, ready: false };
  const typed = preparation.prepared;
  const projection = project({
    item: source, design: typed.design, material: typed.material,
    quantityOverride: typed.overrides.quantity_ft, rateOverride: typed.overrides.cost_per_ft, ...options,
  });
  return { preparation, projection, ready: !preparation.issues.some(i => i.severity === "error") && projection.canApplyToEstimate };
}
check("new draft has no invented engineering dimensions, rates, weight or supports", () => {
  const d = create(item);
  assert.equal(d.design.bar_diameter_inches, ""); assert.deepEqual(d.design.cover_inches, { side: "", top: "", bottom: "" });
  assert.equal(d.design.supports.mode, "unconfigured"); assert.equal(d.material.kind, "");
  assert.deepEqual(d.design.spread, { mats: [], inter_mat_ties: [] }); assert.equal(d.design.pillar.longitudinal.count, "");
  assert.deepEqual(d.overrides, { quantity_ft: null, cost_per_ft: null });
});
check("new draft preserves explicit existing0 overrides", () => {
  assert.deepEqual(create({ ...item, custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0 }).overrides, { quantity_ft: 0, cost_per_ft: 0 });
});
check("typed preview is20ft/material40/labor72/steel112 without changing raw text", () => {
  const before = JSON.stringify(draft), r = preview();
  assert.equal(r.ready, true); assert.equal(r.preparation.prepared.design.bar_diameter_inches, 0.5);
  near(r.projection.model.totals.total_steel_feet, 20); near(r.projection.steel.amounts.material_cost, 40);
  near(r.projection.steel.amounts.labor_cost, 72); near(r.projection.steel.amounts.steel_cost, 112);
  assert.equal(JSON.stringify(draft), before);
});
check("three instances scale fresh quantities and cost to60ft/336", () => {
  const r = preview(draft, { ...item, quantity: 3 }); assert.equal(r.ready, true);
  near(r.projection.steel.amounts.geometry_feet, 60); near(r.projection.steel.amounts.steel_cost, 336);
});
check("draft0 aggregate override means0 pricedft but48connectionlabor", () => {
  const d = clone(draft); d.overrides.quantity_ft = "0"; const r = preview(d);
  assert.equal(r.ready, true); near(r.projection.steel.amounts.priced_feet, 0); near(r.projection.steel.amounts.steel_cost, 48);
  assert.equal(d.overrides.quantity_ft, "0");
});
check("draft0 perft override retains labor72", () => {
  const d = clone(draft); d.overrides.cost_per_ft = "0"; const r = preview(d);
  assert.equal(r.ready, true); near(r.projection.steel.amounts.material_cost, 0); near(r.projection.steel.amounts.steel_cost, 72);
});
check("blank numeric field is missing/null, not guessed0/default", () => {
  const d = clone(draft); d.design.cover_inches.side = " ";
  const r = preview(d); assert.equal(r.ready, false); assert.equal(r.preparation.prepared.design.cover_inches.side, null);
  assert.equal(r.projection.steel.amounts, null); assert.equal(d.design.cover_inches.side, " ");
});
check("invalid raw numeric text remains visible; no partial parsing", () => {
  const d = clone(draft); d.design.spread.mats[0].max_spacing_x_inches = "12junk";
  const r = preview(d); assert.equal(r.ready, false);
  assert.equal(r.preparation.prepared.design.spread.mats[0].max_spacing_x_inches, "12junk");
  assert.equal(r.projection.model.totals, null);
});
check("negative dimensions do not price or overwrite raw inputs", () => {
  const d = clone(draft); d.design.cover_inches.side = "-oops"; const r = preview(d, { ...item, depth_inches: -1 });
  assert.equal(r.ready, false); assert.equal(r.projection.steel.amounts, null); assert.equal(d.design.cover_inches.side, "-oops");
});
check("cached fake model/price cannot bypass fresh invalid quantity", () => {
  const r = project({ item: { ...item, quantity: 0, calculated_model: { status: "valid", total_steel_feet: 20, cost: 0 } },
    design: prepare(draft).prepared.design, material: prepare(draft).prepared.material,
    model: { status: "off", groups: [] } });
  assert.equal(r.canApplyToEstimate, false); assert.equal(r.steel.amounts, null); assert.equal(r.model.status, "invalid");
});
check("unconfigured supports keep known steel112 preliminary, never apply", () => {
  const d = clone(draft); d.design.supports = { mode: "unconfigured" };
  const r = preview(d); assert.equal(r.ready, false); assert.equal(r.projection.steel.steelPriceAvailable, true);
  near(r.projection.steel.amounts.steel_cost, 112);
});
check("manual provenance error blocks even when price-helper readiness istrue", () => {
  const d = clone(draft); d.material.reason = ""; const r = preview(d);
  assert.equal(r.projection.steel.canApplyToEstimate, true); assert.equal(r.projection.canApplyToEstimate, false);
  assert.equal(r.ready, false); near(r.projection.steel.amounts.steel_cost, 112);
});
check("catalog0 ambiguity blocks combined projection despite known steel72", () => {
  const d = clone(draft); d.material = { kind: "catalog", inventory_id: "synthetic-rebar" };
  const r = preview(d, item, { inventory: [{ id: "synthetic-rebar", material_type: "rebar", unit: "ft",
    cost_per_unit: 0, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 }] });
  assert.equal(r.ready, false); assert.equal(r.projection.steel.canApplyToEstimate, true);
  near(r.projection.steel.amounts.steel_cost, 72);
});
check("rebaroff is0 without design/material/rates, not an engineering approval", () => {
  const r = project({ item: { ...item, include_rebar: false }, design: null, material: null, settings: null });
  assert.equal(r.canApplyToEstimate, true); assert.equal(r.model.status, "off"); assert.equal(r.basis, null);
  near(r.steel.amounts.steel_cost, 0); assert.equal(r.engineeringApproved, false);
});
check("malformed/missing raw item fails closed", () => {
  for (const value of [undefined, null, [], "bad"]) {
    const r = project({ item: value }); assert.equal(r.canApplyToEstimate, false); assert.equal(r.steel.amounts, null);
  }
});
check("unsupported draft schema is not silently migrated", () => {
  for (const schema_version of [undefined, "1", 2]) {
    const r = prepare({ ...draft, schema_version }); assert.equal(r.prepared, null); assert.ok(r.issues.length);
  }
});
check("unsupported design version and raw IDs are not silently fixed", () => {
  const d = clone(draft); d.design.version = 3; d.design.spread.mats[0].id = " top ";
  const r = preview(d); assert.equal(r.ready, false);
  assert.equal(r.preparation.prepared.design.version, 3); assert.equal(r.preparation.prepared.design.spread.mats[0].id, " top ");
});
check("oversize lists reject before mapping/rendering any partial quantities", () => {
  for (const [branch, key, count] of [["spread", "mats", 257], ["spread", "inter_mat_ties", 4097], ["pillar", "hoops", 257]]) {
    const d = clone(draft); d.design[branch][key] = Array(count).fill(d.design.spread.mats[0]);
    const r = prepare(d); assert.ok(r.issues.some(i => i.field === `design.${branch}.${key}`));
    assert.equal(r.prepared.design[branch][key], null);
  }
});
check("malformed list/row is visible as an invalid draft, not priced0", () => {
  const d = clone(draft); d.design.spread.mats = [null]; const r = preview(d);
  assert.equal(r.ready, false); assert.ok(r.preparation.issues.length); assert.equal(r.projection.steel.amounts, null);
});
check("accepted design and material are copied without aliasing; inactive data retained", () => {
  const typed = prepare(draft).prepared;
  const source = { ...item, reinforcement_calculation_version: 2, reinforcement_design: typed.design, reinforcement_material: typed.material };
  source.reinforcement_design.pillar.longitudinal.radius_inches = "-oops";
  const d = create(source); assert.equal(d.design.pillar.longitudinal.radius_inches, "-oops");
  d.design.cover_inches.side = 4; d.material.name = "Changed";
  assert.equal(source.reinforcement_design.cover_inches.side, 3); assert.equal(source.reinforcement_material.name, "Synthetic manual steel");
});
check("frozen raw inputs survive repeated fresh projection and typed preparation", () => {
  const d = freeze(clone(draft)), i = freeze(clone(item)), before = JSON.stringify({ d, i });
  const first = preview(d, i); first.projection.steel.amounts.steel_cost = -999;
  const second = preview(d, i); assert.equal(second.ready, true); near(second.projection.steel.amounts.steel_cost, 112);
  assert.equal(JSON.stringify({ d, i }), before);
});
fs.writeFileSync(`${DIR}/draft-projection-verification.json`, JSON.stringify({ synthetic: true, localOnly: true, results }, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Draft/projection: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
