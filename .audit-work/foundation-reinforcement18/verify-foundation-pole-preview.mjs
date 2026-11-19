import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/foundationPolePreview3D.js"],
  bundle: true, format: "esm", platform: "node", write: false, metafile: true,
});
assert.ok(!Object.keys(compiled.metafile.inputs).some(file => /base44Client|staffEntities|foundationCalc|InvokeLLM|@base44/.test(file)));
const { buildFoundationPolePreview3D: preview, FOUNDATION_POLE_3D_PREVIEW_LIMIT: limit } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const pose = freeze({ index: 0, instanceIndex: 0, dimensionsFeet: [3, 3, 3], positionFeet: [11.5, -0.5, 21.5] });
const attached = freeze({ selected_pole_id: "synthetic-pole", pole_total_height_inches: 120, quantity: 3 });
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("attached marker follows resolved foundation X/Z and grade top rather than fixedZzero", () => {
  const model = preview(freeze({ items: [attached], poles: [] }), [pose]);
  assert.equal(model.poles.length, 1);
  assert.deepEqual(model.poles[0].positionFeet, [11.5, 6, 21.5]);
  assert.equal(model.poles[0].heightFeet, 10); assert.equal(model.poles[0].radiusFeet, 0.35);
  assert.equal(model.poles[0].heightBasis, "recorded");
  assert.equal(model.poles[0].kind, "attached");
  assert.equal(model.engineeringApproved, false);
});
check("independent center coordinates offset and height convert inches exactly once", () => {
  const model = preview(freeze({ poles: [{ x_inches: 60, z_inches: 120, height_inches: 120, y_offset_inches: 12 }] }), []);
  assert.equal(model.poles.length, 1);
  assert.deepEqual(model.poles[0].positionFeet, [5, 6, 10]);
  assert.equal(model.poles[0].heightFeet, 10); assert.equal(model.poles[0].kind, "independent");
});
check("legacy missing heights remain explicit schematic placeholders and never enter source data", () => {
  const project = freeze({ items: [{ selected_pole_id: "synthetic-pole" }], poles: [{}] });
  const original = JSON.stringify(project), model = preview(project, [pose]);
  assert.equal(model.poles.length, 2);
  assert.ok(model.poles.every(pole => pole.heightFeet === 8 && pole.heightBasis === "legacy_default"));
  assert.ok(model.issues.filter(issue => /height.*not recorded/i.test(issue.message)).length >= 2);
  assert.deepEqual(model.poles[1].positionFeet, [0, 4, 0]);
  assert.equal(JSON.stringify(project), original);
});
check("explicit zero and malformed active heights never become the legacy8ft default", () => {
  for (const height of [0, -12, false, [], {}, "bad", Infinity, 1e40]) {
    const model = preview(freeze({
      items: [{ selected_pole_id: "synthetic-pole", pole_total_height_inches: height }],
      poles: [{ height_inches: height }],
    }), [pose]);
    assert.equal(model.poles.length, 0, String(height));
    assert.ok(model.issues.some(issue => issue.severity === "error" && /height/i.test(issue.message)), String(height));
  }
});
check("broken independent coordinates and offsets are omitted rather than silently relocated", () => {
  for (const value of ["", "bad", false, [], {}, Infinity, 1e40]) {
    for (const patch of [{ x_inches: value }, { z_inches: value }, { y_offset_inches: value }]) {
      const model = preview(freeze({ poles: [{ height_inches: 120, ...patch }] }), []);
      assert.equal(model.poles.length, 0, JSON.stringify(patch));
      assert.ok(model.issues.some(issue => issue.severity === "error"));
    }
  }
  const missing = preview(freeze({ poles: [{ x_inches: null, z_inches: undefined, y_offset_inches: null, height_inches: 120 }] }), []);
  assert.deepEqual(missing.poles[0].positionFeet, [0, 5, 0]);
});
check("malformed collections and row records produce recoverable diagnostics instead of renderer exceptions", () => {
  const malformed = preview(freeze({ poles: {} }), []);
  assert.equal(malformed.poles.length, 0);
  assert.ok(malformed.issues.some(issue => issue.severity === "error"));
  for (const pole of [null, false, [], "bad"]) {
    const model = preview(freeze({ poles: [pole] }), []);
    assert.equal(model.poles.length, 0);
    assert.ok(model.issues.some(issue => issue.severity === "error"));
  }
});
check("only resolved foundation instances create attached markers, never raw quantity copies", () => {
  const project = freeze({ items: [attached] });
  const one = preview(project, [pose]);
  assert.equal(one.poles.length, 1);
  const two = preview(project, [pose, { ...pose, instanceIndex: 1, positionFeet: [31.5, -0.5, 21.5] }]);
  assert.equal(two.poles.length, 2);
  assert.deepEqual(two.poles[1].positionFeet, [31.5, 6, 21.5]);
  assert.equal(preview(project, []).poles.length, 0);
});
check("render-only64marker budget never changes source quantities financials or gates", () => {
  assert.equal(limit, 64);
  const project = freeze({ items: [{ ...attached, rebar_cost: 40, rebar_labor_cost: 72.00000000000001 }],
    poles: Array.from({ length: 64 }, (_, index) => ({ x_inches: index * 12, height_inches: 120 })),
    procurement_ready: false, engineering_approved: false });
  const original = JSON.stringify(project), model = preview(project, [pose]);
  assert.equal(model.poles.length, 64); assert.equal(model.clipped, true);
  assert.equal(model.engineeringApproved, false);
  assert.equal(JSON.stringify(project), original);
});
check("malformed resolved poses cannot invent attached coordinates", () => {
  for (const instance of [{ ...pose, positionFeet: [11.5, NaN, 21.5] }, { ...pose, dimensionsFeet: [3, 0, 3] }]) {
    const model = preview(freeze({ items: [attached] }), [instance]);
    assert.equal(model.poles.length, 0);
    assert.ok(model.issues.some(issue => issue.severity === "error"));
  }
});
check("numeric string heights and negative offsets retain recorded provenance", () => {
  const model = preview(freeze({ poles: [{ x_inches: "12", z_inches: "-24", height_inches: "120", y_offset_inches: "-12" }] }), []);
  assert.deepEqual(model.poles[0].positionFeet, [1, 4, -2]);
  assert.equal(model.poles[0].heightBasis, "recorded");
});
check("blank and whitespace-only legacy heights are labeled placeholders rather than malformed or zero", () => {
  for (const value of ["", "   ", "\t"]) {
    const model = preview(freeze({
      items: [{ selected_pole_id: "synthetic-pole", pole_total_height_inches: value }],
      poles: [{ height_inches: value }],
    }), [pose]);
    assert.equal(model.poles.length, 2);
    assert.ok(model.poles.every(pole => pole.heightBasis === "legacy_default" && pole.heightFeet === 8));
    assert.ok(model.issues.every(issue => issue.severity === "warning" && /height.*not recorded/i.test(issue.message)));
  }
});
check("pole diagnostics identify their true source once rather than naming an unrelated Foundation", () => {
  const model = preview(freeze({
    items: [{ selected_pole_id: "synthetic-pole", pole_total_height_inches: 0 }],
    poles: [{ x_inches: "bad", height_inches: 120 }],
  }), [pose]);
  assert.ok(model.issues.some(issue => issue.kind === "attached" && issue.index === 0 && /^Foundation 1 pole:/.test(issue.message)));
  assert.ok(model.issues.some(issue => issue.kind === "independent" && issue.index === 0 && /^Pole 1:/.test(issue.message)));
  assert.ok(!model.issues.some(issue => /Foundation 1: Foundation 1/.test(issue.message)));
});
check("malformed source indices and instance collections cannot attach a pole to an unverified source", () => {
  const project = freeze({ items: [attached] });
  for (const index of [undefined, null, -1, 0.5, "0", "__proto__", 2]) {
    const model = preview(project, [{ ...pose, index }]);
    assert.equal(model.poles.length, 0);
    assert.ok(model.issues.some(issue => issue.severity === "error"));
  }
  const model = preview(project, {});
  assert.equal(model.poles.length, 0); assert.ok(model.issues.some(issue => issue.severity === "error"));
});
fs.writeFileSync(DIR + "foundation-pole-preview-verification.json", JSON.stringify({
  results, syntheticOnly: true, UIWired: false, realRendererVerified: false, engineeringApproved: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
