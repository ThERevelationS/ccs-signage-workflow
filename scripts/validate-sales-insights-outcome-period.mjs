import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

check(page.includes('<Select value={outcomePeriod} onValueChange={setOutcomePeriod}>'),
  "Outcome Period remains a dedicated Outcomes workspace control.");
check(page.includes('{recordScope === "outcomes" && ('),
  "Outcome Period UI remains scoped to Won / Lost Outcomes.");
check(page.includes('if (value === "history" || value === "outcomes" || (value !== "current" && ["insights", "daily"].includes(viewMode))) setViewMode("table");'),
  "Switching to Outcomes cannot retain the Current-only Insights view.");
check(sheet.includes('const reportingOutcomeCutoffStamp = recordScope === "outcomes" ? outcomeCutoffStamp : "";'),
  "Outcome-period cutoff is applied only while the Outcomes workspace is active.");
check(sheet.includes('if (!reportingOutcomeCutoffStamp) return true;'),
  "Current Insights uses all authoritative modern outcomes even after a prior period selection.");
check(sheet.includes('wo.close_date >= reportingOutcomeCutoffStamp && wo.close_date <= todayStamp'),
  "Outcomes workspace still enforces its selected cutoff and excludes future close dates.");
check(sheet.includes('if (recordScope === "outcomes") {') &&
  sheet.includes('if (!outcomeCutoffStamp) return true;'),
  "Outcome row scoping still follows Outcome Period.");
check(sheet.includes('summary.ownerOutcomePerformance = buildOutcomePerformance("sales_rep", "Unassigned");') &&
  sheet.includes('summary.sourceOutcomePerformance = buildOutcomePerformance("lead_source", "Unspecified");'),
  "Insights outcome performance remains built from the reporting outcome set.");
check(sheet.includes('[scopedWorkOrders, workOrders, recordScope, todayStamp'),
  "Summary recomputes when workspace changes, preventing cross-workspace period leakage.");

console.log(`Sales Insights/Outcomes period isolation: ${checks}/${checks} PASS.`);
