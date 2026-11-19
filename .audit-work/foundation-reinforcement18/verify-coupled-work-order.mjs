import assert from "node:assert/strict";
import fs from "node:fs";
import { buildWorkOrderHelpers, environment, convert } from "./coupled-work-order-fixture.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const phase = process.argv[2] || "convert";
assert.ok(["convert", "print"].includes(phase));
const pageInputs = Object.fromEntries(["linked-acceptance-and-save", "linked-revision-failure-and-retry"].map(name => {
  const input = JSON.parse(fs.readFileSync(DIR + `coupled-page-${name}.json`, "utf8"));
  assert.equal(input.ok, true);
  return [name, input];
}));
const normal = pageInputs["linked-acceptance-and-save"].finalState;
environment(normal);
const helpers = await buildWorkOrderHelpers();
const results = [];
const cents = value => Math.round(value * 100);
const sourceLine = state => state.AllInOneEstimate[0].line_items.find(row => row.module_key === "foundation");
const foundationParts = state => state.BuilderPart.filter(row => row.builder_product_id === "coupled-foundation-builder");
const mutations = store => store.audit.filter(event => ["create", "updateMany", "delete"].includes(event.method));
const save = (file, body) => fs.writeFileSync(DIR + file, JSON.stringify(body, null, 2) + "\n");
async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
const cases = [
  { name: "saved-page", state: normal },
  { name: "recovered-page", state: pageInputs["linked-revision-failure-and-retry"].finalState },
  { name: "lost-work-order-create-reply", state: normal, loseReply: true },
];
if (phase === "convert") {
  for (const scenario of cases) await check(scenario.name, async () => {
    const file = `coupled-work-order-${scenario.name}-frozen.json`;
    assert.ok(!fs.existsSync(DIR + file), "Do not recompute settled conversion inputs; use frozen output");
    const env = environment(scenario.state);
    const untouched = structuredClone(env.initial);
    let injected = false;
    if (scenario.loseReply) {
      env.store.onEvent = event => {
        if (!injected && event.entity === "WorkOrder" && event.method === "create") {
          injected = true; throw Error("Synthetic Work Order create reply lost after persistence");
        }
      };
    }
    const outcome = await convert(helpers, env);
    assert.equal(outcome.status, "converted");
    assert.equal(injected, !!scenario.loseReply);
    const stored = await env.store.entity("WorkOrder").get(outcome.workOrder.id);
    assert.deepEqual(stored, JSON.parse(JSON.stringify(outcome.workOrder)));
    const state = env.store.snapshot(), product = stored.products.find(row => row.builder_product_id === "coupled-foundation-builder");
    assert.equal(state.WorkOrder.length, 1);
    assert.equal(stored.products.length, 2);
    assert.equal(product.source_project_id, "page-source");
    assert.equal(product.estimate_line_id, "coupled-foundation-line");
    assert.equal(product.source_estimate_id, "coupled-estimate");
    assert.equal(product.quoted_total, 694); assert.equal(product.quoted_unit_price, 694);
    assert.equal(stored.estimate_amount, 1039);
    assert.equal(stored.customer_id, "synthetic-customer");
    assert.equal(stored.materials.length, 10);
    assert.equal(cents(stored.materials.reduce((sum, row) => sum + row.extended_cost, 0)), 69400);
    const steel = stored.materials.find(row => row.part_key === "foundation:item:0:rebar");
    const labor = stored.materials.find(row => row.part_key === "foundation:item:0:rebar-labor");
    assert.equal(steel.quantity, 20); assert.equal(steel.unit_cost, 2); assert.equal(steel.extended_cost, 40);
    assert.equal(labor.quantity, 1.2000000000000002); assert.equal(labor.unit_cost, 60);
    assert.equal(labor.extended_cost, 72.00000000000001);
    for (const row of [steel, labor]) {
      assert.equal(row.source_estimate_id, "coupled-estimate");
      assert.equal(row.builder_product_id, "coupled-foundation-builder");
      assert.equal(row.estimate_line_id, "coupled-foundation-line");
      const handoff = row.foundation_reinforcement_handoff;
      assert.equal(handoff.last_calculated.reinforcement_snapshot.physical_quantity_ft, 20);
      assert.equal(handoff.engineering_approved, false); assert.equal(handoff.procurement_ready, false);
      assert.deepEqual(handoff.purchasing, { state: "unplanned" });
      assert.equal(handoff.definition_reference.reinforcement_acceptance.source_id, "page-source");
      assert.equal(handoff.definition_reference.reinforcement_acceptance.component_id, "one");
      assert.ok(!Object.hasOwn(handoff.definition_reference, "reinforcement_proposal"));
    }
    for (const field of ["FoundationProject", "BuilderProduct", "BuilderPart", "BuilderPriceRevision", "Customer"]) {
      assert.deepEqual(state[field], untouched[field], "Conversion must not rewrite " + field);
    }
    assert.deepEqual(state.AllInOneEstimate[0].line_items, untouched.AllInOneEstimate[0].line_items);
    assert.equal(state.AllInOneEstimate[0].total_cost, 1039);
    assert.equal(state.AllInOneEstimate[0].quote_total, 1039);
    assert.equal(state.AllInOneEstimate[0].work_order_id, stored.id);
    assert.equal(state.EstimateRevision.length, 1); assert.equal(env.calls.length, 1);
    assert.deepEqual(env.forbidden, []);
    assert.equal(mutations(env.store).filter(row => row.entity === "WorkOrder").length, 1);
    assert.equal(mutations(env.store).filter(row => row.entity === "AllInOneEstimate").length, 1);
    const reads = env.store.audit.filter(row => row.entity === "BuilderPart" && row.method === "readRows");
    assert.ok(reads.some(row => row.query.estimate_id === "coupled-estimate" && row.limit === 500 && row.skip === 0));
    assert.ok(reads.some(row => row.query.builder_product_id === "coupled-foundation-builder"));
    const normalized = helpers.productParts(product, { partsCatalog: stored.materials });
    assert.equal(normalized.length, 10);
    const summary = helpers.partsSummary(product, normalized);
    assert.equal(summary.total_cost_cents, 69400); assert.equal(summary.uncosted_parts, 0);
    // Existing bucket semantics include the 180-dollar delivery services in labor.
    assert.equal(summary.by_type.labor.cost_cents, 42825);
    assert.equal(summary.by_type.materials.cost_cents, 26575);
    assert.equal(summary.by_type.other.cost_cents, 0);
    save(file, { scenario: scenario.name, workOrder: stored, outcome, normalized, summary, state, calls: env.calls,
      audit: env.store.audit, sourceInput: scenario.loseReply ? "linked-acceptance-and-save" : scenario.name,
      approvalPreconditionSynthetic: true, realStorageVerified: false, backendAuthorizationVerified: false });
  });
  for (const scenario of ["unapproved", "pending-builder", "corrupt-reinforcement", "material-read-failure", "stale-approved-estimate"]) {
    await check(scenario, async () => {
      const frame = structuredClone(normal);
      if (scenario === "pending-builder") sourceLine(frame).price_acceptance_pending = {
        key: "synthetic-pending", kind: "builder_initial_freeze", started_at: new Date().toISOString(),
      };
      if (scenario === "corrupt-reinforcement") foundationParts(frame)[0].current_extended_cost = 41;
      const env = environment(frame, { approved: scenario !== "unapproved" });
      let requested = env.store.snapshot().AllInOneEstimate[0];
      if (scenario === "stale-approved-estimate") requested = { ...requested, updated_date: "old-source-version" };
      if (scenario === "material-read-failure") env.store.onEvent = event => {
        if (event.entity === "BuilderPart" && event.method === "readRows") throw Error("Synthetic Part collection unavailable");
      };
      const expected = {
        unapproved: /Only an Approved estimate/,
        "pending-builder": /recovery pending/,
        "corrupt-reinforcement": /last-calculated Part does not match/,
        "material-read-failure": /Synthetic Part collection unavailable/,
        "stale-approved-estimate": /changed in another session/,
      }[scenario];
      await assert.rejects(helpers.convertEstimateToWorkOrder({
        estimate: requested, pricing: { quoteTotal: 1039 }, sessionToken: "synthetic-session-not-real",
        entities: { Estimate: env.store.entity("AllInOneEstimate"), WorkOrder: env.store.entity("WorkOrder") },
      }), expected);
      assert.deepEqual(mutations(env.store), []); assert.deepEqual(env.calls, []);
      assert.deepEqual(env.store.snapshot(), env.initial);
      save(`coupled-work-order-${scenario}.json`, { ok: true, noWrites: true, audit: env.store.audit, expected: expected.source });
    });
  }
} else {
  for (const scenario of cases) await check(scenario.name + "-print-readback", async () => {
    const frozen = JSON.parse(fs.readFileSync(DIR + `coupled-work-order-${scenario.name}-frozen.json`, "utf8"));
    const original = JSON.stringify(frozen);
    const model = helpers.buildWorkOrderPrintModel(frozen.workOrder, {
      printedAt: "2026-11-07T12:00:00.000Z", company: { name: "Synthetic company" },
    });
    const html = helpers.renderOriginalHtml(model, { autoPrint: false });
    fs.writeFileSync(DIR + `coupled-work-order-${scenario.name}-print.html`, html);
    save(`coupled-work-order-${scenario.name}-print-model.json`, { ...model, fmt: undefined });
    assert.equal(model.materials.length, 10);
    assert.equal(cents(model.totals.internal.materials_cost), 69400);
    assert.equal(model.totals.contract_total, 1039);
    assert.equal(model.rows.find(row => row.product_id === "coupled-foundation-builder").ext_price, 694);
    const steel = model.materials.find(row => row.type === "material" && row.reinforcement_note);
    const labor = model.materials.find(row => row.type === "labor" && row.reinforcement_note);
    assert.equal(steel.qty, 20); assert.equal(steel.unit_cost, 2); assert.equal(steel.ext_cost, 40);
    assert.equal(labor.qty, 1.2, "Printed quantities must suppress binary floating-point artifacts");
    assert.equal(labor.unit_cost, 60); assert.equal(cents(labor.ext_cost), 7200);
    assert.ok(steel.reinforcement_note.includes("Physical steel (last calculated): 20 ft; 13.36 lb."));
    assert.ok(labor.reinforcement_note.includes("Frozen priced quantity: 1.2 hr."));
    assert.ok(labor.reinforcement_note.includes("Last-calculated labor: 1.2 hr."));
    assert.ok(!html.includes("00000000000000"));
    assert.equal(JSON.stringify(frozen), original, "Print formatting must not mutate persisted inputs");
  });
}
save(`coupled-work-order-${phase}-verification.json`, {
  results, actualSourceHelpers: true, syntheticEntityAndFunctionBoundaries: true,
  realStorageVerified: false, backendAuthorizationVerified: false, reinforcementV2Activated: false,
});
if (results.some(result => !result.ok)) process.exitCode = 1;
