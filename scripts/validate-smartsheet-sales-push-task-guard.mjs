import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCells } from '../base44/shared/smartsheetSyncFields.ts';
import { planFieldPush } from '../base44/shared/smartsheetFieldMerge.ts';
import { guardSalesPushTaskPlan } from '../base44/shared/smartsheetSalesPushTaskGuard.mjs';
import { salesSnapshotsEqual } from '../base44/shared/smartsheetSalesSafety.mjs';

let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const taskId = '4783818077955972';
const amountId = '5655853885876100';
const bindings = {current_task_description:taskId, estimate_amount:amountId};
const base = {
  id:'synthetic-wo-push',in_pipeline:true,sales_status:'lead',
  current_task_description:'Complete Estimate for Review',estimate_amount:125,
  smartsheet_sheet_id:'8702703019812740',smartsheet_row_id:'90001',
  smartsheet_last_synced_at:'2026-10-09T12:00:00.000Z',
  smartsheet_sync_snapshot:{[taskId]:'Complete Estimate for Review',[amountId]:100},
  updated_date:'2026-10-09T13:00:00.000Z',
};
const fakeBase44 = {asServiceRole:{entities:{}}};
async function buildPlan(record, remoteTask, remoteEstimate, salesReviews=[]) {
  const row = {
    id: record.smartsheet_row_id,
    cells:[
      {column_id:taskId,value:remoteTask,display_value:remoteTask},
      {column_id:amountId,value:remoteEstimate,display_value:String(remoteEstimate)},
    ],
  };
  const rawSheet = {
    columns:[{id:Number(taskId),title:'Current Task'},{id:Number(amountId),title:'Estimate Amount'}],
    rows:[{id:row.id,cells:[
      {columnId:Number(taskId),value:remoteTask,displayValue:remoteTask},
      {columnId:Number(amountId),value:remoteEstimate,displayValue:String(remoteEstimate)},
    ]}],
  };
  const original = await planFieldPush({
    base44:fakeBase44,record,dataset:'sales',bindings,
    remoteRow:row,rawSheet,cells:buildCells(record,bindings,'sales'),
    salesReviews,queueSalesReview:()=>{},
  });
  return {original,guarded:guardSalesPushTaskPlan(record,original,bindings)};
}

// Real planner: local estimate changed, remote Task Description moved into Quoted.
// Reverse push used to accept remote task, keeping status Lead.
const conflict = await buildPlan(base,'Estimate Sent to Customer',100);
check(Object.hasOwn(conflict.original.incoming,'current_task_description'),
  'Baseline reproduces remote task silently entering Base44 without a stage update.');
check(conflict.original.outgoing.some(cell=>String(cell.columnId)===amountId),
  'Local estimate can still be planned for Smartsheet push.');
check(!Object.hasOwn(conflict.guarded.incoming,'current_task_description'),
  'Protected task is never included in Base44 bulk reconciliation.');
check(conflict.guarded.outgoing.some(cell=>String(cell.columnId)===amountId),
  'Unrelated outgoing estimate remains eligible to push.');
equal(conflict.guarded.remote[taskId],base.smartsheet_sync_snapshot[taskId],
  'Held task does not advance snapshot to the unapproved remote status.');
check(conflict.guarded.unresolved.includes('current_task_description'),
  'Task mismatch enters review instead of silently marking sync complete.');
check(conflict.guarded.taskStageHeld===true,'Mismatch identified explicitly.');
const candidateSnapshot = {
  ...conflict.guarded.remote,
  ...Object.fromEntries(conflict.guarded.outgoing.map(cell => [String(cell.columnId),cell.value])),
};
equal(candidateSnapshot[taskId],base.smartsheet_sync_snapshot[taskId],
  'Persistable partial snapshot preserves previously verified task value.');
const remoteAfterSafeEstimate = {[taskId]:'Estimate Sent to Customer',[amountId]:125};
const remoteVerifyOnly = Object.fromEntries(Object.entries(candidateSnapshot).filter(([column])=>column!==taskId));
check(salesSnapshotsEqual(remoteVerifyOnly,remoteAfterSafeEstimate),
  'A safely pushed estimate can verify without declaring the conflicting task synchronized.');
check(!salesSnapshotsEqual(candidateSnapshot,remoteAfterSafeEstimate),
  'Never compare the held task as if it had been reconciled remotely.');

// The opposite direction is equally important: a locally inconsistent task
// must not be pushed to Smartsheet as if it were an approved stage.
const inconsistentLocal = {
  ...base,current_task_description:'Estimate Sent to Customer',
  smartsheet_sync_snapshot:{...base.smartsheet_sync_snapshot},
};
const outgoing = await buildPlan(inconsistentLocal,'Complete Estimate for Review',100);
check(outgoing.original.outgoing.some(cell=>String(cell.columnId)===taskId),
  'Pre-fix reverse push would transmit locally mismatched Quoted task.');
check(!outgoing.guarded.outgoing.some(cell=>String(cell.columnId)===taskId),
  'Local task conflicting with Lead status is not pushed.');
check(outgoing.guarded.taskStageHeld,'Locally inconsistent task requires review.');

const sameStage = await buildPlan(base,'Conduct Site Survey',100);
equal(sameStage.guarded.incoming.current_task_description,'Conduct Site Survey',
  'Remote task in same Lead stage remains valid.');
check(!sameStage.guarded.taskStageHeld,'Safe same-stage tasks are not held.');
const mappedWon = {
  ...base,sales_status:'won',current_task_description:'WIP - Designing',
  smartsheet_sync_snapshot:{...base.smartsheet_sync_snapshot,[taskId]:'WIP - Designing'},
};
const wonOperation = await buildPlan(mappedWon,'WIP - Installation',100);
check(!wonOperation.guarded.taskStageHeld,
  'Already-approved Won can continue within Won operational tasks.');
const terminal = await buildPlan(base,'Lost',100);
check(terminal.guarded.taskStageHeld,'Lost requires protected confirmation even when remote wins.');
const neutral = await buildPlan(base,'Closed - Did not Lose',100);
check(neutral.guarded.taskStageHeld,'Neutral close must not be inferred by reverse push.');
const unknown = await buildPlan(base,'Unmapped Workflow',100);
check(unknown.guarded.taskStageHeld,'Unknown tasks cannot contradict supported stage catalog.');
const legacy = {...base,current_task_description:'Completed Sale',
  smartsheet_sync_snapshot:{...base.smartsheet_sync_snapshot,[taskId]:'Completed Sale'}};
const legacyChange = await buildPlan(legacy,'Conduct Site Survey',100);
check(legacyChange.guarded.taskStageHeld,'Historical terminal Smartsheet shell cannot be silently reopened.');
const historical = await buildPlan({...base,in_pipeline:false},'Lost',100);
check(!historical.guarded.taskStageHeld,'Legacy non-pipeline rows are not promoted to modern outcomes.');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
check(backend.includes('fieldPlan = guardSalesPushTaskPlan(record, fieldPlan, bindings)'),
  'Live backend invokes guard immediately after the push field planner.');
check(backend.includes('queuedSalesReviews.push(...taskReviews.map('),
  'Held task is inserted into existing Sales admin review workflow.');
check(backend.includes("if (dataset !== 'orders' && !fieldPlan.unresolved.length) deferredConflictRecordIds.push(record.id)"),
  'Other field success does not resolve held Sales task review.');
check(backend.includes("fieldPlan.decisions?.length && !fieldPlan.taskStageHeld"),
  'Approved field decisions are not auto-resolved during protected task holds.');
check(backend.includes("dataset === 'sales' && fieldPlan.taskStageHeld") &&
  backend.includes("? {} : { smartsheet_last_synced_at: new Date().toISOString() }"),
  'Held Sales task cannot advance the full-sync timestamp.');
check(backend.includes('const verifiedRemoteColumns = fieldPlan.taskStageHeld') &&
  backend.includes('columnId !== String(bindings.current_task_description)'),
  'A held task is excluded only from remote read-back of unrelated safe columns.');
console.log('Sales reverse Smartsheet task/status safety: '+checks+'/'+checks+' PASS.');
