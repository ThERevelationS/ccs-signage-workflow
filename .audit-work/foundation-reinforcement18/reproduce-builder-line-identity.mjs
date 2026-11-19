import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const fixed = process.argv.includes("--fixed");
const entry = fixed ? "src/components/estimator/builder/builderService.js" : DIR + "builder-identity-beforeLocal-builderService.js";
const output = DIR + `builder-identity-${fixed ? "fixed" : "baseline"}-bundle.mjs`;
const unexpected = name => `export function ${name}(){throw Error("Unexpected boundary: ${name}");}`;
const stubs = {
  "@/api/base44Client": `export const base44=new Proxy({},{get(){throw Error("Actual SDK access prohibited");}});`,
  "@/components/estimator/moduleRegistry": `
    export const MODULE_TOTAL_FIELD={};
    export const getModuleLabel=key=>key;
    export function getModule(key){globalThis.__builderIdentity.modules.push(key);throw Object.assign(Error("Synthetic module boundary"),{syntheticModuleBoundary:true,moduleKey:key});}`,
  "./partSync": ["acceptBuilderPartPrices", "applyBuilderPartPriceAcceptancePlan", "loadVerifiedBuilderPartSyncInputs", "syncBuilderParts"].map(unexpected).join("\n"),
  "../customerPricing": `
    export const acceptedCustomerUnitPrice=()=>0;
    export const hasNumericValue=value=>value!==null&&value!==undefined&&value!=="";
    export const liveCustomerUnitPrice=()=>0;
    export const manualCustomerPriceState=()=>({});
    ${unexpected("sourceProjectEconomics")}`,
  "@/components/estimator/estimateMutationGuard": `
    export async function assertEstimateProductMutationAllowed(estimate){
      if(estimate.status!=="draft"||estimate.deleted||estimate.line_items.some(line=>line.price_acceptance_pending))throw Error("Invalid synthetic authorization precondition");
      globalThis.__builderIdentity.guardReached=true;
    }`,
  "./builderMutationRecovery": `
    export function pendingBuilderMutation(line){if(line.price_acceptance_pending)throw Error("Unexpected pending mutation");return null;}
    ${unexpected("resumeBuilderMutation")}`,
  "@/components/estimator/loadAllEntityRows": unexpected("loadAllEntityRows"),
  "@/components/estimator/estimatePersistence": ["expectedEstimateFields", "replaceEstimateFieldsIfUnchanged"].map(unexpected).join("\n"),
  "./builderEntityPersistence": ["deleteBuilderEntityIfUnchanged", "expectedBuilderEntityFields", "replaceBuilderEntityFieldsIfUnchanged"].map(unexpected).join("\n"),
  "./builderProductPersistence": unexpected("createBuilderProductWithRecovery"),
  "@/components/staff/staffEntities": `
    export const staffEntities=new Proxy({},{get(_,name){
      if(name!=="AllInOneEstimate")throw Error("Unexpected entity: "+String(name));
      return {async get(id){const env=globalThis.__builderIdentity;if(id!==env.estimate.id)throw Error("Wrong synthetic estimate");env.reads.push(id);return structuredClone(env.estimate);}};
    }});`,
};
const built = await build({
  entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "esm", metafile: true,
  plugins: [{ name: "stop-before-builder-mutations", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "synthetic" } : null);
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }],
});
assert.ok(!Object.keys(built.metafile.inputs).some(input => /base44Client\.js|staffEntities\.js|node_modules\/@base44/.test(input)));
const { recordBuilderSave } = await import(pathToFileURL(path.resolve(output)));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cases = [
  { name: "Foundation page sparse hint and unrelated missing Builder ID", firstId: undefined, hintId: undefined, before: "painting" },
  { name: "Explicit null Builder IDs must not match each other", firstId: null, hintId: null, before: "painting" },
  { name: "Empty Builder IDs must not match each other", firstId: "", hintId: "", before: "painting" },
  { name: "Ordinary different existing Builder IDs preserve the correct source match", firstId: "painting-builder", hintId: undefined, before: "foundation" },
  { name: "Explicit target Builder identity remains supported without a source hint", firstId: undefined, hintId: "foundation-builder", omitSourceHint: true, before: "foundation" },
  { name: "Equal project IDs in different modules are not interchangeable", firstId: "painting-builder", hintId: undefined, sharedProjectId: true, before: "painting" },
];
const observations = [];
for (const scenario of cases) {
  const targetProject = scenario.sharedProjectId ? "shared-source" : "foundation-source";
  const first = { line_id: "unrelated-first", module_key: "painting", project_id: scenario.sharedProjectId ? targetProject : "paint-source" };
  if (scenario.firstId !== undefined) first.builder_product_id = scenario.firstId;
  const target = { line_id: "target", module_key: "foundation", project_id: targetProject, builder_product_id: "foundation-builder" };
  const estimate = freeze({ id: "synthetic-estimate", status: "draft", line_items: [first, target] });
  const hint = { module_key: "foundation" };
  if (!scenario.omitSourceHint) hint.project_id = targetProject;
  if (scenario.hintId !== undefined) hint.builder_product_id = scenario.hintId;
  freeze(hint);
  const env = { estimate, reads: [], modules: [], guardReached: false };
  globalThis.__builderIdentity = env;
  let signal;
  try {
    await recordBuilderSave({
      estimateId: estimate.id, line: hint,
      sourceProject: freeze({ id: targetProject, updated_date: "synthetic-version" }), liveTotal: 0,
    });
  } catch (error) { signal = error; }
  assert.equal(signal?.syntheticModuleBoundary, true, "Execution must reach the actual ensureBuilderProductForLine dispatch boundary");
  assert.equal(env.guardReached, true); assert.deepEqual(env.reads, [estimate.id]);
  assert.deepEqual(env.modules, [fixed ? "foundation" : scenario.before]);
  observations.push({ name: scenario.name, intendedModule: "foundation", observedModule: signal.moduleKey, dispatchCorrect: signal.moduleKey === "foundation" });
  console.log(scenario.name + " -> " + signal.moduleKey);
}
fs.writeFileSync(DIR + `builder-identity-${fixed ? "fixed" : "baseline"}-observations.json`, JSON.stringify({
  synthetic: true, dispatchOnly: true, authorizationGateMocked: true,
  stopsBeforeAnyBuilderMutation: true, realBase44StorageVerified: false,
  limitations: "Actual recordBuilderSave and ensureBuilderProductForLine code; dependency boundaries are synthetic. This tests dispatch identity, not complete pricing, persistence, authorization or handoff.",
  observations,
}, null, 2) + "\n");
console.log(fixed ? "All six actual-service dispatch scenarios select the intended Foundation line." : "Baseline dispatch behavior captured before any Builder mutation; synthetic only.");
