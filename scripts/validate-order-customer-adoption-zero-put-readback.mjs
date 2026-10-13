import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { orderPushRecordUnchanged } from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { classifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';

const compiled = await build({
  stdin:{
    contents:'export {buildCells, buildSnapshot, buildOrderPullSnapshot} from "../base44/shared/smartsheetSyncFields.ts"; export {planFieldPush} from "../base44/shared/smartsheetFieldMerge.ts";',
    resolveDir:process.cwd()+'/scripts',sourcefile:'scripts/synthetic-order-adopt-reconcile.ts',loader:'ts',
  },bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',
});
const {buildCells,buildSnapshot,buildOrderPullSnapshot,planFieldPush} =
  await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const sheetId='4963691473987460', rowId='1002003004005';
const customerCol='1684354771511172';
const bindings={
  customer_name:customerCol,request_type:'5349364064380804',
  description:'5912314017802116',quantity:'2950182582151044',
};
const oldRecord={
  id:'synthetic-order-adoption-001',updated_date:'2026-10-13T14:25:00Z',
  smartsheet_sheet_id:sheetId,smartsheet_row_id:rowId,
  customer_name:'Original customer',work_order_id:'original-job-12345',
  request_type:'Substrate',description:'PVC panels',quantity:'3',
  smartsheet_pending_local_sync:false,
  smartsheet_last_synced_at:'2026-10-12T16:00:00Z',
};
const prior=buildSnapshot(oldRecord,bindings,'orders');
const incoming={
  ...oldRecord,customer_name:'Verified Smartsheet customer',work_order_id:'',
  smartsheet_pending_local_sync:true,smartsheet_sync_snapshot:prior,
  updated_date:'2026-10-13T14:26:00Z',
};
const remoteRow={
  id:rowId,modified_at:'2026-10-13T14:24:00Z',
  cells:buildCells(incoming,bindings,'orders')
    .map(c=>({column_id:String(c.columnId),value:c.value})),
};
const rawSheet={id:sheetId,
  columns:Object.values(bindings).map(id=>({id})),
  rows:[remoteRow],
};
const remoteSnapshot=buildOrderPullSnapshot(remoteRow,bindings);
assert.notEqual(prior[customerCol],remoteSnapshot[customerCol]);
assert.equal(incoming.work_order_id,'');
assert.equal(orderPushRecordUnchanged(incoming,sheetId,buildSnapshot(incoming,bindings,'orders')),false);

const forbidden=()=>{throw Error('Unexpected datastore mutation or API call in zero-write plan');};
const plan=await planFieldPush({
  base44:{asServiceRole:{entities:new Proxy({}, {get:forbidden})}},
  record:incoming,dataset:'orders',bindings,remoteRow,rawSheet,
  cells:buildCells(incoming,bindings,'orders'),get:forbidden,
});
assert.deepEqual(plan.outgoing,[]);
assert.deepEqual(plan.incoming,{});
assert.deepEqual(plan.unresolved,[]);
assert.deepEqual(plan.remote,remoteSnapshot);
assert.equal(plan.remote[customerCol],'Verified Smartsheet customer');
console.log('PASS actual field planner reconciles adopted customer with no redundant Smartsheet PUT or Work Order relinking');

const expected={id:incoming.id,smartsheet_sync_snapshot:plan.remote,
  smartsheet_last_synced_at:'2026-10-13T14:27:00Z',
  smartsheet_pending_local_sync:false};
const verified={...incoming,...expected};
assert.equal(verified.work_order_id,'');
assert.equal(verified.customer_name,remoteSnapshot[customerCol]);
assert.equal(verified.smartsheet_sheet_id,sheetId);
assert.equal(verified.smartsheet_row_id,rowId);
assert.deepEqual(classifyUncertainOrderSyncReadback([incoming.id],[verified]),{
  confirmedIds:[incoming.id],pendingIds:[],
});
assert.deepEqual(classifyUncertainOrderSyncReadback([incoming.id],[incoming]),{
  confirmedIds:[],pendingIds:[incoming.id],
});
console.log('PASS metadata-only CAS completion preserves customer, cleared job, permanent IDs, and classifies unverified pending as unresolved');

const changedRemote={...remoteRow,modified_at:'2026-10-13T14:28:00Z',
  cells:remoteRow.cells.map(c=>c.column_id===customerCol?{...c,value:'Concurrent Smartsheet edit'}:c)};
assert.notDeepEqual(buildOrderPullSnapshot(changedRemote,bindings),plan.remote);
assert.equal(buildOrderPullSnapshot(changedRemote,bindings)[customerCol],'Concurrent Smartsheet edit');
const missingRemote={...remoteRow,cells:remoteRow.cells.filter(c=>c.column_id!==customerCol)};
assert.notDeepEqual(buildOrderPullSnapshot(missingRemote,bindings),plan.remote);
console.log('PASS remote customer changes and omitted customer cells are detectable at fresh row readback');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const push=backend.slice(backend.indexOf('async function pushDataset('),
  backend.indexOf('// Phase 5: Resolve conflict decisions'));
const verifySection=push.slice(push.indexOf('const orderRemoteVerifiedIds = new Set<string>()'),
  push.indexOf('// Phase 3: Persist Base44 reconciliation'));
assert.match(verifySection,/const remoteChecks = \[\.\.\.deferredOrderVerification\.entries\(\)\]/);
assert.doesNotMatch(verifySection,/if \(!verification\.requiresRemoteWrite\) orderRemoteVerifiedIds\.add\(recordId\)/);
assert.match(verifySection,/smartsheetGet\('\/sheets\/' \+ sheetId \+ '\?' \+ params\.toString\(\), token\)/);
assert.match(verifySection,/String\(verificationResult\.body\?\.id \?\? ''\) !== sheetId/);
assert.match(verifySection,/requestedRowIds\.size !== remoteChecks\.length/);
assert.match(verifySection,/returnedRows\.length !== requestedRowIds\.size/);
assert.match(verifySection,/freshRows\.size !== requestedRowIds\.size/);
assert.match(verifySection,/returnedRows\.some\(\(row: any\) => !requestedRowIds\.has\(String\(row\.id\)\)\)/);
assert.match(verifySection,/!detectConflict\(freshRow\.cells, verification\.expectedSnapshot, bindings, 'orders'\)/);
assert.match(verifySection,/orderFailedRecordIds\.add\(recordId\)/);
const commit=push.slice(push.indexOf('// Phase 3: Persist Base44 reconciliation'),
  push.indexOf('const verifiedSalesUpdates ='));
assert.match(commit,/!orderRemoteVerifiedIds\.has\(recordId\) \|\| orderFailedRecordIds\.has\(recordId\)/);
assert.match(commit,/\{ id: recordId, updated_date: verification\.originalUpdatedDate, smartsheet_pending_local_sync: true \}/);
assert.match(commit,/record\?\.smartsheet_pending_local_sync !== false/);
assert.doesNotMatch(commit,/work_order_id:\s*(?:''|null|undefined)/);
console.log('PASS backend only clears durable pending markers after fresh exact-row readback and guarded Base44 version CAS');
