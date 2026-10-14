import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { orderRemoteVerificationReviewMessage } from '../src/components/orders/orderRemoteVerificationReview.mjs';

const id1='order-review-001', id2='order-review-002';
const row1='100000001', row2='100000002';
const base={
  success:true, configured:true, write_actions_available:true,
  sync_complete:false, needs_review:true,
  results:[{
    dataset:'orders',direction:'push',sheet_id:'4963691473987460',
    records_examined:2,created:0,updated:0,unchanged_skipped:0,errors:2,conflicts:0,
    unresolved_record_ids:[id1,id2],
    remote_verification_review_count:2,
    remote_verification_review_items:[
      {order_id:id1,row_id:row1,state:'row_mismatch'},
      {order_id:id2,row_id:row2,state:'verification_unavailable'},
    ],
  }],
};
const msg=orderRemoteVerificationReviewMessage(base,2);
assert.match(msg,/Smartsheet row 100000001 \(Order order-review-001\)/);
assert.match(msg,/Smartsheet row 100000002 \(Order order-review-002\)/);
assert.match(msg,/remain queued in Base44/);
assert.match(msg,/Review the current Smartsheet row values and reload Orders before using Retry Sync/);
assert.match(msg,/Do not overwrite or resubmit the old values automatically/);
assert.doesNotMatch(msg,/already synchronized/);
console.log('PASS accurate permanent-ID diagnostics and review-first recovery text for mixed remote changes or failed readback');

const alter=(changes={}, rowChanges={})=>({
  ...base,...changes,results:[{...base.results[0],...rowChanges}],
});
for (const invalid of [
  alter({success:false}),alter({configured:false}),alter({write_actions_available:false}),
  alter({sync_complete:true,needs_review:false}),
  alter({results:[base.results[0],base.results[0]]}),
  alter({}, {dataset:'sales'}),alter({}, {direction:'pull'}),
  alter({}, {sheet_id:'other'}),
  alter({}, {records_examined:1}),
  alter({}, {errors:0}),
  alter({}, {remote_verification_review_count:3}),
  alter({}, {remote_verification_review_count:0}),
  alter({}, {remote_verification_review_items:[]}),
  alter({}, {remote_verification_review_items:[{order_id:id1,row_id:row1,state:'invalid'}]}),
  alter({}, {remote_verification_review_items:[{order_id:'not a valid id',row_id:row1,state:'row_mismatch'}]}),
  alter({}, {remote_verification_review_items:[{order_id:id1,row_id:'rowX',state:'row_mismatch'}]}),
  alter({}, {remote_verification_review_items:[{order_id:id1,row_id:row1,state:'row_mismatch'},{order_id:id1,row_id:row2,state:'row_mismatch'}]}),
  alter({}, {remote_verification_review_items:[{order_id:id1,row_id:row1,state:'row_mismatch'},{order_id:id2,row_id:row1,state:'row_mismatch'}]}),
  alter({}, {unresolved_record_ids:[id2]}),
]) assert.equal(orderRemoteVerificationReviewMessage(invalid,2),'');
assert.equal(orderRemoteVerificationReviewMessage(base,3),'');
assert.equal(orderRemoteVerificationReviewMessage(base,-1),'');
console.log('PASS malformed, spoofed, duplicate, mismatched or unverified error evidence is rejected');

const many=Array.from({length:10},(_,i)=>({
  order_id:`order-many-${String(i).padStart(3,'0')}`,
  row_id:String(909090900+i),state:'row_mismatch',
}));
const wide=alter({},{
  records_examined:15,errors:15,
  remote_verification_review_count:15,
  remote_verification_review_items:many,
  unresolved_record_ids:many.map(i=>i.order_id),
});
const wideMessage=orderRemoteVerificationReviewMessage(wide,15);
assert.match(wideMessage,/and 12 more/);
assert.doesNotMatch(wideMessage,/909090903/);
console.log('PASS bounded diagnostics cap displayed permanent IDs without inventing unknown row identities');

// Compile the REAL browser-side result summarizer with an inert queue stub.
const compiled=await build({
  entryPoints:['src/components/orders/orderSaveSync.js'],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',
  alias:{'@':process.cwd()+'/src'},
  plugins:[{name:'order-no-network-test',setup(b){
    b.onResolve({filter:/syncRequestQueue$/},()=>({path:'mock-order-sync-queue',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export async function queueSmartsheetSync(){throw Error("Network disabled in synthetic test");}',loader:'js'}));
  }}],
});
const {summarizeSavedOrderSync}=await import('data:text/javascript;base64,'+
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const summary=summarizeSavedOrderSync(base,{expectedOrderCount:2});
assert.equal(summary.ok,false);
assert.equal(summary.message,msg);
const withoutEvidence=summarizeSavedOrderSync(alter({},{
  remote_verification_review_count:0,
  remote_verification_review_items:[],
}),{expectedOrderCount:2});
assert.equal(withoutEvidence.ok,false);
assert.match(withoutEvidence.message,/explicit writable, configured Order sync confirmation/);
const valid=summarizeSavedOrderSync(alter({sync_complete:true,needs_review:false},{
  errors:0,updated:2,remote_verification_review_count:0,
  remote_verification_review_items:[],unresolved_record_ids:[],
}),{expectedOrderCount:2});
assert.equal(valid.ok,true);
console.log('PASS production result summarizer emits precise failure message without weakening successful-sync proof');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const client=readFileSync('src/components/orders/orderSaveSync.js','utf8');
const grid=readFileSync('src/components/orders/OrderSpreadsheet.jsx','utf8');
const push=backend.slice(backend.indexOf('async function pushDataset('),
  backend.indexOf('// Phase 5: Resolve conflict decisions'));
const verify=push.slice(push.indexOf('const orderRemoteVerifiedIds = new Set<string>()'),
  push.indexOf('// Phase 3: Persist Base44 reconciliation'));
assert.match(verify,/orderVerificationReviews\.set\(recordId, \{\s*order_id: recordId, row_id: verification\.rowId, state: 'row_mismatch'/);
assert.match(verify,/orderVerificationReviews\.set\(recordId, \{\s*order_id: recordId, row_id: verification\.rowId, state: 'verification_unavailable'/);
assert.match(push,/remote_verification_review_count: orderVerificationReviews\.size/);
assert.match(push,/remote_verification_review_items: \[\.\.\.orderVerificationReviews\.values\(\)\]\.slice\(0, 10\)/);
assert.match(verify,/orderFailedRecordIds\.add\(recordId\)/);
assert.match(push,/!orderRemoteVerifiedIds\.has\(recordId\) \|\| orderFailedRecordIds\.has\(recordId\)/);
assert.match(client,/orderRemoteVerificationReviewMessage\(result, expected\)/);
assert.match(client,/if \(remoteVerificationMessage\) return \{ ok: false, message: remoteVerificationMessage \}/);
assert.match(grid,/const exact = await verifyUncertainOrderSyncReadback\(orderIds/);
assert.match(grid,/for \(const id of exact\.pendingIds\)/);
assert.match(grid,/setSaveError\(`Saved in Base44, but Smartsheet sync needs attention:/);
console.log('PASS Order backend response, Save & Sync UI failure branch, durable pending reload, and no-auto-retry guards remain wired');
