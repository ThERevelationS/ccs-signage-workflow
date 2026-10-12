import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifySalesRecoveryHistory,acknowledgeVerifiedSalesRecoveryHistory}
  from '../base44/shared/smartsheetSalesRecoveryHistory.mjs';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const yes=(a,m)=>{assert.ok(a,m);checks++};
const bad=async(fn,re)=>{await assert.rejects(fn,re);checks++};
const rowId='901001', sheetId='8702703019812740';
const at='2026-10-12T13:00:00.000Z', reviewed='v3';
const actor={email:'second.admin@example.test',full_name:'Another Admin'};
const base={
 id:'work-one',updated_date:reviewed,deleted:false,
 smartsheet_sheet_id:sheetId,smartsheet_row_id:rowId,
 smartsheet_create_attempt:{
  sheet_id:sheetId,row_id:rowId,status:'linked',attempt_id:'attempt-one',
  manual_recovery:{attempt_id:'attempt-one',confirmed_row_id:rowId,
   recovered_by_email:'original.admin@example.test',recovered_at:at},
 },
};
const event={id:'cell-event-1',entity_type:'WorkOrder',entity_id:'work-one',
 field_name:'smartsheet_row_id',old_value:'',new_value:rowId,
 changed_by_email:'original.admin@example.test',created_date:'2026-10-12T13:00:10.000Z'};
eq(classifySalesRecoveryHistory(base,[event]).status,'verified_event_ready',
 'One exact CellHistory event is ready to reconcile.');
eq(classifySalesRecoveryHistory(base,[event]).history_event_id,event.id,
 'Only the exact verified event ID is selected.');
eq(classifySalesRecoveryHistory(base,[]).status,'history_not_confirmed',
 'Missing history never authorizes automatic creation.');
eq(classifySalesRecoveryHistory(base,[event,{...event,id:'duplicate'}]).status,'ambiguous_history',
 'Two matching events are held, not de-duplicated by guessing.');
for(const patch of [
 {changed_by_email:'other@example.test'},
 {new_value:'900009'},{entity_id:'other-work'},{field_name:'title'},
 {old_value:'older-row'},{created_date:'2026-10-12T12:59:59.000Z'},
 {created_date:null},{entity_type:'Order'},
]){
 eq(classifySalesRecoveryHistory(base,[{...event,...patch}]).status,'history_not_confirmed',
  'Wrong history provenance is not accepted.');
}
eq(classifySalesRecoveryHistory({...base,smartsheet_create_attempt:{
 ...base.smartsheet_create_attempt,manual_recovery:{
 ...base.smartsheet_create_attempt.manual_recovery,
 history_reconciliation:{event_id:event.id}
 }}},[event]).status,'already_reconciled',
 'Previously acknowledged event is not acknowledged twice.');
const changes=[
 {smartsheet_row_id:'333333'}, {smartsheet_sheet_id:'333333'},
 {deleted:true},{smartsheet_create_attempt:{status:'reserved'}},
 {smartsheet_create_attempt:{...base.smartsheet_create_attempt,attempt_id:'other'}},
];
for(const patch of changes) {
 assert.throws(()=>classifySalesRecoveryHistory({...base,...patch},[event]),/verified manual Sales create recovery identity/);
 checks++;
}
assert.throws(()=>classifySalesRecoveryHistory(base,{}),/incomplete/);checks++;
function fixture({rows=[event],record=base,readbackFailure=false,casFail=false}={}) {
 let current=structuredClone(record),writeCount=0,createCount=0,getCount=0;
 let currentRows=structuredClone(rows);
 const entity={
  get:async(id)=>{getCount++;return id===current.id?structuredClone(current):null},
  updateMany:async(match,update)=>{
    if(casFail||match.id!==current.id||match.updated_date!==current.updated_date)return {updated:0};
    current={...current,...structuredClone(update.$set),updated_date:'v4'};
    writeCount++;return {updated:1};
  },
 };
 const historyEntity={
  get:async(id)=>currentRows.find(r=>r.id===id)||null,
  create:async()=>{createCount++;throw new Error('No history create allowed')},
 };
 let readCount=0;
 const readEvents=async()=>{readCount++;return readbackFailure?{rows:currentRows}:structuredClone(currentRows)};
 const args={entity,historyEntity,workorderId:'work-one',expectedVersion:reviewed,
  expectedAttemptId:'attempt-one',expectedEventId:event.id,
  actor,readEvents,reconciledAt:'2026-10-12T13:20:00.000Z'};
 return {args,setRows:rows=>currentRows=rows,mutate:patch=>current={...current,...patch},
  state:()=>current,calls:()=>({writeCount,createCount,getCount,readCount})};
}
const f=fixture();
const result=await acknowledgeVerifiedSalesRecoveryHistory(f.args);
eq(result,{workorder_id:'work-one',history_event_id:event.id,
 reconciled:true,history_created:false,smartsheet_writes_attempted:false,
 workorder_link_unchanged:true,verified_at:'2026-10-12T13:20:00.000Z'},
 'Acknowledgment persists without new CellHistory or Smartsheet writes.');
eq(f.calls().writeCount,1,'Only one CAS update of the original WorkOrder.');
eq(f.calls().createCount,0,'No CellHistory creation happens.');
eq(f.state().smartsheet_row_id,rowId,'Existing row link remains unchanged.');
eq(f.state().smartsheet_sheet_id,sheetId,'Existing sheet link remains unchanged.');
eq(f.state().smartsheet_create_attempt.manual_recovery.history_reconciliation.event_id,event.id,
 'Verified event attribution persists in the original durable recovery marker.');
eq(f.state().smartsheet_create_attempt.manual_recovery.history_reconciliation.verified_by_email,actor.email,
 'Reconciling admin is recorded, preserving the original recovery actor.');
eq(f.state().smartsheet_create_attempt.manual_recovery.recovered_by_email,'original.admin@example.test',
 'Original recovery identity is preserved.');
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(f.args),/changed since history review/);
eq(f.calls().writeCount,1,'Duplicate invocation does not save another acknowledgment.');
const failures=[
 ['missing',[],/missing, ambiguous/],
 ['duplicates',[event,{...event,id:'duplicate'}],/missing, ambiguous/],
 ['wrong actor',[{...event,changed_by_email:'other@example.test'}],/missing, ambiguous/],
 ['early event',[{...event,created_date:'2026-10-11T00:00:00.000Z'}],/missing, ambiguous/],
];
for(const [name,rows,re] of failures){
 const x=fixture({rows});await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(x.args),re);
 eq(x.calls().writeCount,0,name+' cannot update marker.');
 eq(x.calls().createCount,0,name+' never creates history.');
}
const stale=fixture();stale.args.expectedVersion='v0';
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(stale.args),/changed since history review/);
eq(stale.calls().writeCount,0,'Stale WorkOrder revision cannot acknowledge history.');
const wrongAttempt=fixture();wrongAttempt.args.expectedAttemptId='unknown';
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(wrongAttempt.args),/missing, ambiguous/);
eq(wrongAttempt.calls().writeCount,0,'Wrong attempt ID blocks acknowledgment.');
const wrongEvent=fixture();wrongEvent.args.expectedEventId='other';
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(wrongEvent.args),/missing, ambiguous/);
eq(wrongEvent.calls().writeCount,0,'Wrong event ID blocks acknowledgment.');
const cas=fixture({casFail:true});
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(cas.args),/revision changed before/);
eq(cas.calls().writeCount,0,'CAS failure changes no record.');
const missingOnReRead=fixture();
missingOnReRead.args.historyEntity.get=async()=>null;
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(missingOnReRead.args),/could not be independently verified/);
eq(missingOnReRead.calls().writeCount,0,'Unverified event on fresh get prevents CAS.');
const mutation=fixture();const originalGet=mutation.args.historyEntity.get;
mutation.args.historyEntity.get=async(id)=>{
 const item=await originalGet(id);mutation.mutate({updated_date:'v-changed'});return item;
};
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(mutation.args),/changed during history reconciliation/);
eq(mutation.calls().writeCount,0,'Concurrent WorkOrder edit between review and save is held.');
const invalid=fixture();invalid.args.actor={email:''};
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(invalid.args),/authenticated admin/);
eq(invalid.calls().writeCount,0,'Missing admin identity cannot change record.');
const unreadable=fixture({readbackFailure:true});
await bad(()=>acknowledgeVerifiedSalesRecoveryHistory(unreadable.args),/incomplete/);
eq(unreadable.calls().writeCount,0,'Incomplete history read fails closed.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const ui=readFileSync('src/components/sales/SalesRecoveryHistoryReview.jsx','utf8');
const client=readFileSync('src/components/admin/smartsheetSyncPersistence.js','utf8');
const admin=readFileSync('src/components/admin/SmartsheetSyncSettings.jsx','utf8');
yes(backend.includes("if (action === 'audit_sales_recovery_history' || action === 'acknowledge_sales_recovery_history')") &&
 backend.includes("!hasSessionToken || adminActor?.role !== 'admin'"),
 'Both history actions require authenticated Sales administrator.');
yes(backend.includes("query:{entity_type:'WorkOrder',entity_id:id,field_name:'smartsheet_row_id'}"),
 'History read is scoped by exact WorkOrder and field.');
yes(backend.includes("body?.confirm_existing_event !== true") &&
 backend.includes("expected_history_event_id"),
 'Backend requires explicit acknowledgment and exact reviewed CellHistory identity.');
yes(client.includes('result.history_created !== false') &&
 client.includes('result.workorder_link_unchanged !== true'),
 'Client rejects unexpected history creation or link changes.');
yes(ui.includes('history_not_confirmed') && ui.includes('ambiguous_history') &&
 ui.includes('disabled={!confirmed || busy}') && ui.includes('setEvidence(null)'),
 'Mobile-friendly admin controls block missing/ambiguous history and stale confirmation.');
yes(admin.includes('<SalesRecoveryHistoryReview sessionToken={sessionToken} />'),
 'Admin Smartsheet screen includes the bounded history review.');
console.log('Sales recovery CellHistory verified-event reconciliation: '+checks+'/'+checks+' PASS.');
