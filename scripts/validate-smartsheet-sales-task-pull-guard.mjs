import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapSalesTaskToStage } from "../base44/shared/salesTaskStageCatalog.mjs";
import { planSalesFieldPull, guardSalesPulledTaskTransition } from "../base44/shared/smartsheetSalesPullPlan.ts";
import { buildNonterminalSalesPullPatch } from "../base44/shared/smartsheetSalesStageTransition.mjs";

let checks = 0;
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const taskColumn = "4783818077955972";
const amountColumn = "5655853885876100";
const bindings = { current_task_description: taskColumn, estimate_amount: amountColumn };
const startTask = "Complete Estimate for Review";
const base = {
  id: "synthetic-wo-1",
  in_pipeline: true,
  sales_status: "lead",
  current_task_description: startTask,
  estimate_amount: 100,
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "90001",
  smartsheet_last_synced_at: "2026-09-20T12:00:00Z",
  smartsheet_sync_snapshot: { [taskColumn]: startTask, [amountColumn]: 100 },
  updated_date: "2026-09-20T12:00:00Z",
};

const merge = (record, incoming) => {
  const remote = {
    [taskColumn]: incoming.current_task_description ?? record.current_task_description,
    [amountColumn]: incoming.estimate_amount ?? record.estimate_amount,
  };
  const plan = planSalesFieldPull(record, incoming, remote, bindings);
  const guarded = guardSalesPulledTaskTransition(record, incoming, plan, bindings);
  return { plan, guarded, remote };
};
const held = (record, task, fields = {}) =>
  merge(record, { current_task_description: task, estimate_amount: 150, ...fields }).guarded;

for (const [task, status] of [
  ["Estimate Sent to Customer", "quoted"],
  ["Follow up with Customer - Post-Estimate", "follow_up"],
  ["On Hold - Follow Up with Customer", "on_hold"],
  ["Lost", "lost"],
  ["Lost - We took too long", "lost"],
  ["Closed - Attempted Follow-up/No Response", "lost"],
  ["SIPs", "won"],
  ["WIP - Designing", "won"],
  ["Completed Sale", "won"],
]) {
  same(mapSalesTaskToStage(task).status, status, "Shared catalog agrees on stage for " + task);
  const guarded = held(base, task);
  if (["quoted", "follow_up", "on_hold"].includes(status)) {
    same(guarded.stageTransition, { from: "lead", to: status },
      "Verified nonterminal task change may use the atomic stage path: " + task);
    same(guarded.fields.current_task_description, task, "Transition retains its mapped task: " + task);
    same(guarded.snapshot[taskColumn], task, "Stage snapshot advances only after verified CAS: " + task);
    check(!guarded.held.includes("current_task_description"), "Safe nonterminal task is not held: " + task);
  } else {
    check(!Object.hasOwn(guarded.fields, "current_task_description"),
      "Never apply protected task independently of stage/approval: " + task);
    same(guarded.snapshot[taskColumn], startTask, "Blocked task keeps prior snapshot: " + task);
    check(guarded.held.includes("current_task_description"), "Protected task stays in review pipeline: " + task);
  }
  same(guarded.fields.estimate_amount, 150, "Unrelated safe estimate can still pull: " + task);
}
const neutral = held(base, "Closed - Did not Lose");
check(!Object.hasOwn(neutral.fields, "current_task_description") &&
  neutral.held.includes("current_task_description"), "Neutral closeout never pulls without approval.");
const unmapped = held(base, "A newly invented custom task");
check(!Object.hasOwn(unmapped.fields, "current_task_description"),
  "Unknown task may not silently bypass the Task Description → Status contract.");

const sameStage = merge(base, {
  current_task_description: "Conduct Site Survey",
  estimate_amount: 150,
});
same(sameStage.guarded.fields.current_task_description, "Conduct Site Survey",
  "Normal same-stage Sales tasks continue pulling.");
check(!sameStage.guarded.held.includes("current_task_description"),
  "Same-stage task is not falsely flagged for manual review.");
same(sameStage.guarded.snapshot[taskColumn], "Conduct Site Survey",
  "Accepted same-stage task advances its remote task snapshot.");

const staleLocallyChanged = {
  ...base,
  current_task_description: "Research Sign Code for Mock-up",
  updated_date: "2026-08-01T12:00:00Z",
};
const stalePlan = merge(staleLocallyChanged, { current_task_description: "Conduct Site Survey", estimate_amount: 150 });
check(Object.hasOwn(stalePlan.plan.fields, "current_task_description"),
  "Preexisting planner would accept the remote task on a stale record.");
check(!Object.hasOwn(stalePlan.guarded.fields, "current_task_description"),
  "Guard refuses to overwrite a locally changed task regardless of row age.");
same(stalePlan.guarded.snapshot[taskColumn], startTask,
  "Conflict never falsely establishes a fresh task baseline.");
check(!stalePlan.guarded.stageTransition, "Stale local task edits never qualify for atomic stage transition.");

const stamp = "2026-10-09T17:20:15.123Z";
const accepted = held(base, "Estimate Sent to Customer");
const atomicPatch = buildNonterminalSalesPullPatch(base, accepted.fields, accepted.stageTransition, stamp);
same(atomicPatch.current_task_description, "Estimate Sent to Customer", "Atomic patch carries source task.");
same(atomicPatch.sales_status, "quoted", "Atomic patch sets matching status.");
same(atomicPatch.sales_stage_changed_at, stamp, "Actual stage change gets a new, verified timestamp.");
same(atomicPatch.estimate_amount, 150, "Atomic patch preserves other safely merged fields.");
for (const rejected of [
  { transition: { from: "lead", to: "won" }, task: "SIPs" },
  { transition: { from: "lead", to: "lost" }, task: "Lost" },
  { transition: { from: "lead", to: "quoted" }, task: "Complete Estimate for Review" },
  { transition: { from: "quoted", to: "follow_up" }, task: "Follow up with Customer - Post-Estimate" },
]) {
  assert.throws(() => buildNonterminalSalesPullPatch(base,
    { current_task_description: rejected.task }, rejected.transition, stamp));
  checks++;
}
assert.throws(() => buildNonterminalSalesPullPatch(base, accepted.fields, accepted.stageTransition, "")); checks++;
assert.throws(() => buildNonterminalSalesPullPatch({ ...base, in_pipeline: false }, accepted.fields, accepted.stageTransition, stamp)); checks++;

const noBaseline = { ...base, smartsheet_last_synced_at: "", smartsheet_sync_snapshot: {} };
const unknown = held(noBaseline, "Conduct Site Survey");
check(unknown.held.includes("current_task_description"),
  "Nonblank local task without a verified baseline is preserved.");

const legacyTerminal = {
  ...base,
  current_task_description: "Completed Sale",
  smartsheet_sync_snapshot: { [taskColumn]: "Completed Sale", [amountColumn]: 100 },
  sales_stage_changed_at: "",
  sales_last_activity_at: "",
};
const legacy = held(legacyTerminal, "Complete Estimate for Review");
check(legacy.held.includes("current_task_description"),
  "A historical terminal row cannot be silently reopened as modern Lead by pull.");

const won = { ...base, sales_status: "won", current_task_description: "WIP - Designing",
  smartsheet_sync_snapshot: { [taskColumn]: "WIP - Designing", [amountColumn]: 100 } };
const wonContinuation = held(won, "WIP - Installation");
same(wonContinuation.fields.current_task_description, "WIP - Installation",
  "Already-approved Won may continue normal mapped WIP operations.");
const reopening = held(won, "Follow up with Customer - Post-Estimate");
check(reopening.held.includes("current_task_description"),
  "Smartsheet cannot reopen modern Won without protected confirmation.");

const lost = { ...base, sales_status: "lost", current_task_description: "Lost",
  smartsheet_sync_snapshot: { [taskColumn]: "Lost", [amountColumn]: 100 } };
check(held(lost, "Conduct Site Survey").held.includes("current_task_description"),
  "Smartsheet cannot reopen modern Lost without confirmation.");
const closed = { ...base, in_pipeline: false };
const nonPipeline = held(closed, "Estimate Sent to Customer");
check(!nonPipeline.held.includes("current_task_description"),
  "Legacy non-pipeline records are not automatically converted into modern outcomes.");

const unchanged = merge(base, { current_task_description: startTask });
same(unchanged.guarded.fields, unchanged.plan.fields, "Unchanged incoming task stays a no-op.");
same(unchanged.guarded.stageTransition, null, "No-op task cannot request a stage transition.");

const frontend = readFileSync("src/components/sales/salesTaskStageMapping.mjs", "utf8");
check(frontend.includes('salesTaskStageCatalog.mjs') &&
  !frontend.includes("const TASKS_BY_STATUS ="),
  "Sales UI and Smartsheet import the same canonical task catalog.");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
check(backend.includes("guardSalesPulledTaskTransition(existing, fieldValues") &&
  backend.includes("planSalesFieldPull(existing, fieldValues, salesRemoteSnapshot, bindings)"),
  "Production Sales pull applies task guard before constructing any bulk business update.");
check(backend.includes("buildSalesPullReviews(existing") && backend.includes("plan.held.map"),
  "Held tasks retain the existing admin review and baseline-preservation path.");
check(backend.includes("stageBatch = dataset === 'sales'") &&
      backend.includes("ordinaryBatch.map(") &&
      backend.includes("trackedConditionalSave(base44, 'WorkOrder', _existing, patch") &&
      backend.includes("persisted.sales_stage_changed_at === item.expectedStageChangedAt"),
  "Nonterminal stage transitions bypass bulkUpdate, use CAS and require stage/timing read-back.");
check(!backend.includes("sales_status: 'won'") && !backend.includes("sales_status: 'lost'"),
  "Task pull never invents terminal statuses.");

console.log("Sales Smartsheet task pull guard: " + checks + "/" + checks + " PASS.");
