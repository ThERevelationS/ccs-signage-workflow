import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

const resetBlock = page.split("const resetMetricDrilldownCriteria = () => {")[1]?.split("\n  };")[0] || "";
check(resetBlock.includes('setSearchTerm("");'), "KPI drill-down clears carried search.");
check(resetBlock.includes("setColumnHeaderFilter(null);"), "KPI drill-down clears the parent table-filter indicator immediately.");
check(resetBlock.includes("spreadsheetRef.current?.clearColumnHeaderFilter?.();"), "KPI drill-down clears the actual persisted table-header filter.");

const attentionBlock = page.split("const applyMetricAttentionFilter = (value) => {")[1]?.split("\n  };")[0] || "";
check(attentionBlock.includes("resetMetricDrilldownCriteria();") && attentionBlock.includes("applyAttentionFilter(value);"),
  "Pipeline KPI drill-down resets unrelated row criteria before applying the selected attention KPI.");

const outcomeBlock = page.split("const applyOutcomeMetricFilter = (status) => {")[1]?.split("\n  };")[0] || "";
check(outcomeBlock.includes("resetMetricDrilldownCriteria();"), "Outcome KPI drill-down resets unrelated row criteria.");
check(outcomeBlock.includes('setAttentionFilter("all");') && outcomeBlock.includes("setFilterStatus(status);"),
  "Outcome KPI drill-down replaces attention/information state with the selected outcome status.");
check(outcomeBlock.includes('persistFilterPreferences({ informationFilter: status, attention: "all" });'),
  "Outcome KPI drill-down persists the selected outcome status just like the prior behavior.");

for (const value of ["all", "due", "needs_attention", "quote_no_followup", "near_close", "stale"]) {
  check(page.includes(`applyMetricAttentionFilter("${value}")`),
    "Pipeline KPI uses fresh drill-down handler: " + value);
}
check(page.includes('applyMetricAttentionFilter(pipelineSummary.noNextActionCount > 0 ? "no_next_action" : "all")'),
  "Next Action KPI uses the fresh drill-down handler while preserving its zero-missing fallback.");

for (const status of ["all", "won", "lost"]) {
  check(page.includes(`applyOutcomeMetricFilter("${status}")`),
    "Outcome KPI uses fresh drill-down handler: " + status);
}

check(page.includes('onClick={() => applyAttentionFilter(option.key)}'),
  "Primary quick attention controls remain combinable with visible search/table filters.");
check(page.includes('onSelect={() => applyAttentionFilter(option.key)}'),
  "More Filters attention choices remain combinable with visible search/table filters.");
check(page.includes("Metrics use workspace totals · metric clicks start a fresh row drill-down."),
  "UI explains the KPI replacement behavior.");

console.log("Sales KPI fresh drill-down behavior: " + checks + "/" + checks + " PASS.");
