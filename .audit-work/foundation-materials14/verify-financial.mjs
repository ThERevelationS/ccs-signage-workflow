import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const root = ".audit-work/foundation-materials14";
// The src modules import the Vite `@/` alias (loadAllEntityRows, inventory
// normalization) — alias it so the bundle resolves outside Vite.
buildSync({
  entryPoints: ["src/components/estimator/foundation/foundationCalc.js"],
  bundle: true, platform: "node", format: "esm", outfile: `${root}/calc-after.mjs`,
  alias: { "@": path.resolve("src") },
});
const engine = await import(pathToFileURL(path.resolve(`${root}/calc-after.mjs`)));
const { calcProject, captureConcreteDeliverySnapshot } = engine;
const matrix = JSON.parse(fs.readFileSync(`${root}/complete-before.json`, "utf8")).cases;
const clone = value => JSON.parse(JSON.stringify(value));
const frozen = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack || error) }); console.error("FAIL", name, error); }
};
const fields = [
  "concrete_volume_cy", "excavation_volume_cy", "concrete_bags", "rebar_feet", "rebar_weight_lbs",
  "concrete_cost", "concrete_rate", "rebar_cost", "rebar_rate", "excavation_cost", "excavation_hours",
  "forming_cost", "forming_qty", "pouring_cost", "finishing_cost", "finishing_hours", "item_total_cost",
];
const scenario = matrix[1];
const saved = frozen({
  ...clone(scenario.project), ...clone(scenario.expected.totals), items: clone(scenario.expected.items),
  concrete_delivery_snapshot: captureConcreteDeliverySnapshot(scenario.expected.delivery),
});
const without = id => frozen(scenario.inventory.filter(row => row.id !== id).map(clone));
const calculate = (project, inventory, snapshot = project) => calcProject(project, inventory, {}, { savedProject: snapshot });

for (const c of matrix) check(`exact original whole-model parity: ${c.name}`, () => {
  const actual = calcProject(frozen(clone(c.project)), frozen(clone(c.inventory)), frozen(clone(c.settings)));
  for (const key of Object.keys(c.expected)) assert.deepEqual(clone(actual[key]), c.expected[key], key);
});
for (const id of ["bag", "bar", "form"]) check(`missing ${id}: whole saved item, coupled delivery, immutability`, () => {
  const actual = calculate(saved, without(id));
  assert.equal(actual.itemPricing[0].available, false);
  assert.ok(actual.catalogIssues.some(issue => issue.kind === "foundation"));
  for (const key of fields) {
    const old = saved.items[0][key];
    assert.equal(actual.items[0][key], typeof old === "number" && Number.isFinite(old) ? old : undefined, key);
  }
  assert.equal(actual.totals.grand_total, scenario.expected.totals.grand_total);
  assert.equal(actual.delivery.pricingUnavailable, true);
  assert.equal(actual.delivery.concreteTotal, 0);
  assert.deepEqual(actual.delivery.trucksList, []);
});
check("legacy missing delivery snapshot never fabricates a truck or aggregate", () => {
  const legacy = clone(saved); delete legacy.concrete_delivery_snapshot;
  const actual = calculate(frozen(legacy), without("bag"));
  assert.equal(actual.delivery.concreteTotal, undefined);
  assert.equal(actual.delivery.roundedYards, undefined);
  assert.deepEqual(actual.delivery.availableMixes, []);
  assert.deepEqual(actual.delivery.trucksList, []);
  assert.equal(actual.totals.total_concrete_cost, saved.total_concrete_cost);
  assert.equal(actual.totals.grand_total, null);
});
check("all saved numeric zeros are retained rather than treated as absent", () => {
  const zero = clone(saved);
  for (const key of fields) zero.items[0][key] = 0;
  const actual = calculate(frozen(zero), without("bag"));
  for (const key of fields) assert.equal(actual.items[0][key], 0, key);
  assert.equal(actual.delivery.concreteTotal, 0);
  assert.equal(actual.totals.grand_total, 0);
});
check("never-saved item costs and quantities stay unknown, not zero", () => {
  const actual = calculate(frozen(clone(scenario.project)), without("bag"));
  for (const key of fields) assert.equal(actual.items[0][key], undefined, key);
  assert.equal(actual.totals.total_concrete_cost, null);
  assert.equal(actual.totals.total_rebar_cost, null);
  assert.equal(actual.totals.total_concrete_volume_cy, null);
  assert.equal(actual.totals.grand_total, null);
});
check("wrong-role selected records cannot supply a price", () => {
  const inventory = scenario.inventory.map(row => row.id === "bag" ? { ...row, material_type: "pole" } : row);
  const actual = calculate(saved, frozen(inventory));
  assert.ok(actual.catalogIssues.some(issue => issue.code === "catalog_item_type_mismatch"));
  assert.equal(actual.items[0].item_total_cost, saved.items[0].item_total_cost);
});
check("snapshot source-ID mismatch cannot borrow foreign cached amounts", () => {
  const foreign = { ...clone(saved), id: "another-source" };
  const actual = calculate(saved, without("bag"), frozen(foreign));
  assert.equal(actual.items[0].item_total_cost, undefined);
  assert.equal(actual.delivery.concreteTotal, undefined);
  assert.equal(actual.totals.total_concrete_cost, null);
});
check("new copied component cannot inherit another component's saved cache", () => {
  const draft = { ...clone(saved), items: [{ ...saved.items[0], component_id: "copy" }] };
  const actual = calculate(frozen(draft), without("bag"), saved);
  assert.equal(actual.items[0].item_total_cost, undefined);
  assert.equal(actual.totals.grand_total, null);
});
check("stable identity selects saved values after reorder, never raw stale caches or array positions", () => {
  const c = matrix.find(row => row.name === "multiple service foundations");
  const snapshot = frozen({ ...clone(c.project), ...clone(c.expected.totals), items: clone(c.expected.items),
    concrete_delivery_snapshot: captureConcreteDeliverySnapshot(c.expected.delivery) });
  const draft = frozen({ ...clone(snapshot), items: [...snapshot.items].reverse().map(item => ({ ...item, item_total_cost: 0 })) });
  const actual = calculate(draft, frozen(c.inventory.filter(row => row.id !== "ready")), snapshot);
  assert.equal(actual.items[0].item_total_cost, snapshot.items[1].item_total_cost);
  assert.equal(actual.items[1].item_total_cost, snapshot.items[0].item_total_cost);
  assert.deepEqual(actual.delivery.trucksList, c.expected.delivery.trucksList);
  assert.equal(actual.delivery.concreteTotal, c.expected.delivery.concreteTotal);
});
check("ambiguous current or saved component identity cannot borrow snapshots", () => {
  const duplicateCurrent = frozen({ ...clone(saved), items: [saved.items[0], saved.items[0]] });
  assert.equal(calculate(duplicateCurrent, without("bag"), saved).items[0].item_total_cost, undefined);
  const duplicateSaved = frozen({ ...clone(saved), items: [saved.items[0], saved.items[0]] });
  assert.equal(calculate(saved, without("bag"), duplicateSaved).items[0].item_total_cost, undefined);
});
check("unsupported/malformed delivery snapshot does not manufacture defaults", () => {
  for (const snapshot of [{ version: 2, concrete_total: 123 }, { version: 1, concrete_total: "0", trucks: [null] }]) {
    const source = frozen({ ...clone(saved), concrete_delivery_snapshot: snapshot });
    const actual = calculate(source, without("bag"));
    assert.equal(actual.delivery.concreteTotal, undefined);
    assert.equal(actual.totals.grand_total, null);
  }
});
check("snapshot capture is versioned, copies trucks, and uses no default zero values", () => {
  const c = matrix.find(row => row.name === "three delivery trucks");
  const snapshot = captureConcreteDeliverySnapshot(frozen(clone(c.expected.delivery)));
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.concrete_total, c.expected.delivery.concreteTotal);
  assert.equal(snapshot.trucks.length, 3);
  assert.notEqual(snapshot.trucks, c.expected.delivery.trucksList);
  assert.equal(snapshot.trucks[0].small_order_fee, c.expected.delivery.trucksList[0].smallOrderFee);
});
check("schema preserves existing fields/RLS and adds only optional snapshot/legacy fields", () => {
  const original = JSON.parse(JSON.parse(fs.readFileSync(`${root}/fresh-baselines.json`, "utf8")).files.find(row => row.path.endsWith("/FoundationProject.jsonc")).content);
  const next = JSON.parse(fs.readFileSync("base44/entities/FoundationProject.jsonc", "utf8"));
  for (const [key, value] of Object.entries(original)) if (key !== "properties") assert.deepEqual(next[key], value, key);
  for (const [key, value] of Object.entries(original.properties)) {
    if (key !== "items") assert.deepEqual(next.properties[key], value, key);
  }
  const beforeItems = original.properties.items.items.properties;
  const afterItems = next.properties.items.items.properties;
  for (const key of Object.keys(beforeItems)) assert.deepEqual(afterItems[key], beforeItems[key], key);
  assert.equal(next.properties.concrete_delivery_snapshot.type, "object");
  assert.equal("default" in next.properties.concrete_delivery_snapshot, false);
  for (const key of Object.keys(afterItems).filter(key => !(key in beforeItems))) assert.equal("default" in afterItems[key], false, key);
});

const failures = results.filter(result => !result.ok);
fs.writeFileSync(`${root}/financial-verification.json`, JSON.stringify({ synthetic: true, results, passed: results.length - failures.length, failed: failures.length }, null, 2));
const files = ["src/components/estimator/foundation/foundationCalc.js", "src/components/estimator/foundation/foundationCatalogIntegrity.js", "src/pages/FoundationEstimator.jsx", "base44/entities/FoundationProject.jsonc"];
fs.writeFileSync(`${root}/financial-core-hashes.json`, JSON.stringify(Object.fromEntries(files.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])), null, 2));
console.log(`${failures.length ? "FAILED" : "PASS"} foundation material financial cases=${results.length} failed=${failures.length}`);
process.exitCode = failures.length ? 1 : 0;
