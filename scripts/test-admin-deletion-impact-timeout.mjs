import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runDeletionImpactChecks } from "../base44/shared/deletionImpactBoundedChecks.mjs";
import { DELETION_IMPACT_RESPONSE_DEADLINE_MS, withDeletionImpactDeadline }
  from "../src/components/admin/deletionImpactDeadline.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Backend deadline rejects an indefinitely stalled read and prevents new checks from starting", async () => {
  let finish;
  const stalled = new Promise(resolve => { finish = resolve; });
  const started = [];
  const checks = Array.from({ length: 8 }, (_, i) => async () => {
    started.push(i);
    if (i === 0) await stalled;
    return { count: i };
  });
  await assert.rejects(() => runDeletionImpactChecks(checks, 1, 35),
    /deadline exceeded; no report was verified/);
  assert.deepEqual(started, [0], "No queued reads should start before the hung operation completes");
  finish();
  await pause(5);
  assert.deepEqual(started, [0], "Releasing a timed-out read cannot resume the abandoned scan");
});

test("Backend deadline caps parallel stalled reads and never returns a partial array", async () => {
  const deferred = [];
  const started = [];
  const checks = Array.from({ length: 12 }, (_, index) => async () => {
    started.push(index);
    return new Promise(resolve => { deferred[index] = resolve; });
  });
  await assert.rejects(() => runDeletionImpactChecks(checks, 3, 25), /deadline exceeded/);
  assert.deepEqual(started, [0, 1, 2]);
  deferred.forEach((resolve, index) => resolve(index));
  await pause(5);
  assert.deepEqual(started, [0, 1, 2]);
});

test("Normal and failed reads retain prior behavior ahead of deadline", async () => {
  assert.deepEqual(await runDeletionImpactChecks([async () => 2, async () => 7], 2, 80), [2, 7]);
  await assert.rejects(() => runDeletionImpactChecks([async () => {
    throw Error("synthetic-read-failed");
  }], 1, 80), /synthetic-read-failed/);
});

test("Invalid backend deadlines fail before any check starts", async () => {
  let called = false;
  for (const deadline of [0, 120001, -1, 1.5, "500"]) {
    await assert.rejects(
      () => runDeletionImpactChecks([async () => { called = true; }], 1, deadline),
      /Invalid deletion impact scan plan/,
    );
  }
  assert.equal(called, false);
});

test("Client deadline rejects a hung function response but doesn't display its late success", async () => {
  let resolveRemote;
  const remote = new Promise(resolve => { resolveRemote = resolve; });
  let received = false;
  await assert.rejects(
    () => withDeletionImpactDeadline(async () => {
      const result = await remote;
      received = true;
      return result;
    }, 25),
    /timed out. No report was verified/,
  );
  assert.equal(received, false);
  resolveRemote({ request: { id: "late" }, read_only: true });
  await pause(5);
  // An already running operation may complete, but the settled deadline promise
  // must not turn into a successful report for the waiting caller.
  assert.equal(received, true);
});

test("Client deadline accepts verified fast responses and propagates real failures", async () => {
  assert.equal(DELETION_IMPACT_RESPONSE_DEADLINE_MS, 75000);
  assert.equal(await withDeletionImpactDeadline(async () => "verified", 80), "verified");
  await assert.rejects(
    () => withDeletionImpactDeadline(async () => { throw Error("network-failure"); }, 80),
    /network-failure/,
  );
  for (const deadline of [0, 120001, NaN]) {
    await assert.rejects(() => withDeletionImpactDeadline(async () => "no", deadline), /Invalid impact scan deadline/);
  }
});

test("Only deletion-impact invocation receives client deadline, without changing admin writes", () => {
  const proxy = readFileSync("src/components/admin/authorizedUserAdminPersistence.js", "utf8");
  const scoped = proxy.slice(proxy.indexOf("export async function getAccountDeletionImpactAdmin"),
    proxy.indexOf("export async function resolveAccountDeletionRequestAdmin"));
  assert.match(scoped, /await withDeletionImpactDeadline\(\(\) => invokeAdminUsers\(\{/);
  assert.match(scoped, /return validateDeletionImpactReport\(result\.impact, request\)/);
  assert.equal((proxy.match(/withDeletionImpactDeadline\(\(\) =>/g) || []).length, 1);
  const backend = readFileSync("base44/shared/deletionImpactBoundedChecks.mjs", "utf8");
  assert.match(backend, /deadlineMs = 60_000/);
  assert.match(backend, /stopped = true;\s*reject\(new Error\("Deletion impact scan deadline exceeded/);
});
