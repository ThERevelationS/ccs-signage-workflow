import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedSalesRemoteSnapshotStillCurrent, verifiedSalesConflictResolutionTargets } from '../base44/shared/smartsheetSalesConflictResolution.mjs';
import { buildSalesPullSnapshot } from '../base44/shared/smartsheetSyncFields.ts';

let checks=0;
const yes=(v,message)=>{assert.ok(v,message);checks++;};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const bindings={ current_task_description:'4783818077955972',
  estimate_amount:'5655853885876100',current_task_assigned_to:'1166536483747716' };
const taskCol=bindings.current_task_description, amountCol=bindings.estimate_amount;
const assignedCol=bindings.current_task_assigned_to;
const row=(task,amount,assignee='Brett')=>({
 id:'90001',cells:[
  {column_id:taskCol,value:task,display_value:task},
  {column_id:amountCol,value:amount,display_value:String(amount)},
  {column_id:assignedCol,value:assignee,display_value:assignee},
 ]});
const planned=buildSalesPullSnapshot(row('Conduct Site Survey',125),bindings);
const exact=buildSalesPullSnapshot(row('Conduct Site Survey',125),bindings);
yes(approvedSalesRemoteSnapshotStillCurrent(planned,exact,assignedCol),
  'Identical freshly read approved Sales values remain eligible.');
const concurrentTask=buildSalesPullSnapshot(row('Lost',125),bindings);
yes(!approvedSalesRemoteSnapshotStillCurrent(planned,concurrentTask,assignedCol),
  'New Smartsheet Lost task after planning blocks approved remote write.');
const concurrentAmount=buildSalesPullSnapshot(row('Conduct Site Survey',250),bindings);
yes(!approvedSalesRemoteSnapshotStillCurrent(planned,concurrentAmount,assignedCol),
  'Changed estimate in same approved row also invalidates its stale reconciliation plan.');
const concurrentAssignee=buildSalesPullSnapshot(row('Conduct Site Survey',125,'Twyla'),bindings);
yes(!approvedSalesRemoteSnapshotStillCurrent(planned,concurrentAssignee,assignedCol),
  'Changed mapped assignee invalidates the stale approval preflight.');
yes(!approvedSalesRemoteSnapshotStillCurrent(planned,null,assignedCol),
  'Missing remote row cannot authorize an approved write.');
yes(!approvedSalesRemoteSnapshotStillCurrent({},exact,assignedCol),
  'Empty planned snapshot cannot authorize a write.');
const numeric={...planned,[amountCol]:'125'};
yes(approvedSalesRemoteSnapshotStillCurrent(numeric,exact,assignedCol),
  'Equivalent numeric formatting does not invent a concurrent edit.');
const transformedAssignee={...planned,[assignedCol]:'Brett Heinlein'};
yes(approvedSalesRemoteSnapshotStillCurrent(transformedAssignee,exact,assignedCol),
  'Known canonical assignee-name translation does not produce a false conflict.');
const missing={...exact}; delete missing[taskCol];
yes(!approvedSalesRemoteSnapshotStillCurrent(planned,missing,assignedCol),
  'Missing mapped task evidence cannot authorize a stale approval.');
const failedRecords=new Set();
const approvedPlans=new Map([['wo-1',{rowId:'90001',snapshot:planned}],
  ['wo-2',{rowId:'90002',snapshot:planned}]]);
const freshRows=new Map([['90001',concurrentTask],['90002',exact]]);
for (const [id, plan] of approvedPlans) {
 if (!approvedSalesRemoteSnapshotStillCurrent(plan.snapshot,freshRows.get(plan.rowId),assignedCol)) {
   failedRecords.add(id);
 }
}
eq([...failedRecords],['wo-1'],
  'A changed approved row is held while another unchanged approved row stays eligible.');
const eligible=[{id:'90001',cells:[{columnId:taskCol,value:'Conduct Site Survey'}]},
 {id:'90002',cells:[{columnId:taskCol,value:'Conduct Site Survey'}]},
 {id:'90003',cells:[{columnId:amountCol,value:175}]}]
 .filter(entry=>![...failedRecords].some(id=>approvedPlans.get(id)?.rowId===entry.id));
eq(eligible.map(entry=>entry.id),['90002','90003'],
  'Held approved row is excluded while unrelated safe writes remain.');
const targets=verifiedSalesConflictResolutionTargets({
 verifiedWorkOrderIds:['wo-2'],approvedDecisionsByWorkOrder:new Map([
  ['wo-1',['approval-blocked']],['wo-2',['approval-good']]]),
 openReviewWorkOrderIds:['wo-1','wo-2'],
});
eq(targets.approvedDecisionIds,['approval-good'],
  'Failed fresh remote preflight cannot mark an approved conflict resolved.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
yes(backend.includes('approvedSalesRemotePlans = new Map') &&
 backend.includes('snapshot: buildSalesPullSnapshot(currentRows[0], bindings)'),
 'Production captures exact remote approved values at planning.');
yes(backend.includes('if (dataset === \'sales\' && approvedSalesRemotePlans.size)') &&
 backend.includes('const targets = [...approvedSalesRemotePlans.entries()]'),
 'Fresh Smartsheet preflight affects approved Sales records only.');
yes(backend.includes('for (let start = 0; start < targets.length; start += 100)') &&
 backend.includes('await smartsheetGet(\'/sheets/\' + sheetId + \'?\' + params.toString(), token)'),
 'Production performs bounded batched fresh remote reads.');
yes(backend.includes('approvedSalesRemoteSnapshotStillCurrent(planned.snapshot, remote, assigneeColumnId)') &&
 backend.includes('salesFailedRecordIds.add(id)'),
 'Failed Smartsheet value/identity read blocks the approved row.');
yes(backend.indexOf('approvedSalesRemoteSnapshotStillCurrent(planned.snapshot, remote, assigneeColumnId)') <
 backend.indexOf('const eligibleSmartsheetWrites =') &&
 backend.indexOf('const eligibleSmartsheetWrites =') <
 backend.indexOf("'PUT', '/sheets/' + sheetId + '/rows', token, eligibleSmartsheetWrites"),
 'Fresh approved-read preflight precedes the exact filtered Smartsheet PUT.');
yes(backend.includes('salesRemoteVerifiedIds.has(String(update.id)) && !salesFailedRecordIds.has(String(update.id))'),
 'Approved remote-preflight failures cannot silently advance Base44 sync metadata.');
yes(backend.includes('verifiedWorkOrderIds: updated') &&
 backend.includes('approvedSalesRecordStillCurrent(planned, latestById.get(id))'),
 'Prior Base44 revision fencing and review-resolution gates remain wired.');
console.log('Sales approved Smartsheet prewrite remote value guard: '+checks+'/'+checks+' PASS.');
