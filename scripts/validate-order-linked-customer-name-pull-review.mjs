import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { linkedOrderCustomerPullNeedsReview } from '../base44/shared/smartsheetOrderLinkedCustomerReview.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

// Run the real Smartsheet Order translator against synthetic rows only.
const translated = await build({entryPoints:['base44/shared/smartsheetSyncFields.ts'],
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {parseRowToFields,buildOrderPullSnapshot} = await import('data:text/javascript;base64,' +
  Buffer.from(translated.outputFiles[0].text).toString('base64'));
const customerCol = '1684354771511172';
const binding = {customer_name:customerCol};
const base = {id:'order-permanent-1',smartsheet_sheet_id:'4963691473987460',
  smartsheet_row_id:'1772889111',work_order_id:'linked-permanent-job',
  customer_name:'Acme Sign Co',smartsheet_pending_local_sync:false,deleted:false,
  smartsheet_sync_snapshot:{[customerCol]:'Acme Sign Co'}};
const row = name => ({id:base.smartsheet_row_id,cells: name===null?[]:[{column_id:customerCol,value:name}]});
const remote = row('Another Customer');
const parsed = parseRowToFields(remote,binding,'orders');
const snapshot = buildOrderPullSnapshot(remote,binding);
assert.equal(parsed.customer_name,'Another Customer');
assert.equal(snapshot[customerCol],'Another Customer');
const evaluate = (existing, r, mapped=true) =>
  linkedOrderCustomerPullNeedsReview({order:existing,
    remoteCustomerName: mapped?buildOrderPullSnapshot(r,binding)[customerCol]:undefined,
    customerColumnBound:mapped});
assert.equal(evaluate(base,remote),true);
assert.equal(evaluate(base,row('  ACME   SIGN CO ')),false);
assert.equal(evaluate(base,row(null)),true);
assert.equal(evaluate({...base,work_order_id:''},remote),false);
assert.equal(evaluate({...base,deleted:true},remote),false);
assert.equal(evaluate({...base,smartsheet_pending_local_sync:true},remote),true);
assert.equal(evaluate(base,remote,false),false);
assert.equal(evaluate({...base,id:''},remote),false);
assert.equal(linkedOrderCustomerPullNeedsReview({order:base,remoteCustomerName:null,customerColumnBound:true}),false);
console.log('PASS linked customer mismatch/blank held, casing and whitespace accepted, unrelated/unlinked/unbound rows unaffected');

const records = [
  {...base},
  {...base,id:'order-permanent-2',work_order_id:'',smartsheet_row_id:'1772889222'},
  {...base,id:'order-permanent-3',work_order_id:'linked-job-3',smartsheet_row_id:'1772889333',
    customer_name:'Different Person',smartsheet_pending_local_sync:true},
];
const incoming = [remote,row('Another Customer'),row('Another Customer')];
const updates = [],reviews = [],pending = [];
for(let i=0;i<records.length;i++){
 const existing = records[i];
 if(existing.smartsheet_pending_local_sync===true){pending.push(existing.id);continue;}
 const r=incoming[i];
 if(evaluate(existing,r)){
   reviews.push({order_id:existing.id,row_id:existing.smartsheet_row_id,work_order_id:existing.work_order_id});
   continue;
 }
 updates.push({id:existing.id,...parseRowToFields(r,binding,'orders')});
}
assert.deepEqual(reviews,[{order_id:base.id,row_id:base.smartsheet_row_id,work_order_id:base.work_order_id}]);
assert.deepEqual(pending,['order-permanent-3']);
assert.deepEqual(updates,[{id:'order-permanent-2',customer_name:'Another Customer'}]);
const reviewedResult={dataset:'orders',direction:'pull',updated:updates.length,
  conflicts:reviews.length+pending.length,linked_customer_name_review_count:reviews.length,
  linked_customer_name_review_items:reviews,conflict_record_ids:[...pending,...reviews.map(r=>r.order_id)]};
assert.equal(orderRunRequiresReview([reviewedResult]),true);
assert.equal(orderRunRequiresReview([{...reviewedResult,conflicts:0,linked_customer_name_review_count:0}]),false);
console.log('PASS mixed pull holds only conflicting Order and pending local changes while unrelated Orders can proceed; review required');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const client=readFileSync('src/components/orders/orderSaveSync.js','utf8');
const ui=readFileSync('src/components/orders/OrderSpreadsheet.jsx','utf8');
const pull=backend.slice(backend.indexOf('async function pullDataset('),backend.indexOf('async function pushDataset('));
const pendingGuard=pull.indexOf("if (dataset === 'orders' && existing?.smartsheet_pending_local_sync === true)");
const linkedGuard=pull.indexOf('linkedOrderCustomerPullNeedsReview({');
const toUpdate=pull.indexOf('toUpdate.push({ id: existing.id, _existing: existing,');
const firstBusinessWrite=pull.indexOf('bulkUpdate(payload)');
assert.ok(pendingGuard>0 && linkedGuard>pendingGuard && toUpdate>linkedGuard && firstBusinessWrite>toUpdate);
const guardBlock=pull.slice(linkedGuard,toUpdate);
assert.match(guardBlock,/orderLinkedCustomerNameReviews\.push\(\{/);
assert.match(guardBlock,/order_id: String\(existing\.id\), row_id: rowId/);
assert.match(guardBlock,/continue;/);
assert.match(pull,/conflicts: orderLocalPendingConflicts\.length \+ orderLinkedCustomerNameReviews\.length/);
assert.match(pull,/linked_customer_name_review_count: orderLinkedCustomerNameReviews\.length/);
assert.match(pull,/linked_customer_name_review_items: orderLinkedCustomerNameReviews\.slice\(0, 10\)/);
assert.match(client,/linkedCustomerNameReviewCount/);
assert.match(client,/linkedCustomerNameReviewRowIds/);
assert.match(ui,/Smartsheet customer names differ from/);
assert.match(ui,/Those Orders and their remote rows were preserved without updating/);
console.log('PASS backend guard precedes all Order pull writes/snapshot advancement; exact review IDs and Order Form feedback wired');
