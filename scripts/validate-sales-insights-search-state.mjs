import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

const chooseView = page.split("const chooseView = (nextView) => {")[1]?.split("\n  };")[0] || "";
check(chooseView.includes('if (nextView === "insights") setSearchTerm("");'),
  "Entering Insights clears row search so hidden search state cannot narrow reporting.");
check(chooseView.indexOf('setSearchTerm("")') < chooseView.indexOf("setViewMode(nextView)"),
  "Search is cleared before the Insights view is committed.");
check(chooseView.includes('if (nextView === "daily" || nextView === "insights")') &&
  chooseView.includes('setAttentionFilter("all");') &&
  chooseView.includes('setFilterStatus("all");'),
  "Existing Daily/Insights attention and status reset remains intact.");

const workspaceChange = page.split('<Select value={recordScope} onValueChange={(value) => {')[1]?.split("}}>")[0] || "";
check(workspaceChange.includes('setRecordScope(value);') &&
  workspaceChange.includes('setSearchTerm("");'),
  "Workspace changes clear search instead of carrying hidden row criteria across scopes.");
check(workspaceChange.includes('setAttentionFilter("all");') &&
  workspaceChange.includes('setFilterStatus("all");'),
  "Existing workspace attention/status reset remains intact.");
check(workspaceChange.includes('setViewMode("table")'),
  "Existing incompatible-view fallback remains intact.");

check(page.includes('value={searchTerm}') && page.includes('onChange={(e) => setSearchTerm(e.target.value)}'),
  "Search remains directly editable in row-based workspaces.");
check(page.includes('searchTerm={searchTerm}'),
  "Current search still flows to the spreadsheet.");
check(sheet.includes('if (searchTerm) {') && sheet.includes("const search = searchTerm.toLowerCase();"),
  "Spreadsheet search behavior itself remains unchanged.");
check(sheet.includes('if (viewMode === "insights" && recordScope === "current")') &&
  sheet.includes("<SalesPipelineInsights summary={pipelineSummary} />"),
  "Insights continues to render the shared pipeline summary.");

console.log(`Sales Insights/workspace search-state isolation: ${checks}/${checks} PASS.`);
