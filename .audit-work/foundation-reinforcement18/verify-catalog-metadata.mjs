import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const result = await build({
  entryPoints: ["src/components/estimator/foundation/foundationReinforcementCatalogMetadata.js"],
  bundle: true, format: "esm", platform: "node", outfile: DIR + "catalog-metadata-bundle.mjs", metafile: true,
});
assert.ok(!Object.keys(result.metafile.inputs).some(file => /base44Client|staffEntities|node_modules\/@base44/.test(file)));
const { createFoundationReinforcementCatalogMetadataDraft: create, prepareFoundationReinforcementCatalogMetadataDraft: prepare,
  FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS: fields } =
  await import(pathToFileURL(path.resolve(DIR + "catalog-metadata-bundle.mjs")));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
}
check("missing metadata stays absent, and a #size label is not a measurement", () => {
  const record = Object.freeze({ rebar_size: "#4", material_type: "rebar", material_name: "Synthetic only" });
  assert.deepEqual(create(record), {}); assert.deepEqual(create(null), {});
  assert.deepEqual(prepare(create(record)), { ok: true, values: {}, issues: [] });
});
check("positive numeric and exact decimal text remain explicit diameter and pounds per foot", () => {
  assert.deepEqual(prepare({ rebar_diameter_inches: " .5 ", rebar_weight_lb_per_ft: "0.668" }),
    { ok: true, values: { rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 }, issues: [] });
  assert.deepEqual(prepare({ rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 }).values,
    { rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 });
});
check("clearing is an explicit unknown null, never zero or an invented default", () => {
  assert.deepEqual(prepare({ rebar_diameter_inches: "", rebar_weight_lb_per_ft: "   " }),
    { ok: true, values: { rebar_diameter_inches: null, rebar_weight_lb_per_ft: null }, issues: [] });
  assert.equal(prepare({ rebar_weight_lb_per_ft: null }).values.rebar_weight_lb_per_ft, null);
  assert.equal(JSON.parse(JSON.stringify(prepare({ rebar_weight_lb_per_ft: "" }).values)).rebar_weight_lb_per_ft, null);
});
check("zero, signed negative and partial numeric strings cannot become verified metadata", () => {
  for (const raw of [0, "0", -1, "-0.668", "0.5in", ".668 pounds", ".", "-", "1e-3", "0x10", "Infinity"]) {
    const actual = prepare({ rebar_weight_lb_per_ft: raw });
    assert.equal(actual.ok, false, String(raw)); assert.equal(actual.issues[0].field, "rebar_weight_lb_per_ft");
    assert.equal(Object.hasOwn(actual.values, "rebar_weight_lb_per_ft"), false);
  }
});
check("boolean, object, array and nonfinite values remain invalid and visibly repairable", () => {
  for (const raw of [true, false, [], {}, Infinity, -Infinity, NaN]) {
    assert.equal(prepare({ rebar_diameter_inches: raw }).ok, false);
    const draft = create({ rebar_diameter_inches: raw });
    assert.deepEqual(draft.rebar_diameter_inches, raw);
  }
});
check("malformed root records reject rather than normalizing to an eligible empty form", () => {
  for (const draft of [null, [], 0, "", new Date(0)]) assert.equal(prepare(draft).ok, false);
});
check("frozen source and authored buffers are not mutated or aliased during preparation", () => {
  const bad = Object.freeze({ value: 0.5 });
  const source = Object.freeze({ rebar_diameter_inches: bad, rebar_weight_lb_per_ft: 0.668, unrelated: "keep" });
  const draft = create(source); assert.notEqual(draft.rebar_diameter_inches, bad);
  draft.rebar_diameter_inches.value = 1; assert.equal(bad.value, 0.5);
  const authored = Object.freeze({ rebar_diameter_inches: "0.5", rebar_weight_lb_per_ft: ".668" });
  assert.equal(prepare(authored).ok, true); assert.equal(authored.rebar_diameter_inches, "0.5");
  assert.equal(source.unrelated, "keep");
});
check("field projection is restricted to two declared optional metadata keys and detects numeric overflow or underflow", () => {
  assert.deepEqual(fields.map(field => field.key), ["rebar_diameter_inches", "rebar_weight_lb_per_ft"]);
  const draft = create({ rebar_weight_lb_per_ft: 0.668, cost_per_unit: 2, unit: "ton", rebar_size: "#8" });
  assert.deepEqual(draft, { rebar_weight_lb_per_ft: 0.668 });
  for (const raw of ["9".repeat(400), "0." + "0".repeat(400) + "1"]) assert.equal(prepare({ rebar_diameter_inches: raw }).ok, false);
});
fs.writeFileSync(DIR + "catalog-metadata-verification.json", JSON.stringify({
  synthetic: true, realBase44StorageVerified: false, explicitNullClearReadbackVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(test => !test.ok).length;
console.log(`Catalog metadata: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
