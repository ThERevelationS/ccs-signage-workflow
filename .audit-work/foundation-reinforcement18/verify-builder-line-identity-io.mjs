import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const unexpected = name => `export function ${name}(){throw Error("Unexpected boundary: ${name}");}`;
const stubs = {
  "@/api/base44Client": `export const base44=new Proxy({},{get(){throw Error("Actual SDK access prohibited");}});`,
  "@/components/estimator/moduleRegistry": `
    export const MODULE_TOTAL_FIELD={};
    export const getModuleLabel=key=>key;
    export const getModule=key=>({entity:key==="foundation"?"FoundationProject":"PaintingProject"});`,
  "../customerPricing": `
    export const acceptedCustomerUnitPrice=line=>line.customer_price_snapshot??0;
    export const hasNumericValue=value=>value!==null&&value!==undefined&&value!=="";
    export const liveCustomerUnitPrice=line=>line.live_customer_price_snapshot??0;
    export const manualCustomerPriceState=()=>"manual";
    export const sourceProjectEconomics=()=>({internalCost:0,customerPrice:0});`,
  "@/components/estimator/estimateMutationGuard": `
    export async function assertEstimateProductMutationAllowed(estimate){
      if(estimate.status!=="draft"||estimate.deleted)throw Error("Invalid synthetic authorization precondition");
    }`,
  "@/components/estimator/loadAllEntityRows": `
    export async function loadAllEntityRows({entity,query}){
      if(query.builder_product_id!=="foundation-builder")throw Error("Wrong Parts scope");
      return entity.filter(query);
    }`,
  "@/components/staff/staffEntities": `export const staffEntities=new Proxy({},{get(_,name){return globalThis.__builderIdentityIO.entities[name]||(()=>{throw Error("Unknown entity "+String(name));})();}});`,
  "@/components/estimator/estimatePersistence": `
    export const expectedEstimateFields=(row,data)=>Object.fromEntries(Object.keys(data).map(key=>[key,structuredClone(row[key])]));
    export async function replaceEstimateFieldsIfUnchanged(args){return globalThis.__builderIdentityIO.replaceEstimate(args);}`,
  "./builderEntityPersistence": `
    export const expectedBuilderEntityFields=(row,data)=>Object.fromEntries(Object.keys(data).map(key=>[key,structuredClone(row[key])]));
    export async function replaceBuilderEntityFieldsIfUnchanged(args){return globalThis.__builderIdentityIO.replaceBuilder(args);}
    ${unexpected("deleteBuilderEntityIfUnchanged")}`,
  "./builderProductPersistence": unexpected("createBuilderProductWithRecovery"),
  "./partSync": `
    export async function loadVerifiedBuilderPartSyncInputs({builderProduct,moduleKey}){
      if(builderProduct.id!=="foundation-builder"||moduleKey!=="foundation")throw Error("Wrong catalog/Product scope");
      return {catalogs:{},existingParts:[],inventoryRowsOverride:new Map()};
    }
    export async function syncBuilderParts(args){
      const env=globalThis.__builderIdentityIO;
      if(args.builderProduct.id!=="foundation-builder")throw Error("Wrong Part synchronization Product");
      env.partSync.push(structuredClone(args.sourceProject));
      return {partCount:0,detachedCount:0,changedCount:0,manualAddonCurrentTotal:0,parts:[]};
    }
    export async function acceptBuilderPartPrices(id){
      if(id!=="foundation-builder")throw Error("Wrong price plan Product");
      return {detachedCount:0,acceptancePlan:{part_updates:[]},changedParts:[]};
    }
    ${unexpected("applyBuilderPartPriceAcceptancePlan")}`,
  "./builderMutationRecovery": `
    export const pendingBuilderMutation=line=>line?.price_acceptance_pending?.key?line.price_acceptance_pending:null;
    export async function resumeBuilderMutation(args){return globalThis.__builderIdentityIO.resume(args);}`,
};
const outfile = DIR + "builder-identity-io-bundle.mjs";
const built = await build({
  entryPoints: ["src/components/estimator/builder/builderService.js"], outfile, bundle: true,
  format: "esm", platform: "node", metafile: true,
  plugins: [{ name: "synthetic-identity-io", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "synthetic" } : null);
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }],
});
assert.ok(built.metafile.inputs["src/components/estimator/builder/builderService.js"]);
assert.ok(!Object.keys(built.metafile.inputs).some(input => /base44Client\.js|staffEntities\.js|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "builder-identity-io-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const { recordBuilderSave } = await import(pathToFileURL(path.resolve(outfile)));
const clone = value => structuredClone(value);
const cases = [
  { name: "normal save, missing unrelated Builder ID" },
  { name: "normal save, null Builder IDs", blank: null },
  { name: "normal save, empty Builder IDs", blank: "" },
  { name: "same module, different source and missing Builder ID", sameModule: true },
  { name: "different modules sharing a project ID", sharedSourceId: true },
  { name: "legacy target line without its Builder ID", legacyLink: true, legacyPrice: true },
  { name: "explicit target Builder ID without project hint", explicitBuilder: true },
  { name: "initial freeze scopes marker, recovery and returned line", initial: true, sharedSourceId: true },
];
const results = [];
for (const scenario of cases) {
  const first = { line_id: "unrelated-line", module_key: scenario.sameModule ? "foundation" : "painting",
    project_id: scenario.sharedSourceId ? "foundation-source" : "unrelated-source",
    total_snapshot: 345, customer_price_snapshot: 678, sentinel: { keep: ["all", "nested", "values"] } };
  if ("blank" in scenario) first.builder_product_id = scenario.blank;
  const target = { line_id: "foundation-line", module_key: "foundation", project_id: "foundation-source",
    builder_product_id: "foundation-builder", total_snapshot: scenario.initial ? 0 : 100, customer_price_snapshot: scenario.initial ? 0 : 200 };
  if (scenario.legacyLink) delete target.builder_product_id;
  const env = {
    estimate: { id: "synthetic-estimate", status: "draft", updated_date: "estimate-v1", line_items: [first, target] },
    builders: [
      { id: "unrelated-builder", estimate_id: "synthetic-estimate", module_key: first.module_key, source_project_id: first.project_id,
        updated_date: "unrelated-v1", frozen_cost: 345, frozen_customer_price: 678, builder_snapshot: { sentinel: "untouched" } },
      { id: "foundation-builder", estimate_id: "synthetic-estimate", estimate_line_id: "foundation-line", module_key: "foundation",
        source_project_id: "foundation-source", source_entity: "FoundationProject", builder_name: "foundation", client_product_name: "foundation",
        updated_date: "foundation-v1", frozen_cost: scenario.initial ? 0 : 100, frozen_customer_price: scenario.initial ? 0 : 200,
        price_state: scenario.initial ? "unchecked" : scenario.legacyPrice ? "legacy_frozen" : "current", builder_version: 1 },
    ],
    parts: [{ id: "unrelated-part", builder_product_id: "unrelated-builder", frozen_total_cost: 48 }],
    partSync: [], writes: [], recoveries: [], version: 1,
  };
  const unrelatedLine = clone(first), unrelatedBuilder = clone(env.builders[0]), unrelatedParts = clone(env.parts);
  env.entities = {
    AllInOneEstimate: { get: async id => { assert.equal(id, env.estimate.id); return clone(env.estimate); } },
    BuilderProduct: {
      get: async id => { const row = env.builders.find(item => item.id === id); assert.ok(row); return clone(row); },
      filter: async query => clone(env.builders.filter(item => Object.entries(query).every(([key, value]) => item[key] === value))),
    },
    BuilderPart: { filter: async query => clone(env.parts.filter(item => item.builder_product_id === query.builder_product_id)) },
  };
  env.replaceEstimate = async args => {
    assert.equal(args.estimateId, env.estimate.id);
    for (const [key, value] of Object.entries(args.expectedFields)) assert.deepEqual(env.estimate[key], value, "Synthetic Estimate CAS");
    assert.deepEqual(args.nextFields.line_items[0], unrelatedLine, "Unrelated Estimate line must not receive a patch or marker");
    env.writes.push({ kind: "estimate", lineIds: args.nextFields.line_items.map(item => item.line_id) });
    Object.assign(env.estimate, clone(args.nextFields), { updated_date: `estimate-v${++env.version}` });
    return clone(env.estimate);
  };
  env.replaceBuilder = async args => {
    assert.equal(args.id, "foundation-builder", "No unrelated Builder Product write");
    const row = env.builders[1]; assert.equal(args.expectedUpdatedAt, row.updated_date);
    for (const [key, value] of Object.entries(args.expectedFields)) assert.deepEqual(row[key], value, "Synthetic Builder CAS");
    Object.assign(row, clone(args.nextFields), { updated_date: `foundation-v${++env.version}` });
    env.writes.push({ kind: "builder", id: row.id }); return clone(row);
  };
  env.resume = async args => {
    assert.equal(args.line.line_id, "foundation-line");
    assert.equal(args.pending.estimate_line_id, "foundation-line");
    assert.equal(args.pending.builder_product_id, "foundation-builder");
    assert.equal(args.pending.line_patch.line_id, "foundation-line");
    assert.deepEqual(env.estimate.line_items[0], unrelatedLine);
    env.recoveries.push(clone(args.pending));
    // Recovery itself has separate tests: this boundary observes the exact
    // target and applies only its supplied patches, without inventing pricing.
    Object.assign(env.builders[1], clone(args.pending.builder_patch));
    const line = env.estimate.line_items.find(item => item.line_id === "foundation-line");
    Object.assign(line, clone(args.pending.line_patch)); delete line.price_acceptance_pending;
    return { line: clone(line) };
  };
  globalThis.__builderIdentityIO = env;
  const hint = { module_key: "foundation" };
  if (!scenario.explicitBuilder) hint.project_id = "foundation-source";
  if (scenario.explicitBuilder) hint.builder_product_id = "foundation-builder";
  if ("blank" in scenario) hint.builder_product_id = scenario.blank;
  const source = { id: "foundation-source", updated_date: "source-v2", grand_total: 0, notes: "Synthetic identity I/O only" };
  const hintBefore = clone(hint), submittedSource = clone(source);
  const returned = await recordBuilderSave({ estimateId: env.estimate.id, line: hint, sourceProject: submittedSource, liveTotal: 0 });
  assert.deepEqual(hint, hintBefore); assert.deepEqual(submittedSource, source);
  assert.equal(returned.line_id, "foundation-line"); assert.equal(returned.module_key, "foundation");
  assert.equal(returned.project_id, "foundation-source"); assert.equal(returned.builder_product_id, "foundation-builder");
  assert.deepEqual(env.estimate.line_items[0], unrelatedLine);
  assert.deepEqual(env.builders[0], unrelatedBuilder); assert.deepEqual(env.parts, unrelatedParts);
  assert.equal(env.partSync.length, 1); assert.deepEqual(env.partSync[0], source);
  assert.deepEqual(env.builders[1].builder_snapshot, source);
  assert.equal(env.builders[1].estimate_line_id, "foundation-line");
  assert.equal(env.builders[1].source_project_id, "foundation-source");
  assert.equal(env.builders[1].module_key, "foundation");
  assert.equal(env.builders[1].source_entity, "FoundationProject");
  assert.equal(env.builders[1].builder_snapshot_source_updated_date, source.updated_date);
  assert.equal(env.builders[1].frozen_cost, scenario.initial ? 0 : 100);
  assert.equal(env.builders[1].frozen_customer_price, scenario.initial ? 0 : 200);
  assert.equal(env.recoveries.length, scenario.initial ? 1 : 0);
  if (scenario.legacyPrice) assert.equal(env.builders[1].price_state, "legacy_frozen");
  results.push({ name: scenario.name, ok: true, returnedLineId: returned.line_id, unrelatedRecordsUnchanged: true,
    callerInputsUnchanged: true, finalTarget: clone(env.builders[1]),
    writes: env.writes, pendingRecoveryTargets: env.recoveries.map(item => item.estimate_line_id) });
  console.log("ok", scenario.name);
}
fs.writeFileSync(DIR + "builder-identity-io-verification.json", JSON.stringify({
  synthetic: true, actualBuilderService: true, financialHelpersMocked: true, partSyncMocked: true, recoveryExecutionMocked: true,
  authorizationGateMocked: true, realBase44StorageVerified: false,
  scope: "Actual service selection, ensureProduct routing, Estimate update, marker selection and return scoping. Not a financial calculator, complete recovery, provider or real-storage test.",
  results,
}, null, 2) + "\n");
console.log("Builder identity I/O scope: 8/8");
