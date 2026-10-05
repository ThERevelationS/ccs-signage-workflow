import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isLegacyTerminalSalesTask,
  shouldCreateSmartsheetSalesRecordInPipeline,
} from "../base44/shared/smartsheetSalesSafety.mjs";
import {
  historicalTerminalTaskFamily,
  historicalTerminalTaskSubtype,
  isLegacyTerminalSmartsheetSalesRecord,
} from "../base44/shared/historicalSalesOutcomeReconciliation.mjs";
import {
  isCurrentPipelineOpportunity,
  isLegacyClosedSalesRecord,
} from "../src/components/sales/salesRecordScopes.js";
import { classifyWorkOrderSalesScope } from "../base44/shared/opportunityBridgeAudit.mjs";
import { classifySmartsheetRolloutRow } from "../src/components/admin/smartsheetRolloutModel.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const same = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

for (const task of [
  "Completed Sale",
  "Completed Sale - Electrical Inspection",
  "Completed Sales - Post Invoice Tasks",
]) {
  check(isLegacyTerminalSalesTask(task), task + " is terminal legacy Sales text.");
  same(historicalTerminalTaskFamily(task), "completed_sale", task + " maps to completed_sale family.");
}
check(!isLegacyTerminalSalesTask("Closed loop follow up"), "Closed loop follow up is not terminal.");
same(historicalTerminalTaskFamily("Closed loop follow up"), "", "Closed loop follow up stays non-terminal.");
check(!isLegacyTerminalSalesTask("Lost paperwork follow up"), "Lost paperwork follow up is not terminal without the legacy hyphen/exact form.");

same(historicalTerminalTaskSubtype("Completed Sales - Post Invoice Tasks"), "completed_sale_variant",
  "Plural post-invoice task is a completed-sale variant.");

const pluralImported = {
  in_pipeline: true,
  sales_status: "lead",
  client_name: "Example",
  title: "Example",
  current_task_description: "Completed Sales - Post Invoice Tasks",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456",
};
check(isLegacyTerminalSmartsheetSalesRecord(pluralImported),
  "Plural completed-sales import with no modern Sales evidence is legacy.");
check(!isCurrentPipelineOpportunity(pluralImported),
  "Plural completed-sales import is excluded from Current Pipeline.");
check(isLegacyClosedSalesRecord(pluralImported),
  "Plural completed-sales import appears in Legacy History.");
same(classifyWorkOrderSalesScope(pluralImported), "legacy_history",
  "Opportunity bridge uses the same plural legacy scope.");

check(!shouldCreateSmartsheetSalesRecordInPipeline({
  client_name: "Example",
  current_task_description: "Completed Sales - Post Invoice Tasks",
}), "Future Smartsheet creation does not recreate plural completed-sales rows as active pipeline.");
check(shouldCreateSmartsheetSalesRecordInPipeline({
  client_name: "Example",
  current_task_description: "Closed loop follow up",
}), "Non-terminal Closed loop follow up remains eligible for active pipeline creation.");

same(classifySmartsheetRolloutRow({
  status: "new_record",
  row_id: "1",
  row_number: 1,
  values: { client_name: "Example", current_task_description: "Completed Sales - Post Invoice Tasks" },
}, "sales")?.outcome, "legacy_terminal", "Rollout preview recognizes plural completed-sales legacy text.");
same(classifySmartsheetRolloutRow({
  status: "new_record",
  row_id: "2",
  row_number: 2,
  values: { client_name: "Example", current_task_description: "Closed loop follow up" },
}, "sales")?.outcome, "manual_backfill_review", "Rollout preview does not misclassify Closed loop follow up.");

const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const legacyQuery = spreadsheet.split("const LEGACY_CLOSED_QUERY = {")[1]?.split("\n};")[0] || "";
check(!legacyQuery.includes("in_pipeline:"), "Legacy History query no longer drops stale in_pipeline=true historical imports.");
check(legacyQuery.includes("completed sales?"), "Legacy History query includes singular and plural Completed Sale/Sales forms.");
check(legacyQuery.includes("closed(?:$|\\s*-)"), "Legacy History query excludes non-terminal Closed phrases.");

const proposal = readFileSync("src/components/admin/smartsheetControlledCreationProposalModel.js", "utf8");
check(proposal.includes("completed sales?"), "Controlled creation review recognizes plural Completed Sales text.");
check(proposal.includes("const task = text(originalValues.current_task_description).toLowerCase();"),
  "Controlled creation checks raw normalized-case task text so hyphen semantics are preserved.");

console.log("Sales Completed Sales plural/history loader boundary: " + checks + "/" + checks + " PASS.");
