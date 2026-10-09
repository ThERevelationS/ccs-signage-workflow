import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialSmartsheetSalesStatus,
  shouldCreateSmartsheetSalesRecordInPipeline,
} from '../base44/shared/smartsheetSalesSafety.mjs';
import {
  planSalesFieldPull,
  guardSalesPulledTaskTransition,
} from '../base44/shared/smartsheetSalesPullPlan.ts';
import { mapSalesTaskToStage } from '../base44/shared/salesTaskStageCatalog.mjs';
import { buildNonterminalSalesPullPatch } from '../base44/shared/smartsheetSalesStageTransition.mjs';

let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };

const cases = [
  ['Prospect Initiation (Gather Info, Initial Discuss ...)',true,'lead'],
  ['Conduct Site Survey',true,'lead'],
  ['Complete Estimate for Review',true,'lead'],
  ['Estimate Sent to Customer',true,'quoted'],
  ['Waiting on Deposit',true,'quoted'],
  ['Follow up with Customer - Pre-Estimating',true,'follow_up'],
  ['Follow up with Customer - Post-Estimate',true,'follow_up'],
  ['On Hold - Follow Up with Customer',true,'on_hold'],
  ['SIPs',false,'lead'],
  ['WIP - Designing',false,'lead'],
  ['WIP - Installation',false,'lead'],
  ['Completed Sale',false,'lead'],
  ['Completed Sales - Post Invoice Tasks',false,'lead'],
  ['Lost',false,'lead'],
  ['Lost - We took too long',false,'lead'],
  ['Closed - Attempted Follow-up/No Response',false,'lead'],
  ['Closed - Did not Lose',false,'lead'],
  ['Prospect Initiation',true,'lead'], // Preserve existing historical active import alias behavior.
  ['',true,'lead'],
];
for (const [task, active, status] of cases) {
  const record = {client_name:'Sample Customer',current_task_description:task};
  equal(shouldCreateSmartsheetSalesRecordInPipeline(record),active,'Pipeline scope: '+task);
  equal(initialSmartsheetSalesStatus(record),status,'Initial status: '+task);
  if (['won','lost'].includes(mapSalesTaskToStage(task).status)) {
    check(status !== mapSalesTaskToStage(task).status,
      'Imported historical outcome is never marked modern Won/Lost: '+task);
  }
}
for (const customer of ['', 'Unknown']) {
  const record = {client_name:customer,current_task_description:'Estimate Sent to Customer'};
  equal(shouldCreateSmartsheetSalesRecordInPipeline(record),false,'Missing customer is outside pipeline');
  equal(initialSmartsheetSalesStatus(record),'lead','No outcome or Quoted claimed for missing customer');
}
for (const field of ['date_order_created','project_install_date','permit_receipt_confirmed_date','permit_approved_date','permit_number']) {
  const record = {client_name:'Customer',current_task_description:'Estimate Sent to Customer',[field]:'reviewed downstream evidence'};
  equal(shouldCreateSmartsheetSalesRecordInPipeline(record),false,'Downstream field excludes newly imported pipeline: '+field);
  equal(initialSmartsheetSalesStatus(record),'lead','Downstream field does not create a modern Quoted opportunity: '+field);
}

const id='4783818077955972';
const bindings={current_task_description:id};
const prior='Complete Estimate for Review';
const next='Estimate Sent to Customer';
const workOrder={
  id:'synthetic-existing',updated_date:'2026-10-09T13:00:00Z',
  in_pipeline:true,sales_status:'lead',current_task_description:prior,
  smartsheet_last_synced_at:'2026-10-09T13:00:00Z',
  smartsheet_sync_snapshot:{[id]:prior},
};
const plan=guardSalesPulledTaskTransition(workOrder,{current_task_description:next},
  planSalesFieldPull(workOrder,{current_task_description:next},{[id]:next},bindings),bindings);
equal(plan.stageTransition,{from:'lead',to:'quoted'},'Existing verified task selects atomic transition');
const prepared={id:workOrder.id,_existing:workOrder,_remoteSnapshot:plan.snapshot,
  _salesAssigneeNeedsReview:false,_salesStageTransition:plan.stageTransition,
  ...plan.fields};
equal(prepared._salesStageTransition,plan.stageTransition,'Queued WorkOrder carries transition marker');
const stageBatch=[prepared].filter(rec=>rec._salesStageTransition);
equal(stageBatch.length,1,'Transition candidate enters CAS stage batch');
const patch=buildNonterminalSalesPullPatch(workOrder,plan.fields,stageBatch[0]._salesStageTransition,
  '2026-10-09T17:00:00.000Z');
equal(patch.sales_status,'quoted','CAS uses the queued matching stage');
equal(patch.current_task_description,next,'CAS uses queued matching task');
check(!Object.hasOwn(workOrder,'sales_stage_changed_at') && !Object.hasOwn(workOrder,'sales_last_activity_at'),
  'Test never fabricates historical timestamps');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const newRecordBlock=backend.split("} else if (dataset === 'sales' && profile?.create_base44_from_smartsheet) {")[1]?.split('toCreate.push(newRecord);')[0] ?? '';
check(newRecordBlock.includes('newRecord.in_pipeline = shouldCreateSmartsheetSalesRecordInPipeline(newRecord)') &&
  newRecordBlock.includes('newRecord.sales_status = initialSmartsheetSalesStatus(newRecord)'),
  'Production import creates pipeline membership and task-based stage together');
check(!newRecordBlock.includes('newRecord.sales_stage_changed_at =') &&
  !newRecordBlock.includes('newRecord.sales_last_activity_at ='),
  'Production import does not forge stage timing or activity');
const linkedBlock=backend.split("if (dataset === 'sales' && existing) {")[1]?.split("if (dataset === 'orders' && existing?.smartsheet_pending_local_sync")[0] || '';
check(linkedBlock.includes('salesStageTransition = plan.stageTransition || null'),
  'Production pull captures stage transition directly from guarded planner');
const enqueueBlock=backend.split('toUpdate.push({ id: existing.id, _existing: existing,')[1]?.split('} else if (dataset ===')[0]||'';
check(enqueueBlock.includes('_salesStageTransition: salesStageTransition'),
  'Production pending update preserves stage marker through queue assembly');
check(backend.includes("const stageBatch = dataset === 'sales' ? batch.filter((rec: any) => rec._salesStageTransition)") &&
  backend.includes("trackedConditionalSave(base44, 'WorkOrder', _existing, patch"),
  'Queued stage updates bypass bulkUpdate and use protected WorkOrder CAS');
check(backend.includes('sales_status = initialSmartsheetSalesStatus') &&
  !newRecordBlock.includes('newRecord.sales_status = \'won\'') &&
  !newRecordBlock.includes('newRecord.sales_status = \'lost\''),
  'No terminal status assigned by initial importer');

console.log('Smartsheet initial stage and transition wiring: '+checks+'/'+checks+' PASS.');
