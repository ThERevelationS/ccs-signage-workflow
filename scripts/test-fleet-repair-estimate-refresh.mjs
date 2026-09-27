import test from "node:test";
import assert from "node:assert/strict";
import { attemptEstimateChangeRefresh } from "../src/components/fleet/fleetWorkOrderRefresh.js";
import { restoreEstimateFocusAfterChange } from "../src/components/fleet/fleetWorkOrderFocus.js";

const estimate = { id: "estimate-1", work_order_id: "wo-1", status: "submitted" };

test("acknowledged estimate: successful async list refresh", async () => {
  let calls = 0;
  const result = await attemptEstimateChangeRefresh(async (row) => {
    assert.strictEqual(row, estimate);
    calls += 1;
  }, estimate);
  assert.equal(result, true);
  assert.equal(calls, 1);
});

test("acknowledged estimate: false refresh result never replays the mutation", async () => {
  let calls = 0;
  assert.equal(await attemptEstimateChangeRefresh(async () => { calls++; return false; }, estimate), false);
  assert.equal(calls, 1);
});

test("acknowledged estimate: rejected list refresh is isolated", async () => {
  assert.equal(await attemptEstimateChangeRefresh(async () => { throw new Error("synthetic offline"); }, estimate), false);
});

test("acknowledged estimate: synchronous refresh failure is isolated", async () => {
  assert.equal(await attemptEstimateChangeRefresh(() => { throw new Error("synthetic offline"); }, estimate), false);
});

test("standalone estimate dialog without a callback can still save", async () => {
  assert.equal(await attemptEstimateChangeRefresh(undefined, estimate), true);
});

function setup({ rows = [{ id: "wo-1" }], opener = [], list = [], board = [], hasRetry = false } = {}) {
  let focused = "";
  const button = (name, data = {}, visible = true) => ({
    dataset: data,
    getClientRects: () => visible ? [{}] : [],
    focus: () => { focused = name; },
  });
  const estimateButtons = opener.map(([id, visible = true]) => button("estimate-" + id, { fleetEstimateOpen: id }, visible));
  const boardButtons = board.map(([id, visible = true]) => button("board-" + id, { fleetBoardOpen: id }, visible));
  const listButtons = new Map(list.map(id => ["fleet-work-order-toggle-" + id, button("list-" + id)]));
  const root = {
    querySelectorAll(selector) {
      if (selector === "button[data-fleet-estimate-open]") return estimateButtons;
      if (selector === "button[data-fleet-board-open]") return boardButtons;
      throw new Error("Unexpected selector: " + selector);
    },
    getElementById(id) { return listButtons.get(id) || null; },
  };
  const notices = [];
  const statusFilter = button("status-filter");
  const refreshButton = hasRetry ? { ...button("retry-refresh"), isConnected: true } : null;
  const run = (pending = { id: "wo-1", label: "WO-SYNTH-1", refreshFailed: false }, viewMode = "list") =>
    restoreEstimateFocusAfterChange({
      rows, pending, viewMode, root, statusFilter,
      onNotice: notice => notices.push(notice), refreshButton,
    });
  return { run, notices, get focused() { return focused; } };
}

test("estimate opener regains focus after successful list refresh", () => {
  const page = setup({ opener: [["wo-1"]], list: ["wo-1"] });
  assert.equal(page.run(), "estimate-opener");
  assert.equal(page.focused, "estimate-wo-1");
});

test("hidden estimate action cannot capture focus; use surviving row", () => {
  const page = setup({ opener: [["wo-1", false]], list: ["wo-1"] });
  assert.equal(page.run(), "work-order");
  assert.equal(page.focused, "list-wo-1");
});

test("filtered-out estimate falls back to status control, not stale opener", () => {
  const page = setup({ rows: [], opener: [["wo-1"]] });
  assert.equal(page.run(), "filter");
  assert.equal(page.focused, "status-filter");
  assert.match(page.notices[0], /no longer matches the current filters/);
});

test("visible row with no rendered action uses filter and accurate notice", () => {
  const page = setup();
  assert.equal(page.run(), "filter");
  assert.equal(page.focused, "status-filter");
  assert.match(page.notices[0], /Use the view controls/);
});

test("after failed list refresh, retry receives focus instead of stale row", () => {
  const page = setup({ hasRetry: true, opener: [["wo-1"]] });
  assert.equal(page.run({ id: "wo-1", label: "WO-SYNTH-1", refreshFailed: true }), "refresh");
  assert.equal(page.focused, "retry-refresh");
});

test("missing retry button safely falls back to status control", () => {
  const page = setup({ hasRetry: false, list: ["wo-1"] });
  assert.equal(page.run({ id: "wo-1", label: "WO-SYNTH-1", refreshFailed: true }), "refresh");
  assert.equal(page.focused, "status-filter");
});

test("when layout changes to board, prefer its visible card after close", () => {
  const page = setup({ board: [["wo-1", false], ["wo-1", true]] });
  assert.equal(page.run(undefined, "board"), "work-order");
  assert.equal(page.focused, "board-wo-1");
});

test("unrelated estimate opener cannot steal focus from the saved work order", () => {
  const page = setup({ opener: [["wo-2"]], list: ["wo-1"] });
  assert.equal(page.run(), "work-order");
  assert.equal(page.focused, "list-wo-1");
});
