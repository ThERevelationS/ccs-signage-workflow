import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { persistColumnSortState, resolveColumnSortState } from "../src/components/shared/columnSortPersistence.mjs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(sheet.includes('recordScope === "current" ? "salesPipeline" : `salesPipeline_${recordScope}`'),
  "Current keeps the legacy Sales column-state key while other workspaces use isolated keys.");

const workspaceBlock = page.split('<Select value={recordScope} onValueChange={(value) => {')[1]?.split("}}>")[0] || "";
check(workspaceBlock.includes('setSearchTerm("");'), "Workspace changes clear carried search.");
check(workspaceBlock.includes('setAttentionFilter("all");'), "Workspace changes clear carried attention state.");
check(workspaceBlock.includes('setFilterStatus("all");'), "Workspace changes clear carried information-filter state.");
check(workspaceBlock.includes("setColumnHeaderFilter(null);"), "Workspace changes immediately clear the old workspace filter chip.");
check(!workspaceBlock.includes("clearColumnHeaderFilter"), "Workspace changes must not delete a persisted table-header filter.");
check(!workspaceBlock.includes("persistFilterPreferences"), "Temporary workspace resets must not erase saved information or attention preferences.");
check(workspaceBlock.includes('value === "history" || value === "outcomes"') && workspaceBlock.includes('setViewMode("table")'),
  "Outcomes and Legacy History force the compatible Table view.");
check(workspaceBlock.includes('value !== "current" && ["insights", "daily"].includes(viewMode)'),
  "Leaving Current from Daily or Insights falls back to Table for other workspaces.");

const storage = new Map();
const fakeStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const email = "rep@example.com";
const keys = {
  current: "salesPipeline_sort_" + email,
  outcomes: "salesPipeline_outcomes_sort_" + email,
  history: "salesPipeline_history_sort_" + email,
  all: "salesPipeline_all_sort_" + email,
};
const configs = {
  current: { key: "sales_rep", direction: "asc", customFilter: { filterType: "selected", selectedValues: ["Carl"] } },
  outcomes: { key: "close_date", direction: "desc", customFilter: { filterType: "range", dateRange: { from: "2026-09-01", to: "2026-10-01" } } },
  history: { key: "client_name", direction: "asc", customFilter: null },
  all: { key: "estimate_amount", direction: "desc", customFilter: { filterType: "range", numberRange: { from: 5000, to: null } } },
};
for (const scope of Object.keys(keys)) fakeStorage.setItem(keys[scope], JSON.stringify(configs[scope]));

let state = { storageKey: keys.current, config: configs.current };
for (const scope of ["outcomes", "history", "all", "current"]) {
  state = resolveColumnSortState(state, keys[scope], fakeStorage);
  assert.deepEqual(state.config, configs[scope], scope + " workspace must load only its own saved column state.");
  checks += 1;
}
check(persistColumnSortState(state, keys.current, fakeStorage) === true, "Returning to Current can persist its own state normally.");

console.log("Sales workspace column-filter isolation: " + checks + "/" + checks + " PASS.");
