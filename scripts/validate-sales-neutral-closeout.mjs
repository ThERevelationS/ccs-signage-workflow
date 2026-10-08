import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getSalesRecordClassification,
  isCurrentPipelineOpportunity,
  isExplicitNeutralSalesClosure,
  isLegacyClosedSalesRecord,
  isTrustedSalesOutcome,
} from "../src/components/sales/salesRecordScopes.js";
import { salesStageDisplayLabel, salesStageDisplayValue } from "../src/components/sales/salesStageTrust.mjs";
import { planSalesTaskChange, NEUTRAL_CLOSED_TASK } from "../src/components/sales/salesTaskStageMapping.mjs";
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const current = {
  id: "safe-synthetic",
  sales_status: "lead",
  in_pipeline: true,
  client_name: "Safe Synthetic",
  current_task_description: "Follow up with Customer - Post-Estimate",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
};
equal(planSalesTaskChange(current, NEUTRAL_CLOSED_TASK), {
  action: "confirm_neutral_close", task: NEUTRAL_CLOSED_TASK, status: null,
}, "Neutral task asks confirmation and does not invent a status.");
const closed = {
  ...current,
  in_pipeline: false,
  current_task_description: NEUTRAL_CLOSED_TASK,
  follow_up_date: "",
  sales_neutral_closed_at: "2026-10-08T15:00:00Z",
};
check(isExplicitNeutralSalesClosure(closed), "Explicitly stamped closed WorkOrder is neutral.");
equal(getSalesRecordClassification(closed), "neutral_closed", "Modern neutral closure gets distinct classification.");
equal(salesStageDisplayValue(closed), "closed_neutral", "Neutral closure is a display state, not a sales_status enum.");
equal(salesStageDisplayLabel(closed), "Closed (Neutral)", "Neutral outcome label is descriptive.");
check(!isCurrentPipelineOpportunity(closed), "Neutral closed record leaves current pipeline.");
check(!isTrustedSalesOutcome(closed), "Neutral closure does not count toward Won/Lost reporting.");
check(!isLegacyClosedSalesRecord(closed), "Modern neutral closure never enters Legacy History.");
const unstampedLegacy = { ...closed, sales_neutral_closed_at: "" };
check(!isExplicitNeutralSalesClosure(unstampedLegacy), "Old Closed - Did not Lose text is not modern evidence.");
equal(getSalesRecordClassification(unstampedLegacy), "legacy_history", "Old unstamped closed task remains legacy history.");
const outcomes = ["won", "lost"].map(sales_status => ({ ...current, sales_status }));
for (const row of outcomes) {
  equal(getSalesRecordClassification(row), "outcome", "Explicit modern outcome remains authoritative.");
  check(isTrustedSalesOutcome(row), "Won/Lost remains a real outcome.");
}
const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
check(sheet.includes('taskPlan.action === "confirm_neutral_close"'), "Neutral task is never saved before confirmation.");
check(sheet.includes('statusTransition.kind === "neutral_close"'), "Neutral confirmation has its own save path.");
check(sheet.includes("sales_neutral_closed_at: new Date().toISOString()"), "Closure receives a verified timestamp only on confirmation.");
check(sheet.includes("in_pipeline: false") && sheet.includes("follow_up_date: \"\""), "Neutral closure clears pipeline membership and reminder.");
check(!sheet.includes("sales_status: \"closed_neutral\""), "UI never writes an invalid seventh Sales status.");
check(sheet.includes("isCurrentPipelineOpportunity(current)"), "Confirmation re-checks current Sales scope.");
const modal = readFileSync("src/components/sales/SalesStatusTransitionDialog.jsx", "utf8");
check(modal.includes('transition.kind === "neutral_close"') && modal.includes("Close Without Outcome"), "Dedicated neutral confirmation explains impact.");
for (const path of [
  "src/components/sales/SalesPipelineRow.jsx",
  "src/components/sales/SalesPipelineMobileCards.jsx",
  "src/components/sales/SalesPipelineKanban.jsx",
  "src/components/sales/SalesOpportunityDialog.jsx",
]) {
  const source = readFileSync(path, "utf8");
  check(source.includes("closed_neutral") && source.includes("Closed (Neutral)"), path + " shows neutral closure safely.");
}
const schema = readFileSync("base44/entities/WorkOrder.jsonc", "utf8");
check(schema.includes('"sales_neutral_closed_at"'), "WorkOrder schema supports explicit neutral close provenance.");
console.log("Sales neutral closeout contract: " + checks + "/" + checks + " PASS.");
