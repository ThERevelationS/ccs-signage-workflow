import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const daily = readFileSync("src/components/sales/SalesDailyQueue.jsx", "utf8");

const chooseView = page.split("const chooseView = (nextView) => {")[1]?.split("\n  };")[0] || "";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(chooseView.includes('if (nextView === "daily" || nextView === "insights") setSearchTerm("");'),
  "Daily and Insights clear carried search criteria.");
check(chooseView.includes('if (nextView === "daily") spreadsheetRef.current?.clearColumnHeaderFilter?.();'),
  "Daily clears a table-header-only row filter before the queue view is committed.");
check(chooseView.indexOf("clearColumnHeaderFilter") < chooseView.indexOf("setViewMode(nextView)"),
  "Daily table-header filter is cleared before switching the rendered view.");
check(chooseView.includes('if (nextView === "daily" || nextView === "insights")') &&
  chooseView.includes('setAttentionFilter("all");') &&
  chooseView.includes('setFilterStatus("all");'),
  "Daily retains the existing clean-slate information/attention behavior.");

const boardClearGuard = chooseView
  .replace(/if \(nextView === "daily"\) spreadsheetRef\.current\?\.clearColumnHeaderFilter\?\.\(\);/, "")
  .replace(/if \(nextView === "daily" \|\| nextView === "insights"\) setSearchTerm\(""\);/, "");
check(!boardClearGuard.includes('nextView === "board"') || !boardClearGuard.includes("clearColumnHeaderFilter"),
  "Board does not clear the table-header row filter.");
check(!chooseView.includes('if (nextView === "board") setSearchTerm("");'),
  "Board preserves the visible search criterion.");
check(!chooseView.includes('if (nextView === "board") spreadsheetRef.current?.clearColumnHeaderFilter?.();'),
  "Board preserves the active table-header criterion.");

check(sheet.includes('if (viewMode === "daily" && recordScope === "current")') &&
  sheet.includes("<SalesDailyQueue") &&
  sheet.includes("workOrders={filteredWorkOrders}"),
  "Daily still consumes the shared filtered row pipeline after transition cleanup.");
check(sheet.includes('if (viewMode === "board")') &&
  sheet.includes("<SalesPipelineKanban") &&
  sheet.includes("workOrders={filteredWorkOrders}"),
  "Board continues to consume the same filtered working set as Table.");
check(daily.includes('const [ownerScope, setOwnerScope] = useState("all");') &&
  daily.includes('if (ownerScope === "mine")') &&
  daily.includes('if (ownerScope === "unassigned")'),
  "Daily retains its own operational owner filters after Table criteria are cleared.");

console.log(`Sales Table/Board/Daily filter transitions: ${checks}/${checks} PASS.`);
