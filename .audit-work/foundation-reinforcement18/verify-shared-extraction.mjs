import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync("src/components/estimator/builder/partSync.js", "utf8");
const dependencies = new Map();
for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g))
  dependencies.set(m[2], m[1].split(",").map(s => s.trim()).filter(Boolean));
const externalCalls = [];
globalThis.__extractionExternalCalls = externalCalls;
const bundle = await build({
  stdin: { contents: source + "\nexport { effectiveCurrentUnitCost };\n", sourcefile: "current-partSync.js", resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false, outdir: "out",
  plugins: [{ name: "only-real-private-dto-helper", setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (/foundationReinforcementPartDescriptors(?:\.js)?$/.test(args.path))
        return { path: path.resolve("src/components/estimator/foundation/foundationReinforcementPartDescriptors.js") };
      if (!dependencies.has(args.path)) throw Error(`Unexpected dependency ${args.path}`);
      return { path: args.path, namespace: "blocked" };
    });
    b.onLoad({ filter: /.*/, namespace: "blocked" }, args => ({
      contents: dependencies.get(args.path).map(name => `export const ${name}=()=>{globalThis.__extractionExternalCalls.push(${JSON.stringify(name)});throw Error("External dependency cannot execute in extraction-only checks");};`).join("\n"), loader: "js",
    }));
  } }],
});
const { extractBuilderParts: extract, effectiveCurrentUnitCost: unitCost } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const base = JSON.parse(fs.readFileSync(dir + "part-descriptors-fixture.json", "utf8"));
const old = JSON.parse(fs.readFileSync(dir + "builder-boundary-observations.json", "utf8"));
const clone = structuredClone;
const legacyRow = { id: "legacy-by-size", material_type: "rebar", rebar_size: "#4", cost_per_unit: 9, unit: "ft" };
const selectedRow = { id: "selected-other", material_name: "Selected steel", material_type: "rebar", rebar_size: "#8", cost_per_unit: 2, unit: "ft" };
const catalogs = { FoundationInventory: { rows: [legacyRow, selectedRow], byId: new Map([[legacyRow.id, legacyRow], [selectedRow.id, selectedRow]]) } };
const run = item => extract("foundation", { items: [item] }, catalogs);
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); } };
for (const observation of old.observed) check("legacy compatibility: " + observation.name, () => {
  const item = clone(observation.syntheticInput); item.reinforcement_calculation_version = 1;
  const expected = clone(observation.parts);
  for (const p of expected) p.builder_data.reinforcement_calculation_version = 1;
  assert.deepEqual(run(item), expected);
});
check("fresh typed2 snapshot, not legacy size lookup or combined total", () => {
  const rows = run(base); assert.equal(rows.length, 2);
  assert.equal(rows[0].inventory_item_id, "selected-other"); assert.equal(rows[0].part_name, "Selected steel");
  assert.equal(rows[0].extended_cost, 40); assert.equal(rows[1].extended_cost, 72);
  assert.equal(rows[0].pricing_basis_snapshot.reinforcement.physical_quantity_ft, 20);
});
check("manual typed2 is never linked by legacy size", () => {
  const x = clone(base); x.reinforcement_material = { kind: "manual", reason: "Supplier quote" };
  Object.assign(x.reinforcement_cost_snapshot.material, { kind: "manual", inventory_id: null, reason: "Supplier quote", rate_source: "manual" });
  const rows = run(x); assert.equal(rows[0].inventory_item_id, ""); assert.equal(rows[0].inventory_entity, "");
});
check("zero aggregate stays zero; material0 and labor12 remain distinct", () => {
  const x = clone(base); Object.assign(x, { custom_rebar_qty: 0, rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_labor_hours: 0.2, rebar_labor_cost: 12, rebar_cost: 12 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, labor_hours: 0.2, labor_cost: 12, steel_cost: 12 });
  const rows = run(x); assert.equal(rows[0].quantity, 0); assert.equal(rows[0].extended_cost, 0); assert.equal(rows[1].extended_cost, 12);
  assert.equal(rows[0].pricing_basis_snapshot.reinforcement.physical_quantity_ft, 20);
});
check("explicit zero2 rate cannot fall through to current catalog", () => {
  const x = clone(base); Object.assign(x, { custom_rebar_cost_per_ft: 0, rebar_rate: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.material, { cost_per_ft: 0, rate_source: "custom_rebar_cost_per_ft" });
  x.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  const [m, l] = run(x); assert.equal(unitCost(m, selectedRow), 0); assert.equal(l.extended_cost, 72);
});
check("unrelated descriptor zero behavior remains unchanged", () => assert.equal(unitCost({ unit_cost: 0 }, legacyRow), old.explicitZeroCurrentUnitCostObservation));
for (const v of ["2", 3, 0]) check(`unknown active selector ${String(v)} cannot silently use legacy`, () => {
  const x = clone(base); x.reinforcement_calculation_version = v; assert.throws(() => run(x));
});
check("typed2 missing or inconsistent snapshot fails before producing any parts", () => {
  const x = clone(base); delete x.reinforcement_cost_snapshot; assert.throws(() => run(x));
  const y = clone(base); y.reinforcement_cost_snapshot.amounts.material_cost = 41; assert.throws(() => run(y));
});
check("off2 ignores inactive malformed snapshot", () => { const x = clone(base); x.include_rebar = false; x.reinforcement_cost_snapshot = null; assert.deepEqual(run(x), []); });
check("pure extraction never executes blocked SDK or persistence dependency", () => assert.deepEqual(externalCalls, []));
fs.writeFileSync(dir + "shared-extraction-verification.json", JSON.stringify({ synthetic: true, extractionOnly: true, externalCalls, results }, null, 2) + "\n");
console.log(`Shared extraction: ${results.filter(r => r.ok).length}/${results.length}; failed=${results.filter(r => !r.ok).length}`);
process.exitCode = results.some(r => !r.ok) ? 1 : 0;
