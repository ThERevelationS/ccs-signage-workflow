import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const shared = readFileSync("src/components/shared/ColumnHeaderContextMenu.jsx", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("const [columnHeaderFilter, setColumnHeaderFilter] = useState(null);"), "Sales page tracks active table-header filter state.");
check(page.includes("onColumnHeaderFilterChange={setColumnHeaderFilter}"), "Spreadsheet reports active table-header filter state to the visible Sales toolbar.");
check(page.includes("Table: {columnHeaderFilter.label} · {columnHeaderFilter.detail}"), "Active table-header filter is visibly summarized outside the table header.");
check(page.includes("clearColumnHeaderFilter?.()"), "The visible table-header filter chip can clear the hidden filter.");
check(page.includes("Clear table column filter on"), "The table-header filter clear action is accessible on mobile and desktop.");
check(page.includes("Boolean(columnHeaderFilter)"), "The page-level active-filter state includes table-header filters.");
check(page.includes("const clearActiveFilters = () =>") && page.includes("spreadsheetRef.current?.clearColumnHeaderFilter?.();"), "Clear filters clears the table-header criterion too.");

check(sheet.includes("const describeSalesColumnHeaderFilter = (sortConfig) =>"), "Spreadsheet converts internal header filters into a visible summary.");
check(sheet.includes("onColumnHeaderFilterChange?.(activeColumnHeaderFilter);"), "Spreadsheet publishes header-filter state when it changes.");
check(sheet.includes("onColumnHeaderFilterChange?.(null);"), "Spreadsheet clears parent-visible header-filter state when it unmounts.");
check(sheet.includes("clearColumnHeaderFilter: clearCustomFilter"), "Sales page has an imperative filter-only clear action.");

const clearCustomFilter = shared.split("const clearCustomFilter = () => {")[1]?.split("\\n  };")[0] || "";
check(clearCustomFilter.includes("...current") && clearCustomFilter.includes("customFilter: null"), "Clearing a table-header filter preserves current sort key/direction.");
check(shared.includes("clearCustomFilter,"), "Shared column sorting exposes the filter-only clear action without changing existing consumers.");

console.log(`Sales table-header filter visibility and clear behavior: ${checks}/${checks} PASS.`);
