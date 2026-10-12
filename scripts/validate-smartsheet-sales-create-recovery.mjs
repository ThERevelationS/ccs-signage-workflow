import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recoverVerifiedSalesCreateLink } from '../base44/shared/smartsheetSalesCreateRecovery.mjs';

let tests = 0;
const eq=(actual,expected,msg)=>{assert.deepEqual(actual,expected,msg);tests++};
const ok=(yes,msg)=>{assert.ok(yes,msg);tests++};
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);tests++};
const sheetId='8702703019812740',rowId='9001',workorderId='synthetic-one';
const fields={current_task_description:'111',estimate_amount:'222'};
const snapshot={'111':'Conduct Site Survey','222':150};
function setup(change={}) {
  let record={id:workorderId,updated_date:'v1',smartsheet_row_id:'',in_pipeline:true,
    current_task_description:'Conduct Site Survey',estimate_amount:150,
    smartsheet_create_attempt:{status:'created_unlinked',sheet_id:sheetId,row_id:rowId,
      attempt_id:'attempt-a',expected_snapshot:snapshot},...change};
  let history={},historyCount=0,writes=0,remoteReads=0,claimReads=0,remoteData={...snapshot};
  let claimed=[],attemptClaims=[{id:workorderId}],historyFail=false,casFail=false;
  let ownershipReads=0, loseOwnershipOn=0;
  const entity={
    async get(id){return id===workorderId?structuredClone(record):null},
    async updateMany(filter,update){
      if(casFail || filter.id!==record.id || filter.updated_date!==record.updated_date)return {updated:0};
      record={...record,...structuredClone(update.$set),updated_date:'v2'};
      writes++;return {updated:1};
    },
  };
  const historyEntity={
    async create(next){if(historyFail)throw new Error('History down');
      history={id:'history-1',...next}; historyCount++; return {id:'history-1'}},
    async get(id){return id===history.id?history:null},
  };
  let remoteMissing=false,localChange=false;
  const args={entity,historyEntity,workorderId,sheetId,rowId,expectedVersion:'v1',
    expectedAttemptId:'attempt-a',bindings:fields,actor:{email:'admin@example.test',full_name:'Test Admin'},
    recoveredAt:'2026-10-12T13:05:00.000Z',
    readRemoteSnapshot:async()=>{remoteReads++;return {verified:!remoteMissing,
      snapshot:remoteData,localSnapshot:localChange?{'111':'Newer local task','222':150}:snapshot}},
    readCompetingClaims:async()=>{claimReads++;return {linked:claimed,attempts:attemptClaims}},
    assertRunOwnership:async()=>{ownershipReads++;
      if(loseOwnershipOn && ownershipReads >= loseOwnershipOn) throw new Error('Recovery lost shared Smartsheet run ownership');}, 
  };
  return {args,state:()=>record,counts:()=>({writes,historyCount,remoteReads,claimReads}),
    claim:rows=>claimed=rows,attempts:rows=>attemptClaims=rows,
    remote:x=>remoteData=x,remoteMissing:()=>remoteMissing=true,
    localChanged:()=>localChange=true,historyFailure:()=>historyFail=true,
    casFailure:()=>casFail=true,mutate:x=>{record={...record,...x}},
    loseOwnershipOn:n=>loseOwnershipOn=n,ownershipReads:()=>ownershipReads};
}
const pass=setup();
const confirmed=await recoverVerifiedSalesCreateLink(pass.args);
eq(confirmed,{workorder_id:workorderId,sheet_id:sheetId,row_id:rowId,recovered:true,
  remote_writes_attempted:false,history_verified:true,history_id:'history-1',
  reviewed_workorder_version:'v1'},'Confirmed single-record recovery returns exact IDs and verified history.');
eq(pass.counts(),{writes:1,historyCount:1,remoteReads:1,claimReads:2},
 'Recovery does a single CAS, one CellHistory write and two competing-claim checks.');
eq(pass.ownershipReads(),6,'Recovery asserts active shared coordinator six times through verification.');
eq(pass.state().smartsheet_create_attempt.manual_recovery.recovered_by_email,'admin@example.test',
 'Recovery attribution persists atomically with permanent link.');
eq(pass.state().smartsheet_create_attempt.manual_recovery.confirmed_row_id,rowId,
 'Permanent row identity is preserved inside the durable marker.');
eq(pass.state().smartsheet_sync_snapshot,snapshot,'Baseline stores the exact verified snapshot.');
eq(pass.state().smartsheet_row_id,rowId,'Versioned WorkOrder save creates only the permanent link.');
await rejects(()=>recoverVerifiedSalesCreateLink(pass.args),/changed since review/);
eq(pass.counts().writes,1,'A second recovery invocation cannot link twice.');
const cases=[
  ['stale version',{},a=>a.expectedVersion='older',/changed since review/],
  ['stale attempt',{},a=>a.expectedAttemptId='wrong',/changed since review/],
  ['reserved attempt',{smartsheet_create_attempt:{status:'reserved',sheet_id:sheetId,
    row_id:'',attempt_id:'attempt-a',expected_snapshot:snapshot}},null,/no longer independently verified/],
  ['different recorded ID',{smartsheet_create_attempt:{status:'created_unlinked',
    sheet_id:sheetId,row_id:'9002',attempt_id:'attempt-a',expected_snapshot:snapshot}},null,/no longer independently verified/],
  ['deleted WorkOrder',{deleted:true},null,/changed since review/],
  ['already linked',{smartsheet_row_id:rowId},null,/already has a permanent row ID/],
  ['other sheet',{smartsheet_sheet_id:'111111'},null,/belongs to another sheet/],
  ['missing attempt',{smartsheet_create_attempt:null},null,/changed since review/],
];
for(const [name,changes,changeArgs,pattern] of cases) {
  const f=setup(changes);
  if(changeArgs)changeArgs(f.args);
  await rejects(()=>recoverVerifiedSalesCreateLink(f.args),pattern);
  eq(f.counts().writes,0,name+' blocks any WorkOrder link save.');
}
for(const [name,mutate,pattern] of [
  ['competing linked identity',f=>f.claim([{id:'other'}]),/no longer independently verified/],
  ['competing marker',f=>f.attempts([{id:workorderId},{id:'other'}]),/no longer independently verified/],
  ['remote task drift',f=>f.remote({'111':'Lost','222':150}),/no longer independently verified/],
  ['remote amount drift',f=>f.remote({'111':'Conduct Site Survey','222':151}),/no longer independently verified/],
  ['remote row missing',f=>f.remoteMissing(),/no longer independently verified/],
  ['newer local task',f=>f.localChanged(),/Sales fields changed/],
  ['CAS conflict',f=>f.casFailure(),/final WorkOrder version CAS/],
]){
  const f=setup();mutate(f);
  await rejects(()=>recoverVerifiedSalesCreateLink(f.args),pattern);
  eq(f.counts().writes,0,name+' cannot create a permanent link.');
}
const historyDown=setup();historyDown.historyFailure();
await rejects(()=>recoverVerifiedSalesCreateLink(historyDown.args),/link is verified.*CellHistory/);
eq(historyDown.counts().writes,1,'History failure never triggers a second link CAS.');
eq(historyDown.state().smartsheet_create_attempt.manual_recovery.confirmed_row_id,rowId,
 'WorkOrder retains durable administrator recovery attribution after history outage.');
await rejects(()=>recoverVerifiedSalesCreateLink(historyDown.args),/changed since review/);
eq(historyDown.counts().writes,1,'History failure cannot cause a duplicate recovery.');
const missingInitialClaims=setup();
missingInitialClaims.args.readCompetingClaims=async()=>null;
await rejects(()=>recoverVerifiedSalesCreateLink(missingInitialClaims.args),
  /ownership could not be completely verified/);
eq(missingInitialClaims.counts().writes,0,
  'Missing initial ownership result cannot authorize a manual permanent link.');
const incompleteInitialClaims=setup();
incompleteInitialClaims.args.readCompetingClaims=async()=>({linked:[],attempts:null});
await rejects(()=>recoverVerifiedSalesCreateLink(incompleteInitialClaims.args),
  /ownership could not be completely verified/);
eq(incompleteInitialClaims.counts().writes,0,
  'Incomplete initial ownership result cannot authorize a manual permanent link.');
const missingLateClaims=setup();
const validLateClaims=missingLateClaims.args.readCompetingClaims;
let lateClaimReads=0;
missingLateClaims.args.readCompetingClaims=async()=>
  ++lateClaimReads===1 ? validLateClaims() : null;
await rejects(()=>recoverVerifiedSalesCreateLink(missingLateClaims.args),
  /ownership could not be completely verified immediately before recovery/);
eq(missingLateClaims.counts().writes,0,
  'Missing final ownership result cannot authorize the final WorkOrder CAS.');
const malformedLateClaims=setup();
const validMalformedClaims=malformedLateClaims.args.readCompetingClaims;
let malformedClaimReads=0;
malformedLateClaims.args.readCompetingClaims=async()=>
  ++malformedClaimReads===1 ? validMalformedClaims() : {linked:[],attempts:[{}]};
await rejects(()=>recoverVerifiedSalesCreateLink(malformedLateClaims.args),
  /Another WorkOrder claims/);
eq(malformedLateClaims.counts().writes,0,
  'Unidentified permanent-row claimant fails closed immediately before CAS.');
const midFlight=setup();const originalClaims=midFlight.args.readCompetingClaims;
let claimNo=0;midFlight.args.readCompetingClaims=async()=>{
  claimNo++;return claimNo===1?originalClaims():{linked:[{id:'other'}],attempts:[{id:workorderId}]};
};
await rejects(()=>recoverVerifiedSalesCreateLink(midFlight.args),/Another WorkOrder claims/);
eq(midFlight.counts().writes,0,'Late competing link before CAS cancels recovery.');
const changedMidway=setup();const firstRemote=changedMidway.args.readRemoteSnapshot;
changedMidway.args.readRemoteSnapshot=async()=>{
  const result=await firstRemote();
  changedMidway.mutate({updated_date:'v-other'});
  return result;
};
await rejects(()=>recoverVerifiedSalesCreateLink(changedMidway.args),/changed during recovery checks/);
eq(changedMidway.counts().writes,0,'Concurrent WorkOrder edit between fresh remote read and save blocks CAS.');
for(const [name,at] of [
  ['before WorkOrder read',1],
  ['before remote and competing reads',2],
  ['before current WorkOrder reread',3],
  ['before last competing-claim read',4],
  ['immediately before WorkOrder CAS',5],
]) {
  const gone=setup();gone.loseOwnershipOn(at);
  await rejects(()=>recoverVerifiedSalesCreateLink(gone.args),/lost shared Smartsheet run ownership/);
  eq(gone.counts().writes,0,'Lost coordinator '+name+' prevents permanent row-link mutation.');
  eq(gone.counts().historyCount,0,'Lost coordinator '+name+' produces no CellHistory event.');
}
const missingCoordinator=setup();
missingCoordinator.args.assertRunOwnership=undefined;
await rejects(()=>recoverVerifiedSalesCreateLink(missingCoordinator.args),/authenticated actor and exact versioned permanent identities/);
eq(missingCoordinator.counts().writes,0,'Recovery without coordinator assertion callback fails closed.');
const ownerGonePostCAS=setup();ownerGonePostCAS.loseOwnershipOn(6);
await rejects(()=>recoverVerifiedSalesCreateLink(ownerGonePostCAS.args),/lost shared Smartsheet run ownership/);
eq(ownerGonePostCAS.counts().writes,1,'Loss after CAS does not falsely revert the verified link.');
eq(ownerGonePostCAS.counts().historyCount,0,'Loss after CAS holds history reconciliation for explicit review.');
const bad=setup();bad.args.actor={email:''};
await rejects(()=>recoverVerifiedSalesCreateLink(bad.args),/authenticated actor/);
eq(bad.counts().writes,0,'No unauthenticated recovery write.');
const source=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const client=readFileSync('src/components/admin/smartsheetSyncPersistence.js','utf8');
const ui=readFileSync('src/components/sales/SalesCreateAttemptReview.jsx','utf8');
ok(source.includes("if (action === 'recover_verified_sales_create')") &&
  source.includes("!hasSessionToken || adminActor?.role !== 'admin'"),
  'Production action explicitly requires an authenticated admin session.');
ok(source.includes('body?.confirm_exact_recorded_row !== true') &&
  source.includes('expected_updated_date') && source.includes('expected_attempt_id'),
  'Backend requires explicit confirmation and preflight version and attempt IDs.');
ok(source.includes('readCompetingClaims') && source.includes('readRemoteSnapshot') &&
  source.includes('recoverVerifiedSalesCreateLink({'),
  'Backend passes authoritative remote and competing identity reads into tested recovery.');
ok(client.includes('confirm_exact_recorded_row:true') &&
  client.includes('result.history_verified !== true') && client.includes('result.remote_writes_attempted !== false'),
  'Client rejects unverified history or unexpected remote mutations.');
ok(ui.includes('result?.classification === "verified_candidate"') &&
  ui.includes('result?.recorded_row_id === rowId.trim()') &&
  ui.includes('disabled={!confirmed || busy}') &&
  ui.includes('setConfirmed(false)'),
  'Recovery button requires exact reviewed identity, explicit confirmation and resets stale review state.');
ok(source.includes("current?.action === 'recover_verified_sales_create'") &&
  source.includes('Explicit stale Sales run recovery is required before another claim'),
  'Running manual recovery cannot be automatically superseded by another sync.');
ok(source.includes("await claimInvocationRun({\n          status:'running',started_at:recoveryRunStartedAt") &&
  source.includes("assertRunOwnership:()=>assertSyncRunOwnership(base44,recoveryRunStartedAt)"),
  'Recovery claims the existing run coordinator before execution and passes its run identity.');
ok(source.includes("await saveSyncStatusForRun(base44,{\n          status:'completed'") &&
  source.includes("status:'needs_review',needs_review:true,action,"),
  'Recovery must finish the shared coordinator or leave an explicit review-required result.');
ok(!source.slice(source.indexOf("if (action === 'recover_verified_sales_create')"),
  source.indexOf("if (action === 'recover_stale_sales_run')")).includes('smartsheetWrite('),
  'Admin recovery cannot issue a Smartsheet mutation.');
console.log('Sales verified manual link recovery: '+tests+'/'+tests+' PASS.');
