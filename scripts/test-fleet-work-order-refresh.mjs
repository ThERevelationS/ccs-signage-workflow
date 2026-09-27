import test from "node:test";
import assert from "node:assert/strict";
import { attemptPostMutationRefresh } from "../src/components/fleet/fleetWorkOrderRefresh.js";
import { restoreWorkOrderFocusAfterSave } from "../src/components/fleet/fleetWorkOrderFocus.js";

test("successful refresh reports success", async () => {
  let loads = 0;
  assert.equal(await attemptPostMutationRefresh(async () => { loads++; }), true);
  assert.equal(loads, 1);
});

test("failed refresh reports failure without propagating a misleading mutation error", async () => {
  let loads = 0;
  assert.equal(await attemptPostMutationRefresh(async () => {
    loads++;
    throw new Error("network unavailable");
  }), false);
  assert.equal(loads, 1);
});

test("a synchronous refresh failure is also isolated", async () => {
  assert.equal(await attemptPostMutationRefresh(() => { throw new Error("load failed"); }), false);
});

test("a confirmed mutation is never repeated just because list refresh fails", async () => {
  let mutationCalls = 0;
  let listCalls = 0;
  const committed = await (async () => { mutationCalls++; return { success: true }; })();
  assert.equal(committed.success, true);
  const refreshed = await attemptPostMutationRefresh(async () => {
    listCalls++;
    throw new Error("stale network");
  });
  assert.equal(refreshed, false);
  assert.equal(mutationCalls, 1);
  assert.equal(listCalls, 1);
});

test("after confirmed save and refresh failure, old visible work order is not focused", () => {
  let focus = "";
  let staleRowLookups = 0;
  const pending = { id: "wo-1", verb: "Saved", label: "WO-1", refreshFailed: true };
  const rows = [{ id: "wo-1", title: "old, stale" }];
  const destination = restoreWorkOrderFocusAfterSave({
    rows, pending, viewMode: "list",
    root: { getElementById: () => { staleRowLookups++; return { focus: () => { focus = "stale"; } }; } },
    refreshButton: { isConnected: true, focus: () => { focus = "retry"; } },
    statusFilter: { focus: () => { focus = "status"; } },
    onNotice: () => { throw new Error("stale row should not produce a visibility notice"); },
  });
  assert.equal(destination, "refresh");
  assert.equal(focus, "retry");
  assert.equal(staleRowLookups, 0);
});

test("after failed refresh, missing retry button falls back to the status filter", () => {
  let focus = "";
  const destination = restoreWorkOrderFocusAfterSave({
    rows: [{ id: "wo-1" }], pending: { id: "wo-1", refreshFailed: true },
    viewMode: "board", root: { querySelectorAll: () => { throw new Error("stale board"); } },
    refreshButton: { isConnected: false, focus: () => { focus = "stale"; } },
    statusFilter: { focus: () => { focus = "status"; } },
    onNotice: () => {},
  });
  assert.equal(destination, "refresh");
  assert.equal(focus, "status");
});
