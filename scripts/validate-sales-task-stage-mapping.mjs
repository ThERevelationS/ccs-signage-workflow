import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_TASK_STAGE_MAP,
  NEUTRAL_CLOSED_TASK,
  mapSalesTaskToStage,
  planSalesTaskChange,
} from "../src/components/sales/salesTaskStageMapping.mjs";

const expected = {
  "Prospect Initiation (Gather Info, Initial Discuss ...)": "lead",
  "Conduct Site Survey": "lead",
  "Research Sign Code for Mock-up": "lead",
  "Follow up with Customer - Pre-Estimating": "follow_up",
  "Mock up and Send to Customer": "lead",
  "Mock up Only": "lead",
  "Send Mock up to Customer": "lead",
  "Quoting - 3rd Party": "lead",
  "Complete Estimate for Review": "lead",
  "Estimate - To Be Reviewed": "lead",
  "Review Complete - Send to Customer": "lead",
  "Follow up with Customer - Post-Estimate": "follow_up",
  "On Hold - Follow Up with Customer": "on_hold",
  "Waiting on Deposit": "quoted",
  "SIPs": "won",
  "WIP - Waiting for Deposit": "won",
  "WIP - In Final Design Queue": "won",
  "WIP - Designing": "won",
  "WIP - Prepare/Submit Permit": "won",
  "WIP - Follow Up On Status of Accepted Permit": "won",
  "WIP - Permitting Follow-ups": "won",
  "WIP - Production/Fabrication": "won",
  "WIP - Outsourced Fabrication": "won",
  "WIP - Maintenance/Service Call": "won",
  "WIP - Installation": "won",
  "WIP - Outsourced Installation": "won",
  "WIP - Follow Up with Customer": "won",
  "WIP - Inspections": "won",
  "Completed Sale - Electrical Inspection": "won",
  "Completed Sale - Sign Inspection": "won",
  "Completed Sales - Post Invoice Tasks": "won",
  "Completed Sale": "won",
  "Lost": "lost",
  "Lost - We took too long": "lost",
  "Closed - Attempted Follow-up/No Response": "lost",
};

let checks = 0;
const same = (actual, expectedValue, message) => {
  assert.deepEqual(actual, expectedValue, message);
  checks++;
};
const check = (value, message) => { assert.ok(value, message); checks++; };

same(Object.keys(SALES_TASK_STAGE_MAP).length, 36,
  "All 35 configured non-neutral tasks plus the new Estimate Sent option are mapped.");
for (const [task, status] of Object.entries(expected)) {
  same(mapSalesTaskToStage(task), { kind: "stage", status }, "Exact task maps correctly: " + task);
}
same(mapSalesTaskToStage("Estimate Sent to Customer"), { kind: "stage", status: "quoted" },
  "New Estimate Sent option maps to Quoted.");
same(mapSalesTaskToStage(NEUTRAL_CLOSED_TASK), { kind: "neutral_close", status: null },
  "Neutral closed task is never converted into a fake Won/Lost outcome.");
same(mapSalesTaskToStage("Closed loop follow up"), { kind: "unmapped", status: null },
  "Unrecognized text does not become a terminal outcome.");
same(mapSalesTaskToStage(""), { kind: "unmapped", status: null },
  "Blank task cannot create a Sales outcome.");
same(planSalesTaskChange({ sales_status: "lead" }, "Waiting on Deposit"),
  { action: "save_stage_and_task", task: "Waiting on Deposit", status: "quoted" },
  "Lead to Quoted saves task and stage together.");
same(planSalesTaskChange({ sales_status: "lead" }, "Follow up with Customer - Post-Estimate"),
  { action: "save_stage_and_task", task: "Follow up with Customer - Post-Estimate", status: "follow_up" },
  "Lead to Follow Up saves task and stage together.");
same(planSalesTaskChange({ sales_status: "lead" }, "On Hold - Follow Up with Customer"),
  { action: "save_stage_and_task", task: "On Hold - Follow Up with Customer", status: "on_hold" },
  "Lead to On Hold saves task and stage together.");
same(planSalesTaskChange({ sales_status: "lead" }, "WIP - Designing"),
  { action: "confirm_transition", task: "WIP - Designing", status: "won" },
  "First Won/WIP task requires protected closeout confirmation.");
same(planSalesTaskChange({ sales_status: "won" }, "WIP - Installation"),
  { action: "task_only", task: "WIP - Installation", status: "won" },
  "Subsequent WIP task does not repeat Won closeout.");
same(planSalesTaskChange({ sales_status: "quoted" }, "Lost - We took too long"),
  { action: "confirm_transition", task: "Lost - We took too long", status: "lost" },
  "Lost task requires protected closeout and reason.");
same(planSalesTaskChange({ sales_status: "won" }, "Prospect Initiation (Gather Info, Initial Discuss ...)"),
  { action: "confirm_transition", task: "Prospect Initiation (Gather Info, Initial Discuss ...)", status: "lead" },
  "Reopening terminal outcomes requires confirmation.");
same(planSalesTaskChange({ sales_status: "lead" }, NEUTRAL_CLOSED_TASK),
  { action: "confirm_neutral_close", task: NEUTRAL_CLOSED_TASK, status: null },
  "Neutral Closed requires explicit confirmation rather than inventing a modern Won/Lost outcome.");
same(planSalesTaskChange({ sales_status: "quoted" }, "Custom follow up task"),
  { action: "task_only", task: "Custom follow up task", status: null },
  "Unrecognized free text cannot infer a Sales status.");

const sheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
check(sheet.includes("isCurrentPipelineOpportunity(currentWo)") &&
  sheet.includes('Object.prototype.hasOwnProperty.call(nextChanges, "current_task_description")'),
  "Stage inference happens only for user edits to an active Current Pipeline record.");
check(sheet.includes('!Object.prototype.hasOwnProperty.call(nextChanges, "sales_status")'),
  "A confirmed stage-and-task save bypasses task inference instead of re-opening its confirmation.");
check(sheet.includes('taskPlan.action === "confirm_transition"') &&
  sheet.includes("nextTask: taskPlan.task"),
  "Protected task changes defer both task and status until explicit confirmation.");
check(sheet.includes('taskPlan.action === "save_stage_and_task"') &&
  sheet.includes("proposedUpdates.sales_status = taskPlan.status"),
  "Nonterminal task changes save status in the same conflict-safe WorkOrder update.");
check(sheet.includes('typeof statusTransition.nextTask === "string"') &&
  sheet.includes("{ current_task_description: statusTransition.nextTask }"),
  "Confirmed closeout/reopening saves the task and Sales stage atomically.");
check(sheet.includes('nextStatus === "lost" ? lostReason : ""'),
  "Lost transition retains the existing required reason.");
check(sheet.includes("sales_stage_changed_at: activityStamp"),
  "A real Sales stage change still establishes stage timing.");
console.log("Sales task-to-status mapping and transition safety: " + checks + "/" + checks + " PASS.");
