import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const output = DIR + "reinforcement-preview-3d-bundle.mjs";
const built = await build({ entryPoints: ["src/components/estimator/foundation/foundationReinforcementPreview3D.js"],
  bundle: true, format: "esm", platform: "node", outfile: output, metafile: true });
assert.ok(!Object.keys(built.metafile.inputs).some(file => /base44Client|staffEntities|node_modules\/@base44|foundationCalc/.test(file)));
const { buildFoundationReinforcementPreview3D: preview, FOUNDATION_3D_PREVIEW_LIMITS: limits } =
  await import(pathToFileURL(path.resolve(output)));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const design = freeze({
  version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: { mode: "off", reason: "Synthetic exclusion only; no structural advice." },
  spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] },
});
const item = freeze({ component_id: "synthetic", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true, reinforcement_calculation_version: 2,
  reinforcement_design: design });
const run = (patch = {}, options) => preview({ items: [{ ...item, ...patch }] }, options);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
}
check("legacy or absent calculation versions never acquire invented steel or a new design", () => {
  for (const version of [undefined, null, 1]) {
    const actual = run({ reinforcement_calculation_version: version });
    assert.equal(actual.hasVersioned, false); assert.equal(actual.steelCount, 0);
    assert.equal(actual.instances[0].reinforcementStatus, "legacy");
    assert.deepEqual(actual.instances[0].dimensionsFeet, [3, 3, 3]);
    assert.deepEqual(actual.instances[0].positionFeet, [1.5, -1.5, 0]);
  }
});
check("one top mat renders exactly eight horizontal 30-inch paths, totaling 20 physical feet, with no invented vertical steel", () => {
  const actual = run(); assert.equal(actual.steelCount, 8);
  assert.ok(actual.instances[0].steel.every(primitive => primitive.role === "horizontal" && primitive.kind === "segment"));
  assert.equal(actual.instances[0].steel.reduce((sum, primitive) => sum + primitive.lengthFeet, 0), 20);
  assert.equal(actual.engineeringApproved, false); assert.equal(actual.instances[0].engineeringApproved, false);
});
check("inches convert once into concrete-centered local feet with the nominal physical bar radius", () => {
  const steel = run().instances[0].steel[0];
  near(steel.from[0], -1.25); near(steel.to[0], 1.25); near(steel.from[1], 1.1875);
  near(steel.from[2], -14.75 / 12); near(steel.radiusFeet, 0.5 / 24); near(steel.lengthFeet, 2.5);
});
check("a grade offset and shared parent rotation preserve the concrete-to-steel registration", () => {
  const instance = run({ grade_offset_inches: 12, rotation_degrees: 90 }).instances[0];
  assert.deepEqual(instance.positionFeet, [1.5, -0.5, 0]); near(instance.rotationRadians, Math.PI / 2);
  near(instance.steel[0].from[1] + instance.positionFeet[1], 0.6875);
  assert.equal(item.grade_offset_inches, undefined);
});
check("multiple instances retain per-instance geometry instead of scaling a bar's dimensions", () => {
  const actual = run({ quantity: 2 });
  assert.equal(actual.instances.length, 2); assert.equal(actual.steelCount, 16);
  assert.deepEqual(actual.instances.map(instance => instance.positionFeet), [[1.5, -1.5, 0], [6.5, -1.5, 0]]);
  assert.deepEqual(actual.instances[0].steel, actual.instances[1].steel);
});
check("pricing overrides, frozen totals and an unapplied draft cannot alter the active physical preview", () => {
  const before = run();
  const actual = run({ custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0, rebar_feet: 0, rebar_cost: 48,
    reinforcement_cost_snapshot: { amounts: { total: 48 } }, reinforcement_proposal: { design: { malformed: true } } });
  assert.deepEqual(actual, before);
});
check("pillar longitudinal bars and hoop centerlines remain separate physical primitives", () => {
  const actual = run({ foundation_type: "pillar", diameter: 24, depth_inches: 48,
    reinforcement_design: { ...design, spread: undefined, pillar: {
      longitudinal: { count: 4, radius_inches: 6, bottom_end_inches: 3.25, top_end_inches: 44.75 },
      hoops: [{ id: "low", center_y_inches: 12, centerline_diameter_inches: 14, cut_allowance_inches: 1 },
        { id: "high", center_y_inches: 36, centerline_diameter_inches: 14, cut_allowance_inches: 0 }],
    } } });
  assert.equal(actual.steelCount, 6);
  const steel = actual.instances[0].steel;
  assert.equal(steel.filter(primitive => primitive.role === "longitudinal").length, 4);
  const hoops = steel.filter(primitive => primitive.kind === "hoop");
  assert.deepEqual(hoops.map(hoop => hoop.center), [[0, -1, 0], [0, 1, 0]]);
  near(hoops[0].centerlineRadiusFeet, 7 / 12); near(hoops[0].radiusFeet, 0.5 / 24);
  assert.equal(hoops[0].allowanceNotDrawn, true); assert.equal(hoops[1].allowanceNotDrawn, false);
});
check("inter-mat ties remain reference paths; authored hook/cut allowances are not invented as straight geometry", () => {
  const actual = run({ reinforcement_design: { ...design, spread: {
    mats: [{ ...design.spread.mats[0], id: "bottom", bearing_elevation_inches: 3 }, design.spread.mats[0]],
    inter_mat_ties: [{ id: "tie", from_mat_id: "bottom", to_mat_id: "top", x_inches: 6, z_inches: 6, cut_length_inches: 36 }],
  } } });
  assert.equal(actual.steelCount, 17);
  const tie = actual.instances[0].steel.find(primitive => primitive.kind === "tie_reference");
  assert.ok(tie); near(tie.lengthFeet, 29 / 12); assert.notEqual(tie.lengthFeet, 3);
  assert.ok(actual.issues.some(issue => /Tie paths are references/.test(issue.message)));
});
check("unconfigured supports stay visibly unmodeled rather than being fabricated as zero support objects", () => {
  const actual = run({ reinforcement_design: { ...design, supports: { mode: "manual" } } });
  assert.equal(actual.steelCount, 8);
  assert.ok(actual.issues.some(issue => /Supports have not been modeled or priced/.test(issue.message)));
  assert.ok(actual.instances[0].steel.every(primitive => primitive.role !== "support"));
});
check("rebar explicitly off produces no steel and does not require a design", () => {
  const actual = run({ include_rebar: false, reinforcement_design: null });
  assert.equal(actual.steelCount, 0); assert.equal(actual.instances[0].reinforcementStatus, "off");
});
check("unsupported versions and malformed active designs do not silently display legacy steel", () => {
  for (const version of [0, 3, "1", "2", []]) {
    const actual = run({ reinforcement_calculation_version: version });
    assert.equal(actual.steelCount, 0); assert.ok(actual.issues.some(issue => /unsupported/.test(issue.message)));
  }
  for (const patch of [{ reinforcement_design: {} }, { include_rebar: "false" }]) {
    const actual = run(patch); assert.equal(actual.steelCount, 0);
    assert.ok(actual.issues.some(issue => issue.severity === "error"));
  }
});
check("invalid counts never turn into one foundation or an unbounded render loop", () => {
  for (const quantity of [0, -1, 1.5, "1e309", Infinity]) {
    const actual = run({ quantity }); assert.equal(actual.instances.length, 0);
    assert.equal(actual.steelCount, 0); assert.ok(actual.issues.some(issue => issue.severity === "error"));
  }
  assert.equal(run({ quantity: undefined }).instances.length, 1);
});
check("hiding reinforcement does not change foundation geometry or the saved design", () => {
  const actual = run({ quantity: 2 }, { showReinforcement: false });
  assert.equal(actual.instances.length, 2); assert.equal(actual.steelCount, 0);
  assert.equal(actual.instances[0].reinforcementStatus, "valid");
});
check("instance and steel budgets affect only the preview, not authored quantities", () => {
  assert.deepEqual(limits, { instances: 64, steelPrimitives: 2048 });
  const many = freeze({ ...item, quantity: 1000 });
  const actual = preview({ items: [many, item] });
  assert.equal(actual.instances.length, 64); assert.equal(actual.steelCount, 512);
  assert.equal(actual.clipped, true); assert.equal(many.quantity, 1000);
  const mats = Array.from({ length: 256 }, (_, index) => ({ ...design.spread.mats[0], id: "mat" + index, bearing_elevation_inches: 3 + index * 2 }));
  const dense = run({ quantity: 2, depth_inches: 1024, reinforcement_design: { ...design, spread: { mats, inter_mat_ties: [] } } });
  assert.equal(dense.instances.length, 2); assert.equal(dense.steelCount, 2048); assert.equal(dense.clipped, true);
  assert.equal(dense.instances[0].steel.length, 2048); assert.equal(dense.instances[1].steel.length, 0);
});
check("nonfinite or partial authored transforms fail visibly; large finite rotation is safely normalized", () => {
  for (const patch of [{ rotation_degrees: "90deg" }, { grade_offset_inches: Infinity }]) {
    const actual = run(patch); assert.equal(actual.instances.length, 0); assert.ok(actual.issues.some(issue => /rotation/.test(issue.message)));
  }
  assert.ok(Number.isFinite(run({ rotation_degrees: 1e308 }).instances[0].rotationRadians));
});
check("unsupported 3D float ranges and malformed collections do not fabricate zero-sized geometry", () => {
  const actual = run({ length_inches: 3e200, width_inches: 3e-200 });
  assert.equal(actual.instances.length, 0); assert.ok(actual.issues.some(issue => /3D numeric range/.test(issue.message)));
  for (const items of [null, "not-a-list"]) assert.equal(preview({ items }).issues[0].severity, "error");
  assert.equal(JSON.stringify(item), JSON.stringify({ ...item }));
});
fs.writeFileSync(DIR + "reinforcement-preview-3d-verification.json", JSON.stringify({
  synthetic: true, realBase44StorageVerified: false, webGLVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Reinforcement preview model: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
