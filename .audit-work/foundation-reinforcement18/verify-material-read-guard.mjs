import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync(process.env.MATERIAL_GUARD_SOURCE || "src/components/estimator/estimateConversionService.js", "utf8");
const imports = new Map();
for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g))
  imports.set(match[2], match[1].split(",").map(value => value.trim()).filter(Boolean));
globalThis.__materialRead = async () => [];
globalThis.__materialWrite = () => { throw Error("Unexpected write"); };
const special = {
  base44: "export const base44={entities:{}};",
  staffEntities: `export const staffEntities={BuilderPart:{kind:"BuilderPart",filter:(query,sort,limit)=>globalThis.__materialRead({query,sort,limit,entity:{kind:"BuilderPart"}}, "raw")}};`,
  loadAllEntityRows: `export const loadAllEntityRows=args=>globalThis.__materialRead(args,"paged");`,
  getModuleLabel: `export const getModuleLabel=()=>"Foundation";`,
  buildEstimateWorkOrderProducts: `export const buildEstimateWorkOrderProducts=()=>[];`,
  mergeWorkOrderProducts: `export const mergeWorkOrderProducts=(before,after)=>[...before,...after];`,
  buildConvertedWorkOrderFields: `export const buildConvertedWorkOrderFields=()=>({});`,
  localDateStamp: `export const localDateStamp=()=>"2026-11-06";`,
  hasVerifiedEstimateSalesActivity: `export const hasVerifiedEstimateSalesActivity=()=>true;`,
  expectedWorkOrderFields: `export const expectedWorkOrderFields=()=>({});`,
  createEstimateLinkedWorkOrderWithRecovery: `export const createEstimateLinkedWorkOrderWithRecovery=async args=>globalThis.__materialWrite("create",args);`,
  replaceWorkOrderFieldsIfUnchanged: `export const replaceWorkOrderFieldsIfUnchanged=async args=>globalThis.__materialWrite("update",args);`,
  acceptedInternalEstimateCost: `export const acceptedInternalEstimateCost=()=>0;`,
};
const compiled = await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "material-read-fixture.js" },
  bundle: true, platform: "node", format: "esm", write: false, outdir: "out",
  plugins: [{ name: "synthetic-only-no-sdk", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (/foundationReinforcement(?:WorkOrderPart|PartDescriptors|FrozenPricing)(?:\.js)?$/.test(args.path)) {
        const name = path.basename(args.path);
        return { path: path.resolve("src/components/estimator/foundation", name + (name.endsWith(".js") ? "" : ".js")) };
      }
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
const { buildEstimateMaterialsManifest: manifest, commitEstimateConversion: commit } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const estimate = { id: "synthetic-estimate", estimate_number: "SYN-1", status: "approved",
  line_items: [{ line_id: "synthetic-line", builder_product_id: "synthetic-builder",
    module_key: "foundation", client_product_name: "Synthetic foundation" }] };
const part = (id, extra = {}) => ({ id, builder_product_id: "synthetic-builder", part_key: id,
  part_name: id, part_type: "material", part_subtype: "rebar", quantity: 1, unit: "ft",
  frozen_unit_cost: 2, frozen_extended_cost: 2, is_active: true, ...extra });
let reads = [], writes = [], handler = async () => [];
globalThis.__materialRead = async (args, via) => {
  assert.equal(args.entity.kind, "BuilderPart");
  reads.push({ via, query: structuredClone(args.query), limit: args.limit });
  const rows = await handler(args.query);
  return via === "raw" && Array.isArray(rows) ? rows.slice(0, args.limit) : rows;
};
globalThis.__materialWrite = async (kind, args) => {
  writes.push({ kind, fields: Object.keys(args) }); return { id: "synthetic-work-order" };
};
const results = [];
const check = async (name, fn) => {
  reads = []; writes = []; handler = async () => [];
  try { await fn(); results.push({ name, ok: true, reads, writes }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack), reads, writes }); console.error("FAIL", name, error.message); }
};
await check("missing estimate id performs no read", async () => {
  assert.deepEqual(await manifest({}), []); assert.deepEqual(reads, []);
});
await check("explicit frozen inputs preserve exact zero, split, provenance and inactive filtering", async () => {
  const parts = [part("Zulu labor", { part_type: "labor", part_subtype: "rebar_labor", quantity: 1, unit: "job",
    frozen_unit_cost: 72, frozen_extended_cost: 72 }),
  part("Alpha steel", { quantity: 0, frozen_extended_cost: 0 }),
  part("Inactive", { is_active: false })];
  const before = JSON.stringify(parts);
  const actual = await manifest(estimate, { parts });
  assert.equal(actual.length, 2); assert.equal(actual[0].part_name, "Alpha steel");
  assert.equal(actual[0].quantity, 0); assert.equal(actual[0].unit_cost, 2); assert.equal(actual[0].extended_cost, 0);
  assert.equal(actual[1].part_type, "labor"); assert.equal(actual[1].unit_cost, 72); assert.equal(actual[1].extended_cost, 72);
  for (const row of actual) {
    assert.equal(row.source_estimate_id, estimate.id); assert.equal(row.estimate_line_id, "synthetic-line");
    assert.equal(row.builder_product_id, "synthetic-builder"); assert.equal(row.module_key, "foundation");
    assert.equal(row.section_name, "Synthetic foundation");
  }
  assert.equal(JSON.stringify(parts), before); assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});
await check("primary read errors remain errors, never an empty manifest", async () => {
  const failure = Error("Synthetic primary read unavailable");
  handler = async query => { if (query.estimate_id) throw failure; return []; };
  await assert.rejects(manifest(estimate), error => error === failure);
});
await check("linked product read errors remain errors", async () => {
  const failure = Error("Synthetic product read unavailable");
  handler = async query => { if (query.builder_product_id) throw failure; return []; };
  await assert.rejects(manifest(estimate), error => error === failure);
});
await check("mixed stamped and legacy parts on one product are both included", async () => {
  const stamped = part("stamped"), legacy = part("legacy");
  handler = async query => query.estimate_id ? [stamped] : [stamped, legacy];
  const actual = await manifest(estimate);
  assert.deepEqual(actual.map(row => row.builder_part_id), ["legacy", "stamped"]);
  assert.deepEqual(reads.map(row => row.query), [{ estimate_id: estimate.id }, { builder_product_id: "synthetic-builder" }]);
});
await check("legacy product loading is paged rather than silently capped at500", async () => {
  const rows = Array.from({ length: 505 }, (_, index) => part("legacy-" + index));
  handler = async query => query.estimate_id ? [] : rows;
  const actual = await manifest(estimate);
  assert.equal(actual.length, 505); assert.equal(new Set(actual.map(row => row.builder_part_id)).size, 505);
  assert.ok(actual.some(row => row.builder_part_id === "legacy-504"));
  assert.ok(reads.every(row => row.via === "paged"));
});
await check("duplicate rows from both read paths count only once", async () => {
  handler = async () => [part("one")];
  const actual = await manifest(estimate);
  assert.equal(actual.length, 1); assert.equal(actual[0].extended_cost, 2);
});
await check("malformed explicit inputs do not fall through into live reads", async () => {
  for (const value of [false, 0, "", {}, "parts"]) {
    await assert.rejects(manifest(estimate, { parts: value }), /Parts must be an array/);
  }
  assert.deepEqual(reads, []);
});
for (const existing of [null, { id: "synthetic-existing-work-order", materials: [], products: [] }]) {
  await check(`failed material read blocks ${existing ? "update" : "create"} before any Work Order write`, async () => {
    const failure = Error("Synthetic materials could not be verified");
    handler = async query => { if (query.estimate_id) throw failure; return []; };
    await assert.rejects(commit({ estimate, estimateBefore: estimate, existing,
      verifiedCustomerId: "synthetic-customer", entities: { Estimate: {}, WorkOrder: {} } }), error => error === failure);
    assert.deepEqual(writes, []);
  });
}
await check("a mapper validation error is not converted into an empty successful handoff", async () => {
  const failure = Object.assign(Error("Synthetic invalid frozen context"), { code: "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID" });
  const invalid = part("invalid");
  Object.defineProperty(invalid, "frozen_unit_cost", { get() { throw failure; } });
  handler = async () => [invalid];
  await assert.rejects(commit({ estimate, estimateBefore: estimate, existing: null,
    verifiedCustomerId: "synthetic-customer", entities: { Estimate: {}, WorkOrder: {} } }), error => error === failure);
  assert.deepEqual(writes, []);
});
fs.writeFileSync(dir + "material-read-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Material read guards: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;
