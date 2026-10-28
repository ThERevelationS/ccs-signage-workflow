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
    // Remote-only terminal changes adopt through the dedicated CAS batch:
    // task + mapped stage + close fields commit atomically, never bulkUpdate.
    same(guarded.taskAdoption, { mode: "adoption", kind: "stage", to: status, remoteTask: task },
      "Remote-only terminal task routes to the adoption CAS path: " + task);
    same(guarded.fields.current_task_description, task, "Adoption patch carries its mapped task: " + task);
    same(guarded.snapshot[taskColumn], task, "Adopted task snapshot advances only after verified CAS: " + task);
    check(!guarded.held.includes("current_task_description"), "Remote-only terminal task is not held: " + task);
    check(!guarded.stageTransition, "Terminal task never uses the nonterminal stage path: " + task);
  }
  same(guarded.fields.estimate_amount, 150, "Unrelated safe estimate can still pull: " + task);
}
const neutral = held(base, "Closed - Did not Lose");
same(neutral.taskAdoption?.kind, "neutral_close",
  "Neutral closeout adopts through the CAS batch, not a field overwrite.");
same(neutral.fields.current_task_description, "Closed - Did not Lose",
  "Neutral closeout patch carries its remote task.");
check(!neutral.held.includes("current_task_description") && !neutral.stageTransition,
  "Remote-only neutral closeout is not held or stage-routed.");
const unmapped = held(base, "A newly invented custom task");
same(unmapped.fields.current_task_description, "A newly invented custom task",
  "Remote-only unmapped task text pulls plainly without stage effects.");
check(!unmapped.taskAdoption && !unmapped.stageTransition && !unmapped.held.includes("current_task_description"),
  "Unmapped remote task needs no transition, adoption, or review.");

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
const legacy = held(legacyTerminal, "WIP - Installation");
check(legacy.held.includes("current_task_description"),
  "A historical terminal row cannot be silently re-staged by pull.");
const legacySameStage = held(legacyTerminal, "Complete Estimate for Review");
same(legacySameStage.fields.current_task_description, "Complete Estimate for Review",
  "A same-stage remote task is a safe text pull even on a legacy-pattern row.");

const won = { ...base, sales_status: "won", current_task_description: "WIP - Designing",
  smartsheet_sync_snapshot: { [taskColumn]: "WIP - Designing", [amountColumn]: 100 } };
const wonContinuation = held(won, "WIP - Installation");
same(wonContinuation.fields.current_task_description, "WIP - Installation",
  "Already-approved Won may continue normal mapped WIP operations.");
const reopening = held(won, "Follow up with Customer - Post-Estimate");
same(reopening.taskAdoption, { mode: "adoption", kind: "stage", to: "follow_up",
  remoteTask: "Follow up with Customer - Post-Estimate" },
  "A remote-only backward move reopens Won through the guarded adoption CAS, never silently.");
check(!reopening.held.includes("current_task_description"),
  "Remote-only reopen is adopted, not left to an unactionable queue.");

const lost = { ...base, sales_status: "lost", current_task_description: "Lost",
  smartsheet_sync_snapshot: { [taskColumn]: "Lost", [amountColumn]: 100 } };
same(held(lost, "Conduct Site Survey").taskAdoption?.to, "lead",
  "A remote-only reopen of Lost routes through the guarded adoption CAS.");
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
check(backend.includes("buildSalesPullReviews(existing") && backend.includes("stillHeld.map"),
  "Held tasks retain the existing admin review and baseline-preservation path.");
check(backend.includes("verifiedLocalFieldTime(base44, 'WorkOrder', existing, binding)") &&
      backend.includes("planSalesRemoteTaskApplication"),
  "Both-changed held fields arbitrate by timestamp evidence before review.");
check(backend.includes("adoptionBatch = dataset === 'sales'") &&
      backend.includes("buildSalesTaskAdoptionPatch(_existing, fields") &&
      backend.includes("expectedNeutralClose"),
  "Terminal task adoptions bypass bulkUpdate, use CAS, and verify neutral-close read-back.");
check(backend.includes("stageBatch = dataset === 'sales'") &&
      backend.includes("ordinaryBatch.map(") &&
      backend.includes("trackedConditionalSave(base44, 'WorkOrder', _existing, patch") &&
      backend.includes("persisted.sales_stage_changed_at === item.expectedStageChangedAt"),
  "Nonterminal stage transitions bypass bulkUpdate, use CAS and require stage/timing read-back.");
check(!backend.includes("sales_status: 'won'") && !backend.includes("sales_status: 'lost'"),
  "Task pull never invents terminal statuses.");

console.log("Sales Smartsheet task pull guard: " + checks + "/" + checks + " PASS.");
