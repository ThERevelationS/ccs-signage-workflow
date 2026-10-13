import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planOrderSmartsheetCustomerUnlink } from '../base44/shared/smartsheetOrderCustomerDecisionCommit.mjs';

const review = {
  order_id: 'order-permanent-001', sheet_id: '4963691473987460',
  row_id: '123456789', work_order_id: 'job-permanent-55',
  local_customer_name: 'Original customer',
  smartsheet_customer_name: 'New remote customer',
  order_updated_date: '2026-10-13T12:00:00.000Z',
  remote_modified_at: '2026-10-13T12:01:00.000Z',
};
const order = {
  id: review.order_id, updated_date: review.order_updated_date,
  smartsheet_sheet_id: review.sheet_id, smartsheet_row_id: review.row_id,
  work_order_id: review.work_order_id, customer_name: review.local_customer_name,
  smartsheet_pending_local_sync: false, deleted: false,
  vendor: 'Unchanged vendor', smartsheet_sync_snapshot: {'1684354771511172':'Original customer'},
};
const job = { id: review.work_order_id, client_name: review.local_customer_name, deleted:false };
const remoteRow = { id: review.row_id, modified_at: review.remote_modified_at };
const args = {
  review, decision: 'adopt_smartsheet_unlink_job', confirmed: true,
  order, job, remoteRow, remoteCustomerName: review.smartsheet_customer_name,
  duplicateClaims:false,
};
const proposal = planOrderSmartsheetCustomerUnlink(args);
assert.equal(proposal.ok, true);
assert.deepEqual(proposal.selector, {
  id: order.id, updated_date: order.updated_date,
  customer_name: order.customer_name, work_order_id: order.work_order_id,
  smartsheet_sheet_id: order.smartsheet_sheet_id, smartsheet_row_id: order.smartsheet_row_id,
});
assert.deepEqual(proposal.patch, {
  customer_name: review.smartsheet_customer_name,
  work_order_id: '', smartsheet_pending_local_sync: true,
});
const after = { ...order, ...proposal.patch };
assert.equal(after.vendor, order.vendor);
assert.deepEqual(after.smartsheet_sync_snapshot, order.smartsheet_sync_snapshot);
assert.equal(after.work_order_id,'');
assert.equal(after.smartsheet_pending_local_sync,true);
assert.equal(planOrderSmartsheetCustomerUnlink({...args, order:after}).ok,false);
console.log('PASS exact-revision proposal atomically adopts customer, unlinks job, queues durable sync without modifying snapshot or other fields');

assert.equal(planOrderSmartsheetCustomerUnlink({...args, confirmed:false}).reason,'explicit_admin_confirmation_required');
assert.equal(planOrderSmartsheetCustomerUnlink({...args, decision:'keep_linked_job'}).reason,'explicit_admin_confirmation_required');
assert.equal(planOrderSmartsheetCustomerUnlink({...args, review:{...review, order_updated_date:''}}).reason,'invalid_review');
for(const variant of [
  {order:{...order,updated_date:'2026-10-13T12:15:00Z'}},
  {order:{...order,work_order_id:'job-other'}},
  {order:{...order,smartsheet_pending_local_sync:true}},
  {order:{...order,deleted:true}},
  {job:{...job,client_name:'Wrong customer'}},
  {duplicateClaims:true},
  {remoteRow:{...remoteRow,modified_at:'2026-10-13T12:05:00Z'}},
  {remoteCustomerName:'Third updated customer'},
]) assert.equal(planOrderSmartsheetCustomerUnlink({...args,...variant}).ok,false);
assert.equal(planOrderSmartsheetCustomerUnlink({
  ...args,remoteCustomerName:'New remote customer'.padEnd(200,'!'),
}).ok,false);
console.log('PASS stale Order, job, row revision, owner, long/truncated remote name and repeat requests fail closed');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const commit=backend.slice(backend.indexOf("if (action === 'commit_order_customer_decision')"),
  backend.indexOf("if (action === 'audit_sales_permanent_ownership')"));
const client=readFileSync('src/components/orders/orderSaveSync.js','utf8');
const panel=readFileSync('src/components/orders/OrderLinkedCustomerReview.jsx','utf8');
const grid=readFileSync('src/components/orders/OrderSpreadsheet.jsx','utf8');
assert.ok(commit.length>4000);
assert.match(commit,/!hasSessionToken \|\| adminActor\?\.role !== 'admin'/);
assert.match(commit,/confirmed: body\?\.confirmed === true/);
assert.match(commit,/duplicateCount !== 1/);
assert.match(commit,/firstClaims\.length !== 1/);
assert.match(commit,/latestClaims\.length !== 1/);
assert.match(commit,/String\(firstRow\?\.modified_at\) !== String\(secondRow\?\.modified_at\)/);
assert.match(commit,/planOrderSmartsheetCustomerUnlink\(\{/);
assert.match(commit,/trackedConditionalSave\(base44, 'Order', latestOrder,[\s\S]*?plan\.patch, adminActor, 'admin'\)/);
assert.match(commit,/state: 'save_acknowledgement_uncertain'/);
assert.match(commit,/state: 'save_readback_uncertain'/);
assert.match(commit,/smartsheet_pending_local_sync !== true/);
assert.match(commit,/smartsheet_writes_attempted: false, state: 'saved_pending_sync'/);
assert.doesNotMatch(commit,/smartsheetWrite\(|smartsheetWriteNoTimeoutRetry\(|\.create\(|\.delete\(|\.bulkUpdate\(/);
assert.match(client,/action: 'commit_order_customer_decision'/);
assert.match(client,/attempts: 1, retryRateLimit: false, retryCoordinatorBusy: false/);
assert.match(client,/do not click Apply again/);
assert.match(panel,/commitInFlightRef\.current = true/);
assert.match(panel,/setCommitAttemptedIds/);
assert.match(panel,/!previews\[item\.orderId\]\?\.ok/);
assert.match(grid,/handleCustomerResolutionApplied = async saved =>/);
assert.match(grid,/current\.smartsheet_pending_local_sync !== true/);
assert.match(grid,/queued for Save & Sync/);
console.log('PASS admin-only single-attempt audited CAS endpoint and UI reload safeguards are wired with zero Smartsheet writes');
