import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { Vector3, Matrix4 } from "three";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/foundationReinforcementPreview3D.js"],
  bundle: true, format: "esm", platform: "node", write: false, metafile: true,
});
assert.ok(!Object.keys(compiled.metafile.inputs).some(file => /base44Client|staffEntities|foundationCalc\.js|@base44/.test(file)));
const { buildFoundationReinforcementPreview3D: preview } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const base = freeze({ component_id: "anchor", foundation_type: "spread_foot", quantity: 1,
  length_inches: 72, width_inches: 36, depth_inches: 36, x_inches: 120, z_inches: 240,
  reinforcement_calculation_version: 1, include_rebar: false });
const run = patch => preview(freeze({ items: [{ ...base, ...patch }] }), { placementMode: "layout" });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("saved top-left inches become centered feet with no inspection spread", () => {
  const model = run();
  assert.equal(model.placementMode, "layout");
  assert.deepEqual(model.instances[0].positionFeet, [13, -1.5, 21.5]);
  assert.deepEqual(model.instances[0].dimensionsFeet, [6, 3, 3]);
});
check("clockwise CSS90 rotation matches the real Three rotated top-left corner", () => {
  const item = run({ rotation_degrees: 90 }).instances[0];
  near(item.rotationRadians, -Math.PI / 2);
  const corner = new Vector3(-3, 0, -1.5)
    .applyMatrix4(new Matrix4().makeRotationY(item.rotationRadians)).add(new Vector3(...item.positionFeet));
  near(corner.x, 14.5); near(corner.z, 18.5); near(corner.y, -1.5);
});
check("negative anchors are not clamped and missing legacy coordinates default to the same2Dzero", () => {
  assert.deepEqual(run({ x_inches: -24, z_inches: -12 }).instances[0].positionFeet, [1, -1.5, 0.5]);
  assert.deepEqual(run({ x_inches: undefined, z_inches: null }).instances[0].positionFeet, [3, -1.5, 1.5]);
});
check("quantity3 has only one recorded anchor, with explicit unrecorded additional-location warning", () => {
  const project = freeze({ items: [{ ...base, quantity: 3, total_cost: 694 }] });
  const frozen = JSON.stringify(project), model = preview(project, { placementMode: "layout" });
  assert.equal(model.instances.length, 1);
  assert.equal(model.clipped, false, "Missing locations are not budget clipping");
  assert.ok(model.issues.some(issue => /additional.*locations.*not recorded/i.test(issue.message)));
  assert.equal(JSON.stringify(project), frozen);
});
check("inspection remains the default with all quantity copies and its original rotation sign", () => {
  const project = freeze({ items: [{ ...base, quantity: 2, rotation_degrees: 90 }] });
  const actual = preview(project), explicit = preview(project, { placementMode: "inspection" });
  assert.equal(actual.placementMode, "inspection"); assert.deepEqual(actual, explicit);
  assert.deepEqual(actual.instances.map(item => item.positionFeet), [[3, -1.5, 0], [11, -1.5, 0]]);
  near(actual.instances[0].rotationRadians, Math.PI / 2);
});
check("authored-broken and Float32-overflow coordinates are not silently relocated", () => {
  for (const value of ["", "bad", false, [], {}, Infinity, 1e40]) {
    const model = run({ x_inches: value });
    assert.equal(model.instances.length, 0, String(value));
    assert.ok(model.issues.some(issue => issue.severity === "error"), String(value));
  }
  assert.equal(preview({ items: [{ ...base, x_inches: "bad" }] }).instances.length, 1,
    "Inspection may still inspect valid geometry independent of a broken saved location");
});
check("pillar saved anchor uses diameter for both footprint dimensions and keeps grade offset", () => {
  const model = run({ foundation_type: "pillar", diameter: 24, depth_inches: 48, grade_offset_inches: 12 });
  assert.deepEqual(model.instances[0].positionFeet, [11, -1, 21]);
  assert.deepEqual(model.instances[0].dimensionsFeet, [2, 4, 2]);
});
check("version2 steel shares its concrete saved pose without changing frozen quantities or approvals", () => {
  const design = { version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "Synthetic rendering exclusion, not structural advice." },
    spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] } };
  const project = freeze({ items: [{ ...base, length_inches: 36, rotation_degrees: 90, grade_offset_inches: 12,
    reinforcement_calculation_version: 2, include_rebar: true, reinforcement_design: design,
    custom_rebar_qty: 0, rebar_cost: 40, rebar_labor_cost: 72.00000000000001 }] });
  const frozen = JSON.stringify(project), layout = preview(project, { placementMode: "layout" }), inspection = preview(project);
  const instance = layout.instances[0];
  assert.deepEqual(instance.positionFeet, [11.5, -0.5, 21.5]);
  assert.deepEqual(instance.steel, inspection.instances[0].steel);
  assert.equal(layout.steelCount, 8);
  assert.equal(instance.steel.reduce((sum, primitive) => sum + primitive.lengthFeet, 0), 20);
  const point = new Vector3(...instance.steel[0].from)
    .applyMatrix4(new Matrix4().makeRotationY(instance.rotationRadians)).add(new Vector3(...instance.positionFeet));
  near(point.x, 11.5 + 14.75 / 12); near(point.y, 0.6875); near(point.z, 20.25);
  assert.equal(layout.engineeringApproved, false); assert.equal(JSON.stringify(project), frozen);
});
check("unsupported placement modes fail closed without interpreting them as saved positions", () => {
  const model = preview({ items: [base] }, { placementMode: "unrecognized" });
  assert.equal(model.instances.length, 0);
  assert.ok(model.issues.some(issue => issue.severity === "error" && /placement/i.test(issue.message)));
});
fs.writeFileSync(DIR + "foundation-saved-anchor-verification.json", JSON.stringify({ results, syntheticOnly: true,
  realRendererVerified: false, UIWired: false, pricingChanged: false }, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
