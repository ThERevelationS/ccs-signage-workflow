import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/components/estimator/builder/builderService.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const body = source.match(/async function ensureEstimateBuilderProductsOnce\(estimate, \{[\s\S]*?\n\}(?=\n\nexport async function recordBuilderSave)/)?.[0];
assert.ok(body);
const first = { line_id: "first", module_key: "vinyl", project_id: "v", preserved: { nested: [1, 2] } };
const second = { line_id: "second", module_key: "metal", project_id: "m", preserved: { nested: [3, 4] } };
const third = { line_id: "third", module_key: "vinyl", project_id: "v2", price_acceptance_pending: { kind: "builder_product_remove" } };
const estimate = { id: "estimate", updated_date: "version", line_items: [first, second, third] };
const reads = [], reconciled = [], writes = [];
const context = {
  staffEntities: {
    AllInOneEstimate: { name: "estimate-entity" },
    VinylProject: { get: async (id) => { reads.push(["vinyl", id]); return { id }; } },
    MetalProject: { get: async (id) => { reads.push(["metal", id]); return { id }; } },
  },
  getModule: (key) => ({ entity: key === "vinyl" ? "VinylProject" : "MetalProject" }),
  getModuleLabel: (key) => key,
  ensureBuilderProductForLine: async ({ line, sourceProjectOverride }) => {
    reconciled.push([line.line_id, sourceProjectOverride.id]);
    return { line: { ...line, updated: true }, changed: true };
  },
  expectedEstimateFields: (current, fields) => ({ version: current.updated_date, line_items: current.line_items, next: fields.line_items }),
  replaceEstimateFieldsIfUnchanged: async (args) => { writes.push(args); return { line_items: args.nextFields.line_items }; },
};
const reconcile = runInNewContext(`(${body})`, context);
{
  const result = await reconcile(estimate, { strictReconciliation: true, onlyLineIds: ["second"] });
  assert.deepEqual(reads, [["metal", "m"]]);
  assert.deepEqual(reconciled, [["second", "m"]]);
  assert.equal(result.line_items[0], first);
  assert.equal(result.line_items[2], third);
  assert.equal(JSON.stringify(result.line_items[0]), JSON.stringify(first));
  assert.equal(JSON.stringify(result.line_items[2]), JSON.stringify(third));
  assert.equal(result.line_items[1].updated, true);
  assert.deepEqual(Array.from(result.line_items, (line) => line.line_id), ["first", "second", "third"]);
  assert.equal(writes.length, 1);
  assert.deepEqual(Array.from(writes[0].nextFields.line_items, (line) => line.line_id), ["first", "second", "third"]);
  assert.equal(writes[0].nextFields.line_items[0], first);
  assert.equal(writes[0].nextFields.line_items[2], third);
  assert.equal(writes[0].expectedFields.version, "version");
}
reads.length = 0; reconciled.length = 0; writes.length = 0;
{
  const result = await reconcile(estimate, { strictReconciliation: true, onlyLineIds: [] });
  assert.equal(reads.length, 0);
  assert.equal(reconciled.length, 0);
  assert.equal(writes.length, 0);
  assert.deepEqual(Array.from(result.line_items), [first, second, third]);
}
reads.length = 0; reconciled.length = 0; writes.length = 0;
{
  await reconcile(estimate, { strictReconciliation: true });
  assert.deepEqual(reads, [["vinyl", "v"], ["metal", "m"]]);
  assert.deepEqual(reconciled, [["first", "v"], ["second", "m"]]);
  assert.equal(writes.length, 1);
}

const pageSource = readFileSync(new URL("../src/pages/EstimateDetail.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const refreshBody = pageSource.match(/const runRefreshProducts = (async \(scope\) => \{[\s\S]*?\n  \});/)?.[1];
assert.ok(refreshBody);
for (const scope of [{ lineIds: ["one"] }, { lineIds: [] }, undefined]) {
  const manualReads = [], reconcileOptions = [], lines = [
    { line_id: "one", module_key: "custom", builder_product_id: "b1" },
    { line_id: "two", module_key: "custom", builder_product_id: "b2" },
    { line_id: "removed", module_key: "custom", builder_product_id: "b3", price_acceptance_pending: { kind: "builder_product_remove" } },
  ];
  let warnings = [
    { line_id: "one", message: "old one" },
    { builder_product_id: "b2", message: "old two" },
    { line_id: "deleted", message: "removed" },
  ];
  const ctx = {
    latestEstimateRef: { current: { id: "estimate" } },
    staffEntities: { AllInOneEstimate: { get: async () => ({ id: "estimate", updated_date: "v", line_items: lines }) } },
    ensureEstimateBuilderProducts: async (value, options) => { reconcileOptions.push(options); return value; },
    refreshManualProductPricing: async (id) => { manualReads.push(id); },
    refreshSectionSnapshots: async (items) => items,
    serverUpdatedAtRef: { current: "" },
    setEstimate: () => {},
    setReconciliationWarnings: (value) => { warnings = typeof value === "function" ? value(warnings) : value; },
  };
  await runInNewContext(`(${refreshBody})`, ctx)(scope);
  assert.deepEqual(manualReads, scope ? scope.lineIds.map(() => "b1") : ["b1", "b2"]);
  assert.equal(JSON.stringify(reconcileOptions[0].onlyLineIds), JSON.stringify(scope?.lineIds ?? null));
  assert.deepEqual(Array.from(warnings, (warning) => warning.message), scope?.lineIds.length ? ["old two"] : scope ? ["old one", "old two"] : []);
}
console.log("PASS scoped reconciliation, unchanged lines, full CAS, manual pricing scope and warning preservation");
