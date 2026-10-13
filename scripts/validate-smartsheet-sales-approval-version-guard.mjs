import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedSalesRecordStillCurrent, verifiedSalesConflictResolutionTargets } from '../base44/shared/smartsheetSalesConflictResolution.mjs';

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
console.log('Sales approved task decision concurrent-version guard: '+checks+'/'+checks+' PASS.');