import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createSingleFlight } from "../src/components/estimator/singleFlight.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

{
  const runs = [deferred(), deferred(), deferred()];
  let calls = 0, active = 0, maxActive = 0;
  const refresh = createSingleFlight(async () => {
    const index = calls++;
    active++;
    maxActive = Math.max(maxActive, active);
    try { return await runs[index].promise; } finally { active--; }
  });
  const first = refresh();
  await tick();
  const trailing = [refresh(), refresh(), refresh()];
  let trailingSettled = false;
  trailing[0].then(() => { trailingSettled = true; });
  assert.equal(calls, 1);
  runs[0].resolve("first");
  assert.equal(await first, "first");
  await tick();
  assert.equal(calls, 2);
  assert.equal(trailingSettled, false);
  const thirdRunCaller = refresh();
  runs[1].resolve("second");
  assert.deepEqual(await Promise.all(trailing), ["second", "second", "second"]);
  await tick();
  assert.equal(calls, 3, "calls during a trailing run receive a later run");
  runs[2].resolve("third");
  assert.equal(await thirdRunCaller, "third");
  assert.equal(maxActive, 1);
}

{
  const firstRun = deferred(), secondRun = deferred();
  let calls = 0;
  const refresh = createSingleFlight(() => (++calls === 1 ? firstRun.promise : secondRun.promise));
  const first = refresh();
  const firstRejected = assert.rejects(first, /first failure/);
  await tick();
  const second = refresh();
  firstRun.reject(new Error("first failure"));
  await firstRejected;
  await tick();
  assert.equal(calls, 2, "trailing run survives a first-run rejection");
  secondRun.resolve("recovered");
  assert.equal(await second, "recovered");
}

{
  let calls = 0;
  const refresh = createSingleFlight(() => ++calls);
  assert.equal(await refresh(), 1);
  assert.equal(await refresh(), 2);
  assert.equal(calls, 2, "sequential calls each run");
}

{
  const firstRun = deferred(), secondRun = deferred();
  let calls = 0;
  const refresh = createSingleFlight(() => (++calls === 1 ? firstRun.promise : secondRun.promise));
  const first = refresh();
  await tick();
  const secondRejected = assert.rejects(refresh(), /trailing failure/);
  firstRun.resolve("success");
  assert.equal(await first, "success");
  await tick();
  secondRun.reject(new Error("trailing failure"));
  await secondRejected;
}

{
  let calls = 0;
  let latest = () => "old";
  const wait = deferred();
  const refresh = createSingleFlight(() => (++calls === 1 ? wait.promise : latest()));
  const first = refresh();
  await tick();
  const second = refresh();
  latest = () => "new estimate";
  wait.resolve("initial");
  assert.equal(await first, "initial");
  assert.equal(await second, "new estimate", "trailing run uses the latest callback");
}

{
  let calls = 0;
  const refresh = createSingleFlight(() => {
    calls++;
    if (calls === 1) throw new Error("synchronous failure");
    return "next";
  });
  await assert.rejects(refresh(), /synchronous failure/);
  assert.equal(await refresh(), "next");
}

{
  const source = readFileSync(new URL("../src/pages/EstimateDetail.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const editor = source.slice(source.indexOf("<InlineProductEditor"));
  const close = editor.match(/onClose=\{(async \(\) => \{[\s\S]*?\n                \})\}/);
  const saved = editor.match(/onSaved=\{(\(\) => refreshProducts\(\)\.catch\(reportProductRefreshError\))\}/);
  assert.ok(close && saved, "editor callbacks handle refresh errors");
  const reports = [], closed = [];
  const context = {
    refreshProducts: async () => { throw new Error("refresh failed"); },
    reportProductRefreshError: (error) => reports.push(error.message),
    setActiveProduct: (value) => closed.push(value),
  };
  await runInNewContext(`(${close[1]})`, context)();
  await runInNewContext(`(${saved[1]})`, context)();
  assert.deepEqual(reports, ["refresh failed", "refresh failed"]);
  assert.deepEqual(closed, [null], "editor closes even if refresh fails");
  const report = source.match(/const reportProductRefreshError = (\(error\) => \{[\s\S]*?\n  \});/);
  assert.ok(report, "refresh failure reports a reconciliation warning");
  let warnings = [];
  const reporter = runInNewContext(`(${report[1]})`, {
    activeProduct: { line_id: "line-1" },
    setReconciliationWarnings: (update) => { warnings = update(warnings); },
  });
  reporter(new Error("synthetic failure"));
  assert.equal(warnings[0].line_id, "line-1");
  assert.equal(warnings[0].product_name, "Products");
  assert.equal(warnings[0].message, "synthetic failure");
}

console.log("PASS estimate refresh single-flight, trailing runs, failures, latest callback and editor error handling");
