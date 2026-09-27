import test from "node:test";
import assert from "node:assert/strict";
import { restoreWorkOrderFocusAfterSave } from "../src/components/fleet/fleetWorkOrderFocus.js";

// Synthetic keyboard destinations: no production writes or live backend calls.
function page(rows, listIds = [], boardCards = []) {
  let focused = "";
  const control = (id, visible = true) => ({
    dataset: { fleetBoardOpen: id },
    getClientRects: () => visible ? [{}] : [],
    focus: () => { focused = id; },
  });
  const list = new Map(listIds.map(id => [`fleet-work-order-toggle-${id}`, control(id)]));
  const board = boardCards.map(([id, visible]) => control(id, visible));
  const root = {
    getElementById: id => list.get(id) || null,
    querySelectorAll: () => board,
  };
  const notices = [];
  const pending = { id: "wo-1", label: "WO-TEST-1", verb: "Started" };
  return {
    restore: viewMode => restoreWorkOrderFocusAfterSave({
      rows, pending, viewMode, root, statusFilter: {
        focus: () => { focused = "status-filter"; },
      }, onNotice: notice => notices.push(notice),
    }),
    notices,
    get focused() { return focused; },
  };
}

test("start work: updated list row gets keyboard focus", () => {
  const p = page([{ id: "wo-1", status: "in_progress" }], ["wo-1"]);
  assert.equal(p.restore("list"), "work-order");
  assert.equal(p.focused, "wo-1");
  assert.deepEqual(p.notices, []);
});

test("start work: mobile board focuses visible card in new column", () => {
  const p = page([{ id: "wo-1", status: "in_progress" }], [], [["wo-1", true], ["wo-1", false]]);
  assert.equal(p.restore("board"), "work-order");
  assert.equal(p.focused, "wo-1");
});

test("start work: desktop board skips hidden mobile duplicate", () => {
  const p = page([{ id: "wo-1", status: "in_progress" }], [], [["wo-1", false], ["wo-1", true]]);
  assert.equal(p.restore("board"), "work-order");
  assert.equal(p.focused, "wo-1");
});

test("start work: updated projected date filtered out directs focus to filter", () => {
  const p = page([], [], [["wo-1", true]]);
  assert.equal(p.restore("board"), "filter");
  assert.equal(p.focused, "status-filter");
  assert.deepEqual(p.notices, ["Started WO-TEST-1. It no longer matches the current filters."]);
});

test("start work: visible row without a visible card directs focus to filter", () => {
  const p = page([{ id: "wo-1", status: "in_progress" }], [], [["wo-1", false]]);
  assert.equal(p.restore("board"), "filter");
  assert.equal(p.focused, "status-filter");
  assert.deepEqual(p.notices, ["Started WO-TEST-1. Use the view controls to locate the updated work order."]);
});
