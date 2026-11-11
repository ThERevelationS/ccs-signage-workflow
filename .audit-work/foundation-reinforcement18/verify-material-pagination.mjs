import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const entry = "src/components/estimator/estimateConversionService.js";
const loader = "src/lib/loadAllEntityRows.js";
const source = fs.readFileSync(entry, "utf8");
const imports = new Map();
for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g))
  imports.set(match[2], match[1].split(",").map(value => value.trim()).filter(Boolean));
const special = {
  base44: "export const base44={entities:{}};",
  staffEntities: `export const staffEntities={BuilderPart:{filter:(query,sort,limit,skip)=>globalThis.__materialPage(query,sort,limit,skip)}};`,
  getModuleLabel: `export const getModuleLabel=()=>"Foundation";`,
  buildEstimateWorkOrderProducts: `export const buildEstimateWorkOrderProducts=()=>[];`,
  mergeWorkOrderProducts: `export const mergeWorkOrderProducts=(before,after)=>[...before,...after];`,
  buildConvertedWorkOrderFields: `export const buildConvertedWorkOrderFields=()=>({});`,
  localDateStamp: `export const localDateStamp=()=>"2026-11-06";`,
  hasVerifiedEstimateSalesActivity: `export const hasVerifiedEstimateSalesActivity=()=>true;`,
  expectedWorkOrderFields: `export const expectedWorkOrderFields=()=>({});`,
  createEstimateLinkedWorkOrderWithRecovery: `export const createEstimateLinkedWorkOrderWithRecovery=async()=>globalThis.__materialWrite("create");`,
  replaceWorkOrderFieldsIfUnchanged: `export const replaceWorkOrderFieldsIfUnchanged=async()=>globalThis.__materialWrite("update");`,
  acceptedInternalEstimateCost: `export const acceptedInternalEstimateCost=()=>0;`,
};
const compiled = await build({
  entryPoints: [path.resolve(entry)], bundle: true, platform: "node", format: "esm",
  write: false, outdir: "out", metafile: true,
  plugins: [{ name: "real-pagination-fake-sdk-only", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.kind === "entry-point") return null;
      if (/foundationReinforcement(?:WorkOrderPart|PartDescriptors|FrozenPricing)(?:\.js)?$/.test(args.path)) {
        const name = path.basename(args.path);
        return { path: path.resolve("src/components/estimator/foundation", name + (name.endsWith(".js") ? "" : ".js")) };
      }
      if (args.path === "@/lib/loadAllEntityRows" || args.path === "@/components/estimator/loadAllEntityRows" || args.path === "./loadAllEntityRows") return { path: path.resolve(loader) };
      if (!imports.has(args.path)) throw Error("Unexpected import " + args.path);
      return { path: args.path, namespace: "synthetic" };
    });
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({
      contents: imports.get(args.path).map(name => special[name] ||
        `export const ${name}=()=>{throw Error("Unexpected dependency ${name}");};`).join("\n"),
      loader: "js",
    }));
  } }],
});
assert.ok(Object.keys(compiled.metafile.inputs).includes(entry));
assert.ok(Object.keys(compiled.metafile.inputs).includes(loader));
assert.ok(!Object.keys(compiled.metafile.inputs).some(file => file.includes("node_modules/@base44/")));
const { buildEstimateMaterialsManifest: manifest, commitEstimateConversion: commit } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const estimate = { id: "synthetic-estimate", estimate_number: "SYN-1", status: "approved",
  line_items: [{ line_id: "synthetic-line", builder_product_id: "synthetic-builder",
    module_key: "foundation", client_product_name: "Synthetic foundation" }] };
const rows = Array.from({ length: 505 }, (_, index) => Object.freeze({
  id: "part-" + index, builder_product_id: "synthetic-builder", part_key: "key-" + index,
  part_name: "Part " + String(index).padStart(4, "0"), part_type: "material", part_subtype: "rebar",
  quantity: 1, unit: "ft", frozen_unit_cost: 2, frozen_extended_cost: 2, is_active: true,
}));
let calls = [], writes = [], stamped = false, pageFailure = null, malformedPage = false;
globalThis.__materialPage = async (query, sort, limit, skip) => {
  calls.push({ query: structuredClone(query), sort, limit, skip });
  assert.equal(sort, "created_date"); assert.equal(limit, 500);
  if (query.estimate_id) {
    assert.deepEqual(query, { estimate_id: estimate.id }); assert.equal(skip, 0);
    return stamped ? [{ ...rows[0], estimate_id: estimate.id }] : [];
  }
  assert.deepEqual(query, { builder_product_id: "synthetic-builder" });
  if (skip === 500 && pageFailure) throw pageFailure;
  if (skip === 500 && malformedPage) return { rows: [] };
  return rows.slice(skip, skip + limit);
};
globalThis.__materialWrite = async kind => {
  writes.push(kind); return { id: "synthetic-work-order" };
};
const results = [];
const check = async (name, fn) => {
  calls = []; writes = []; stamped = false; pageFailure = null; malformedPage = false;
  try { await fn(); results.push({ name, ok: true, calls, writes }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack), calls, writes }); console.error("FAIL", name, error.message); }
};
const assertPages = () => assert.deepEqual(calls.map(call => [call.query, call.skip]), [
  [{ estimate_id: estimate.id }, 0],
  [{ builder_product_id: "synthetic-builder" }, 0],
  [{ builder_product_id: "synthetic-builder" }, 500],
]);
const assertComplete = actual => {
  assert.equal(actual.length, 505); assert.equal(new Set(actual.map(row => row.builder_part_id)).size, 505);
  assert.equal(actual.reduce((total, row) => total + row.extended_cost, 0), 1010);
  assert.ok(actual.some(row => row.builder_part_id === "part-504"));
  assertPages(); assert.deepEqual(writes, []);
};
await check("real paged loader requests the second Product page and retains all505 frozen amounts", async () => {
  assertComplete(await manifest(estimate));
});
await check("real pagination includes mixed stamped and legacy rows without duplicate amounts", async () => {
  stamped = true; assertComplete(await manifest(estimate));
});
await check("a failed second page prevents a partial500-part Work Order write", async () => {
  pageFailure = Error("Synthetic second page unavailable");
  await assert.rejects(commit({ estimate, estimateBefore: estimate, existing: null,
    verifiedCustomerId: "synthetic-customer", entities: { Estimate: {}, WorkOrder: {} } }), error => error === pageFailure);
  assertPages(); assert.deepEqual(writes, []);
});
await check("a malformed second page remains unavailable rather than an empty complete result", async () => {
  malformedPage = true;
  await assert.rejects(manifest(estimate), /could not be verified completely/);
  assertPages(); assert.deepEqual(writes, []);
});
fs.writeFileSync(dir + "material-pagination-meta.json", JSON.stringify(compiled.metafile, null, 2) + "\n");
fs.writeFileSync(dir + "material-pagination-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Real material pagination: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
