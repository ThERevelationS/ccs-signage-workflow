import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSalesFieldPull, guardSalesPulledTaskTransition, salesStageSnapshotRecoveryNeedsReview, hasUnverifiedSalesStageChangeSinceSync } from '../base44/shared/smartsheetSalesPullPlan.ts';
import { buildCells } from '../base44/shared/smartsheetSyncFields.ts';
import { planFieldPush } from '../base44/shared/smartsheetFieldMerge.ts';
import { guardSalesPushTaskPlan } from '../base44/shared/smartsheetSalesPushTaskGuard.mjs';

let checks=0;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const check=(v,label)=>{assert.ok(v,label);checks++};
const taskColumn='4783818077955972',amountColumn='5655853885876100';
const bindings={current_task_description:taskColumn,estimate_amount:amountColumn};
const before={
  id:'synthetic-post-repair-wo',in_pipeline:true,sales_status:'lead',
  current_task_description:'Estimate Sent to Customer',
  estimate_amount:100,smartsheet_sheet_id:'8702703019812740',smartsheet_row_id:'90001',
  smartsheet_sync_snapshot:{[taskColumn]:'Estimate Sent to Customer',[amountColumn]:100},
  smartsheet_last_synced_at:'2026-10-09T15:00:00.000Z',
  updated_date:'2026-10-09T15:00:00.000Z',
};
const corrected={
  ...before,sales_status:'quoted',
  sales_last_activity_at:'2026-10-10T11:20:00.000Z',
  sales_stage_changed_at:'2026-10-10T11:20:00.000Z',
  updated_date:'2026-10-10T11:20:01.000Z',
};
const restored={
  ...corrected,
  updated_date:'2026-10-10T11:20:12.000Z',
};
const remote={current_task_description:'Conduct Site Survey',estimate_amount:150};
function pulled(record,incoming=remote) {
  const snapshot={[taskColumn]:incoming.current_task_description,[amountColumn]:incoming.estimate_amount};
  const rawPlan=planSalesFieldPull(record,incoming,snapshot,bindings);
  const guarded=guardSalesPulledTaskTransition(record,incoming,rawPlan,bindings);
  return {rawPlan,guarded,snapshot};
}
check(!salesStageSnapshotRecoveryNeedsReview(restored,bindings),
  'Before fix: existing incomplete-stage-snapshot guard cannot detect status-only correction because task matches baseline.');
check(hasUnverifiedSalesStageChangeSinceSync(restored),
  'A real stage change newer than the last verified Smartsheet sync remains awaiting reconciliation.');
const risky=pulled(restored);
equal(risky.rawPlan.fields.current_task_description,'Conduct Site Survey',
  'Reproduce: ordinary field merger favors newly changed Smartsheet Lead task over locally unchanged snapshot.');
equal(risky.guarded.stageTransition,null,
  'Smartsheet must NOT auto-revert verified Quoted to Lead while stage correction awaits sync.');
check(!Object.hasOwn(risky.guarded.fields,'current_task_description'),
  'Stale remote task cannot overwrite the approved Quoted task.');
check(risky.guarded.held.includes('current_task_description'),'Task conflict enters existing admin review.');
equal(risky.guarded.snapshot[taskColumn],before.smartsheet_sync_snapshot[taskColumn],
  'Held task retains previously verified snapshot evidence.');
equal(risky.guarded.fields.estimate_amount,150,
  'Unrelated incoming estimate remains eligible to reconcile.');
equal(restored.sales_status,'quoted','A pull plan never directly mutates saved Sales status.');
equal(restored.current_task_description,'Estimate Sent to Customer',
  'The approved same-task text is preserved.');

const activeNewerSync={...restored,smartsheet_last_synced_at:'2026-10-10T11:25:00.000Z'};
check(!hasUnverifiedSalesStageChangeSinceSync(activeNewerSync),
  'After genuine sync verification, an older stage stamp no longer suppresses normal nonterminal transitions.');
equal(pulled(activeNewerSync).guarded.stageTransition,{from:'quoted',to:'lead'},
  'A verified subsequent remote task can still use the existing guarded nonterminal transition.');
const equalTime={...restored,smartsheet_last_synced_at:restored.sales_stage_changed_at};
check(!hasUnverifiedSalesStageChangeSinceSync(equalTime),
  'Equal authenticated stage/sync stamps do not imply an unsynchronized stage.');
equal(pulled(equalTime).guarded.stageTransition,{from:'quoted',to:'lead'},
  'Equal stage/sync timestamps are treated as synchronized.');
check(!hasUnverifiedSalesStageChangeSinceSync({...restored,sales_stage_changed_at:''}),
  'Missing stage history cannot manufacture a pending stage change.');
check(hasUnverifiedSalesStageChangeSinceSync({...restored,smartsheet_last_synced_at:''}),
  'Known stage change with missing sync timestamp must not be auto-reversed.');
check(hasUnverifiedSalesStageChangeSinceSync({...restored,smartsheet_last_synced_at:'unknown'}),
  'Malformed sync timestamps cannot authorize a reverse stage transition.');
check(!hasUnverifiedSalesStageChangeSinceSync({...restored,in_pipeline:false}),
  'Non-pipeline records remain outside modern stage authority.');

const sameStage=pulled(restored,{current_task_description:'Waiting on Deposit',estimate_amount:150});
equal(sameStage.guarded.stageTransition,null,
  'Same-stage task changes do not create a stage transition.');
equal(sameStage.guarded.fields.current_task_description,'Waiting on Deposit',
  'A Quoted-to-Quoted task change can still pull despite a pending local stage stamp.');
check(!sameStage.guarded.held.includes('current_task_description'),
  'Same-stage incoming task is not unnecessarily escalated.');

const asSheetRow=(task,amount)=>({
 id:restored.smartsheet_row_id,
 cells:[{column_id:taskColumn,value:task,display_value:task},
        {column_id:amountColumn,value:amount,display_value:String(amount)}],
});
const remoteRow=asSheetRow('Conduct Site Survey',150);
const rawSheet={
 columns:[{id:Number(taskColumn),title:'Current Task'},{id:Number(amountColumn),title:'Estimate Amount'}],
 rows:[{id:remoteRow.id,cells:[
  {columnId:Number(taskColumn),value:'Conduct Site Survey',displayValue:'Conduct Site Survey'},
  {columnId:Number(amountColumn),value:150,displayValue:'150'},
 ]}],
};
const reverse=await planFieldPush({base44:{asServiceRole:{entities:{}}},record:restored,
 dataset:'sales',bindings,remoteRow,rawSheet,cells:buildCells(restored,bindings,'sales'),
 salesReviews:[],queueSalesReview:()=>{}});
const protectedReverse=guardSalesPushTaskPlan(restored,reverse,bindings);
check(protectedReverse.taskStageHeld,'Reverse push guard already refuses the incompatible remote Lead task.');
check(!Object.hasOwn(protectedReverse.incoming,'current_task_description'),
  'Reverse push cannot overwrite Quoted after stage-only correction.');
equal(protectedReverse.incoming.estimate_amount,150,
  'Reverse push keeps the independently safe Estimate Amount pull while holding the task.');
equal(protectedReverse.remote[taskColumn],before.smartsheet_sync_snapshot[taskColumn],
  'Reverse push does not falsely advance the task baseline.');
check(protectedReverse.unresolved.includes('current_task_description'),
  'Reverse push defers just the unsafe task to existing review.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
check(backend.includes('guardSalesPulledTaskTransition(existing, fieldValues') &&
 backend.includes('planSalesFieldPull(existing, fieldValues, salesRemoteSnapshot, bindings)'),
 'Live sync invokes the protected pull planner before accepting business changes.');
check(backend.includes('guardSalesPushTaskPlan(record, fieldPlan, bindings)'),
 'Live sync invokes the protected reverse push guard.');
check(backend.includes('buildSalesPullReviews(existing') &&
 backend.includes('salesPullReviews.push(...'),
 'Pulled task conflicts use the existing administrative review channel.');
console.log('Sales post-repair Smartsheet stage rollback guard: '+checks+'/'+checks+' PASS.');
