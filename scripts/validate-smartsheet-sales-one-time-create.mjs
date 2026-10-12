import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSalesSmartsheetRowWithGuard, createdSalesSmartsheetRowId,
  salesSmartsheetCreateNeedsReview } from '../base44/shared/smartsheetSalesCreateSafety.mjs';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const throws=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const sheetId='8702703019812740';
const start={id:'synthetic-wo',title:'Survey',estimate_amount:150,
  updated_date:'rev-1',smartsheet_row_id:'',smartsheet_sheet_id:'',deleted:false};
function fixture(changes={}) {
 let row={...structuredClone(start),...changes}, sequence=1, posts=0, remote=null;
 let failReservation=false,failLink=false,failMarker=false;
 let competingLinked=[],competingAttempts=[],claimReads=0,onClaimRead=null;
 const entity={
   async get(id) {return id===row.id?structuredClone(row):null;},
   async updateMany(query,update) {
     if(query.id!==row.id || query.updated_date!==row.updated_date) return {updated:0};
     const patch=update.$set||{};
     if(patch.smartsheet_create_attempt?.status==='reserved' && failReservation) return {updated:0};
     if(patch.smartsheet_create_attempt?.status==='created_unlinked' && failMarker) return {updated:0};
     if(patch.smartsheet_create_attempt?.status==='linked' && failLink) return {updated:0};
     row={...row,...structuredClone(patch),updated_date:'rev-'+(++sequence)};
     return {updated:1};
   },
 };
 const snapshot=r=>({'111':r.title,'222':r.estimate_amount});
 const opts={entity,record:row,sheetId,attemptId:'test-attempt',startedAt:'2026-10-11T01:00:00Z',
   assertOwner:async()=>{},
   readCompetingClaims:async()=>{claimReads++;if(onClaimRead)onClaimRead(claimReads);
     return {linked:structuredClone(competingLinked),attempts:structuredClone(competingAttempts)};},
   makeSnapshot:snapshot,
   postRow:async(current)=>{posts++;remote={id:'5678',snapshot:snapshot(current)};
     return {message:'SUCCESS',resultCode:0,result:[{id:5678}]};},
   verifyCreatedRow:async({rowId,expectedSnapshot})=>
     rowId===remote?.id && JSON.stringify(expectedSnapshot)===JSON.stringify(remote.snapshot),
 };
 return {opts,entity,view:()=>row,posts:()=>posts,remote:()=>remote,
  setFailReservation:v=>failReservation=v,setFailLink:v=>failLink=v,
  setFailMarker:v=>failMarker=v,
  claimLinked:v=>competingLinked=v,claimAttempts:v=>competingAttempts=v,
  onClaimRead:v=>onClaimRead=v,claimReads:()=>claimReads,
  edit:v=>{row={...row,...v,updated_date:'rev-'+(++sequence)};},
  mutateRemote:v=>{remote=v;},
 };
}
const clean=fixture();
const linked=await createSalesSmartsheetRowWithGuard(clean.opts);
eq(linked,{rowId:'5678',recovered:false,newerLocalEditsRemain:false},
 'One Sales POST and verified permanent link succeed.');
eq(clean.posts(),1,'Success sends exactly one POST.');
eq(clean.view().smartsheet_create_attempt.status,'linked','Linked marker completes lifecycle.');
eq(clean.view().smartsheet_row_id,'5678','Permanent row ID verified.');
eq(clean.claimReads(),2,'Permanent row ownership is checked before and after link CAS.');
eq(clean.view().smartsheet_sync_snapshot,{'111':'Survey','222':150},
 'Verified exact mapped snapshot persisted.');
ok(!salesSmartsheetCreateNeedsReview(clean.view()),'Linked marker is not a pending review.');
await throws(()=>createSalesSmartsheetRowWithGuard(clean.opts),/unresolved or previously linked/);
eq(clean.posts(),1,'A linked WorkOrder cannot create another remote row.');
const interrupted=fixture();
interrupted.setFailLink(true);
await throws(()=>createSalesSmartsheetRowWithGuard(interrupted.opts),/changed during permanent link save/);
eq(interrupted.posts(),1,'Failed Base44 link does not cause a second Smartsheet POST.');
eq(interrupted.view().smartsheet_create_attempt.status,'created_unlinked',
 'Created remote row ID is durable before link finalization.');
eq(interrupted.view().smartsheet_create_attempt.row_id,'5678',
 'Interrupted link preserves permanent row ID.');
interrupted.setFailLink(false);
eq(await createSalesSmartsheetRowWithGuard(interrupted.opts),
 {rowId:'5678',recovered:true,newerLocalEditsRemain:false},
 'Unlinked permanent row recovered after exact remote verification.');
eq(interrupted.posts(),1,'Recovery never sends another POST.');
const conflictingLinked=fixture();
const originalLinkedPost=conflictingLinked.opts.postRow;
conflictingLinked.opts.postRow=async current=>{
 const result=await originalLinkedPost(current);
 conflictingLinked.claimLinked([{id:'another-workorder'}]);
 return result;
};
await throws(()=>createSalesSmartsheetRowWithGuard(conflictingLinked.opts),/Another WorkOrder claims/);
eq(conflictingLinked.posts(),1,'Competing linked WorkOrder never triggers a duplicate POST.');
eq(conflictingLinked.view().smartsheet_create_attempt.status,'created_unlinked',
 'Competing linked owner blocks permanent link CAS and retains durable row evidence.');
const conflictingAttempt=fixture();
conflictingAttempt.setFailLink(true);
await throws(()=>createSalesSmartsheetRowWithGuard(conflictingAttempt.opts),/changed during permanent link save/);
conflictingAttempt.setFailLink(false);
conflictingAttempt.claimAttempts([{id:'other-unlinked'}]);
await throws(()=>createSalesSmartsheetRowWithGuard(conflictingAttempt.opts),/Another WorkOrder claims/);
eq(conflictingAttempt.posts(),1,'Competing durable attempt blocks recovery without another POST.');
eq(conflictingAttempt.view().smartsheet_create_attempt.status,'created_unlinked',
 'Conflicting recovery retains the exact permanent row for manual review.');
const lateClaim=fixture();
lateClaim.onClaimRead(count=>{if(count===2)lateClaim.claimLinked([{id:'late-owner'}]);});
await throws(()=>createSalesSmartsheetRowWithGuard(lateClaim.opts),/Another WorkOrder claims/);
eq(lateClaim.view().smartsheet_create_attempt.status,'linked',
 'Late post-CAS collision reports review without undoing a committed link.');
eq(lateClaim.posts(),1,'Post-CAS collision never retries the Smartsheet POST.');
const incompleteClaims=fixture();
incompleteClaims.opts.readCompetingClaims=async()=>null;
await throws(()=>createSalesSmartsheetRowWithGuard(incompleteClaims.opts),/ownership could not be completely verified/);
eq(incompleteClaims.view().smartsheet_create_attempt.status,'created_unlinked',
 'Incomplete claim verification fails closed with durable row evidence.');
const missingClaimReader=fixture();
missingClaimReader.opts.readCompetingClaims=undefined;
await throws(()=>createSalesSmartsheetRowWithGuard(missingClaimReader.opts),/requires run ownership and permanent-row claim verification/);
eq(missingClaimReader.posts(),0,'Missing ownership reader cannot send a Smartsheet POST.');
const missingCoordinator=fixture();
missingCoordinator.opts.assertOwner=undefined;
await throws(()=>createSalesSmartsheetRowWithGuard(missingCoordinator.opts),/requires run ownership and permanent-row claim verification/);
eq(missingCoordinator.posts(),0,'Missing run coordinator cannot send a Smartsheet POST.');
const timeout=fixture();
timeout.opts.postRow=async(current)=>{timeout.mutateRemote({id:'5678',
  snapshot:timeout.opts.makeSnapshot(current)});throw Object.assign(new Error('timeout'),{timedOut:true});};
await throws(()=>createSalesSmartsheetRowWithGuard(timeout.opts),/POST outcome is uncertain/);
eq(timeout.view().smartsheet_create_attempt.status,'reserved',
 'Unknown remote outcome remains durably reserved for manual review.');
ok(salesSmartsheetCreateNeedsReview(timeout.view()),'Unknown outcome requires review.');
await throws(()=>createSalesSmartsheetRowWithGuard(timeout.opts),/unresolved or previously linked/);
const malformed=fixture();
malformed.opts.postRow=async()=>({message:'SUCCESS',resultCode:0,result:[{}]});
await throws(()=>createSalesSmartsheetRowWithGuard(malformed.opts),/permanent Sales row ID/);
eq(malformed.view().smartsheet_create_attempt.status,'reserved',
 'Unreadable successful POST cannot clear durable reservation.');
await throws(()=>createSalesSmartsheetRowWithGuard(malformed.opts),/unresolved or previously linked/);
for (const body of [
  {message:'ERROR',resultCode:1,result:[{id:12}]},
  {message:'SUCCESS',resultCode:0,result:[{id:12},{id:13}]},
  {message:'SUCCESS',resultCode:0,result:[{id:'not-an-id'}]},
  {message:'SUCCESS',resultCode:0,result:[{id:Number.MAX_SAFE_INTEGER+1}]},
  {message:'SUCCESS',resultCode:0,result:[{id:{value:'5678'}}]},
  {message:'SUCCESS',resultCode:0,result:[]},
]) await throws(async()=>createdSalesSmartsheetRowId(body),/Sales|Smartsheet/);
eq(createdSalesSmartsheetRowId({message:'SUCCESS',resultCode:0,result:[{id:12345}]}),'12345',
 'Smartsheet array response requires a single permanent ID.');
const lost=fixture();
lost.setFailReservation(true);
await throws(()=>createSalesSmartsheetRowWithGuard(lost.opts),/changed before the create reservation/);
eq(lost.posts(),0,'Lost CAS reservation never sends POST.');
const sourceChanged=fixture();
const originalGet=sourceChanged.entity.get;
let sourceReadCount=0;
sourceChanged.entity.get=async(key)=>{
  sourceReadCount++;
  if(sourceReadCount===2)sourceChanged.edit({title:'Newer user task'});
  return originalGet(key);
};
await throws(()=>createSalesSmartsheetRowWithGuard(sourceChanged.opts),/reservation could not be verified/);
eq(sourceChanged.posts(),0,'Concurrent local edit after reservation blocks POST before it is sent.');
eq(sourceChanged.view().smartsheet_create_attempt.status,'reserved',
  'Uncertain prewrite reservation stays held after concurrent local edit.');
const lostRowId=fixture();
lostRowId.setFailMarker(true);
await throws(()=>createSalesSmartsheetRowWithGuard(lostRowId.opts),/could not preserve the permanent ID/);
eq(lostRowId.posts(),1,'Remote create whose row ID cannot be persisted was sent only once.');
await throws(()=>createSalesSmartsheetRowWithGuard(lostRowId.opts),/unresolved or previously linked/);
eq(lostRowId.posts(),1,'Subsequent retry cannot duplicate a create with lost local row-ID evidence.');
const newerLocal=fixture();
newerLocal.opts.postRow=async(current)=>{newerLocal.edit({title:'Updated during POST'});
  newerLocal.mutateRemote({id:'5678',snapshot:newerLocal.opts.makeSnapshot(current)});
  return {message:'SUCCESS',resultCode:0,result:[{id:'5678'}]};};
const newer=await createSalesSmartsheetRowWithGuard(newerLocal.opts);
ok(newer.newerLocalEditsRemain,'New local edits during remote POST stay pending after link.');
eq(newerLocal.view().title,'Updated during POST','Verified linking preserves newer local task.');
eq(newerLocal.view().smartsheet_sync_snapshot['111'],'Survey',
 'Snapshot reflects actual remote content, not newer local edit.');
const unverifiable=fixture();
unverifiable.opts.verifyCreatedRow=async()=>false;
await throws(()=>createSalesSmartsheetRowWithGuard(unverifiable.opts),/cannot be verified/);
eq(unverifiable.view().smartsheet_create_attempt.status,'created_unlinked',
 'Remote verification failure preserves recoverable permanent ID.');
await throws(()=>createSalesSmartsheetRowWithGuard(unverifiable.opts),/cannot be verified/);
eq(unverifiable.posts(),1,'Unverifiable remote row does not cause new POST.');
for(const item of [{deleted:true},{smartsheet_row_id:'90001'},{smartsheet_sheet_id:sheetId}]) {
 const q=fixture(item);
 await throws(()=>createSalesSmartsheetRowWithGuard(q.opts),/missing or deleted|incomplete Smartsheet identity/);
 eq(q.posts(),0,'Existing identity or deleted WorkOrder blocks POST.');
}
const code=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const schema=readFileSync('base44/entities/WorkOrder.jsonc','utf8');
ok(schema.includes('"smartsheet_create_attempt"'),'WorkOrder stores durable attempt marker.');
ok(code.includes('createSalesSmartsheetRowWithGuard({'),'Production routes Sales creation through durable reservation.');
ok(code.includes('readSalesCreateRowClaims(base44, sheetId, rowId)') &&
   code.includes('Sales create permanent-row linked owner verification') &&
   code.includes('Sales create permanent-row durable attempt verification'),
 'Production Sales create checks both permanent linked and durable-attempt owners.');
ok(code.includes("smartsheetWriteNoTimeoutRetry('POST'"),'Production Sales POST disables timeout retry.');
ok(!code.includes("smartsheetWrite('POST', `/sheets/${sheetId}/rows`"),
 'Old risky Sales create transport is no longer called.');
ok(code.includes('verifyCreatedRow: async ({rowId,expectedSnapshot}: any)') &&
  code.includes('salesSnapshotsEqual(expectedSnapshot,buildSalesPullSnapshot(rows[0],bindings)'),
 'Permanent Smartsheet row and mapped values must verify before linking.');
ok(code.includes('created.push(record.id);') && code.includes('if (result.newerLocalEditsRemain)'),
 'Success accounting happens only after guarded, verified linking.');
console.log('Sales Smartsheet durable one-time create safety: '+checks+'/'+checks+' PASS.');
