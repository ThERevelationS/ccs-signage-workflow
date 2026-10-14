import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { orderSnapshotsMatchForPrewrite, staleOrderRetryPrewriteIds } from '../base44/shared/smartsheetOrderRetryPrewriteSafety.mjs';

const sheet='4963691473987460';
const bindings={customer_name:'1684354771511172',vendor:'5975894415173508',
  description:'5912314017802116',quantity:'2950182582151044'};
const compiled=await build({stdin:{
 contents:'export {buildCells,buildSnapshot,buildOrderPullSnapshot} from "../base44/shared/smartsheetSyncFields.ts"; export {planFieldPush} from "../base44/shared/smartsheetFieldMerge.ts";',
 resolveDir:process.cwd()+'/scripts',sourcefile:'scripts/order-retry-field-test.ts',loader:'ts',
},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {buildCells,buildSnapshot,buildOrderPullSnapshot,planFieldPush}=
 await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const baseline={
 id:'order-retry-0001',updated_date:'2026-10-14T15:00:00Z',
 smartsheet_sheet_id:sheet,smartsheet_row_id:'70111111',
 smartsheet_pending_local_sync:false,smartsheet_last_synced_at:'2026-10-14T14:00:00Z',
 customer_name:'Smith Signs',vendor:'Vendor Old',description:'Panel',quantity:'2',
 work_order_id:'job-associated-001',
};
baseline.smartsheet_sync_snapshot=buildSnapshot(baseline,bindings,'orders');
const saved={...baseline,quantity:'5',smartsheet_pending_local_sync:true,updated_date:'2026-10-14T15:02:00Z'};
const remoteAtPlan={...baseline,vendor:'Vendor New'};
const row=(record,rowId=baseline.smartsheet_row_id)=>({
 id:rowId,modified_at:'2026-10-14T15:01:00Z',
 cells:buildCells(record,bindings,'orders').map(c=>({column_id:String(c.columnId),value:c.value})),
});
const plannedRemote=row(remoteAtPlan);
const rawSheet={id:sheet,columns:Object.values(bindings).map(id=>({id})),rows:[plannedRemote]};
const fake={asServiceRole:{entities:{SyncConflict:{
 async filter(){return {items:[]};},
 async updateMany(){throw Error('Unexpected conflict write');},
 async upsert(){throw Error('Unexpected conflict write');},
}}}};
const plan=await planFieldPush({base44:fake,record:saved,dataset:'orders',bindings,
 remoteRow:plannedRemote,rawSheet,cells:buildCells(saved,bindings,'orders'),
 get:async()=>{throw Error('Unexpected network');}});
assert.equal(plan.incoming.vendor,'Vendor New');
assert.equal(plan.incoming.quantity,undefined);
assert.equal(plan.outgoing.length,1);
assert.equal(String(plan.outgoing[0].columnId),bindings.quantity);
assert.equal(String(plan.outgoing[0].value),'5');
assert.deepEqual(plan.unresolved,[]);
assert.equal(plan.remote[bindings.vendor],'Vendor New');
console.log('PASS real field planner accepts newer Smartsheet vendor while preserving independent saved Base44 quantity edit for PUT');

const verification={rowId:saved.smartsheet_row_id,originalUpdatedDate:saved.updated_date,
 plannedRemoteSnapshot:plan.remote,expectedSnapshot:{...plan.remote,[bindings.quantity]:'5'}};
const plans=[[saved.id,verification]];
const byLocal=new Map([[saved.id,saved]]);
const expectedRemote=new Map([[saved.smartsheet_row_id,buildOrderPullSnapshot(plannedRemote,bindings)]]);
assert.equal(staleOrderRetryPrewriteIds(plans,byLocal,byLocal,expectedRemote,sheet).length,0);
const staleRow=row({...remoteAtPlan,description:'NEWER edited Smartsheet panel'});
const remoteChanged=new Map([[saved.smartsheet_row_id,buildOrderPullSnapshot(staleRow,bindings)]]);
assert.deepEqual(staleOrderRetryPrewriteIds(plans,byLocal,byLocal,remoteChanged,sheet),[saved.id]);
assert.deepEqual(staleOrderRetryPrewriteIds(plans,byLocal,byLocal,
 new Map([[saved.smartsheet_row_id,buildOrderPullSnapshot(row({...remoteAtPlan,quantity:'7'}),bindings)]]),sheet),[saved.id]);
assert.deepEqual(staleOrderRetryPrewriteIds(plans,byLocal,
 new Map([[saved.id,{...saved,updated_date:'2026-10-14T15:03:00Z'}]]),expectedRemote,sheet),[saved.id]);
assert.deepEqual(staleOrderRetryPrewriteIds(plans,byLocal,
 new Map([[saved.id,{...saved,work_order_id:'new job',smartsheet_pending_local_sync:false}]]),expectedRemote,sheet),[saved.id]);
assert.deepEqual(staleOrderRetryPrewriteIds(plans,byLocal,byLocal,new Map(),sheet),[saved.id]);
console.log('PASS stale Smartsheet changes, stale local revisions and missing permanent rows block planned PUT');

assert.equal(orderSnapshotsMatchForPrewrite(plan.remote,{...plan.remote}),true);
assert.equal(orderSnapshotsMatchForPrewrite(plan.remote,
 {...plan.remote,[bindings.vendor]:'Changed'}),false);
assert.equal(orderSnapshotsMatchForPrewrite(plan.remote,
 Object.fromEntries(Object.entries(plan.remote).filter(([id])=>id!==bindings.vendor))),false);
assert.equal(orderSnapshotsMatchForPrewrite(plan.remote,
 {...plan.remote,'987654':'rogue'}),false);
assert.equal(orderSnapshotsMatchForPrewrite(null,plan.remote),false);
assert.throws(()=>staleOrderRetryPrewriteIds(plans,byLocal,byLocal,expectedRemote,'not-sheet'),/complete permanent-ID/);
const second={...saved,id:'order-retry-0002',smartsheet_row_id:'70222222'};
const secondPlan={...verification,rowId:second.smartsheet_row_id};
const pair=[[saved.id,verification],[second.id,secondPlan]];
const firstAndSecond=new Map([[saved.id,saved],[second.id,second]]);
const remotePair=new Map([[saved.smartsheet_row_id,remoteChanged.get(saved.smartsheet_row_id)],
 [second.smartsheet_row_id,plan.remote]]);
assert.deepEqual(staleOrderRetryPrewriteIds(pair,firstAndSecond,firstAndSecond,remotePair,sheet),[saved.id]);
assert.deepEqual(staleOrderRetryPrewriteIds([[saved.id,verification],[second.id,{...secondPlan,rowId:saved.smartsheet_row_id}]],
 firstAndSecond,firstAndSecond,remotePair,sheet),[saved.id,second.id]);
console.log('PASS one stale row does not block a different verified Order; duplicate row identity fails closed');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const push=backend.slice(backend.indexOf('async function pushDataset('),backend.indexOf('async function smartsheetSyncHandler('));
const prewrite=push.slice(push.indexOf('// Order Retry Sync: an outgoing cell'),push.indexOf('const heldApprovedSalesRowIds'));
assert.ok(prewrite.length>1900);
assert.match(prewrite,/loadAllEntityRows\(\{[\s\S]*?Order Retry Sync exact local prewrite revision/);
assert.match(prewrite,/smartsheetGet\('\/sheets\/' \+ sheetId \+ '\?' \+ params\.toString\(\), token\)/);
assert.match(prewrite,/staleOrderRetryPrewriteIds\(/);
assert.match(prewrite,/orderFailedRecordIds\.add\(id\)/);
assert.match(push,/plannedRemoteSnapshot: fieldPlan\.remote/);
assert.match(push,/dataset === 'orders'[\s\S]*?deferredSmartsheetWrites\.filter\(\(row: any\) =>[\s\S]*?orderFailedRecordIds\.has\(id\)/);
assert.match(push,/!orderRemoteVerifiedIds\.has\(recordId\) \|\| orderFailedRecordIds\.has\(recordId\)/);
console.log('PASS Order-only fresh source guard is upstream of Smartsheet PUT and prevents metadata advancement for held rows');
