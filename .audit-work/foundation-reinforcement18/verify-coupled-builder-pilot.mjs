import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const frozen = JSON.parse(fs.readFileSync(DIR + "versioned-persistence-frozen-inputs.json", "utf8"));
const source = structuredClone(frozen.adopted);
source.grand_total = frozen.adopted.items[0].item_total_cost;
source.items[0].reinforcement_proposal = structuredClone(frozen.rawDraft);
const sourceBefore = structuredClone(source), expected = frozen.adopted.items[0];
const unrelatedLine = { line_id: "unrelated-line", module_key: "painting", project_id: source.id, total_snapshot: 345, sentinel: ["untouched"] };
const unrelatedBuilder = { id: "unrelated-builder", estimate_id: "coupled-estimate", module_key: "painting", source_project_id: source.id,
  updated_date: source.updated_date, frozen_cost: 345, frozen_customer_price: 678, builder_snapshot: { sentinel: "untouched" } };
const unrelatedPart = { id: "unrelated-part", builder_product_id: "unrelated-builder", frozen_extended_cost: 48, sentinel: "untouched" };
const store = coupledBuilderStore({
  AllInOneEstimate: [{ id: "coupled-estimate", status: "draft", deleted: false, updated_date: source.updated_date, line_items: [
    unrelatedLine,
    { line_id: "coupled-foundation-line", module_key: "foundation", project_id: source.id, builder_product_id: "coupled-foundation-builder",
      total_snapshot: 0, customer_price_snapshot: 0 },
  ] }],
  BuilderProduct: [unrelatedBuilder, { id: "coupled-foundation-builder", estimate_id: "coupled-estimate", estimate_line_id: "coupled-foundation-line",
    module_key: "foundation", source_project_id: source.id, source_entity: "FoundationProject", updated_date: source.updated_date,
    frozen_cost: 0, frozen_customer_price: 0, price_state: "unchecked", builder_version: 1 }],
  BuilderPart: [unrelatedPart], BuilderPartGroup: [], BuilderPriceRevision: [], FoundationProject: [source],
  FoundationInventory: [{ id: "legacy-by-size", material_name: "Legacy #4", material_type: "rebar", rebar_size: "#4",
    unit: "ft", cost_per_unit: 9, updated_date: source.updated_date }],
  LaborServiceInventory: [], Settings: [],
});
globalThis.__coupledBuilder = store;
globalThis.window = {
  location: { href: "http://coupled.invalid/", origin: "http://coupled.invalid", search: "" },
  localStorage: { getItem: key => key === "sss_session_token" ? "synthetic-session-not-real" : null },
};
globalThis.fetch = () => { throw Error("External requests prohibited in coupled synthetic pilot"); };
const virtual = {
  "@/api/base44Client": `
    const entities=new Proxy({},{get(_,key){return globalThis.__coupledBuilder.entity(key);}});
    export const base44={entities,functions:{invoke:(...args)=>globalThis.__coupledBuilder.invoke(...args)},
      auth:{me:async()=>({id:"synthetic-owner"})}};
    export const isRetryableFunction=()=>false;`,
  "@/components/staff/staffEntities": `export const staffEntities=new Proxy({},{get(_,key){return globalThis.__coupledBuilder.entity(key);}});`,
};
const outfile = DIR + "coupled-builder-pilot-bundle.mjs";
const built = await build({
  entryPoints: ["src/components/estimator/builder/builderService.js"], outfile, bundle: true,
  format: "esm", platform: "node", metafile: true,
  plugins: [{ name: "only-sdk-entity-boundary-is-fake", setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => {
      if (virtual[args.path]) return { path: args.path, namespace: "synthetic" };
      return builder.resolve(path.resolve("src", args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() });
    });
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: virtual[args.path], loader: "js" }));
  } }],
});
for (const file of [
  "src/components/estimator/builder/builderService.js", "src/components/estimator/builder/partSync.js",
  "src/components/estimator/customerPricing.js", "src/components/estimator/estimatePersistence.js",
  "src/components/estimator/builder/builderEntityPersistence.js", "src/components/estimator/builder/builderPartPersistence.js",
  "src/components/estimator/builder/builderMutationRecovery.js", "src/components/estimator/estimateMutationGuard.js",
  "src/components/estimator/loadAllEntityRows.js", "src/components/estimator/foundation/foundationReinforcementPartDescriptors.js",
]) assert.ok(built.metafile.inputs[file], "Must exercise actual helper: " + file);
assert.ok(!Object.keys(built.metafile.inputs).some(input => /src\/api\/base44Client\.js|node_modules\/@base44\//.test(input)));
fs.writeFileSync(DIR + "coupled-builder-pilot-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const { recordBuilderSave } = await import(pathToFileURL(path.resolve(outfile)));
let returned, failure;
try {
  returned = await recordBuilderSave({ estimateId: "coupled-estimate", line: { module_key: "foundation", project_id: source.id },
    sourceProject: source, liveTotal: expected.item_total_cost });
  const state = store.snapshot(), product = state.BuilderProduct.find(row => row.id === "coupled-foundation-builder");
  const material = state.BuilderPart.find(row => row.part_key === "foundation:item:0:rebar");
  const labor = state.BuilderPart.find(row => row.part_key === "foundation:item:0:rebar-labor");
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(state.AllInOneEstimate[0].line_items[0], unrelatedLine);
  assert.deepEqual(state.BuilderProduct[0], unrelatedBuilder); assert.deepEqual(state.BuilderPart[0], unrelatedPart);
  assert.equal(returned.line_id, "coupled-foundation-line"); assert.equal(returned.updated_date_snapshot, source.updated_date);
  assert.ok(!returned.price_acceptance_pending?.key);
  assert.equal(product.estimate_line_id, "coupled-foundation-line");
  assert.equal(product.frozen_cost, expected.item_total_cost); assert.equal(product.frozen_customer_price, expected.item_total_cost);
  assert.equal(material.quantity, expected.rebar_feet); assert.equal(material.frozen_unit_cost, expected.rebar_rate);
  assert.equal(material.frozen_extended_cost, expected.rebar_material_cost);
  assert.equal(material.inventory_item_id, ""); assert.equal(labor.inventory_item_id, "");
  assert.equal(labor.quantity, expected.rebar_labor_hours);
  assert.equal(labor.frozen_extended_cost, expected.rebar_labor_cost);
  for (const part of [material, labor]) {
    assert.ok(!Object.hasOwn(part.builder_data, "reinforcement_proposal"));
    const basis = part.pricing_basis_snapshot.reinforcement;
    assert.equal(basis.physical_quantity_ft, expected.rebar_geometry_feet);
    assert.equal(basis.priced_quantity_ft, expected.rebar_feet);
    assert.equal(basis.engineering_approved, false); assert.equal(basis.procurement_ready, false);
  }
  assert.equal(state.BuilderPriceRevision.length, 1);
  assert.equal(state.BuilderPriceRevision[0].reason, "initial_freeze");
  assert.equal(state.BuilderPriceRevision[0].new_total_cost, expected.item_total_cost);
} catch (error) { failure = error; }
const markerIndex = store.audit.findIndex(event => event.entity === "AllInOneEstimate" && event.patch?.line_items?.some(
  line => line.line_id === "coupled-foundation-line" && line.price_acceptance_pending?.key));
const preliminaryFrozenCreates = store.audit.filter(event => event.entity === "BuilderPart" && event.method === "create"
  && event.after.frozen_extended_cost > 0 && (markerIndex === -1 || event.index < markerIndex));
fs.writeFileSync(DIR + "coupled-builder-pilot-evidence.json", JSON.stringify({
  ok: !failure, error: failure ? { message: failure.message, stack: failure.stack } : null,
  sdkAndEntityBoundaryMocked: true, financialAndPersistenceHelpersReal: true,
  realStorageVerified: false, backendAuthorizationVerified: false, calculatorInputsFromFrozenData: true,
  returned, state: store.snapshot(), audit: store.audit,
  diagnostics: { markerIndex, preMarkerBaselineCreates: preliminaryFrozenCreates.map(event => ({ index: event.index, partKey: event.after.part_key })),
    baselineVersusAcceptedPriceContractRequiresReview: true },
}, null, 2) + "\n");
if (failure) throw failure;
console.log("Coupled actual service/Part sync/initial-freeze recovery pilot passes; baseline-write ordering still requires review.");
