import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

check(page.includes("visibleRowCount: 0") && page.includes("loadedWorkspaceRowCount: 0"),
  "Parent summary has explicit visible and loaded row counts.");
check(sheet.includes("visibleRowCount: filteredWorkOrders.length") &&
  sheet.includes("loadedWorkspaceRowCount: scopedWorkOrders.length"),
  "Spreadsheet reports filtered rows separately from loaded workspace rows.");
check(sheet.indexOf("const pipelineSummary = useMemo") < sheet.indexOf("const sortedWorkOrders = useMemo"),
  "Workspace KPI summary is calculated before user row filters/sorting.");
check(sheet.includes("const operational = scopedWorkOrders.filter(isCurrentPipelineOpportunity);"),
  "Pipeline KPIs continue to use workspace-scoped operational records rather than filtered rows.");
check(sheet.includes("const filteredWorkOrders = sortedWorkOrders;"),
  "Visible row count comes from the fully filtered/sorted result set.");

check(page.includes('aria-label="Sales Pipeline visible row count"'),
  "Row-count context is always visible for row-based Sales views.");
check(page.includes("Rows: {pipelineSummary.visibleRowCount} shown · {pipelineSummary.loadedWorkspaceRowCount} loaded"),
  "UI clearly distinguishes rows shown from rows currently loaded.");
check(page.includes("Metrics use workspace totals · metric clicks start a fresh row drill-down."),
  "UI explains both workspace-total KPI semantics and fresh KPI drill-down behavior.");
check(page.includes('(recordScope === "current" || recordScope === "all" || recordScope === "outcomes")'),
  "Workspace-total explanation appears only where workspace metrics are displayed.");
check(page.includes("Workspace pipeline metrics"),
  "Current/All KPI section is explicitly labeled as workspace metrics.");
check(sheet.includes("{filteredWorkOrders.length} shown · {scopedWorkOrders.length} loaded"),
  "Inline spreadsheet header uses the same shown-versus-loaded wording when enabled.");

check(!page.includes("Rows: {pipelineSummary.openCount}"),
  "Visible row context never reuses the workspace KPI count as the filtered count.");

console.log("Sales workspace KPI versus filtered-row count clarity: " + checks + "/" + checks + " PASS.");
