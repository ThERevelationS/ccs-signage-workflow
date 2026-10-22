import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/pages/FleetHistory.jsx", "utf8").replace(/\r\n/g, "\n");

const start = source.indexOf("const changeReportStatus = async");
assert.notEqual(start, -1, "changeReportStatus not found");
const end = source.indexOf("};", start);
assert.notEqual(end, -1, "changeReportStatus body end not found");
const body = source.slice(start, end + 2);

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const harness = ({ statusBusyId = "", initialReports = [] } = {}) => {
  const calls = [];
  const gates = [];
  const setters = { reports: initialReports, error: "", statusBusyId };
  const reportsRef = { current: setters.reports };
  const makeSetter = (name) => (value) => {
    setters[name] = typeof value === "function" ? value(setters[name]) : value;
    if (name === "reports") reportsRef.current = setters.reports;
  };
  const base44 = { functions: { invoke: async (fn, payload) => {
    calls.push(payload);
    const gate = gates[calls.length - 1];
    assert.ok(gate, `unexpected invoke #${calls.length}: ${JSON.stringify(payload)}`);
    return gate.promise;
  } } };
  const ctx = {
    base44,
    setReports: makeSetter("reports"),
    setError: makeSetter("error"),
    setStatusBusyId: makeSetter("statusBusyId"),
    statusChangeSequence: { current: new Map() },
    reportsRef,
    REPORT_STATUSES: ["new", "in_review", "in_progress", "completed", "declined"],
    statusBusyId,
  };
  const fn = new Function(
    ...Object.keys(ctx),
    `${body}\nreturn changeReportStatus;`,
  )(...Object.values(ctx));
  return { fn, calls, gates, setters, reportsRef };
};

test("FleetHistory: a superseded status response cannot overwrite a newer status", async () => {
  const a = deferred(); const b = deferred();
  const { fn, gates, setters, reportsRef } = harness({
    initialReports: [{ id: "r1", status: "new", updated_date: "d1" }],
  });
  gates.push(a, b);
  reportsRef.current = setters.reports;
  const report = { id: "r1", status: "new", updated_date: "d1" };
  const first = fn(report, "in_review");
  const second = fn(report, "completed");
  b.resolve({ data: { report: { id: "r1", status: "completed", updated_date: "d3" } } });
  await second;
  a.resolve({ data: { report: { id: "r1", status: "in_review", updated_date: "d2" } } });
  await first;
  assert.equal(setters.reports.find(r => r.id === "r1")?.status, "completed");
});

test("FleetHistory: a chained status change uses the freshly applied updated_date", async () => {
  const a = deferred(); const b = deferred();
  const { fn, calls, gates, reportsRef, setters } = harness({
    initialReports: [{ id: "r1", status: "new", updated_date: "d1" }],
  });
  gates.push(a, b);
  const report = { id: "r1", status: "new", updated_date: "d1" };
  const first = fn(report, "in_review");
  a.resolve({ data: { report: { id: "r1", status: "in_review", updated_date: "d2" } } });
  await first;
  reportsRef.current = setters.reports;
  const second = fn(report, "completed");
  b.resolve({ data: { report: { id: "r1", status: "completed", updated_date: "d3" } } });
  await second;
  assert.equal(calls[1].expected_updated_date, "d2",
    "the second write must carry the version token the first response established");
});

test("FleetHistory: a second status change on the same report is blocked while one is in flight", async () => {
  const { fn, calls } = harness({ statusBusyId: "r1" });
  await fn({ id: "r1", status: "new", updated_date: "d1" }, "in_review");
  assert.equal(calls.length, 0, "a busy report must not issue a second update_status call");
});

test("FleetHistory: a stale status failure cannot surface an error over a newer change", async () => {
  const a = deferred(); const b = deferred();
  const { fn, gates, setters } = harness({
    initialReports: [{ id: "r1", status: "new", updated_date: "d1" }],
  });
  gates.push(a, b);
  const report = { id: "r1", status: "new", updated_date: "d1" };
  const first = fn(report, "in_review");
  const second = fn(report, "completed");
  a.reject(new Error("stale failure"));
  await first;
  assert.equal(setters.error, "");
  b.resolve({ data: { report: { id: "r1", status: "completed", updated_date: "d3" } } });
  await second;
  assert.equal(setters.error, "");
});

test("FleetHistory: status changes on different reports can proceed concurrently", async () => {
  const a = deferred(); const b = deferred();
  const { fn, calls, gates, setters, reportsRef } = harness({
    initialReports: [
      { id: "r1", status: "new", updated_date: "d1" },
      { id: "r2", status: "new", updated_date: "d1" },
    ],
  });
  gates.push(a, b);
  reportsRef.current = setters.reports;
  const first = fn({ id: "r1" }, "in_review");
  const second = fn({ id: "r2" }, "declined");
  assert.equal(calls.length, 2);
  a.resolve({ data: { report: { id: "r1", status: "in_review", updated_date: "d2" } } });
  b.resolve({ data: { report: { id: "r2", status: "declined", updated_date: "d2" } } });
  await Promise.all([first, second]);
  assert.equal(setters.reports.find(r => r.id === "r1")?.status, "in_review");
  assert.equal(setters.reports.find(r => r.id === "r2")?.status, "declined");
});

test("FleetHistory: a report cannot be sent an invalid status", async () => {
  const { fn, calls } = harness();
  await fn({ id: "r1" }, "bogus");
  assert.equal(calls.length, 0);
});
