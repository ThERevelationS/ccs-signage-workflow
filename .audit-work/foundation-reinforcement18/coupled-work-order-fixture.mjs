import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const TOKEN = "synthetic-session-not-real";
export function environment(state, { approved = true } = {}) {
  const initial = structuredClone(state);
  Object.assign(initial.AllInOneEstimate[0], {
    ...(approved ? { status: "approved" } : {}),
    customer_id: "synthetic-customer", client_name: "Synthetic", estimate_number: "SYN-COUPLED",
  });
  initial.Customer = [{ id: "synthetic-customer", company_name: "Synthetic", credit_hold: false, credit_limit: 0 }];
  initial.WorkOrder = []; initial.EstimateRevision = [];
  const store = coupledBuilderStore(initial);
  const epoch = Date.parse("2026-11-07T12:00:00.000Z");
  const stamps = Object.values(initial).flat().map(row => Date.parse(row.updated_date)).filter(Number.isFinite);
  store.sequence = Math.max(epoch, ...stamps) - epoch + 1;
  const calls = [];
  store.invoke = async (name, body) => {
    assert.equal(name, "ensureEstimateLifecycleRevision", "No AI, invoicing, customer creation or other SDK function is permitted");
    assert.equal(body.session_token, TOKEN);
    assert.equal(body.revision.estimate_id, "coupled-estimate");
    assert.equal(body.revision.revision_type, "conversion");
    assert.equal(body.revision.work_order_id, store.snapshot().WorkOrder[0].id);
    assert.equal(body.revision.idempotency_key, body.idempotency_key);
    calls.push({ name, body: structuredClone(body) });
    const entity = store.entity("EstimateRevision");
    const rows = await entity.filter({ idempotency_key: body.idempotency_key });
    assert.ok(rows.length <= 1);
    return { data: { revision: rows[0] || await entity.create(body.revision) } };
  };
  const env = { initial, store, calls, forbidden: [] };
  globalThis.__coupledWorkOrder = env;
  return env;
}
export async function buildWorkOrderHelpers() {
  const deny = name => `(...args)=>{globalThis.__coupledWorkOrder.forbidden.push(${JSON.stringify(name)});throw Error("Forbidden advisory/notification I/O: "+${JSON.stringify(name)});}`;
  const stubs = {
    "@/api/base44Client": `export const base44={
      entities:new Proxy({},{get(_,key){return globalThis.__coupledWorkOrder.store.entity(key);}}),
      functions:{invoke:(...args)=>globalThis.__coupledWorkOrder.store.invoke(...args)}};
      export const isRetryableFunction=()=>false;`,
    "@/components/staff/staffEntities": `export const staffEntities=new Proxy({},{get(_,key){return globalThis.__coupledWorkOrder.store.entity(key);}});`,
    "@/components/auth/EmailGate": `export const getSessionToken=()=>${JSON.stringify(TOKEN)};export const useAuth=()=>({currentUser:{id:"synthetic-owner"}});`,
    "@/lib/workOrderCache": `export const fetchAllWorkOrders=${deny("board-cache")};`,
    "@/components/workflow/NotificationService": `export const NotificationTriggers=new Proxy({},{get(){return ${deny("notification")};}});`,
  };
  const outfile = DIR + "coupled-work-order-bundle.mjs";
  const compiled = await build({
    stdin: { contents: `
      export {convertEstimateToWorkOrder,buildEstimateMaterialsManifest} from "./src/components/estimator/estimateConversionService.js";
      export {buildEstimateWorkOrderProducts} from "./src/components/estimator/workOrderConversion.js";
      export {productParts,partsSummary} from "./src/components/jobs/productsToPartsModel.js";
      export {buildWorkOrderPrintModel} from "./src/components/jobs/printTemplates/workOrderPrintModel.js";
      export {renderOriginalHtml} from "./src/components/jobs/printTemplates/templates/original.js";
    `, resolveDir: process.cwd(), sourcefile: "coupled-work-order-entry.js", loader: "js" },
    bundle: true, platform: "node", format: "esm", jsx: "automatic", metafile: true, outfile,
    external: ["react", "react-dom"],
    plugins: [{ name: "saved-page-work-order-sdk-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (stubs[args.path]) return { path: args.path, namespace: "offline" };
        if (args.path.startsWith("@/")) return builder.resolve(path.resolve("src", args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() });
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  for (const file of ["src/components/estimator/estimateConversionService.js", "src/components/estimator/loadAllEntityRows.js",
    "src/components/estimator/workOrderConversion.js", "src/components/estimator/workOrderSyncPersistence.js",
    "src/components/estimator/customerSync.js", "src/components/estimator/estimatePersistence.js",
    "src/components/estimator/estimateRevisionService.js", "src/components/estimator/customerPricing.js",
    "src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js",
    "src/components/jobs/productsToPartsModel.js", "src/components/jobs/printTemplates/workOrderPrintModel.js",
    "src/components/jobs/printTemplates/templates/original.js"]) assert.ok(compiled.metafile.inputs[file], "Actual helper required: " + file);
  assert.ok(!Object.keys(compiled.metafile.inputs).some(file => /src\/api\/base44Client\.js|node_modules\/@base44\//.test(file)));
  fs.writeFileSync(DIR + "coupled-work-order-meta.json", JSON.stringify(compiled.metafile, null, 2) + "\n");
  globalThis.fetch = () => { throw Error("External requests prohibited"); };
  return import(pathToFileURL(path.resolve(outfile)));
}
export const convert = (helpers, env) => helpers.convertEstimateToWorkOrder({
  estimate: env.store.snapshot().AllInOneEstimate[0],
  // This is the existing two-section frozen fixture: painting345 + Foundation694.
  pricing: { quoteTotal: 1039 }, sessionToken: TOKEN,
  currentUser: { id: "synthetic-owner", role: "admin" },
  entities: { Estimate: env.store.entity("AllInOneEstimate"), WorkOrder: env.store.entity("WorkOrder") },
});
