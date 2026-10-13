import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedSalesRecordStillCurrent, verifiedSalesConflictResolutionTargets } from '../base44/shared/smartsheetSalesConflictResolution.mjs';
import { commitVerifiedSalesMetadata } from '../base44/shared/smartsheetSalesMetadataCAS.mjs';

let checks = 0;
const check = (value, msg) => { assert.ok(value, msg); checks++; };
const same = (actual, expected, msg) => { assert.deepEqual(actual, expected, msg); checks++; };
const initial = { id:'synthetic-sales-record', updated_date:'2026-10-10T12:05:00.000Z',
  sales_status:'quoted', current_task_description:'Estimate Sent to Customer', in_pipeline:true,
  smartsheet_sheet_id:'8702703019812740', smartsheet_row_id:'90001' };
check(approvedSalesRecordStillCurrent(initial, {...initial}), 'Unchanged approved record is current.');
const revisions = [
  ['different revision', {...initial, updated_date:'2026-10-10T12:06:00.000Z'}],
  ['unrelated user edit', {...initial, estimate_amount:350, updated_date:'2026-10-10T12:06:00.000Z'}],
  ['new task', {...initial, current_task_description:'Lost'}],
  ['new status', {...initial, sales_status:'lost'}],
  ['new sheet', {...initial, smartsheet_sheet_id:'8702703019812741'}],
  ['relinked row', {...initial, smartsheet_row_id:'90002'}],
  ['deleted', {...initial, deleted:true}],
  ['missing', null],
];
for (const [label, next] of revisions) {
  check(!approvedSalesRecordStillCurrent(initial, next), 'Stale approval blocked: '+label);
}
check(!approvedSalesRecordStillCurrent({...initial, updated_date:''}, initial),
  'Unknown planning version cannot authorize an approval write.');
function fakeEntity(initialRecord) {
  let record={...initialRecord}, writes=0;
  return { get value(){return record}, get writes(){return writes},
    edit(changes){record={...record,...changes}},
    async updateMany(where, body) {
      if (where.id!==record.id || where.updated_date!==record.updated_date) return {updated:0};
      record={...record,...body.$set,updated_date:'2026-10-10T12:07:00.000Z'};
      writes++; return {updated:1};
    },
  };
}
const metadata={smartsheet_sync_snapshot:{},smartsheet_last_synced_at:'2026-10-10T12:06:30.000Z'};
const clean=fakeEntity(initial);
same((await clean.updateMany({id:initial.id,updated_date:initial.updated_date},{$set:metadata})).updated,1,
  'Approved metadata commits at the exact unchanged WorkOrder revision.');
same(clean.writes,1,'Successful approved update performs one versioned write.');
const raced=fakeEntity(initial);
check(approvedSalesRecordStillCurrent(initial, raced.value), 'Preflight was initially safe.');
raced.edit({current_task_description:'Lost',updated_date:'2026-10-10T12:06:50.000Z'});
same((await raced.updateMany({id:initial.id,updated_date:initial.updated_date},{$set:metadata})).updated,0,
  'A user edit after preflight defeats final version CAS.');
same(raced.value.current_task_description,'Lost','Newer user task remains unchanged.');
same(raced.writes,0,'CAS failure performs zero writes.');
const blocked=verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds:[], approvedDecisionsByWorkOrder:new Map([[initial.id,['approval-one']]]),
  openReviewWorkOrderIds:[initial.id],
});
same(blocked,{approvedDecisionIds:[],openReviewWorkOrderIds:[]},
  'An unverified record cannot resolve its pending approved review.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
check(backend.includes('approvedSalesPlanSnapshots = new Map<string, any>()') &&
  backend.includes('approvedSalesRecordStillCurrent(planned, latestById.get(id))'),
  'Production preflights approved plan versions from a batched fresh WorkOrder read.');
check(backend.includes('heldApprovedSalesRowIds') && backend.includes('eligibleSmartsheetWrites') &&
  backend.includes('!heldApprovedSalesRowIds.has(String(row.id))'),
  'Failed preflight approved records are excluded from remote Smartsheet PUT.');
check(backend.includes('const approvedUpdates = verifiedSalesUpdates.filter(') &&
  backend.includes('const ordinaryUpdates = verifiedSalesUpdates.filter(') &&
  backend.includes('await commitVerifiedSalesMetadata({'),
  'Ordinary Sales records use versioned metadata CAS while approved review writes retain their existing guard.');
check(backend.includes('{ id, updated_date: planned.updated_date }, { $set: fields }') &&
  backend.includes('if (committed?.updated !== 1)'),
  'Approved Sales metadata uses a final version matched updateMany CAS.');
check(backend.includes('if (failedMetadataIds.has(recordId) || salesFailedRecordIds.has(recordId))') &&
  backend.includes('verifiedWorkOrderIds: updated'),
  'Failed approved records are excluded from verified success and resolution.');
// Ordinary Sales sync uses the same revision protection without consuming
// or resolving approved task decisions.
function ordinaryFixture() {
  let record={...initial}, writes=0, coordinatorChecks=0;
  const entity={updateMany:async(where,body)=>{
    if(where.id!==record.id || where.updated_date!==record.updated_date ||
      where.smartsheet_sheet_id!==record.smartsheet_sheet_id ||
      where.smartsheet_row_id!==record.smartsheet_row_id)return {updated:0};
    record={...record,...body.$set,updated_date:'new-version'};writes++;
    return {updated:1};
  }};
  const args={entity,recordId:initial.id,plannedVersion:initial.updated_date,
    sheetId:initial.smartsheet_sheet_id,rowId:initial.smartsheet_row_id,
    fields:metadata,assertRunOwnership:async()=>{coordinatorChecks++;}};
  return {args,change:next=>{record={...record,...next}},record:()=>record,
    writes:()=>writes,coordinatorChecks:()=>coordinatorChecks};
}
const ordinaryClean=ordinaryFixture();
same(await commitVerifiedSalesMetadata(ordinaryClean.args),true,
  'Unchanged ordinary Sales metadata passes revision+permanent-row CAS.');
same(ordinaryClean.writes(),1,'Ordinary success writes exactly once.');
same(ordinaryClean.coordinatorChecks(),1,'Ordinary commit checks run ownership.');
const ordinaryRace=ordinaryFixture();
ordinaryRace.change({updated_date:'newer',current_task_description:'Lost'});
await assert.rejects(()=>commitVerifiedSalesMetadata(ordinaryRace.args),/changed or was relinked/);
checks++;
same(ordinaryRace.writes(),0,'Newer ordinary Sales edit blocks stale metadata save.');
same(ordinaryRace.record().current_task_description,'Lost','Newer task remains intact.');
const ordinaryRelink=ordinaryFixture();
ordinaryRelink.change({smartsheet_row_id:'90002'});
await assert.rejects(()=>commitVerifiedSalesMetadata(ordinaryRelink.args),/changed or was relinked/);
checks++;
same(ordinaryRelink.writes(),0,'Changed permanent row blocks ordinary metadata.');
const ordinarySheet=ordinaryFixture();
ordinarySheet.change({smartsheet_sheet_id:'8702703019812741'});
await assert.rejects(()=>commitVerifiedSalesMetadata(ordinarySheet.args),/changed or was relinked/);
checks++;
same(ordinarySheet.writes(),0,'Changed sheet identity blocks ordinary metadata.');
const ordinaryMissing=ordinaryFixture();
ordinaryMissing.args.plannedVersion='';
await assert.rejects(()=>commitVerifiedSalesMetadata(ordinaryMissing.args),/requires a versioned/);
checks++;
same(ordinaryMissing.writes(),0,'Missing revision fails closed.');
const ordinaryNoOwner=ordinaryFixture();
ordinaryNoOwner.args.assertRunOwnership=undefined;
await assert.rejects(()=>commitVerifiedSalesMetadata(ordinaryNoOwner.args),/requires a versioned/);
checks++;
same(ordinaryNoOwner.writes(),0,'Missing coordinator fails closed.');
check(backend.includes('originalUpdatedDate: String(record.updated_date || \'\')') &&
  backend.includes('plannedVersion: verification?.originalUpdatedDate') &&
  backend.includes('rowId: verification?.rowId') &&
  !backend.includes('bulkUpdate(ordinaryUpdates)'),
  'Ordinary Sales metadata uses exact planning version and permanent row, never bulk update.');
console.log('Sales approved and ordinary task concurrent-version guards: '+checks+'/'+checks+' PASS.');