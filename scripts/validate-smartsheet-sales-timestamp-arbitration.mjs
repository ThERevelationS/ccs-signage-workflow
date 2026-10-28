import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSalesFieldPull, guardSalesPulledTaskTransition, planSalesRemoteTaskApplication } from "../base44/shared/smartsheetSalesPullPlan.ts";
import { buildSalesTaskAdoptionPatch } from "../base44/shared/smartsheetSalesTaskAdoption.mjs";
import { persistSalesReviews } from "../base44/shared/smartsheetSalesReviewPersistence.ts";

let checks = 0;
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (condition, label) => { assert.ok(condition, label); checks++; };

const taskColumn = "4783818077955972";
const amountColumn = "5655853885876100";
const bindings = { current_task_description: taskColumn, estimate_amount: amountColumn };
const base = {
  id: "synthetic-wo-arb", in_pipeline: true, sales_status: "quoted",
  current_task_description: "Estimate Sent to Customer",
  estimate_amount: 100, smartsheet_sheet_id: "8702703019812740", smartsheet_row_id: "90001",
  smartsheet_last_synced_at: "2026-10-20T12:00:00Z",
  smartsheet_sync_snapshot: { [taskColumn]: "Estimate Sent to Customer", [amountColumn]: 100 },
  updated_date: "2026-10-20T12:00:00Z",
};

// 1. Local-only divergence: remote still equals the verified baseline. Keeping
// local silently is correct — this is a pending push, not a conflict.
const localEdit = { ...base, estimate_amount: 250 };
{
  const remote = { [taskColumn]: "Estimate Sent to Customer", [amountColumn]: 100 };
  const plan = planSalesFieldPull(localEdit, { estimate_amount: 100 }, remote, bindings);
  check(plan.localWins.includes("estimate_amount") && !plan.held.includes("estimate_amount"),
    "Remote-equal-baseline local edit is a silent local win, not a review.");
  same(plan.snapshot[amountColumn], 100, "Silent local win preserves the remote baseline.");
  check(!Object.hasOwn(plan.fields, "estimate_amount"), "Held-out remote value never overwrites local.");
}

// 2. Both sides changed since baseline: held for timestamp arbitration.
{
  const remote = { [taskColumn]: "Estimate Sent to Customer", [amountColumn]: 175 };
  const plan = planSalesFieldPull(localEdit, { estimate_amount: 175 }, remote, bindings);
  check(plan.held.includes("estimate_amount") && !plan.localWins.includes("estimate_amount"),
    "Both-changed field is held for timestamp arbitration.");
}

// 3. Remote-only change still applies normally.
{
  const remote = { [taskColumn]: "Estimate Sent to Customer", [amountColumn]: 175 };
  const plan = planSalesFieldPull(base, { estimate_amount: 175 }, remote, bindings);
  same(plan.fields.estimate_amount, 175, "Unchanged local value accepts the remote edit.");
  check(!plan.held.length && !plan.localWins.length, "Clean remote edit holds nothing.");
}

// 4. Task remote==baseline + consistent local edit: silent local win.
const localTaskEdit = { ...base, current_task_description: "Waiting on Deposit" };
{
  const plan = planSalesFieldPull(localTaskEdit, { current_task_description: "Estimate Sent to Customer" },
    { [taskColumn]: "Estimate Sent to Customer" }, bindings);
  const guarded = guardSalesPulledTaskTransition(localTaskEdit,
    { current_task_description: "Estimate Sent to Customer" }, plan, bindings);
  check(guarded.localWins.includes("current_task_description") && !guarded.held.includes("current_task_description"),
    "Unchanged remote task plus consistent local task is a silent local win.");
  check(!Object.hasOwn(guarded.fields, "current_task_description"),
    "Local-winning task is not overwritten by the pull.");
}

// 5. Same but local task is stage-inconsistent (won task on a lead record):
// the push can never deliver it — a real inconsistency worth one review.
const inconsistent = { ...localTaskEdit, sales_status: "lead" };
{
  const plan = planSalesFieldPull(inconsistent, { current_task_description: "Estimate Sent to Customer" },
    { [taskColumn]: "Estimate Sent to Customer" }, bindings);
  const guarded = guardSalesPulledTaskTransition(inconsistent,
    { current_task_description: "Estimate Sent to Customer" }, plan, bindings);
  check(guarded.held.includes("current_task_description") && guarded.pushBlockedTask === true,
    "Push-blocked local task is held and marked un-arbitrable.");
}

// 6. Remote-only terminal move: adoption CAS path.
{
  const plan = planSalesFieldPull(base, { current_task_description: "Completed Sale" },
    { [taskColumn]: "Completed Sale" }, bindings);
  const guarded = guardSalesPulledTaskTransition(base, { current_task_description: "Completed Sale" }, plan, bindings);
  same(guarded.taskAdoption, { mode: "adoption", kind: "stage", to: "won", remoteTask: "Completed Sale" },
    "Remote-only terminal task routes to guarded adoption.");
  check(!guarded.held.includes("current_task_description") && !guarded.stageTransition,
    "Adoption never uses the review queue or the nonterminal stage path.");
}

// 7. planSalesRemoteTaskApplication modes.
same(planSalesRemoteTaskApplication(base, "Waiting on Deposit").mode, "plain",
  "Same-stage remote task applies plainly.");
same(planSalesRemoteTaskApplication(base, "On Hold - Follow Up with Customer"),
  { mode: "transition", to: "on_hold" }, "Active-to-active remote task transitions via CAS.");
same(planSalesRemoteTaskApplication({ ...base, sales_status: "lead" }, "WIP - Installation").mode,
  "adoption", "Active-to-terminal remote task adopts via CAS.");
same(planSalesRemoteTaskApplication(base, "Closed - Did not Lose").mode, "adoption",
  "Neutral closeout adopts via CAS.");
same(planSalesRemoteTaskApplication(base, "Brand new task text").mode, "plain",
  "Remote-only unmapped task text pulls plainly.");
same(planSalesRemoteTaskApplication({ ...base, in_pipeline: false }, "Waiting on Deposit").mode, "held",
  "Non-pipeline records cannot adopt remote tasks.");
same(planSalesRemoteTaskApplication(
  { ...base, current_task_description: "Closed - Did not Lose", sales_status: "lead" },
  "Estimate - To Be Reviewed").mode, "plain",
  "A same-stage remote task is a safe text pull even on a legacy-terminal-pattern row.");
same(planSalesRemoteTaskApplication(
  { ...base, current_task_description: "Closed - Did not Lose", sales_status: "lead" },
  "WIP - Installation").mode, "held",
  "A stage-affecting remote task on a legacy-terminal-pattern row still fails closed.");
same(planSalesRemoteTaskApplication(
  { ...base, sales_stage_changed_at: "2026-10-21T00:00:00Z", sales_status: "quoted" },
  "Estimate Sent to Customer").mode, "plain",
  "A same-stage remote text pull proceeds under an unverified local stage move.");
same(planSalesRemoteTaskApplication(
  { ...base, sales_stage_changed_at: "2026-10-21T00:00:00Z" }, "On Hold - Follow Up with Customer").mode, "held",
  "Unverified local stage move blocks remote stage-affecting tasks.");

// 7b. Converged task, diverged stage: self-heal via adoption, not a silent skip.
{
  const converged = { ...base, current_task_description: "Completed Sale", sales_status: "lead",
    opportunity_id: "OPP-90001" };
  const incoming = { current_task_description: "Completed Sale" };
  const healed = guardSalesPulledTaskTransition(converged, incoming,
    planSalesFieldPull(converged, incoming, { [taskColumn]: "Completed Sale" }, bindings), bindings);
  same(healed.taskAdoption, { mode: "adoption", kind: "stage", to: "won", remoteTask: "Completed Sale" },
    "A record whose task already matches Smartsheet still heals a diverged stage.");
  const legacy = guardSalesPulledTaskTransition(
    { ...base, current_task_description: "Completed Sale", sales_status: "lead" }, incoming,
    planSalesFieldPull(base, incoming, { [taskColumn]: "Completed Sale" }, bindings), bindings);
  check(!legacy.taskAdoption && !legacy.stageTransition,
    "A legacy-terminal-pattern record still fails closed, converged task or not.");
  const consistent = guardSalesPulledTaskTransition(base, { current_task_description: "Estimate Sent to Customer" },
    planSalesFieldPull(base, { current_task_description: "Estimate Sent to Customer" },
      { [taskColumn]: "Estimate Sent to Customer" }, bindings), bindings);
  check(!consistent.taskAdoption && !consistent.stageTransition,
    "A converged task with a consistent stage stays a no-op.");
  const unverified = guardSalesPulledTaskTransition(
    { ...converged, sales_stage_changed_at: "2026-10-21T00:00:00Z" }, incoming,
    planSalesFieldPull(converged, incoming, { [taskColumn]: "Completed Sale" }, bindings), bindings);
  check(!unverified.taskAdoption && !unverified.stageTransition,
    "An unverified local stage move blocks the stage heal.");
  const activeHeal = guardSalesPulledTaskTransition(
    { ...base, current_task_description: "Waiting on Deposit", sales_status: "lead" },
    { current_task_description: "Waiting on Deposit" },
    planSalesFieldPull(base, { current_task_description: "Waiting on Deposit" },
      { [taskColumn]: "Waiting on Deposit" }, bindings), bindings);
  same(activeHeal.taskAdoption, { mode: "adoption", kind: "stage", to: "quoted", remoteTask: "Waiting on Deposit" },
    "Active-stage heals ride the adoption CAS, not the nonterminal transition patch.");
}

// 8. Adoption patch builder: terminal stage fields.
{
  const stamp = "2026-10-26T14:00:00.000Z";
  const patch = buildSalesTaskAdoptionPatch(base, { estimate_amount: 175 }, "Completed Sale", "", stamp);
  same(patch.sales_status, "won", "Terminal adoption stamps the mapped status.");
  same(patch.sales_stage_changed_at, stamp, "Adoption stamps a verified stage timestamp.");
  same(patch.close_date, "2026-10-26", "Won adoption sets the close date.");
  same(patch.lost_reason, "", "Won adoption clears lost reason.");
  same(patch.estimate_amount, 175, "Adoption preserves other pulled fields.");
  const lost = buildSalesTaskAdoptionPatch(base, {}, "Lost - We took too long", "Price too high", stamp);
  same(lost.lost_reason, "Price too high", "Lost adoption carries the remote lost reason.");
  const neutral = buildSalesTaskAdoptionPatch({ ...base, sales_status: "lead" }, {}, "Closed - Did not Lose", "", stamp);
  same(neutral.in_pipeline, false, "Neutral closeout leaves the pipeline.");
  same(neutral.sales_neutral_closed_at, stamp, "Neutral closeout stamps the closure.");
  const stageHeal = buildSalesTaskAdoptionPatch(
    { ...base, current_task_description: "Completed Sale", sales_status: "lead" }, {},
    "Completed Sale", "", stamp);
  same(stageHeal.sales_status, "won",
    "A same-task adoption still repairs the diverged stage.");
  same(stageHeal.sales_stage_changed_at, stamp, "The stage heal stamps a verified timestamp.");
  assert.throws(() => buildSalesTaskAdoptionPatch({ ...base, sales_status: "won" }, {}, "Closed - Did not Lose", "", stamp)); checks++;
  assert.throws(() => buildSalesTaskAdoptionPatch(base, {}, "Estimate Sent to Customer", "", stamp)); checks++;
  assert.throws(() => buildSalesTaskAdoptionPatch(
    { ...base, current_task_description: "Estimate Sent to Customer", sales_status: "quoted" }, {},
    "Estimate Sent to Customer", "", stamp)); checks++;
  assert.throws(() => buildSalesTaskAdoptionPatch(base, {}, "Completed Sale", "", "not-a-stamp")); checks++;
}

// 9. persistSalesReviews returns a new-vs-known summary.
{
  const calls = { bulkUpdate: [], upsert: [] };
  const mock = {
    asServiceRole: { entities: { SyncConflict: {
      bulkUpdate: async rows => calls.bulkUpdate.push(...rows),
      upsert: async rows => calls.upsert.push(...rows),
    } } },
  };
  const review = {
    id: "c1", conflict_key: "k1", dataset: "sales", entity_id: "wo-1", record_label: "Rec",
    field_name: "estimate_amount", sheet_id: "1", row_id: "2", column_id: amountColumn,
    local_value: "250", remote_value: "100", status: "open",
  };
  const first = await persistSalesReviews(mock, [review], null, []);
  same(first, { added: 1, kept: 0, superseded: 0 }, "New conflict evidence counts as added.");
  const second = await persistSalesReviews(mock, [review], null, [review]);
  same(second, { added: 0, kept: 1, superseded: 0 }, "Identical open evidence is kept, not re-added.");
  const changed = await persistSalesReviews(mock, [{ ...review, remote_value: "120" }], null, [review]);
  same(changed, { added: 1, kept: 0, superseded: 1 }, "Changed evidence supersedes and counts as new.");
}

// 10. Backend wiring: arbitration, adoption batch, and the newly-reported gate.
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
check(backend.includes("local_pending_newly_reported"),
  "Pull result reports how much of the preserved set is newly reported.");
check(backend.includes("local_wins_silent"),
  "Pull result reports silent local wins separately from review items.");
check(backend.includes("verifiedLocalFieldTime"),
  "Pull arbitrates held fields using committed local edit evidence.");
check(backend.includes("plan.pushBlockedTask"),
  "Push-blocked tasks skip arbitration and stay on the review path.");
check(backend.includes("adoptionBatch") && backend.includes("buildSalesTaskAdoptionPatch"),
  "Terminal adoptions commit through their own CAS batch.");
check(backend.includes("openConflictLabels") && backend.includes("tab=${openConflicts > 0 ? 'sync_conflicts' : 'smartsheet'}"),
  "Alert email names pending conflicts and links to the review tab.");
const reviewModule = readFileSync("base44/shared/smartsheetConflictReview.ts", "utf8");
check(reviewModule.includes("buildSalesTaskAdoptionPatch"),
  "Admin conflict resolution and pull adoption share the same transition builder.");

console.log(`Sales timestamp arbitration validation: ${checks}/${checks} PASS.`);
