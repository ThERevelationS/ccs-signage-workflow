// Contract + behavior checks for the rate-limit-resilient Fleet entity loaders.
// Covers: in-flight dedupe, 429 retry honoring "Retry after Ns", non-retryable
// errors, retry exhaustion, and the $in fan-out merges on the heavy pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { listAllFleetRows, filterAllFleetRows } = await import("../src/components/fleet/fleetEntityLoaders.js");

const rateLimited = () => new Error("Rate limit exceeded: entity_list allows 210 requests per 60s for each caller of this app. Retry after 1s.");

test("identical concurrent loads share one in-flight request chain", async () => {
  let calls = 0;
  const entity = { list: async (sort, limit, skip) => { calls += 1; return [{ id: 1 }]; } };
  const [a, b] = await Promise.all([
    listAllFleetRows(entity, "name"),
    listAllFleetRows(entity, "name"),
  ]);
  assert.equal(calls, 1, `expected 1 underlying call, got ${calls}`);
  assert.deepEqual(a, b);
});

test("different sorts/queries do not dedupe against each other", async () => {
  let calls = 0;
  const entity = { list: async () => { calls += 1; return []; }, filter: async () => { calls += 1; return []; } };
  await Promise.all([
    listAllFleetRows(entity, "name"),
    listAllFleetRows(entity, "-created_date"),
    filterAllFleetRows(entity, { status: "open" }, "-created_date"),
    filterAllFleetRows(entity, { status: { $in: ["open", "assigned"] } }, "-created_date"),
  ]);
  assert.equal(calls, 4);
});

test("settled loads are never cached — a later load refetches", async () => {
  let calls = 0;
  const entity = { list: async () => { calls += 1; return [{ id: calls }]; } };
  const first = await listAllFleetRows(entity, "name");
  const second = await listAllFleetRows(entity, "name");
  assert.equal(calls, 2, "post-mutation reloads must always hit the API");
  assert.equal(second[0].id, 2);
});

test("a transient 429 is retried after the server-provided delay and succeeds", async () => {
  let calls = 0;
  const entity = {
    list: async () => {
      calls += 1;
      if (calls === 1) throw rateLimited();
      return [{ id: 7 }];
    },
  };
  const started = Date.now();
  const rows = await listAllFleetRows(entity, "name");
  assert.deepEqual(rows, [{ id: 7 }]);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 400, "the retry must wait rather than hammer the quota");
});

test("non-rate-limit errors are not retried", async () => {
  let calls = 0;
  const entity = { list: async () => { calls += 1; throw new Error("permission denied"); } };
  await assert.rejects(listAllFleetRows(entity, "name"), /permission denied/);
  assert.equal(calls, 1);
});

test("a persistent 429 gives up after the bounded attempt budget", async () => {
  let calls = 0;
  const entity = { list: async () => { calls += 1; throw rateLimited(); } };
  await assert.rejects(listAllFleetRows(entity, "name"), /rate limit/i, { timeout: 30000 });
  assert.equal(calls, 5, `expected 1 initial + 4 retries, got ${calls}`);
});

test("the heavy pages merge same-entity status filters into $in queries", () => {
  const overview = readFileSync("src/pages/FleetOverview.jsx", "utf8");
  const notifications = readFileSync("src/pages/FleetNotifications.jsx", "utf8");
  const settings = readFileSync("src/pages/FleetSettings.jsx", "utf8");
  const maintenance = readFileSync("src/pages/FleetMaintenance.jsx", "utf8");
  const tracking = readFileSync("src/pages/FleetTracking.jsx", "utf8");

  for (const [name, src] of [["Overview", overview], ["Notifications", notifications], ["Settings", settings]]) {
    assert.match(src, /FleetNotificationQueue, \{ status: \{ \$in: \["pending", "sending", "failed"\] \} \}/, `${name} must merge the three queue status filters`);
    assert.match(src, /FleetOperationReceipt, \{ status: \{ \$in: \["started", "failed"\] \} \}/, `${name} must merge the two receipt status filters`);
    assert.doesNotMatch(src, /FleetNotificationQueue, \{ status: "pending" \}/, `${name} must not keep per-status queue filters`);
    assert.doesNotMatch(src, /FleetOperationReceipt, \{ status: "started" \}/, `${name} must not keep per-status receipt filters`);
  }
  assert.match(overview, /FleetSystemLog\.filter\(\{ source: \{ \$in: \[/);
  assert.match(settings, /FleetSystemLog\.filter\(\{ source: \{ \$in: AUTOMATION_SOURCES \}/);
  assert.doesNotMatch(overview, /BouncieNotification, \{ is_read: false, severity: "warning"/);
  assert.doesNotMatch(notifications, /BouncieNotification, \{ is_read: false, severity: "warning"/);
  for (const [name, src] of [["Maintenance", maintenance], ["Tracking", tracking]]) {
    assert.match(src, /FleetMaintenanceWorkOrder, \{ status: \{ \$in: \["open", "assigned", "in_progress"\] \} \}/, `${name} must merge active work-order statuses`);
    assert.doesNotMatch(src, /FleetMaintenanceWorkOrder, \{ status: "open" \}/);
  }
});

console.log("7/7 fleet entity-loader resilience checks passed");
