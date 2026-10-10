import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCells } from '../base44/shared/smartsheetSyncFields.ts';
import { planFieldPush } from '../base44/shared/smartsheetFieldMerge.ts';
import { guardSalesPushTaskPlan } from '../base44/shared/smartsheetSalesPushTaskGuard.mjs';
import { verifiedSalesConflictResolutionTargets } from '../base44/shared/smartsheetSalesConflictResolution.mjs';
import { persistSalesReviews } from '../base44/shared/smartsheetSalesReviewPersistence.ts';

let checks=0;
const same=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const check=(value,label)=>{assert.ok(value,label);checks++};
const taskColumn='4783818077955972';
const amountColumn='5655853885876100';
const bindings={current_task_description:taskColumn,estimate_amount:amountColumn};
const base={id:'synthetic-wo-1',in_pipeline:true,sales_status:'lead',
  current_task_description:'Conduct Site Survey',estimate_amount:150,
  smartsheet_sheet_id:'8702703019812740',smartsheet_row_id:'90001',
  smartsheet_last_synced_at:'2026-10-09T12:00:00.000Z',
  smartsheet_sync_snapshot:{[taskColumn]:'Complete Estimate for Review',[amountColumn]:100},
  updated_date:'2026-10-10T12:00:00.000Z'};
function input(record,task,amount) {
  const row={id:record.smartsheet_row_id,cells:[
    {column_id:taskColumn,value:task,display_value:task},
    {column_id:amountColumn,value:amount,display_value:String(amount)},
  ]};
  const sheet={columns:[{id:Number(taskColumn)},{id:Number(amountColumn)}],
    rows:[{id:row.id,cells:[
      {columnId:Number(taskColumn),value:task,displayValue:task},
      {columnId:Number(amountColumn),value:amount,displayValue:String(amount)},
    ]}]};
  return {row,sheet};
}
async function plan(record,remoteTask,remoteAmount,reviews=[]) {
  const {row,sheet}=input(record,remoteTask,remoteAmount);
  const raw=await planFieldPush({base44:{asServiceRole:{entities:{}}},record,
    dataset:'sales',bindings,remoteRow:row,rawSheet:sheet,cells:buildCells(record,bindings,'sales'),
    salesReviews:reviews,queueSalesReview:()=>{}});
  return {raw,protected:guardSalesPushTaskPlan(record,raw,bindings)};
}
const approvedApp={id:'approval-app',dataset:'sales',entity_id:base.id,
  column_id:taskColumn,field_name:'current_task_description',
  status:'approved',decision:'app',local_value:'Conduct Site Survey',
  remote_value:'Complete Estimate for Review'};
const approvedRemote={...approvedApp,id:'approval-remote',decision:'smartsheet'};
const appDecision=await plan(base,'Complete Estimate for Review',100,[approvedApp]);
same(appDecision.raw.decisions,['approval-app'],'Actual planner consumes matching approved task review.');
check(appDecision.protected.outgoing.some(cell=>String(cell.columnId)===taskColumn),
  'Approved Keep App requests a remote task write without changing the Sales stage.');
check(!appDecision.protected.taskStageHeld,
  'A mapped same-stage approval is eligible only through the normal verified write/read-back path.');
const remoteDecision=await plan(base,'Complete Estimate for Review',100,[approvedRemote]);
same(remoteDecision.raw.decisions,['approval-remote'],
  'Approved Keep Smartsheet is recognized for the same exact task values.');
same(remoteDecision.protected.incoming.current_task_description,'Complete Estimate for Review',
  'Approved compatible remote task can be applied without stage movement.');
check(!remoteDecision.protected.taskStageHeld,'Same-stage remote approval does not need terminal confirmation.');

const incompatible={...base,sales_status:'quoted',current_task_description:'Estimate Sent to Customer'};
const terminal={...approvedApp,id:'approval-unsafe',entity_id:incompatible.id,
  local_value:'Estimate Sent to Customer',remote_value:'Lost',decision:'smartsheet'};
const guarded=await plan(incompatible,'Lost',100,[terminal]);
same(guarded.raw.decisions,['approval-unsafe'],
  'A previously approved incompatible terminal task is recognized but NOT authorization to bypass Sales guards.');
check(guarded.protected.taskStageHeld,'Task-stage guard blocks approved Lost without Sales closeout.');
check(!Object.hasOwn(guarded.protected.incoming,'current_task_description'),
  'Approved incompatible task is removed from outgoing Base44 business update.');
check(guarded.protected.unresolved.includes('current_task_description'),
  'The terminal approval retains an unresolved review.');
same(guarded.protected.remote[taskColumn],incompatible.smartsheet_sync_snapshot[taskColumn],
  'Blocked approved task cannot launder the verified snapshot.');

const proposed=new Map([
  ['synthetic-wo-1',['approval-app','approval-other']],
  ['synthetic-wo-failed',['approval-failed']],
  ['synthetic-wo-held',['approval-unsafe']],
  ['synthetic-wo-later',['approval-later']],
]);
const unresolvedIds=['synthetic-wo-1','synthetic-wo-failed','synthetic-wo-held','synthetic-wo-later'];
const verified=verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds:['synthetic-wo-1','synthetic-wo-later','synthetic-wo-1'],
  approvedDecisionsByWorkOrder:proposed,
  openReviewWorkOrderIds:unresolvedIds,
});
same(verified.approvedDecisionIds,['approval-app','approval-other','approval-later'],
  'Only independently verified WorkOrders can resolve approved review IDs.');
same(verified.openReviewWorkOrderIds,['synthetic-wo-1','synthetic-wo-later'],
  'Open field reviews also require verified WorkOrder sync metadata.');
const failed=verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds:[],approvedDecisionsByWorkOrder:proposed,openReviewWorkOrderIds:unresolvedIds,
});
same(failed,{approvedDecisionIds:[],openReviewWorkOrderIds:[]},
  'Failed read-back or missing Base44 metadata leaves every approval and open review pending.');
const heldTargets=verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds:['synthetic-wo-1'],approvedDecisionsByWorkOrder:new Map(),
  openReviewWorkOrderIds:[],
});
same(heldTargets,{approvedDecisionIds:[],openReviewWorkOrderIds:[]},
  'Safely reconciled unrelated fields cannot resolve an approved held-task review.');
const dedup=verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds:['synthetic-wo-1'],approvedDecisionsByWorkOrder:new Map([
    ['synthetic-wo-1',['approval-app','approval-app','']],
    ['other',['approval-other']],
  ]),openReviewWorkOrderIds:['synthetic-wo-1','synthetic-wo-1',''],
});
same(dedup,{approvedDecisionIds:['approval-app'],openReviewWorkOrderIds:['synthetic-wo-1']},
  'A batch resolves each verified review once and ignores unknown/empty identifiers.');

const storage=[structuredClone(approvedApp)];
let reviewWrites=0;
const reviewEntity={
  async bulkUpdate(updates) {reviewWrites++; for (const update of updates) {
    const target=storage.find(r=>r.id===update.id);if(target)Object.assign(target,update);
  }},
  async upsert(additions) {reviewWrites++;storage.push(...additions);},
};
const fakeBase44={asServiceRole:{entities:{SyncConflict:reviewEntity}}};
await persistSalesReviews(fakeBase44,[{...approvedApp,status:'open'}],null,storage);
same(storage[0].status,'approved','Repeated identical held task review preserves its human approval.');
same(reviewWrites,0,'An identical approved review is not redundantly rewritten or recreated.');
const updatedReview={...approvedApp,remote_value:'Lost',id:'new-review',status:'open'};
await persistSalesReviews(fakeBase44,[updatedReview],null,storage);
same(storage[0].status,'superseded','Changed remote task invalidates the old value-specific approval.');
check(storage.some(r=>r.remote_value==='Lost'&&r.status==='open'),
  'A new remote task value creates a fresh review rather than recycling the old approval.');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
check(backend.includes('deferredSalesConflictDecisions = new Map<string, string[]>()') &&
  backend.includes('deferredSalesConflictDecisions.set(String(record.id), [...fieldPlan.decisions])'),
  'Production batches retain approved Sales reviews by their owning WorkOrder.');
check(backend.includes('verifiedSalesConflictResolutionTargets({') &&
  backend.includes('verifiedWorkOrderIds: updated'),
  'Production finalization uses only independently verified reconciliation success IDs.');
check(backend.includes('verifiedTargets.approvedDecisionIds') &&
  backend.includes('verifiedTargets.openReviewWorkOrderIds'),
  'Both approved and open Sales reviews are gated on verified outcomes.');
check(backend.includes('if (fieldPlan.decisions?.length && !fieldPlan.taskStageHeld)') &&
  backend.includes('if (dataset !== \'orders\' && !fieldPlan.unresolved.length) deferredConflictRecordIds.push(record.id)'),
  'Held task reviews are excluded even when other fields on the same row succeed.');
check(backend.includes('if (failedMetadataIds.has(recordId))') &&
  backend.includes('updated.push(recordId);'),
  'Success IDs require verified Base44 metadata read-back and exclude failures.');
check(!backend.includes('deferredConflictDecisions.push('),
  'No unscoped flat Sales approved-review IDs remain to be prematurely resolved.');
console.log('Sales approved Task review verification-gated reconciliation: '+checks+'/'+checks+' PASS.');
