import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCoupledPage, environment, mount, acceptVersionTwo } from "./coupled-page-fixture.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const summary = [];
const describe = outcome => outcome ? {
  ...outcome, error: outcome.error ? { message: outcome.error.message, stack: outcome.error.stack } : null,
} : null;
function untouched(env, state) {
  assert.deepEqual(state.AllInOneEstimate[0].line_items[0], env.initial.AllInOneEstimate[0].line_items[0]);
  assert.deepEqual(state.BuilderProduct.find(row => row.id === "unrelated-builder"), env.initial.BuilderProduct[0]);
  assert.deepEqual(state.BuilderPart.find(row => row.id === "unrelated-part"), env.initial.BuilderPart[0]);
}
function sourceWrites(env) {
  return env.store.audit.filter(event => event.entity === "FoundationProject" && event.method === "updateMany");
}
function verifiedSaved(m, outcome) {
  assert.equal(outcome.status, "saved");
  const state = m.env.store.snapshot(), source = state.FoundationProject[0];
  const product = state.BuilderProduct.find(row => row.id === "coupled-foundation-builder");
  const line = state.AllInOneEstimate[0].line_items.find(row => row.line_id === "coupled-foundation-line");
  assert.equal(sourceWrites(m.env).length, 1, "Recovery must not rewrite the already-saved source");
  // FoundationProject persists split totals, not a grand_total field.
  const savedTotalFields = ["total_concrete_cost", "total_rebar_cost", "total_excavation_cost", "total_labor_cost",
    "total_equipment_cost", "total_forming_materials_cost", "total_pole_cost", "total_pole_painting_cost",
    "total_wall_cost", "total_wall_cap_cost", "total_signage_cabinet_cost", "total_landscape_cost"];
  assert.equal(savedTotalFields.reduce((total, key) => total + source[key], 0), 694);
  assert.equal(product.frozen_cost, 694);
  assert.equal(product.frozen_customer_price, 694); assert.equal(line.total_snapshot, 694);
  assert.equal(line.updated_date_snapshot, source.updated_date);
  assert.ok(!line.price_acceptance_pending?.key);
  assert.equal(source.items[0].reinforcement_calculation_version, 2);
  assert.equal(source.items[0].rebar_material_cost, 40);
  assert.equal(source.items[0].rebar_labor_cost, 72.00000000000001);
  assert.equal(source.items[0].rebar_geometry_feet, 20);
  assert.equal(source.items[0].reinforcement_acceptance.source_id, "page-source");
  assert.equal(source.items[0].reinforcement_acceptance.component_id, "one");
  assert.equal(source.builder_sync_attempt.estimate_id, "coupled-estimate");
  assert.equal(source.builder_sync_attempt.source_project_id, "page-source");
  assert.equal(state.BuilderPriceRevision.length, 1);
  assert.equal(m.toolbar().dirty, false);
  const material = state.BuilderPart.find(part => part.part_key === "foundation:item:0:rebar");
  const labor = state.BuilderPart.find(part => part.part_key === "foundation:item:0:rebar-labor");
  assert.equal(material.frozen_extended_cost, 40); assert.equal(labor.frozen_extended_cost, 72.00000000000001);
  assert.equal(material.quantity, 20); assert.equal(material.inventory_item_id, "");
  for (const part of [material, labor]) {
    assert.ok(!Object.hasOwn(part.builder_data, "reinforcement_proposal"));
    assert.equal(part.pricing_basis_snapshot.reinforcement.procurement_ready, false);
    assert.equal(part.pricing_basis_snapshot.reinforcement.engineering_approved, false);
  }
  untouched(m.env, state);
  return state;
}
await buildCoupledPage();
for (const scenario of ["linked-acceptance-and-save", "linked-revision-failure-and-retry"]) {
  const env = environment();
  let injected = false;
  if (scenario === "linked-revision-failure-and-retry") {
    const invoke = env.store.invoke;
    env.store.invoke = async (...args) => {
      if (!injected) {
        assert.equal(args[0], "ensureBuilderPriceRevision");
        injected = true; throw Error("Synthetic linked-page revision unavailable");
      }
      return invoke(...args);
    };
  }
  const m = await mount(env);
  let first, second, afterFirst, finalState, failure;
  try {
    await acceptVersionTwo(m);
    first = await m.save();
    afterFirst = env.store.snapshot();
    if (scenario === "linked-acceptance-and-save") {
      finalState = verifiedSaved(m, first);
      const receipt = sourceWrites(env)[0];
      const firstFrozen = env.store.audit.find(event => event.entity === "BuilderPart" && event.method === "create" && event.after.frozen_extended_cost > 0);
      assert.ok(receipt.after.builder_sync_attempt, "Source sync receipt must be durable before Part baselines");
      assert.ok(firstFrozen && receipt.index < firstFrozen.index);
    } else {
      assert.equal(injected, true); assert.equal(first.status, "partial");
      assert.equal(first.sourceSaved, true); assert.equal(first.builderSync, "pending");
      assert.equal(sourceWrites(env).length, 1);
      assert.equal(afterFirst.BuilderProduct.find(row => row.id === "coupled-foundation-builder").frozen_cost, 0);
      assert.equal(afterFirst.BuilderPriceRevision.length, 0);
      const pending = afterFirst.AllInOneEstimate[0].line_items.find(line => line.line_id === "coupled-foundation-line");
      assert.ok(pending.price_acceptance_pending?.key);
      assert.equal(m.toolbar().dirty, true);
      untouched(env, afterFirst);
      second = await m.retry();
      finalState = verifiedSaved(m, second);
    }
  } catch (error) { failure = error; }
  fs.writeFileSync(DIR + `coupled-page-${scenario}.json`, JSON.stringify({
    scenario, ok: !failure, error: failure ? { message: failure.message, stack: failure.stack } : null,
    actualPageAndBusinessHelpers: true, presentationAndSdkEntityBoundariesMocked: true,
    realStorageVerified: false, backendAuthorizationVerified: false,
    first: describe(first), second: describe(second), afterFirst, finalState: finalState || env.store.snapshot(),
    toolbar: { dirty: m.toolbar()?.dirty, pricingUnavailable: m.toolbar()?.pricingUnavailable },
    sourceWriteCount: sourceWrites(env).length, audit: env.store.audit,
  }, null, 2) + "\n");
  await m.close();
  summary.push({ scenario, ok: !failure, error: failure?.message || null });
  console.log(failure ? "FAIL" : "ok", scenario, failure?.message || "");
}
fs.writeFileSync(DIR + "coupled-page-verification.json", JSON.stringify({ results: summary,
  actualPageAndBusinessHelpers: true, realStorageVerified: false, backendAuthorizationVerified: false }, null, 2) + "\n");
if (summary.some(row => !row.ok)) process.exitCode = 1;
