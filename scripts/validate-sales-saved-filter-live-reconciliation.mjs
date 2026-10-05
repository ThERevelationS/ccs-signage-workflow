import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("const [filterReconciliationNotice, setFilterReconciliationNotice] = useState"),
  "Page keeps a visible saved-filter reconciliation notice.");
check(page.includes("const loadActiveFiltersRef = useRef"),
  "Live SalesFilter events use a stable ref to the latest refresh function.");

const loader = page.split("const loadActiveFilters = async () => {")[1]?.split("\n  };")[0] || "";
check(loader.includes("const missingInformationReference = Boolean(savedCustomFilterId && !savedCustomFilter);"),
  "Missing/unselected custom Information Filter is detected explicitly.");
check(loader.includes('const missingColumnReference = savedColumnId !== "default" && !restoredColumn;'),
  "Missing/unselected Column Filter preset is detected explicitly.");
check(loader.includes('? (savedCustomFilter ? savedInformation : "all")'),
  "Missing custom Information Filter falls back to All Statuses.");
check(loader.includes('column_preset_id: restoredColumn?.id || "default"'),
  "Missing Column Filter preset falls back to Default View in repaired preferences.");
check(loader.includes("hasLegacyFilterConflict || missingInformationReference || missingColumnReference"),
  "Legacy conflicts and stale saved references share one guarded repair path.");
check(loader.includes("expectedPreferences") &&
  loader.includes("saveSalesPipelinePreferencesSafely"),
  "Stale-reference self-heal uses the guarded preference save.");
check(loader.includes("keeping the current visible state"),
  "Transient refresh failures preserve the existing visible filter state.");
check(!loader.includes("return { information_filter:"),
  "Transient refresh failures cannot silently substitute All/Default preferences.");

const subscription = page.split("SalesFilter.subscribe(() => {")[1]?.split("\n    });")[0] || "";
check(Boolean(subscription), "Sales Pipeline subscribes to live SalesFilter changes.");
check(subscription.includes("refreshTimer !== null"),
  "Bursting collaborative filter updates are debounced to one refresh.");
check(subscription.includes("loadActiveFiltersRef.current()"),
  "Live SalesFilter changes reload current selections and definitions.");
check(page.includes('console.warn("Could not subscribe to live Sales saved-filter changes:"'),
  "Realtime subscription setup failure is contained rather than crashing the page.");
check(page.includes('console.warn("Could not refresh Sales saved filters after a live change:"'),
  "Realtime refresh failure is contained rather than producing an unhandled rejection.");
check(page.includes('if (typeof unsubscribe === "function") unsubscribe();'),
  "Realtime saved-filter subscription is cleaned up on identity/session change or unmount.");

check(page.includes('The active saved Information Filter is no longer available. Showing All Statuses.'),
  "Users are told when an active custom Information Filter disappears.");
check(page.includes('The active saved Column Filter is no longer available. Showing Default View.'),
  "Users are told when an active Column Filter disappears.");
check(page.includes('A saved Information Filter and Column Filter are no longer available. Both were reset.'),
  "Combined stale-reference fallback is explained clearly.");
check(page.includes('aria-label="Sales saved filter changed"') &&
  page.includes('aria-label="Dismiss saved filter change notice"'),
  "Saved-filter reconciliation notice is visible, accessible and dismissible.");

check(page.includes('setFilterReconciliationNotice("");\n    setAttentionFilter(value);'),
  "Explicit Attention selection dismisses an old reconciliation notice.");
check(page.includes('setFilterReconciliationNotice("");\n    setFilterStatus(value);'),
  "Explicit Information selection dismisses an old reconciliation notice.");
check(page.includes('setFilterReconciliationNotice("");\n    setSearchTerm("");'),
  "Clear Filters dismisses an old reconciliation notice.");
check(page.includes('setFilterReconciliationNotice("");\n                  setActiveColumnPreset(null);'),
  "Explicit Default View selection dismisses an old reconciliation notice.");

console.log("Sales live saved-filter reconciliation: " + checks + "/" + checks + " PASS.");
