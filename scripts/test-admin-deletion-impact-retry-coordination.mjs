import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  runCoordinatedDeletionImpact,
  getDeletionImpactRetryState,
  DELETION_IMPACT_BUSY_MESSAGE,
  DELETION_IMPACT_COOLDOWN_MESSAGE,
  DELETION_IMPACT_RETRY_COOLDOWN_MS,
} from "../src/components/admin/deletionImpactRetryCoordinator.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Timed-out client scan retains ownership until original SDK response settles", async () => {
  let release;
  let requests = 0;
  const hanging = new Promise(resolve => { release = resolve; });
  await assert.rejects(
    () => runCoordinatedDeletionImpact(() => { requests++; return hanging; }, { deadlineMs: 35, cooldownMs: 120 }),
    /timed out.*No report was verified/,
  );
  assert.equal(requests, 1);
  assert.equal(getDeletionImpactRetryState().inFlight, true);
  await assert.rejects(
    () => runCoordinatedDeletionImpact(() => { requests++; return "duplicate"; }, { deadlineMs: 35, cooldownMs: 120 }),
    new RegExp(DELETION_IMPACT_BUSY_MESSAGE),
  );
  assert.equal(requests, 1, "No duplicate SDK call may be started while the first is unresolved");
  release("late");
  await sleep(4);
  assert.equal(getDeletionImpactRetryState().inFlight, false);
  assert.ok(getDeletionImpactRetryState().retryInMs > 0);
  await assert.rejects(
    () => runCoordinatedDeletionImpact(() => { requests++; return "duplicate"; }, { deadlineMs: 35, cooldownMs: 120 }),
    new RegExp(DELETION_IMPACT_COOLDOWN_MESSAGE),
  );
  assert.equal(requests, 1);
  await sleep(135);
  assert.equal(await runCoordinatedDeletionImpact(() => { requests++; return "verified"; }, { deadlineMs: 100, cooldownMs: 120 }), "verified");
  assert.equal(requests, 2);
});

test("Recognized backend deadline response initiates pause without exposing another operation", async () => {
  let calls = 0;
  await assert.rejects(
    () => runCoordinatedDeletionImpact(async () => {
      calls++;
      throw new Error("Account deletion impact scan timed out. No report was verified.");
    }, { deadlineMs: 100, cooldownMs: 40 }),
    /timed out/,
  );
  assert.equal(getDeletionImpactRetryState().inFlight, false);
  await assert.rejects(
    () => runCoordinatedDeletionImpact(() => { calls++; return "too soon"; }, { deadlineMs: 100, cooldownMs: 40 }),
    new RegExp(DELETION_IMPACT_COOLDOWN_MESSAGE),
  );
  assert.equal(calls, 1);
  await sleep(50);
  assert.equal(await runCoordinatedDeletionImpact(async () => { calls++; return "safe"; }, { deadlineMs: 100, cooldownMs: 40 }), "safe");
  assert.equal(calls, 2);
});

test("Ordinary fast read errors do not delay manual recovery", async () => {
  let calls = 0;
  await assert.rejects(
    () => runCoordinatedDeletionImpact(async () => { calls++; throw new Error("synthetic-fast-failure"); }, { deadlineMs: 100, cooldownMs: 50 }),
    /synthetic-fast-failure/,
  );
  assert.equal(await runCoordinatedDeletionImpact(() => { calls++; return "recovered"; }, { deadlineMs: 100, cooldownMs: 50 }), "recovered");
  assert.equal(calls, 2);
});

test("Invalid parameters block invocation before server access", async () => {
  let calls = 0;
  await assert.rejects(() => runCoordinatedDeletionImpact(() => { calls++; }, { deadlineMs: 0 }), /Invalid account deletion impact scan parameters/);
  await assert.rejects(() => runCoordinatedDeletionImpact(() => { calls++; }, { cooldownMs: 0 }), /Invalid account deletion impact scan parameters/);
  await assert.rejects(() => runCoordinatedDeletionImpact(() => { calls++; }, { cooldownMs: 300001 }), /Invalid account deletion impact scan parameters/);
  assert.equal(calls, 0);
  assert.equal(DELETION_IMPACT_RETRY_COOLDOWN_MS, 90000);
});

test("Read-only scan uses coordination, while backend exposes only the known deadline safely", () => {
  const proxy = readFileSync("src/components/admin/authorizedUserAdminPersistence.js", "utf8");
  const backend = readFileSync("base44/functions/manageAuthorizedUsers/entry.ts", "utf8");
  const ui = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
  const scope = proxy.slice(proxy.indexOf("export async function getAccountDeletionImpactAdmin"), proxy.indexOf("export async function resolveAccountDeletionRequestAdmin"));
  assert.match(scope, /await runCoordinatedDeletionImpact\(\(\) => invokeAdminUsers\(\{/);
  assert.equal((proxy.match(/runCoordinatedDeletionImpact\(\(\) =>/g) || []).length, 1);
  assert.match(scope, /return validateDeletionImpactReport\(result\.impact, request\)/);
  assert.match(backend, /impactTimedOut = error\?\.message === 'Deletion impact scan deadline exceeded; no report was verified.'/);
  assert.match(backend, /impactTimedOut \? 503/);
  assert.match(ui, /deletionImpactRetry\.inFlight \|\| deletionImpactRetry\.retryInMs > 0/);
  assert.match(ui, /Retry available in/);
  assert.match(ui, /setInterval\(refreshRetry, 1000\)/);
});
