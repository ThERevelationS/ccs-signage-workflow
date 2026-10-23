import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Held Sales task reviews are stage decisions. Choosing the Smartsheet task
// must apply the remote task AND its mapped stage in one conditional write —
// the bulk push guard can never perform that transition, so an approved
// review would otherwise stay pending forever.
const src = readFileSync("base44/shared/smartsheetConflictReview.ts", "utf8");

let checks = 0;
const check = (cond, message) => { assert.ok(cond, message); checks++; };
const match = (re, message) => { assert.match(src, re, message); checks++; };

match(/import \{[^}]*trackedConditionalSave[^}]*\} from '\.\/fieldAudit\.ts'/,
  "the held-task apply path must reuse the audited conditional save");
match(/import \{ mapSalesTaskToStage \} from '\.\/salesTaskStageCatalog\.mjs'/,
  "task decisions must be classified by the shared task catalog");

const branch = src.slice(src.indexOf("conflict.field_name==='current_task_description'"));
check(branch.length > 0, "a dedicated apply branch must exist for held Sales task reviews");
check(branch.indexOf("current_task_description") < src.length,
  "the branch is scoped to the sales task field only");
match(/body\.decision==='smartsheet'/, "the apply path runs only for the Smartsheet-side decision");

match(/mapSalesTaskToStage\(remoteTask\)/, "the remote task is classified before any write");
match(/in_pipeline:false,sales_neutral_closed_at:stamp,follow_up_date:''/,
  "a neutral close applies the full closeout patch, not just the task text");
match(/patch\.sales_status=mapped\.status;patch\.sales_stage_changed_at=stamp/,
  "a stage change writes the task, the real status, and the stage stamp together");
match(/patch\.close_date=today;patch\.follow_up_date=''/,
  "Won/Lost closes clear follow-up and record the close date like the pipeline UI");
match(/patch\.lost_reason=mapped\.status==='lost'/,
  "a Lost close only carries a lost reason for lost outcomes");
match(/patch\.close_date='';patch\.lost_reason=''/,
  "reopening a terminal record clears outcome fields");

match(/smartsheet_sync_snapshot=\{\.\.\.\(record\.smartsheet_sync_snapshot\|\|\{\}\),\[conflict\.column_id\]:remoteTask\}/,
  "the applied task advances its Smartsheet baseline so later pulls do not re-review it");
match(/trackedConditionalSave\(base44,'WorkOrder',record,patch/,
  "the apply uses a conditional save that fails closed on a stale revision");
match(/status:'resolved',decision:'smartsheet',resolved_at/,
  "a verified apply marks the review resolved so it leaves the pending list");

const branchEnd = branch.indexOf("await entity.update(conflict.id,{status:'approved'");
const branchBody = branch.slice(0, branchEnd);
assert.match(branchBody, /finish\(\{status:'completed'/, "a successful apply finishes the claimed run completed");
assert.ok(branchBody.indexOf("trackedConditionalSave") < branchBody.indexOf("status:'resolved'"),
  "the review only resolves after the conditional write is verified");

// No write to Smartsheet happens in this branch — the remote already holds the value.
assert.doesNotMatch(branchBody, /push\(/, "adopting the remote task must not re-push to Smartsheet");

console.log(`Sales held-task review apply: ${checks + 4}/${checks + 4} PASS.`);
