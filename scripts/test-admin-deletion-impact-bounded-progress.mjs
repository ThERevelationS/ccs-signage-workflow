import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runDeletionImpactChecks } from "../base44/shared/deletionImpactBoundedChecks.mjs";

test("Bounded scanner preserves input order while running at most five checks", async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 38 }, (_, index) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, (index % 4) + 1));
      return { index, count: index % 3 };
    } finally {
      active -= 1;
    }
  });
  const rows = await runDeletionImpactChecks(tasks, 5);
  assert.equal(rows.length, 38);
  assert.deepEqual(rows.map(row => row.index), Array.from({ length: 38 }, (_, i) => i));
  assert.ok(peak <= 5);
  assert.ok(peak >= 2, "Checks should overlap while respecting the cap");
  assert.equal(active, 0);
});

test("Empty scan plans and small plans resolve without fan-out", async () => {
  assert.deepEqual(await runDeletionImpactChecks([], 5), []);
  assert.deepEqual(await runDeletionImpactChecks([async () => 12], 5), [12]);
});

test("Scan failures reject the whole report and stop scheduling new checks", async () => {
  const started = [];
  const tasks = Array.from({ length: 24 }, (_, index) => async () => {
    started.push(index);
    if (index === 2) throw new Error("Synthetic read unavailable");
    await new Promise(resolve => setTimeout(resolve, 4));
    return index;
  });
  await assert.rejects(() => runDeletionImpactChecks(tasks, 5), /Synthetic read unavailable/);
  assert.ok(started.length <= 5, "No more work should be scheduled after a synchronous rejection");
});

test("Scan helper rejects invalid schedules rather than silently ignoring them", async () => {
  await assert.rejects(() => runDeletionImpactChecks("no", 5), /Invalid deletion impact scan plan/);
  await assert.rejects(() => runDeletionImpactChecks([null], 5), /Invalid deletion impact scan plan/);
  await assert.rejects(() => runDeletionImpactChecks([], 0), /Invalid deletion impact scan plan/);
  await assert.rejects(() => runDeletionImpactChecks([], 11), /Invalid deletion impact scan plan/);
});

test("Admin backend preserves every reporting group, scope, validation contract and access check", () => {
  const backend = readFileSync("base44/functions/manageAuthorizedUsers/entry.ts", "utf8");
  assert.match(backend, /import \{ runDeletionImpactChecks \} from '\.\.\/\.\.\/shared\/deletionImpactBoundedChecks\.mjs'/);
  assert.match(backend, /const completed = await runDeletionImpactChecks\(checks, 5\)/);
  for (const group of ["history", "account_state", "ownership", "assignments"]) {
    assert.ok(backend.includes(`reportRows('${group}')`), `Missing ${group} output`);
  }
  assert.match(backend, /const history = reportRows\('history'\)/);
  assert.match(backend, /const ownership = reportRows\('ownership'\)/);
  assert.match(backend, /const \[workOrders, generalTasks, calendarEvents\]/);
  assert.match(backend, /await countIdentityReferences\(base44, 'WorkOrder'/);
  assert.match(backend, /if \(actor\?\.role !== 'admin'\)/);
  assert.match(backend, /read_only: true/);
});

test("Admin progress view names scope without guessing percentages or claiming completion", () => {
  const frontend = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
  assert.match(frontend, /role="status" aria-label="Account impact scan in progress"/);
  assert.match(frontend, /aria-label="Impact checks included"/);
  for (const label of [
    "User identity and account match",
    "Payroll and timekeeping history",
    "Account state and credentials",
    "Estimator record ownership",
    "Work order, task and calendar references",
  ]) assert.ok(frontend.includes(label));
  assert.match(frontend, /Individual completion percentages are unavailable/);
  assert.match(frontend, /deletionImpactReport \? \(/);
});
