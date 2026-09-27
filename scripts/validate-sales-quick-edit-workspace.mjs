import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

check(source.includes("const pendingRecordScopesRef = useRef({});"),
  "Pending quick edits remember the workspace where they originated.");

const merge = source.split("const mergeLoadedRows =")[1]?.split("\n\n  const loadWorkOrders")[0] || "";
check(merge.includes("scope = activeRecordScopeRef.current"),
  "Loaded-row merge is explicitly workspace-aware.");
check(merge.includes("pendingRecordScopesRef.current[order.id] === scope"),
  "Optimistic quick edits overlay only rows loaded for their originating workspace.");
check(merge.includes("(pendingChangesRef.current[order.id] || {})"),
  "Same-workspace reloads still preserve optimistic quick edits.");

const updater = source.split("const updateWorkOrderFields =")[1]?.split("\n  const updateWorkOrder =")[0] || "";
check(updater.includes("pendingRecordScopesRef.current[orderId] = activeRecordScopeRef.current;"),
  "Quick edit records its active workspace before debounce save.");
check(updater.includes("replaceWorkOrderFieldsIfUnchanged"),
  "Workspace protection does not weaken conflict-safe persistence.");
check(updater.includes("delete pendingRecordScopesRef.current[orderId];"),
  "Successful completion clears quick-edit workspace metadata.");

const loader = source.split("const loadWorkOrders = async")[1]?.split("\n  const loadMoreArchive")[0] || "";
check(loader.includes("setWorkOrders(mergeLoadedRows(rows, scopeAtStart));"),
  "Each workspace load applies only optimistic values belonging to that scope.");
check(loader.includes("scopeAtStart !== activeRecordScopeRef.current"),
  "Existing stale-request workspace guard remains intact.");

const discard = source.split("const discardPendingQuickEdits = async")[1]?.split("\n  const [deleteConfirm")[0] || "";
check(discard.includes("pendingRecordScopesRef.current = {};"),
  "Explicit quick-edit discard clears workspace metadata too.");

const bulkDelete = source.split("const confirmBulkDelete = async")[1]?.split("\n  const deleteWorkOrder")[0] || "";
check(bulkDelete.includes("delete pendingRecordScopesRef.current[id];"),
  "Bulk delete clears quick-edit workspace metadata for deleted rows.");

const singleDelete = source.split("const confirmDelete = async")[1]?.split("\n  const handleEditList")[0] || "";
check(singleDelete.includes("delete pendingRecordScopesRef.current[orderId];"),
  "Single delete clears quick-edit workspace metadata.");

console.log(`Sales pending quick-edit workspace isolation: ${checks}/${checks} PASS.`);
