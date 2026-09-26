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
const refreshContext = {
  hasLoadedRef,
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
console.log("PASS: initial and repeat refresh, confirmation/loading/view guards, visible and filtered focus, canceled and superseded requests, and status announcements.");
