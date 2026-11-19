import assert from "node:assert/strict";
import fs from "node:fs";
import { act } from "react-test-renderer";
import { buildCoupledPage, environment, mount } from "./coupled-page-fixture.mjs";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const captured = JSON.parse(fs.readFileSync(DIR + "coupled-page-linked-revision-failure-and-retry-baseline-before-header-assertion-fix.json", "utf8"));
const frozenPartial = captured.afterFirst;
assert.equal(captured.first.status, "partial");
assert.equal(frozenPartial.BuilderPriceRevision.length, 0);
const results = [];
const requested = new Set(process.argv.slice(2));
const foundationLine = state => state.AllInOneEstimate[0].line_items.find(line => line.line_id === "coupled-foundation-line");
const foundationProduct = state => state.BuilderProduct.find(row => row.id === "coupled-foundation-builder");
const writes = store => store.audit.filter(event => ["create", "updateMany", "delete"].includes(event.method));
const sourceWrites = store => writes(store).filter(event => event.entity === "FoundationProject");
const describe = outcome => outcome ? { ...outcome, error: outcome.error ? { message: outcome.error.message, stack: outcome.error.stack } : null } : null;
function seeded(change = () => {}) {
  const initial = structuredClone(frozenPartial);
  initial.EstimateRevision = [];
  change(initial);
  const env = environment();
  env.initial = structuredClone(initial);
  env.store = coupledBuilderStore(initial);
  // Preserve the captured versions, but advance the synthetic clock beyond
  // every captured row so a later simulated write cannot reuse its version.
  const epoch = Date.parse("2026-11-07T12:00:00.000Z");
  const stamps = Object.values(initial).flat().map(row => Date.parse(row.updated_date)).filter(Number.isFinite);
  env.store.sequence = Math.max(epoch, ...stamps) - epoch + 1;
  return env;
}
function verifiedRecovery(env, outcome) {
  const state = env.store.snapshot();
  assert.equal(outcome.builderSync, "synced");
  assert.equal(foundationProduct(state).frozen_cost, 694);
  assert.equal(foundationProduct(state).builder_version, 2);
  assert.equal(state.BuilderPriceRevision.length, 1);
  assert.equal(state.BuilderPriceRevision[0].new_total_cost, 694);
  assert.ok(!foundationLine(state).price_acceptance_pending?.key);
  assert.equal(foundationLine(state).updated_date_snapshot, state.FoundationProject[0].updated_date);
  assert.equal(sourceWrites(env.store).length, 0);
  assert.deepEqual(state.FoundationProject, env.initial.FoundationProject);
  assert.deepEqual(state.AllInOneEstimate[0].line_items[0], env.initial.AllInOneEstimate[0].line_items[0]);
  assert.deepEqual(state.BuilderProduct.find(row => row.id === "unrelated-builder"), env.initial.BuilderProduct[0]);
  assert.deepEqual(state.BuilderPart.filter(row => row.builder_product_id === "unrelated-builder"),
    env.initial.BuilderPart.filter(row => row.builder_product_id === "unrelated-builder"));
}
await buildCoupledPage();
async function check(name, change, run) {
  if (requested.size && !requested.has(name)) return;
  const env = seeded(change), m = await mount(env);
  let outcome, failure;
  try { outcome = await run(m, env); }
  catch (error) { failure = error; }
  fs.writeFileSync(DIR + `coupled-recovery-safety-${name}.json`, JSON.stringify({
    name, ok: !failure, error: failure ? { message: failure.message, stack: failure.stack } : null,
    initial: env.initial, outcome: describe(outcome || env.lastOutcome), state: env.store.snapshot(), audit: env.store.audit,
    toolbar: { dirty: m.toolbar()?.dirty, autoSave: m.toolbar()?.autoSave, pricingUnavailable: m.toolbar()?.pricingUnavailable },
    savedObservers: env.savedObservers, frozenInitialStateReused: true,
    realStorageVerified: false, backendAuthorizationVerified: false,
  }, null, 2) + "\n");
  await m.close();
  results.push({ name, ok: !failure, error: failure?.message || null });
  console.log(failure ? "FAIL" : "ok", name, failure?.message || "");
}
await check("remounted-pending-snapshot", undefined, async (m, env) => {
  const outcome = await m.retry();
  assert.equal(outcome.status, "saved"); verifiedRecovery(env, outcome);
  assert.equal(m.toolbar().dirty, false); assert.equal(env.savedObservers, 1);
  return outcome;
});
await check("newer-unsent-edit-before-recovery", undefined, async (m, env) => {
  await act(async () => { m.toolbar().onToggleAutoSave(); });
  assert.equal(m.toolbar().autoSave, true);
  await m.cardEdit({ description: "Newer unsent description" });
  assert.equal(env.cards.get("one").item.description, "Newer unsent description");
  const outcome = await m.retry();
  verifiedRecovery(env, outcome);
  assert.equal(outcome.status, "superseded");
  assert.ok(outcome.warnings.includes("previous_sync_recovered_unsent_changes_remain"));
  assert.equal(env.cards.get("one").item.description, "Newer unsent description");
  assert.equal(m.toolbar().dirty, true); assert.equal(m.toolbar().autoSave, false);
  assert.equal(env.savedObservers, 0); assert.ok(env.storage.size > 0);
  const savedVersion = env.store.snapshot().FoundationProject[0].updated_date;
  const next = await m.save();
  assert.equal(next.status, "saved");
  assert.equal(sourceWrites(env.store).length, 1);
  assert.equal(sourceWrites(env.store)[0].query.updated_date, savedVersion);
  assert.equal(env.store.snapshot().FoundationProject[0].items[0].description, "Newer unsent description");
  assert.equal(env.store.snapshot().BuilderPriceRevision.length, 1);
  assert.equal(foundationProduct(env.store.snapshot()).frozen_cost, 694);
  assert.equal(m.toolbar().dirty, false); assert.equal(env.savedObservers, 1);
  return outcome;
});
await check("newer-unsent-edit-during-recovery", undefined, async (m, env) => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const invoke = env.store.invoke;
  env.store.invoke = async (...args) => { enter(); await held; return invoke(...args); };
  const button = m.renderer.root.findAllByType("button").find(node => node.children.join("") === "Review and retry Save");
  let pending, outcome;
  await act(async () => {
    pending = button.props.onClick();
    await Promise.race([entered, pending.then(outcome => {
      throw Error("Recovery stopped before the deferred revision request: " + (outcome.error?.message || outcome.status));
    })]);
  });
  await m.cardEdit({ description: "Edited while recovery was waiting" });
  await act(async () => { release(); outcome = await pending; });
  verifiedRecovery(env, outcome);
  assert.equal(outcome.status, "superseded");
  assert.equal(env.cards.get("one").item.description, "Edited while recovery was waiting");
  assert.equal(m.toolbar().dirty, true); assert.equal(m.toolbar().autoSave, false);
  assert.equal(env.savedObservers, 0); assert.ok(env.storage.size > 0);
  return outcome;
});
await check("source-version-changed-after-load", undefined, async (m, env) => {
  await env.store.entity("FoundationProject").updateMany({ id: "page-source" }, { $set: { notes: "Other editor's saved note" } });
  const before = env.store.snapshot(), count = writes(env.store).length;
  const outcome = await m.retry();
  assert.equal(outcome.status, "conflict"); assert.match(outcome.error.message, /changed in another session/);
  assert.equal(writes(env.store).length, count); assert.deepEqual(env.store.snapshot(), before);
  assert.equal(env.savedObservers, 0);
  return outcome;
});
await check("invalid-unsent-design-does-not-block-saved-recovery", undefined, async (m, env) => {
  await m.cardEdit({ quantity: 0 });
  assert.equal(m.toolbar().pricingUnavailable, true);
  const outcome = await m.retry();
  verifiedRecovery(env, outcome);
  assert.equal(outcome.status, "superseded");
  assert.equal(env.cards.get("one").item.quantity, 0);
  assert.equal(m.toolbar().dirty, true); assert.equal(m.toolbar().pricingUnavailable, true);
  assert.equal(env.savedObservers, 0);
  const recoveredState = env.store.snapshot();
  const ordinarySave = await m.save();
  assert.equal(ordinarySave.status, "failed");
  assert.equal(ordinarySave.error.pricingUnavailable, true);
  assert.equal(ordinarySave.sourceSaved, false);
  assert.deepEqual(env.store.snapshot(), recoveredState);
  assert.equal(sourceWrites(env.store).length, 0);
  return outcome;
});
for (const [name, change, pattern] of [
  ["receipt-wrong-estimate", state => { state.FoundationProject[0].builder_sync_attempt.estimate_id = "another-estimate"; }, /receipt does not match/],
  ["operation-wrong-source-version", state => { foundationLine(state).price_acceptance_pending.line_patch.updated_date_snapshot = "other-version"; }, /different Foundation source revision/],
  ["operation-wrong-builder", state => { foundationLine(state).price_acceptance_pending.builder_product_id = "unrelated-builder"; }, /does not match this Foundation Product/],
  ["archived-estimate", state => { state.AllInOneEstimate[0].status = "archived"; }, /archived and locked/],
  ["cancelled-estimate", state => { state.AllInOneEstimate[0].status = "cancelled"; }, /cancelled and permanently locked/],
  ["protected-estimate-without-revision", state => { state.AllInOneEstimate[0].status = "sent"; }, /Start an Estimate Revision/],
]) {
  await check(name, change, async (m, env) => {
    const before = env.store.snapshot(), outcome = await m.save();
    assert.equal(outcome.status, "failed"); assert.match(outcome.error.message, pattern);
    assert.equal(writes(env.store).length, 0); assert.deepEqual(env.store.snapshot(), before);
    assert.equal(env.savedObservers, 0);
    return outcome;
  });
}
for (const cleared of [true, false]) {
  await check(cleared ? "pending-key-cleared-race" : "pending-key-replaced-race", undefined, async (m, env) => {
    let injected = false, external;
    env.store.onEvent = event => {
      if (!injected && event.entity === "FoundationProject" && event.method === "get") {
        injected = true;
        const estimate = env.store.snapshot().AllInOneEstimate[0];
        const lineItems = estimate.line_items.map(line => line.line_id === "coupled-foundation-line"
          ? { ...line, price_acceptance_pending: cleared ? {} : { ...line.price_acceptance_pending, key: "replacement-operation" } }
          : line);
        external = env.store.entity("AllInOneEstimate").updateMany({ id: estimate.id }, { $set: { line_items: lineItems } });
      }
    };
    const outcome = await m.retry(); await external;
    assert.equal(injected, true);
    assert.equal(outcome.status, "partial"); assert.match(outcome.error.message, /pending Builder operation changed/);
    assert.equal(writes(env.store).length, 1, "Only the simulated competing actor may write");
    assert.equal(writes(env.store)[0].entity, "AllInOneEstimate");
    assert.equal(sourceWrites(env.store).length, 0);
    assert.equal(env.store.snapshot().BuilderPriceRevision.length, 0);
    assert.equal(foundationProduct(env.store.snapshot()).frozen_cost, 0);
    assert.equal(env.savedObservers, 0);
    return outcome;
  });
}
const selectedSuffix = requested.size ? "-selected-" + [...requested].join("-") : "";
fs.writeFileSync(DIR + "coupled-recovery-safety-verification" + selectedSuffix + ".json", JSON.stringify({
  results, selectedScenarios: [...requested], acceptedInitialPricesReused: true, realStorageVerified: false, backendAuthorizationVerified: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
