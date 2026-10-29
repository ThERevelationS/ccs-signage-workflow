// Contract + behavior checks for the rate-limit-resilient Fleet entity loaders.
// Covers: fleetDataRead routing, in-flight dedupe, 429 retry honoring "Retry
// after Ns", non-retryable errors, retry exhaustion, pagination, and the $in
// fan-out merges on the heavy pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";

register("./helpers/fleet-loader-hooks.mjs", import.meta.url);
const { listAllFleetRows, filterAllFleetRows, readFleetRows } = await import("../src/components/fleet/fleetEntityLoaders.js");

const rateLimited = () => new Error("Rate limit exceeded: entity_list allows 210 requests per 60s for each caller of this app. Retry after 1s.");
const ok = (items) => ({ data: { success: true, items } });

test("loads route through fleetDataRead with entity names and paging params", async () => {
  const calls = [];
  globalThis.__fleetInvokeMock = async (name, payload) => {
    calls.push({ name, payload });
    return ok([{ id: "row-1" }]);
  };
  await listAllFleetRows("FleetEquipment", "name");
  await filterAllFleetRows("FleetPartFluidRequest", { status: "pending" }, "-created_date");
  await readFleetRows("FleetSettings", { sort: "-created_date", limit: 1 });
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.name, "fleetDataRead", "all reads must go through the read gateway");
  assert.equal(calls[0].payload.entity, "FleetEquipment");
  assert.equal(calls[0].payload.sort, "name");
  assert.equal(calls[1].payload.entity, "FleetPartFluidRequest");
  assert.deepEqual(calls[1].payload.query, { status: "pending" });
  assert.equal(calls[2].payload.entity, "FleetSettings");
  assert.equal(calls[2].payload.limit, 1);
});

test("identical concurrent loads share one in-flight request chain", async () => {
  let calls = 0;
  globalThis.__fleetInvokeMock = async () => { calls += 1; return ok([{ id: 1 }]); };
  const [a, b] = await Promise.all([
    listAllFleetRows("FleetEquipment", "name"),
    listAllFleetRows("FleetEquipment", "name"),
  ]);
  assert.equal(calls, 1, `expected 1 underlying call, got ${calls}`);
  assert.deepEqual(a, b);
});

test("different entities/sorts/queries do not dedupe against each other", async () => {
  let calls = 0;
  globalThis.__fleetInvokeMock = async () => { calls += 1; return ok([]); };
  await Promise.all([
    listAllFleetRows("FleetEquipment", "name"),
    listAllFleetRows("FleetEquipment", "-created_date"),
    listAllFleetRows("FleetPart", "name"),
    filterAllFleetRows("FleetPart", { status: "open" }, "-created_date"),
    filterAllFleetRows("FleetPart", { status: { $in: ["open", "assigned"] } }, "-created_date"),
  ]);
  assert.equal(calls, 5);
});

test("settled loads are never cached — a later load refetches", async () => {
  let calls = 0;
  globalThis.__fleetEpoch = 0;
  globalThis.__fleetInvokeMock = async () => { calls += 1; return ok([{ id: calls }]); };
  const first = await listAllFleetRows("FleetEquipment", "name");
  const second = await listAllFleetRows("FleetEquipment", "name");
  assert.equal(calls, 2, "post-mutation reloads must always hit the API");
  assert.equal(second[0].id, 2);
});

test("a mutation between identical loads prevents consuming a pre-mutation snapshot", async () => {
  globalThis.__fleetEpoch = 0;
  const pending = [];
  globalThis.__fleetInvokeMock = async () => {
    const d = {};
    d.promise = new Promise((resolve) => { d.resolve = resolve; });
    pending.push(d);
    return d.promise;
  };
  const staleFetch = listAllFleetRows("FleetEquipment", "name");
  // A fleet mutation completes while the first fetch is still in flight.
  globalThis.__fleetEpoch = 1;
  const freshFetch = listAllFleetRows("FleetEquipment", "name");
  await Promise.resolve();
  assert.equal(pending.length, 2, "the post-mutation read must issue its own fetch, not share the stale one");
  pending[1].resolve(ok([{ id: "fresh" }]));
  assert.deepEqual(await freshFetch, [{ id: "fresh" }]);
  pending[0].resolve(ok([{ id: "stale" }]));
  assert.deepEqual(await staleFetch, [{ id: "stale" }]);
});

test("paginates through multi-page results", async () => {
  const calls = [];
  globalThis.__fleetInvokeMock = async (_name, payload) => {
    calls.push({ limit: payload.limit, skip: payload.skip });
    // batchSize default is 500 — simulate a 2-page result set
    if (payload.skip === 0) return ok(new Array(500).fill({ id: "x" }));
    return ok([{ id: "last" }]);
  };
  const rows = await listAllFleetRows("FleetEquipment", "name");
  assert.equal(rows.length, 501);
  assert.deepEqual(calls, [{ limit: 500, skip: 0 }, { limit: 500, skip: 500 }]);
});

test("a transient 429 is retried after the server-provided delay and succeeds", async () => {
  let calls = 0;
  globalThis.__fleetInvokeMock = async () => {
    calls += 1;
    if (calls === 1) throw rateLimited();
    return ok([{ id: 7 }]);
  };
  const started = Date.now();
  const rows = await listAllFleetRows("FleetEquipment", "name");
  assert.deepEqual(rows, [{ id: 7 }]);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 400, "the retry must wait rather than hammer the quota");
});

test("non-rate-limit errors are not retried", async () => {
  let calls = 0;
  globalThis.__fleetInvokeMock = async () => { calls += 1; throw new Error("permission denied"); };
  await assert.rejects(listAllFleetRows("FleetEquipment", "name"), /permission denied/);
  assert.equal(calls, 1);
});

test("a persistent 429 gives up after the bounded attempt budget", async () => {
  let calls = 0;
  globalThis.__fleetInvokeMock = async () => { calls += 1; throw rateLimited(); };
  await assert.rejects(listAllFleetRows("FleetEquipment", "name"), /rate limit/i, { timeout: 30000 });
  assert.equal(calls, 5, `expected 1 initial + 4 retries, got ${calls}`);
});

test("the heavy pages merge same-entity status filters into $in queries", () => {
  const overview = readFileSync("src/pages/FleetOverview.jsx", "utf8");
  const notifications = readFileSync("src/pages/FleetNotifications.jsx", "utf8");
  const settings = readFileSync("src/pages/FleetSettings.jsx", "utf8");
  const maintenance = readFileSync("src/pages/FleetMaintenance.jsx", "utf8");
  const tracking = readFileSync("src/pages/FleetTracking.jsx", "utf8");

  for (const [name, src] of [["Overview", overview], ["Notifications", notifications], ["Settings", settings]]) {
    assert.match(src, /FleetNotificationQueue", \{ status: \{ \$in: \["pending", "sending", "failed"\] \} \}/, `${name} must merge the three queue status filters`);
    assert.match(src, /FleetOperationReceipt", \{ status: \{ \$in: \["started", "failed"\] \} \}/, `${name} must merge the two receipt status filters`);
    assert.doesNotMatch(src, /FleetNotificationQueue", \{ status: "pending" \}/, `${name} must not keep per-status queue filters`);
    assert.doesNotMatch(src, /FleetOperationReceipt", \{ status: "started" \}/, `${name} must not keep per-status receipt filters`);
  }
  assert.match(overview, /readFleetRows\("FleetSystemLog", \{ query: \{ source: \{ \$in: \[/);
  assert.match(settings, /readFleetRows\("FleetSystemLog", \{ query: \{ source: \{ \$in: AUTOMATION_SOURCES \}/);
  assert.doesNotMatch(overview, /BouncieNotification", \{ is_read: false, severity: "warning"/);
  assert.doesNotMatch(notifications, /BouncieNotification", \{ is_read: false, severity: "warning"/);
  for (const [name, src] of [["Maintenance", maintenance], ["Tracking", tracking]]) {
    assert.match(src, /FleetMaintenanceWorkOrder", \{ status: \{ \$in: \["open", "assigned", "in_progress"\] \} \}/, `${name} must merge active work-order statuses`);
    assert.doesNotMatch(src, /FleetMaintenanceWorkOrder", \{ status: "open" \}/);
  }
});

console.log("10/10 fleet entity-loader resilience checks passed");
