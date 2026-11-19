import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const baseline = JSON.parse(fs.readFileSync(DIR + "coupled-builder-pilot-evidence.json", "utf8"));
const provenance = JSON.parse(fs.readFileSync(DIR + "coupled-builder-pilot-frozen-code.json", "utf8"));
const frozen = JSON.parse(fs.readFileSync(DIR + "versioned-persistence-frozen-inputs.json", "utf8"));
assert.equal(baseline.ok, true);
function checkCode() {
  for (const [file, hash] of Object.entries(provenance.hashes)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), hash, "Frozen code drift: " + file);
  }
}
checkCode();
const firstEstimateWrite = baseline.audit.find(event => event.entity === "AllInOneEstimate" && event.method === "updateMany");
const firstProductWrite = baseline.audit.find(event => event.entity === "BuilderProduct"
  && event.id === "coupled-foundation-builder" && event.method === "updateMany");
assert.ok(firstEstimateWrite?.before && firstProductWrite?.before);
const initial = structuredClone(baseline.state);
initial.AllInOneEstimate = [firstEstimateWrite.before];
initial.BuilderProduct = [baseline.state.BuilderProduct.find(row => row.id === "unrelated-builder"), firstProductWrite.before];
initial.BuilderPart = baseline.state.BuilderPart.filter(row => row.builder_product_id === "unrelated-builder");
initial.BuilderPartGroup = [];
initial.BuilderPriceRevision = [];
const source = initial.FoundationProject[0], expected = frozen.adopted.items[0];
const originalUnrelatedLine = structuredClone(initial.AllInOneEstimate[0].line_items[0]);
const originalUnrelatedBuilder = structuredClone(initial.BuilderProduct[0]);
const originalUnrelatedParts = structuredClone(initial.BuilderPart);
globalThis.fetch = () => { throw Error("External requests prohibited in recovery matrix"); };
globalThis.window = {
  location: { href: "http://coupled.invalid/", origin: "http://coupled.invalid", search: "" },
  localStorage: { getItem: key => key === "sss_session_token" ? "synthetic-session-not-real" : null },
};
const results = [];
let recordBuilderSave;
for (const scenario of ["revision-unavailable-before-persist", "revision-reply-lost-after-persist"]) {
  const store = coupledBuilderStore(initial);
  globalThis.__coupledBuilder = store;
  if (!recordBuilderSave) ({ recordBuilderSave } = await import(pathToFileURL(path.resolve(provenance.bundle))));
  let injected = false, attempts = 0;
  const invoke = store.invoke;
  store.invoke = async (...args) => {
    attempts++;
    if (scenario === "revision-unavailable-before-persist" && !injected) {
      injected = true;
      assert.equal(args[0], "ensureBuilderPriceRevision");
      throw Error("Synthetic revision unavailable before persistence");
    }
    return invoke(...args);
  };
  store.onEvent = event => {
    if (scenario === "revision-reply-lost-after-persist" && event.method === "ensureBuilderPriceRevision" && !injected) {
      injected = true;
      throw Error("Synthetic revision reply lost after persistence");
    }
  };
  const supplied = structuredClone(source), suppliedBefore = structuredClone(supplied);
  const call = () => recordBuilderSave({
    estimateId: "coupled-estimate", line: { module_key: "foundation", project_id: source.id },
    sourceProject: supplied, liveTotal: expected.item_total_cost,
  });
  let afterFailure, afterRecovery, returned, failure;
  try {
    await assert.rejects(call, /Synthetic revision (unavailable before|reply lost after) persistence/);
    assert.equal(injected, true);
    afterFailure = store.snapshot();
    const pendingLine = afterFailure.AllInOneEstimate[0].line_items.find(line => line.line_id === "coupled-foundation-line");
    assert.equal(pendingLine.price_acceptance_pending.kind, "builder_initial_freeze");
    assert.ok(pendingLine.price_acceptance_pending.key);
    const product = afterFailure.BuilderProduct.find(row => row.id === "coupled-foundation-builder");
    assert.equal(product.frozen_cost, 0); assert.equal(product.builder_version, 1);
    assert.equal(afterFailure.BuilderPriceRevision.length, scenario === "revision-reply-lost-after-persist" ? 1 : 0);
    returned = await call();
    afterRecovery = store.snapshot();
    assert.equal(attempts, 2);
    assert.equal(returned.line_id, "coupled-foundation-line");
    assert.equal(returned.updated_date_snapshot, source.updated_date);
    assert.equal(returned.total_snapshot, expected.item_total_cost);
    assert.ok(!returned.price_acceptance_pending?.key);
    assert.deepEqual(supplied, suppliedBefore);
    for (const state of [afterFailure, afterRecovery]) {
      assert.deepEqual(state.AllInOneEstimate[0].line_items[0], originalUnrelatedLine);
      assert.deepEqual(state.BuilderProduct.find(row => row.id === "unrelated-builder"), originalUnrelatedBuilder);
      assert.deepEqual(state.BuilderPart.filter(row => row.builder_product_id === "unrelated-builder"), originalUnrelatedParts);
    }
    const recoveredProduct = afterRecovery.BuilderProduct.find(row => row.id === "coupled-foundation-builder");
    assert.equal(recoveredProduct.frozen_cost, expected.item_total_cost);
    assert.equal(recoveredProduct.frozen_customer_price, expected.item_total_cost);
    assert.equal(recoveredProduct.builder_version, 2);
    assert.equal(afterRecovery.BuilderPriceRevision.length, 1);
    const revision = afterRecovery.BuilderPriceRevision[0];
    assert.equal(revision.new_total_cost, expected.item_total_cost);
    assert.equal(revision.idempotency_key, pendingLine.price_acceptance_pending.key);
    const parts = afterRecovery.BuilderPart.filter(row => row.builder_product_id === "coupled-foundation-builder");
    assert.equal(parts.length, 5);
    assert.equal(new Set(parts.map(part => part.part_key)).size, 5);
    const material = parts.find(part => part.part_key === "foundation:item:0:rebar");
    const labor = parts.find(part => part.part_key === "foundation:item:0:rebar-labor");
    assert.equal(material.frozen_extended_cost, expected.rebar_material_cost);
    assert.equal(labor.frozen_extended_cost, expected.rebar_labor_cost);
    assert.equal(material.quantity, expected.rebar_feet);
    assert.equal(labor.quantity, expected.rebar_labor_hours);
    for (const part of [material, labor]) {
      assert.equal(part.inventory_item_id, "");
      assert.equal(part.pricing_basis_snapshot.reinforcement.physical_quantity_ft, expected.rebar_geometry_feet);
      assert.equal(part.pricing_basis_snapshot.reinforcement.engineering_approved, false);
      assert.equal(part.pricing_basis_snapshot.reinforcement.procurement_ready, false);
      assert.ok(!Object.hasOwn(part.builder_data, "reinforcement_proposal"));
    }
  } catch (error) { failure = error; }
  const evidence = { scenario, ok: !failure, error: failure ? { message: failure.message, stack: failure.stack } : null,
    sdkAndEntityBoundaryMocked: true, realStorageVerified: false, backendAuthorizationVerified: false,
    initialFixtureFromFrozenPilotAudit: true, calculatorInputsFromFrozenData: true, attempts,
    afterFailure, afterRecovery: afterRecovery || store.snapshot(), returned, audit: store.audit };
  fs.writeFileSync(DIR + `coupled-builder-recovery-${scenario}.json`, JSON.stringify(evidence, null, 2) + "\n");
  if (failure) throw failure;
  results.push({ scenario, ok: true, revisionRows: afterRecovery.BuilderPriceRevision.length,
    productVersion: afterRecovery.BuilderProduct.find(row => row.id === "coupled-foundation-builder").builder_version });
  console.log("ok", scenario);
}
checkCode();
fs.writeFileSync(DIR + "coupled-builder-recovery-verification.json", JSON.stringify({
  actualFrozenServiceAndHelpers: true, sdkAndEntityBoundaryMocked: true, realStorageVerified: false,
  acceptedPilotNotRecomputed: true, results,
}, null, 2) + "\n");
