import assert from "node:assert/strict";
import {
  hasModernSalesWorkflowEvidence,
  isLegacyTerminalSmartsheetSalesRecord,
} from "../base44/shared/historicalSalesOutcomeReconciliation.mjs";
import {
  getSalesRecordClassification,
  isCurrentPipelineOpportunity,
  isLegacyClosedSalesRecord,
} from "../src/components/sales/salesRecordScopes.js";
import { classifyWorkOrderSalesScope } from "../base44/shared/opportunityBridgeAudit.mjs";

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

const importedLegacy = {
  id: "legacy-import",
  in_pipeline: true,
  sales_status: "lead",
  client_name: "Historical Customer",
  title: "Smartsheet row 123456",
  current_task_description: "Completed Sale",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456",
};

check(isLegacyTerminalSmartsheetSalesRecord(importedLegacy),
  "Smartsheet-linked open Lead with terminal legacy task and no modern evidence is historical.");
check(!isCurrentPipelineOpportunity(importedLegacy),
  "Historical imported terminal record is excluded from Current Pipeline.");
check(isLegacyClosedSalesRecord(importedLegacy),
  "Historical imported terminal record is visible in Legacy History.");
same(getSalesRecordClassification(importedLegacy), "legacy_history",
  "Sales UI classification routes the imported terminal record to Legacy History.");
same(classifyWorkOrderSalesScope(importedLegacy), "legacy_history",
  "Opportunity bridge uses the same Legacy History classification.");

for (const patch of [
  { sales_last_activity_at: "2026-10-04T12:00:00Z" },
  { sales_stage_changed_at: "2026-10-04T12:00:00Z" },
  { sales_last_follow_up_completed_at: "2026-10-04T12:00:00Z" },
  { sales_last_follow_up_outcome: "Customer asked us to reopen" },
  { follow_up_date: "2026-10-10" },
  { expected_close_date: "2026-10-20" },
  { probability: 0 },
  { close_date: "2026-10-04" },
  { lost_reason: "Explicit modern reason" },
  { opportunity_id: "opp-modern" },
]) {
  const row = { ...importedLegacy, ...patch };
  check(hasModernSalesWorkflowEvidence(row),
    "Modern Sales workflow evidence is recognized.");
  check(!isLegacyTerminalSmartsheetSalesRecord(row),
    "Modern Sales evidence prevents task text alone from demoting a record to legacy.");
  check(isCurrentPipelineOpportunity(row),
    "Open record with modern Sales evidence remains in Current Pipeline despite stale terminal task text.");
  same(classifyWorkOrderSalesScope(row), "current",
    "Opportunity bridge also keeps modern-evidence record current.");
}

const unlinkedModern = {
  ...importedLegacy,
  smartsheet_sheet_id: "",
  smartsheet_row_id: "",
};
check(!isLegacyTerminalSmartsheetSalesRecord(unlinkedModern),
  "Terminal task text alone never demotes an unlinked modern WorkOrder.");
check(isCurrentPipelineOpportunity(unlinkedModern),
  "Unlinked modern WorkOrder remains current until an explicit Sales status changes it.");

const activeLinked = {
  ...importedLegacy,
  current_task_description: "Follow up with customer",
};
check(!isLegacyTerminalSmartsheetSalesRecord(activeLinked),
  "Normal active Smartsheet-linked task remains current.");
check(isCurrentPipelineOpportunity(activeLinked),
  "Normal active Smartsheet-linked task stays in Current Pipeline.");

const explicitOutcome = { ...importedLegacy, sales_status: "won", close_date: "2026-10-04" };
check(!isLegacyTerminalSmartsheetSalesRecord(explicitOutcome),
  "Explicit modern Won status is not reclassified from legacy task text.");
same(getSalesRecordClassification(explicitOutcome), "outcome",
  "Explicit modern Won status stays a trusted outcome.");

const oldNonPipeline = {
  in_pipeline: false,
  sales_status: "lead",
  current_task_description: "Lost - no response",
};
check(isLegacyClosedSalesRecord(oldNonPipeline),
  "Existing non-pipeline terminal-text history remains Legacy History.");
same(getSalesRecordClassification(oldNonPipeline), "legacy_history",
  "Existing historical classification remains unchanged.");

console.log("Sales legacy terminal Smartsheet scope: " + checks + "/" + checks + " PASS.");
