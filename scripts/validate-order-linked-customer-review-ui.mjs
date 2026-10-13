import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeOrderLinkedCustomerReviews,
  orderCustomerReviewRowState,
} from '../src/components/orders/orderLinkedCustomerReviewPresentation.mjs';

const raw = {
  order_id: 'order-permanent-001',
  sheet_id: '4963691473987460',
  row_id: '123456789',
  work_order_id: 'job-permanent-55',
  local_customer_name: 'Original customer',
  smartsheet_customer_name: 'Different Smartsheet customer',
  order_updated_date: '2026-10-13T10:00:00.000Z',
  remote_modified_at: '2026-10-13T10:01:00.000Z',
};
const [review] = normalizeOrderLinkedCustomerReviews([raw], 1);
assert.deepEqual(review, {
  orderId: raw.order_id, sheetId: raw.sheet_id, rowId: raw.row_id,
  workOrderId: raw.work_order_id, localCustomerName: raw.local_customer_name,
  smartsheetCustomerName: raw.smartsheet_customer_name,
  orderUpdatedDate: raw.order_updated_date,
  remoteModifiedAt: raw.remote_modified_at,
});
const loaded = {
  id: raw.order_id, smartsheet_sheet_id: raw.sheet_id,
  smartsheet_row_id: raw.row_id, work_order_id: raw.work_order_id,
  customer_name: raw.local_customer_name, smartsheet_pending_local_sync: false,
  updated_date: raw.order_updated_date,
};
assert.equal(orderCustomerReviewRowState(review, loaded), 'matches_review');
for (const change of [
  { work_order_id: 'different-job' },
  { customer_name: 'newly typed' },
  { smartsheet_pending_local_sync: true },
  { smartsheet_row_id: '888' },
  { smartsheet_sheet_id: '777' },
  { updated_date: '2026-10-14T10:00:00.000Z' },
]) {
  assert.equal(orderCustomerReviewRowState(review, { ...loaded, ...change }), 'changed_or_unavailable');
}
assert.equal(orderCustomerReviewRowState(review, null), 'changed_or_unavailable');
console.log('PASS side-by-side review compares exact permanent IDs and marks stale/unloaded Base44 records');

const invalid = [
  { ...raw, order_id: 'bad id' },
  { ...raw, row_id: 'not-a-number' },
  { ...raw, sheet_id: 'not-a-number' },
  { ...raw, work_order_id: '' },
  { ...raw, local_customer_name: null },
  { ...raw, smartsheet_customer_name: null },
  { ...raw, remote_modified_at: '' },
  { ...raw, order_updated_date: null },
];
assert.deepEqual(normalizeOrderLinkedCustomerReviews(invalid, 6), []);
assert.deepEqual(normalizeOrderLinkedCustomerReviews([raw], 0), []);
assert.equal(normalizeOrderLinkedCustomerReviews([raw,raw], 2).length, 1);
assert.equal(normalizeOrderLinkedCustomerReviews(
  Array.from({length:14},(_,i)=>({...raw,order_id:'order-000'+String(i).padStart(3,'0'),row_id:String(1000+i)})),14
).length,10);
assert.equal(normalizeOrderLinkedCustomerReviews([{...raw, smartsheet_customer_name:''}],1)[0].smartsheetCustomerName, '');
console.log('PASS missing/malformed/duplicate review identities fail closed and response is bounded to ten samples');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const spreadsheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const panel = readFileSync('src/components/orders/OrderLinkedCustomerReview.jsx', 'utf8');
const pull = backend.slice(backend.indexOf('async function pullDataset('), backend.indexOf('async function pushDataset('));
assert.match(pull, /orderLinkedCustomerNameReviews\.push\(\{[\s\S]*?sheet_id: sheetId, row_id: rowId,[\s\S]*?local_customer_name: cleanText\(existing\.customer_name, 160\),[\s\S]*?smartsheet_customer_name: cleanText\(remoteName, 160\)/);
assert.match(pull, /linked_customer_name_review_items: orderLinkedCustomerNameReviews\.slice\(0, 10\)/);
assert.match(client, /normalizeOrderLinkedCustomerReviews\(/);
assert.match(client, /linkedCustomerNameReviewItems,/);
assert.match(spreadsheet, /setLinkedNameReview\(\{ count: pull\.linkedCustomerNameReviewCount, items: pull\.linkedCustomerNameReviewItems \}\)/);
assert.ok((spreadsheet.match(/<OrderLinkedCustomerReview count=\{linkedNameReview\.count\}/g) || []).length === 2);
assert.match(panel, /sm:grid-cols-3/);
assert.match(panel, /Base44 customer at pull/);
assert.match(panel, /Smartsheet customer at pull/);
assert.match(panel, /Linked job in Base44/);
assert.match(panel, /Job not in active-job list/);
assert.match(panel, /This Order has changed since the review or is not loaded/);
assert.match(panel, /separate version-protected commit is required/);
assert.match(panel, /Verify decision safely/);
assert.match(panel, /isAdmin &&/);
assert.match(panel, /previewEpochRef\.current \+= 1/);
assert.doesNotMatch(panel, /\.update\(|\.create\(|pushSavedOrdersToSmartsheet|pullOrdersFromSmartsheet|onClick=\{\(\) => .*save/);
console.log('PASS Order pull includes capped names, client validates IDs, and desktop/mobile read-only review wiring exists');
