import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

// Pure, synthetic checks: no Base44 records, authentication, or network access.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/pages/FleetWorkOrders.jsx"), "utf8");

function extract(startText, endText, prefix, context) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, "expected focus or refresh handler exists");
  return vm.runInNewContext("(" + prefix + source.slice(start + startText.length, end) + "\n})", context);
}

const loadingCalls = [];
const rowsRead = [];
const hasLoadedRef = { current: false };
const loadSequenceRef = { current: 0 };
const refreshContext = {
  hasLoadedRef,
  loadSequenceRef,
  setLoading: value => loadingCalls.push(value),
  listAllFleetRows: async (_entity, _sort, options) => [{ label: options.label }],
  base44: {
    entities: {
      FleetMaintenanceWorkOrder: "workOrders",
      FleetEquipment: "equipment",
      FleetMaintenanceTask: "tasks",
      FleetPart: "parts",
      FleetFluid: "fluids",
    },
    auth: { me: async () => ({ role: "synthetic" }) },
  },
  setOrders: rows => rowsRead.push(rows),
  setEquipment() {},
  setTasks() {},
  setParts() {},
  setFluids() {},
  setCurrentUser() {},
  setRefreshError() {},
  Promise,
};
const refresh = extract(
  "const loadData = useCallback(async () => {",
  "\n  }, []);",
  "async () => {",
  refreshContext
);
await refresh();
assert.deepEqual(loadingCalls, [true, false], "initial fetch shows and clears loading state");
assert.equal(hasLoadedRef.current, true);
assert.equal(rowsRead.length, 1);
await refresh();
assert.deepEqual(loadingCalls, [true, false, false], "subsequent refresh does not unmount list");
assert.equal(rowsRead.length, 2);

const pendingReopenFocusRef = { current: null };
const statusFilter = { focused: 0, focus() { this.focused++; } };
const statusFilterRef = { current: statusFilter };
const notices = [];
const focusedRows = [];
const timers = new Map();
let timerNumber = 0;
const focusContext = {
  findWorkOrderFocusTarget: (rows, id, _viewMode, root) => rows.some(row => row.id === id)
    ? root.getElementById(`fleet-work-order-toggle-${id}`)
    : null,
  pendingReopenFocusRef,
  confirmReopen: null,
  loading: false,
  viewMode: "list",
  rows: [],
  statusFilterRef,
  setFocusNotice: notice => notices.push(notice),
  document: {
    getElementById(id) {
      assert.equal(id, "fleet-work-order-toggle-wo1");
      return { focus: () => focusedRows.push(id) };
    },
  },
  window: {
    setTimeout(callback) {
      const id = ++timerNumber;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  },
};
const restoreFocus = extract(
  "  useEffect(() => {\n    const pending = pendingReopenFocusRef.current;",
  "\n  }, [confirmReopen, loading, rows, viewMode]);",
  "() => { const pending = pendingReopenFocusRef.current;",
  focusContext
);
function runTimers() {
  const pending = [...timers.values()];
  timers.clear();
  pending.forEach(callback => callback());
}

// Reopen cannot move focus before the nested confirmation has closed.
pendingReopenFocusRef.current = { id: "wo1", label: "WO-1" };
focusContext.confirmReopen = { id: "wo1" };
assert.equal(restoreFocus(), undefined);
assert.equal(timers.size, 0);
focusContext.confirmReopen = null;
focusContext.loading = true;
assert.equal(restoreFocus(), undefined);
focusContext.loading = false;
focusContext.viewMode = "board";
assert.equal(restoreFocus(), undefined);
focusContext.viewMode = "list";

// A still-visible work order receives focus once the modal has closed.
focusContext.rows = [{ id: "wo1" }];
const visibleCleanup = restoreFocus();
assert.equal(focusedRows.length, 0, "focus is deferred until modal cleanup");
runTimers();
assert.deepEqual(focusedRows, ["fleet-work-order-toggle-wo1"]);
assert.equal(pendingReopenFocusRef.current, null);
visibleCleanup();

// When filters hide reopened work, focus the status filter and explain why.
pendingReopenFocusRef.current = { id: "wo2", label: "WO-2" };
focusContext.rows = [];
restoreFocus();
runTimers();
assert.equal(statusFilter.focused, 1);
assert.deepEqual(notices, ["Reopened WO-2. It no longer matches the current filters."]);
assert.equal(pendingReopenFocusRef.current, null);

// Aborted effects and superseded requests may not steal keyboard focus.
pendingReopenFocusRef.current = { id: "wo1", label: "WO-1" };
focusContext.rows = [{ id: "wo1" }];
const canceled = restoreFocus();
canceled();
runTimers();
assert.equal(focusedRows.length, 1);
assert.equal(pendingReopenFocusRef.current.id, "wo1");
const old = restoreFocus();
pendingReopenFocusRef.current = { id: "newer", label: "newer work order" };
runTimers();
assert.equal(focusedRows.length, 1);
assert.equal(pendingReopenFocusRef.current.id, "newer");
old();

assert.ok(source.includes('ref={statusFilterRef}'), "fallback filter is focusable");
assert.ok(source.includes('role="status"'), "filtered-out outcome is announced");
assert.ok(source.includes('role="alert"'), "reopen failures are announced");
console.log("PASS: initial and repeat refresh, confirmation/loading/view guards, visible and filtered reopen focus.");

const pendingCompletionFocusRef = { current: null };
const completedRows = [];
const completionNotices = [];
const completionStatusFilter = { focused: 0, focus() { this.focused++; } };
const boardButtons = [
  { id: "wo1", visible: false, focused: 0 },
  { id: "wo1", visible: true, focused: 0 },
  { id: "wo-other", visible: true, focused: 0 },
].map(entry => ({
  dataset: { fleetBoardOpen: entry.id },
  getClientRects: () => entry.visible ? [1] : [],
  focus() { entry.focused++; },
  entry,
}));
let listFocused = 0;
const completionContext = {
  findWorkOrderFocusTarget: (rows, id, mode, root) => {
    if (!rows.some(row => row.id === id)) return null;
    if (mode === "list") return root.getElementById(`fleet-work-order-toggle-${id}`);
    return Array.from(root.querySelectorAll("button[data-fleet-board-open]"))
      .find(button => button.dataset.fleetBoardOpen === id && button.getClientRects().length > 0) || null;
  },
  pendingCompletionFocusRef,
  dialog: { mode: "complete" },
  loading: false,
  viewMode: "list",
  rows: [],
  statusFilterRef: { current: completionStatusFilter },
  setFocusNotice: notice => completionNotices.push(notice),
  document: {
    getElementById: id => id === "fleet-work-order-toggle-wo1"
      ? { focus() { listFocused++; } } : null,
    querySelectorAll: selector => {
      assert.equal(selector, "button");
      return boardButtons;
    },
  },
  window: focusContext.window,
};
const restoreCompletionFocus = extract(
  "  useEffect(() => {\n    const pending = pendingCompletionFocusRef.current;",
  "\n  }, [dialog, loading, rows, viewMode]);",
  "() => { const pending = pendingCompletionFocusRef.current;",
  completionContext
);

// The modal must close before focus restoration, including the server-save path.
pendingCompletionFocusRef.current = { id: "wo1", label: "WO-1" };
assert.equal(restoreCompletionFocus(), undefined);
assert.equal(timers.size, 0);
completionContext.dialog = null;
completionContext.loading = true;
assert.equal(restoreCompletionFocus(), undefined);
completionContext.loading = false;

// A completed order absent from Active returns focus to the status filter.
const filteredCleanup = restoreCompletionFocus();
assert.equal(completionStatusFilter.focused, 0);
runTimers();
assert.equal(completionStatusFilter.focused, 1);
assert.equal(completionNotices.at(-1), "Completed WO-1. It no longer matches the current filters.");
assert.equal(pendingCompletionFocusRef.current, null);
filteredCleanup();

// An order still visible under All statuses focuses its own list disclosure.
pendingCompletionFocusRef.current = { id: "wo1", label: "WO-1" };
completionContext.rows = [{ id: "wo1" }];
restoreCompletionFocus();
runTimers();
assert.equal(listFocused, 1);
assert.equal(completionStatusFilter.focused, 1);

// Board completion moves the card to another column: select only the visible copy.
pendingCompletionFocusRef.current = { id: "wo1", label: "WO-1" };
completionContext.viewMode = "board";
restoreCompletionFocus();
runTimers();
assert.deepEqual(boardButtons.map(button => button.entry.focused), [0, 1, 0]);

// If a board filter hides the completed card, use the same safe fallback.
pendingCompletionFocusRef.current = { id: "wo1", label: "WO-1" };
completionContext.rows = [];
restoreCompletionFocus();
runTimers();
assert.equal(completionStatusFilter.focused, 2);

// An abandoned or superseded effect must not steal focus from a newer action.
pendingCompletionFocusRef.current = { id: "wo1", label: "WO-1" };
completionContext.rows = [{ id: "wo1" }];
const abortedCompletion = restoreCompletionFocus();
abortedCompletion();
runTimers();
assert.equal(boardButtons[1].entry.focused, 1);
assert.equal(pendingCompletionFocusRef.current.id, "wo1");
const replacedCompletion = restoreCompletionFocus();
pendingCompletionFocusRef.current = { id: "newer", label: "WO-2" };
runTimers();
assert.equal(boardButtons[1].entry.focused, 1);
assert.equal(pendingCompletionFocusRef.current.id, "newer");
replacedCompletion();

// Exercise the submit boundary using synthetic inputs, never live records.
const completionRequests = [];
const submission = {
  dialog: { mode: "complete", workOrder: { id: "wo1", work_order_number: "WO-1", updated_date: "synthetic" } },
  equipment: [],
  tasks: [],
  pendingCompletionFocusRef,
  setFocusNotice: notice => completionNotices.push(notice),
  setActionError() {},
  closeDialog() { submission.closed = true; },
  closed: false,
  base44: { functions: { invoke: async (_name, payload) => {
    completionRequests.push(payload);
    return { data: {} };
  } } },
  async loadData() { completedRows.push("refreshed"); },
};
const submitCompleted = extract(
  "  const submitDialog = async (workOrderData, equipmentStatus) => {",
  "\n  };\n\n  const startWork",
  "async (workOrderData, equipmentStatus) => {",
  submission
);
pendingCompletionFocusRef.current = null;
await submitCompleted({ equipment_id: "synthetic-eq" }, "operational");
assert.equal(completionRequests.length, 1);
assert.equal(completionRequests[0].action, "complete");
assert.equal(completionRequests[0].id, "wo1");
assert.deepEqual(completedRows, ["refreshed"]);
assert.equal(pendingCompletionFocusRef.current.id, "wo1");

// Failed completion or failed post-save refresh cannot queue focus restoration.
submission.dialog = { mode: "complete", workOrder: { id: "failed", work_order_number: "WO-F" } };
submission.base44.functions.invoke = async () => ({ data: { error: "synthetic rejection" } });
pendingCompletionFocusRef.current = null;
await assert.rejects(() => submitCompleted({}, "operational"), /synthetic rejection/);
assert.equal(pendingCompletionFocusRef.current, null);
assert.ok(source.includes("data-fleet-board-open={workOrder.id}"), "board cards expose stable focus targets");
console.log("PASS: 11 completion focus scenarios, synthetic successful and rejected submissions, plus existing reopening and refresh coverage.");
