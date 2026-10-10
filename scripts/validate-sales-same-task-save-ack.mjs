import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySalesTaskStatusAudit } from '../base44/shared/salesTaskStatusAudit.mjs';
import { canKeepLocallyResolvedSalesReview, keepLocallyResolvedSalesReviewDetails } from '../src/components/sales/salesReviewQueueExit.mjs';
import { guardSalesPushTaskPlan } from '../base44/shared/smartsheetSalesPushTaskGuard.mjs';
import { planExistingSalesTaskStatusReconciliation, untouchedSalesTransitionGuards } from '../src/components/sales/salesTaskStageMapping.mjs';

let checks=0;
const same=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const ok=(condition,label)=>{assert.ok(condition,label);checks++};
const taskCol='4783818077955972';
const before={id:'synthetic-h',in_pipeline:true,sales_status:'lead',
  current_task_description:'Estimate Sent to Customer',
  updated_date:'2026-10-10T10:00:00Z',
  smartsheet_sync_snapshot:{[taskCol]:'Estimate Sent to Customer'},
  smartsheet_sheet_id:'8702703019812740',smartsheet_row_id:'9001',
  sales_stage_changed_at:'',sales_last_activity_at:''};
const desired=planExistingSalesTaskStatusReconciliation(before);
same(desired?.status,'quoted','Existing task specifies the intended Quoted status.');
const patch={sales_status:'quoted',sales_stage_changed_at:'2026-10-10T11:01:00Z',
  sales_last_activity_at:'2026-10-10T11:01:00Z'};
const after={...before,...patch,updated_date:'2026-10-10T11:01:01Z'};
same(classifySalesTaskStatusAudit(before).kind,'modern_review','Persisted unsaved baseline still needs review.');
same(classifySalesTaskStatusAudit(after).kind,'none','Verified patch resolves mismatch.');
same(untouchedSalesTransitionGuards({
  sales_status:'lead',in_pipeline:true,current_task_description:before.current_task_description,
},patch),{in_pipeline:true,current_task_description:before.current_task_description},
'Unmodified task stays a guard during status-only CAS save.');

function syntheticUI({failure=false,remoteUpdate=null}={}) {
  const status={workOrders:[{...before}],selected:{...before},pending:new Set(),failed:new Map(),exit:null,pins:{},history:[],needsSync:false};
  const queue=()=>status.workOrders.filter(row=>classifySalesTaskStatusAudit(row).kind==='modern_review');
  const begin=()=>{status.pending.add(before.id);};
  const reload=()=>{if(remoteUpdate)status.workOrders=[{...remoteUpdate}];};
  const fail=()=>{status.failed.set(before.id,'The record no longer matches its loaded state.');};
  const succeed=()=>{
    status.pending.delete(before.id);status.failed.delete(before.id);
    status.exit=canKeepLocallyResolvedSalesReview({selectedId:before.id,workOrderBefore:before,workOrderAfter:after,attentionFilter:'task_status_review'})
      ? {id:before.id,filterKey:'review'}:null;
    // Production UI applies only fields confirmed by the WorkOrder save.
    const confirmed=Object.fromEntries(Object.keys(patch).map(field=>[field,after[field]]));
    status.workOrders=status.workOrders.map(row=>({...row,...confirmed,updated_date:after.updated_date}));
    status.selected={...status.selected,...confirmed,updated_date:after.updated_date};
    status.history.push('sales_status');status.needsSync=true;
  };
  const recover=()=>{status.pending.clear();status.failed.clear();status.exit=null;status.workOrders=[{...remoteUpdate||before}];};
  return {status,queue,begin,reload,fail,succeed,recover};
}
const failed=syntheticUI();
failed.begin();
same(failed.queue().length,1,'Pending correction must keep warning in review queue.');
same(failed.status.selected.sales_status,'lead','Pending correction displays stored status, not optimistic Quoted.');
failed.fail();
same(failed.queue().length,1,'Failed CAS retains mismatch in queue.');
same(failed.status.selected.sales_status,'lead','Failed CAS does not fabricate Quoted status.');
same(failed.status.failed.get(before.id),'The record no longer matches its loaded state.',
  'Failed CAS provides an actionable status-specific error.');
same(failed.status.history.length,0,'Failed CAS creates no successful sales-history event.');
same(failed.status.needsSync,false,'Failed CAS cannot be marked ready to sync.');
failed.recover();
same(failed.status.pending.size,0,'Recovery clears the stale pending correction.');
same(failed.queue().length,1,'Reloading unchanged server state still displays mismatch.');

const successful=syntheticUI();
successful.begin();
successful.succeed();
same(successful.queue().length,0,'Verified status save removes resolved item from review queue.');
same(successful.status.selected.sales_status,'quoted','Verified saved status is displayed in detail.');
same(successful.status.selected.current_task_description,before.current_task_description,
  'Existing task text remains unchanged after save.');
same(successful.status.selected.sales_stage_changed_at,patch.sales_stage_changed_at,
  'Actual saved stage stamp is retained.');
same(successful.status.history,['sales_status'],'Synthetic user history is only produced after a save.');
ok(successful.status.needsSync,'Successful status correction is queued for Smartsheet sync.');
ok(keepLocallyResolvedSalesReviewDetails({
 selectedId:before.id,exit:successful.status.exit,filterKey:'review',latestRow:successful.status.selected,
}),'Open details can remain after saved review item exits filtered queue.');

const remotePlan={outgoing:[],incoming:{current_task_description:'Lost'},remote:{[taskCol]:'Lost'},unresolved:[]};
const held=guardSalesPushTaskPlan(after,remotePlan,{current_task_description:taskCol});
ok(held.taskStageHeld,'Smartsheet cannot replace verified Quoted task with unapproved Lost text.');
ok(!Object.hasOwn(held.incoming,'current_task_description'),
  'Incoming conflicting remote task is omitted from Base44 bulk update.');
same(held.remote[taskCol],before.smartsheet_sync_snapshot[taskCol],
  'Held conflict preserves task snapshot baseline rather than laundering mismatch.');
const safeRemote=guardSalesPushTaskPlan(after,
 {outgoing:[],incoming:{current_task_description:'Waiting on Deposit'},
  remote:{[taskCol]:'Waiting on Deposit'},unresolved:[]},
 {current_task_description:taskCol});
ok(!safeRemote.taskStageHeld,'A same-Quoted-stage remote task remains reconcilable.');

const code=readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
const detail=readFileSync('src/components/sales/SalesOpportunityDialog.jsx','utf8');
ok(code.includes('pendingSameTaskRepairRef.current.add(orderId)') &&
   code.includes('pendingSameTaskRepairRef.current.delete(orderId)') &&
   code.includes('const verifiedRepairFields = verifiedSameTaskRepair'),
   'Production view tracks pending repair and applies only acknowledged fields.');
ok(code.includes('if (reconcileSameTask) {\n      // Preserve the true review warning') &&
   code.includes('pendingSameTaskRepairRef.current.has(order.id)'),
   'Production same-task correction does not optimistically overwrite the original review row.');
ok(code.includes('pendingRecordScopesRef.current[id] === activeRecordScopeRef.current && !pendingSameTaskRepairRef.current.has(id)') &&
   code.includes('pendingRecordScopesRef.current[order.id] === scope && !pendingSameTaskRepairRef.current.has(order.id)'),
   'Realtime and reload paths do not inject unsaved reconciliation fields.');
ok(code.includes('if (!reconcileSameTask && selectedWorkOrder?.id === orderId') &&
   code.includes('if (verifiedSameTaskRepair && selectedWorkOrder?.id === orderId)'),
   'Queue-exit protection arms on acknowledged same-task save, not optimistic request.');
ok(code.includes('failedSameTaskRepairRef.current.set(orderId, saveError)') &&
   code.includes('failedSameTaskRepairRef.current.clear()'),
   'Failure is tracked by record and cleared only after success or explicit recovery.');
ok(code.includes('taskStatusCorrectionError={failedSameTaskRepairRef.current.get(selectedWorkOrder.id)') &&
   code.includes('onReloadAfterFailedTaskStatusCorrection={() => { setSelectedWorkOrder(null); discardPendingQuickEdits(); }}'),
   'Actual Opportunity Detail exposes failed correction and verified reload path.');
ok(detail.includes('role={taskStatusCorrectionError ? \'alert\' : \'status\'}') &&
   detail.includes('Discard unsaved changes and reload latest'),
   'Desktop/mobile detail includes accessible save state and recovery.');
ok(code.includes('await replaceWorkOrderFieldsIfUnchanged({') &&
   code.indexOf('await replaceWorkOrderFieldsIfUnchanged({') < code.indexOf('const verifiedSameTaskRepair = pendingSameTaskRepairRef.current.delete(orderId)'),
   'Review warning changes only after existing guarded save call.');
ok(code.includes('await Promise.all(Object.keys(changes)') &&
   code.indexOf('await Promise.all(Object.keys(changes)') < code.indexOf('const verifiedSameTaskRepair = pendingSameTaskRepairRef.current.delete(orderId)'),
   'Acknowledgment follows attempted CellHistory recording.');
console.log('Sales same-task correction acknowledged-save visibility: '+checks+'/'+checks+' PASS.');
