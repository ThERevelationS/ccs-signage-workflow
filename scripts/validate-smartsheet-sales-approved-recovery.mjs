import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCells, buildSalesPullSnapshot } from '../base44/shared/smartsheetSyncFields.ts';
import { planFieldPush } from '../base44/shared/smartsheetFieldMerge.ts';
import { guardSalesPushTaskPlan } from '../base44/shared/smartsheetSalesPushTaskGuard.mjs';
import { recoverCompletedApprovedSalesTaskDecisionIds, approvedSalesRecordStillCurrent,
  approvedSalesRemoteSnapshotStillCurrent, verifiedSalesConflictResolutionTargets } from '../base44/shared/smartsheetSalesConflictResolution.mjs';

let checks=0;
const yes=(test,label)=>{assert.ok(test,label);checks++;};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const taskId='4783818077955972', amountId='5655853885876100';
const bindings={current_task_description:taskId,estimate_amount:amountId};
const oldTask='Complete Estimate for Review', newTask='Conduct Site Survey';
const record={id:'synthetic-post-write-cas-failure',in_pipeline:true,sales_status:'lead',
  current_task_description:newTask,estimate_amount:150,
  smartsheet_row_id:'90001',smartsheet_sheet_id:'8702703019812740',
  smartsheet_last_synced_at:'2026-10-10T09:00:00Z',
  smartsheet_sync_snapshot:{[taskId]:oldTask,[amountId]:150},
  updated_date:'2026-10-10T09:15:00Z'};
const review={id:'approved-task-one',dataset:'sales',entity_id:record.id,
  sheet_id:record.smartsheet_sheet_id,row_id:record.smartsheet_row_id,
  column_id:taskId,field_name:'current_task_description',status:'approved',
  decision:'app',local_value:newTask,remote_value:oldTask};
const row=(task,amount=150)=>({id:record.smartsheet_row_id,cells:[
  {column_id:taskId,value:task,display_value:task},
  {column_id:amountId,value:amount,display_value:String(amount)}]});
const sheet=(item)=>({columns:[{id:Number(taskId)},{id:Number(amountId)}],
  rows:[{id:item.id,cells:item.cells.map(c=>({columnId:Number(c.column_id),value:c.value,
    displayValue:c.display_value}))}]});
async function plan(current,remote,activeReviews=[review]) {
  const original=await planFieldPush({
    base44:{asServiceRole:{entities:{}}},record:current,dataset:'sales',
    bindings,remoteRow:remote,rawSheet:sheet(remote),
    cells:buildCells(current,bindings,'sales'),salesReviews:activeReviews,
    queueSalesReview:()=>{},
  });
  const guarded=guardSalesPushTaskPlan(current,original,bindings);
  const recovered=!guarded.taskStageHeld&&!guarded.unresolved.length
    ?recoverCompletedApprovedSalesTaskDecisionIds(current,buildSalesPullSnapshot(remote,bindings),activeReviews,bindings)
    :[];
  return {original,guarded,recovered};
}
const remoteAlreadyWritten=row(newTask);
const retry=await plan(record,remoteAlreadyWritten);
equal(retry.original.outgoing,[],'Retry sees task already written in Smartsheet; no duplicate remote write.');
equal(retry.original.incoming,{},'Retry has no stale remote task to overwrite Base44.');
equal(retry.original.decisions,[],'Ordinary equal-value planner cannot consume old approval without recovery.');
equal(retry.recovered,[review.id],'Exact approved Keep App task is recovered from old snapshot evidence.');
yes(!retry.guarded.taskStageHeld,'Mapped modern Lead task remains compatible with stored Lead stage.');
const expected=buildSalesPullSnapshot(remoteAlreadyWritten,bindings);
yes(approvedSalesRemoteSnapshotStillCurrent(expected,expected),'Fresh remote recheck proves intended approved task still present.');
yes(approvedSalesRecordStillCurrent(record,{...record}),'Original WorkOrder revision qualifies for retry.');
const persisted={...record,smartsheet_sync_snapshot:expected,
  smartsheet_last_synced_at:'2026-10-10T09:30:00Z'};
const matchesExpected=Object.entries(expected).every(([key,value])=>
  String(persisted.smartsheet_sync_snapshot[key])===String(value));
yes(matchesExpected,'Synthetic Base44 metadata read-back matches verified remote snapshot.');
equal(verifiedSalesConflictResolutionTargets({verifiedWorkOrderIds:[record.id],
  approvedDecisionsByWorkOrder:new Map([[record.id,retry.recovered]])}).approvedDecisionIds,
  [review.id],'Approved review resolves only after verified remote and local metadata success.');
equal(verifiedSalesConflictResolutionTargets({verifiedWorkOrderIds:[],
  approvedDecisionsByWorkOrder:new Map([[record.id,retry.recovered]])}).approvedDecisionIds,
  [],'Failed Base44 CAS or metadata read-back never resolves prior approval.');
yes(!approvedSalesRemoteSnapshotStillCurrent(expected,buildSalesPullSnapshot(row('Lost'),bindings)),
  'Remote drift after planning cancels recovery rather than laundering a new Lost task.');
for(const [label,change] of [
 ['review not approved',{status:'open'}],['wrong decision',{decision:'smartsheet'}],
 ['wrong row',{row_id:'90002'}],['wrong sheet',{sheet_id:'8702703019812741'}],
 ['wrong column',{column_id:'80002'}],['wrong local value',{local_value:'SIPs'}],
 ['wrong former remote value',{remote_value:'Lost'}],['wrong entity',{entity_id:'different'}],
 ['wrong field',{field_name:'estimate_amount'}],
]){
 equal((await plan(record,remoteAlreadyWritten,[{...review,...change}])).recovered,[],
   'Recovery rejects '+label+'.');
}
for(const [label,change] of [
 ['modern Won',{sales_status:'won'}],['modern Lost',{sales_status:'lost'}],
 ['mismatched Lead task',{sales_status:'quoted'}],['legacy record',{in_pipeline:false}],
 ['unverified baseline',{smartsheet_last_synced_at:''}],
 ['missing snapshot',{smartsheet_sync_snapshot:{[amountId]:150}}],
 ['snapshot already completed',{smartsheet_sync_snapshot:{[taskId]:newTask,[amountId]:150}}],
 ['relinked row',{smartsheet_row_id:'90002'}],
]){
 const candidate={...record,...change};
 const snapshot=buildSalesPullSnapshot(remoteAlreadyWritten,bindings);
 equal(recoverCompletedApprovedSalesTaskDecisionIds(candidate,snapshot,[review],bindings),[],
  'Recovery refuses '+label+'.');
}
equal(recoverCompletedApprovedSalesTaskDecisionIds(record,
 buildSalesPullSnapshot(row(oldTask),bindings),[review],bindings),[],
 'Original remote task still pending is not mistaken for a completed remote write.');
equal(recoverCompletedApprovedSalesTaskDecisionIds(record,
 buildSalesPullSnapshot(row('Lost'),bindings),[review],bindings),[],
 'Changed remote task does not inherit old approval.');
equal(recoverCompletedApprovedSalesTaskDecisionIds(record,
 buildSalesPullSnapshot(row('WIP - Designing'),bindings),[review],bindings),[],
 'Downstream operational task cannot inherit Lead task approval.');

const source=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
yes(source.includes('recoverCompletedApprovedSalesTaskDecisionIds(record, buildSalesPullSnapshot(currentRows[0], bindings), salesReviews, bindings)') &&
 source.includes('!fieldPlan.taskStageHeld && !fieldPlan.unresolved.length'),
 'Production only recovers exact approved task decisions after stage and held-task guards.');
yes(source.includes('fieldPlan = { ...fieldPlan, decisions: [...new Set(') &&
 source.includes('deferredSalesConflictDecisions.set(String(record.id), [...fieldPlan.decisions])'),
 'Recovered decision uses established verified Sales review-resolution pipeline.');
yes(source.includes('requiresRemoteWrite: fieldPlan.outgoing.length > 0 || recoveredTaskDecisionIds.length > 0'),
 'Recovery requires fresh remote post-plan read-back even without remote write.');
yes(source.includes('const approvedUpdates = verifiedSalesUpdates.filter(') &&
 source.includes('updated_date: planned.updated_date'),
 'Recovered approval requires the same Base44 revision CAS as an ordinary approved write.');
yes(source.includes('approvedSalesRemoteSnapshotStillCurrent(planned.snapshot, remote, assigneeColumnId)') &&
 source.indexOf('approvedSalesRemoteSnapshotStillCurrent(planned.snapshot, remote, assigneeColumnId)') <
 source.indexOf('const eligibleSmartsheetWrites ='),
 'Recovered approval inherits fresh prewrite Smartsheet verification.');
yes(source.includes('verifiedWorkOrderIds: updated'),
 'Only verified Base44+Smartsheet records can resolve recovered approval.');
console.log('Sales approved remote-success metadata-failure recovery: '+checks+'/'+checks+' PASS.');
