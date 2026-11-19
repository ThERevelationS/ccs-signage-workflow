import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCoupledPage, environment, mount } from "./coupled-page-fixture.mjs";
import { coupledBuilderStore } from "./coupled-builder-store.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const candidate = JSON.parse(fs.readFileSync(DIR + "recovery-remote-candidate-source.json", "utf8"));
assert.equal(candidate.reinforcementV2Activated, false);
await buildCoupledPage({ sourceOverrides: candidate.sources, artifactPrefix: "recovery-remote-legacy", versioned: false });
const results = [];
const line = state => state.AllInOneEstimate[0].line_items.find(item => item.line_id === "coupled-foundation-line");
const product = state => state.BuilderProduct.find(item => item.id === "coupled-foundation-builder");
const sourceWrites = env => env.store.audit.filter(event => event.entity === "FoundationProject" && event.method === "updateMany");
const describe = value => value ? { ...value, error: value.error ? { message: value.error.message, stack: value.error.stack } : null } : null;
function verifyOther(env, state) {
  assert.deepEqual(state.AllInOneEstimate[0].line_items[0], env.initial.AllInOneEstimate[0].line_items[0]);
  assert.deepEqual(state.BuilderProduct.find(item => item.id === "unrelated-builder"), env.initial.BuilderProduct[0]);
  assert.deepEqual(state.BuilderPart.find(item => item.id === "unrelated-part"),
    env.initial.BuilderPart.find(item => item.id === "unrelated-part"));
}
function verifiedPrice(env, amount) {
  const state = env.store.snapshot();
  assert.equal(product(state).frozen_cost, amount);
  assert.equal(product(state).frozen_customer_price, amount);
  assert.equal(line(state).total_snapshot, amount);
  assert.equal(product(state).builder_version, 2);
  assert.ok(!line(state).price_acceptance_pending?.key);
  assert.equal(line(state).updated_date_snapshot, state.FoundationProject[0].updated_date);
  assert.equal(state.BuilderPriceRevision.length, 1);
  assert.equal(state.BuilderPriceRevision[0].new_total_cost, amount);
  assert.equal(state.FoundationProject[0].items[0].reinforcement_calculation_version, undefined);
  verifyOther(env, state);
  return state;
}
let pendingFrame, pendingAmount;
async function check(name, env, run) {
  const m = await mount(env);
  let details, failure;
  try { details = await run(m, env); } catch (error) { failure = error; }
  fs.writeFileSync(DIR + `recovery-remote-legacy-${name}.json`, JSON.stringify({
    name, ok: !failure, error: failure ? { message: failure.message, stack: failure.stack } : null,
    details, lastOutcome: describe(env.lastOutcome), state: env.store.snapshot(), audit: env.store.audit,
    toolbar: { total: m.toolbar()?.total, dirty: m.toolbar()?.dirty, pricingUnavailable: m.toolbar()?.pricingUnavailable },
    actualRemoteBusinessSources: true, heldLocalBusinessSourcesAllowed: false, reinforcementV2Activated: false,
    realStorageVerified: false, backendAuthorizationVerified: false,
  }, null, 2) + "\n");
  await m.close();
  results.push({ name, ok: !failure, error: failure?.message || null });
  console.log(failure ? "FAIL" : "ok", name, failure?.message || "");
}
for (const mode of ["normal-save", "revision-unavailable", "revision-reply-lost"]) {
  const env = environment();
  let injected = false;
  if (mode === "revision-unavailable") {
    const invoke = env.store.invoke;
    env.store.invoke = async (...args) => {
      if (!injected) {
        assert.equal(args[0], "ensureBuilderPriceRevision"); injected = true;
        throw Error("Synthetic legacy revision unavailable");
      }
      return invoke(...args);
    };
  } else if (mode === "revision-reply-lost") {
    env.store.onEvent = event => {
      if (!injected && event.method === "ensureBuilderPriceRevision") {
        injected = true; throw Error("Synthetic legacy revision reply lost");
      }
    };
  }
  await check(mode, env, async m => {
    const amount = m.toolbar().total;
    assert.equal(Math.round(amount * 100), 83480, "Frozen legacy page profile must not acquire v2 prices");
    const first = await m.save();
    let failedSnapshot, second;
    if (mode !== "normal-save") {
      assert.equal(first.status, "partial"); assert.equal(injected, true);
      failedSnapshot = env.store.snapshot();
      assert.ok(line(failedSnapshot).price_acceptance_pending?.key);
      assert.equal(product(failedSnapshot).frozen_cost, 0);
      assert.equal(failedSnapshot.BuilderPriceRevision.length, mode === "revision-reply-lost" ? 1 : 0);
      if (mode === "revision-unavailable") {
        pendingFrame = structuredClone(failedSnapshot); pendingAmount = amount;
        fs.writeFileSync(DIR + "recovery-remote-legacy-frozen-pending.json", JSON.stringify({
          state: pendingFrame, expectedTotal: pendingAmount, independentlyFrozenExpectedCents: 83480,
        }, null, 2) + "\n");
      }
      second = await m.retry();
      assert.equal(second.status, "saved");
    } else assert.equal(first.status, "saved");
    verifiedPrice(env, amount);
    assert.equal(sourceWrites(env).length, 1);
    assert.equal(m.toolbar().dirty, false); assert.equal(env.savedObservers, 1);
    const saved = sourceWrites(env)[0], firstPart = env.store.audit.find(event => event.entity === "BuilderPart" && event.method === "create");
    assert.ok(saved.after.builder_sync_attempt && saved.index < firstPart.index);
    return { first: describe(first), failedSnapshot, second: describe(second), expectedTotal: amount };
  });
}
assert.ok(pendingFrame, "Legacy pending fixture must be captured once before replay scenarios");
function replay() {
  const env = environment();
  env.initial = structuredClone(pendingFrame); env.store = coupledBuilderStore(pendingFrame);
  const epoch = Date.parse("2026-11-07T12:00:00.000Z");
  const stamps = Object.values(pendingFrame).flat().map(row => Date.parse(row.updated_date)).filter(Number.isFinite);
  env.store.sequence = Math.max(epoch, ...stamps) - epoch + 1;
  return env;
}
await check("reopened-pending-snapshot", replay(), async (m, env) => {
  const outcome = await m.retry();
  assert.equal(outcome.status, "saved"); verifiedPrice(env, pendingAmount);
  assert.equal(sourceWrites(env).length, 0);
  assert.deepEqual(env.store.snapshot().FoundationProject, pendingFrame.FoundationProject);
  return { outcome: describe(outcome), expectedTotal: pendingAmount };
});
await check("newer-unsent-description", replay(), async (m, env) => {
  await m.cardEdit({ description: "Unsent legacy description" });
  const outcome = await m.retry();
  assert.equal(outcome.status, "superseded"); verifiedPrice(env, pendingAmount);
  assert.equal(m.toolbar().dirty, true); assert.equal(env.savedObservers, 0);
  assert.equal(env.cards.get("one").item.description, "Unsent legacy description");
  assert.deepEqual(env.store.snapshot().FoundationProject, pendingFrame.FoundationProject);
  assert.equal(sourceWrites(env).length, 0);
  return { outcome: describe(outcome), expectedTotal: pendingAmount };
});
await check("invalid-unsent-quantity", replay(), async (m, env) => {
  await m.cardEdit({ quantity: 0 }); assert.equal(m.toolbar().pricingUnavailable, true);
  const outcome = await m.retry();
  assert.equal(outcome.status, "superseded"); verifiedPrice(env, pendingAmount);
  assert.equal(env.cards.get("one").item.quantity, 0);
  assert.equal(m.toolbar().dirty, true); assert.equal(env.savedObservers, 0);
  const recovered = env.store.snapshot(), ordinarySave = await m.save();
  assert.equal(ordinarySave.status, "failed"); assert.equal(ordinarySave.error.pricingUnavailable, true);
  assert.deepEqual(env.store.snapshot(), recovered); assert.equal(sourceWrites(env).length, 0);
  return { outcome: describe(outcome), ordinarySave: describe(ordinarySave), expectedTotal: pendingAmount };
});
fs.writeFileSync(DIR + "recovery-remote-legacy-verification.json", JSON.stringify({
  results, actualRemoteBusinessSources: true, heldLocalBusinessSourcesAllowed: false,
  reinforcementV2Activated: false, realStorageVerified: false, backendAuthorizationVerified: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
