import test from "node:test";
import assert from "node:assert/strict";
import { findWorkOrderFocusTarget, restoreWorkOrderFocusAfterSave } from "../src/components/fleet/fleetWorkOrderFocus.js";

function setup({ rows = [{ id: "wo-1" }], listButtons = [], boardButtons = [] } = {}) {
  let focused = "";
  const button = (id, visible = true) => ({
    dataset: { fleetBoardOpen: id },
    getClientRects: () => visible ? [{}] : [],
    focus: () => { focused = id; },
  });
  const list = new Map(listButtons.map((id) => [`fleet-work-order-toggle-${id}`, button(id)]));
  const board = boardButtons.map(([id, visible]) => button(id, visible));
  const root = {
    getElementById: (id) => list.get(id) || null,
    querySelectorAll: (selector) => {
      assert.equal(selector, "button[data-fleet-board-open]");
      return board;
    },
  };
  const notices = [];
  const statusFilter = { focus: () => { focused = "status-filter"; } };
  const restore = (pending, viewMode = "list") => restoreWorkOrderFocusAfterSave({
    rows, pending, viewMode, root, statusFilter, onNotice: (value) => notices.push(value),
  });
  return { root, restore, notices, get focused() { return focused; } };
}

const created = { id: "wo-1", label: "WO-TEST-1", verb: "Created" };
const saved = { id: "wo-1", label: "WO-TEST-1", verb: "Saved" };

test("created work order: refreshed list focuses newly created row", () => {
  const page = setup({ listButtons: ["wo-1"] });
  assert.equal(page.restore(created), "work-order");
  assert.equal(page.focused, "wo-1");
  assert.deepEqual(page.notices, []);
});

test("edited work order: refreshed list focuses existing row", () => {
  const page = setup({ listButtons: ["wo-1"] });
  assert.equal(page.restore(saved), "work-order");
  assert.equal(page.focused, "wo-1");
});

test("board: skips hidden desktop card and focuses visible mobile card", () => {
  const page = setup({ boardButtons: [["wo-1", false], ["wo-1", true]] });
  assert.equal(page.restore(created, "board"), "work-order");
  assert.equal(page.focused, "wo-1");
  assert.deepEqual(page.notices, []);
});

test("board: skips hidden mobile card and focuses visible desktop card", () => {
  const page = setup({ boardButtons: [["wo-1", false], ["other", true], ["wo-1", true]] });
  assert.equal(page.restore(saved, "board"), "work-order");
  assert.equal(page.focused, "wo-1");
});

test("editing to a status excluded by current filters focuses status filter", () => {
  const page = setup({ rows: [], listButtons: ["wo-1"] });
  assert.equal(page.restore(saved), "filter");
  assert.equal(page.focused, "status-filter");
  assert.deepEqual(page.notices, ["Saved WO-TEST-1. It no longer matches the current filters."]);
});

test("creating under a filter that hides the result focuses status filter", () => {
  const page = setup({ rows: [], boardButtons: [["wo-1", true]] });
  assert.equal(page.restore(created, "board"), "filter");
  assert.equal(page.focused, "status-filter");
  assert.match(page.notices[0], /^Created WO-TEST-1\. It no longer matches/);
});

test("visible row without its control gives a safe filter fallback", () => {
  const page = setup();
  assert.equal(page.restore(saved), "filter");
  assert.equal(page.focused, "status-filter");
  assert.deepEqual(page.notices, ["Saved WO-TEST-1. Use the view controls to locate the updated work order."]);
});

test("board: hidden-only card cannot capture focus", () => {
  const page = setup({ boardButtons: [["wo-1", false]] });
  assert.equal(findWorkOrderFocusTarget([{ id: "wo-1" }], "wo-1", "board", page.root), null);
  assert.equal(page.restore(created, "board"), "filter");
  assert.equal(page.focused, "status-filter");
});

test("stale save identity cannot focus an unrelated row", () => {
  const page = setup({ rows: [{ id: "wo-2" }], listButtons: ["wo-1", "wo-2"] });
  assert.equal(page.restore(saved), "filter");
  assert.equal(page.focused, "status-filter");
});
