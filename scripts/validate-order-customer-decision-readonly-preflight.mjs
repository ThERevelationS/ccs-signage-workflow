import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOrderCustomerDecisionEvidence } from '../base44/shared/smartsheetOrderCustomerDecisionSafety.mjs';
import { normalizeOrderLinkedCustomerReviews } from '../src/components/orders/orderLinkedCustomerReviewPresentation.mjs';

const review = {
  order_id: 'order-permanent-001',
  sheet_id: '4963691473987460',
  row_id: '123456789',
  work_order_id: 'job-permanent-55',
  local_customer_name: 'Original customer',
  smartsheet_customer_name: 'Different Smartsheet customer',
  order_updated_date: '2026-10-13T10:00:00.000Z',
  remote_modified_at: '2026-10-13T10:01:00.000Z',
};
const order = { id: review.order_id, updated_date: review.order_updated_date,
  work_order_id: review.work_order_id, smartsheet_sheet_id: review.sheet_id,
  smartsheet_row_id: review.row_id, customer_name: review.local_customer_name,
  deleted: false, smartsheet_pending_local_sync: false };
const job = { id: review.work_order_id, client_name: review.local_customer_name, deleted: false };
const remoteRow = { id: review.row_id, modified_at: review.remote_modified_at };
const base = { review, order, job, remoteRow, remoteCustomerName: review.smartsheet_customer_name };
for (const decision of ['keep_linked_job', 'adopt_smartsheet_unlink_job']) {
  assert.equal(checkOrderCustomerDecisionEvidence({ ...base, decision }), 'verified_read_only');
}
assert.equal(checkOrderCustomerDecisionEvidence({ ...base, decision: 'approve_unconditionally' }), 'invalid_review');
assert.equal(checkOrderCustomerDecisionEvidence({ ...base, decision: 'keep_linked_job', review: { ...review, remote_modified_at: '' } }), 'invalid_review');
assert.equal(checkOrderCustomerDecisionEvidence({ ...base, decision: 'keep_linked_job', review: { ...review, order_updated_date: '' } }), 'invalid_review');
console.log('PASS both explicit choices are read-only; malformed/revisionless captured evidence fails closed');

const d = 'keep_linked_job';
const check = overrides => checkOrderCustomerDecisionEvidence({ ...base, decision: d, ...overrides });
for (const updated of [
  { work_order_id: 'other-job' }, { updated_date: '2026-10-13T10:02:00Z' },
  { smartsheet_pending_local_sync: true }, { customer_name: 'Newer edit' },
  { smartsheet_row_id: '999999' }, { smartsheet_sheet_id: '999999' },
  { deleted: true },
]) assert.equal(check({ order: { ...order, ...updated } }), 'order_changed');
assert.equal(check({ duplicateClaims: true }), 'order_changed');
assert.equal(check({ order: null }), 'order_changed');
assert.equal(check({ job: null }), 'linked_job_unverified');
assert.equal(check({ job: { ...job, deleted: true } }), 'linked_job_unverified');
assert.equal(check({ job: { ...job, id: 'other-job' } }), 'linked_job_unverified');
assert.equal(check({ job: { ...job, client_name: 'Unrelated customer' } }), 'linked_job_unverified');
assert.equal(check({ job: { ...job, client_name: '  ORIGINAL    CUSTOMER  ' } }), 'verified_read_only');
assert.equal(check({ remoteRow: { ...remoteRow, modified_at: '2026-10-13T10:05:00Z' } }), 'smartsheet_changed');
assert.equal(check({ remoteRow: { ...remoteRow, id: '987654' } }), 'smartsheet_changed');
assert.equal(check({ remoteCustomerName: 'Other updated customer' }), 'smartsheet_changed');
assert.equal(check({ remoteCustomerName: review.local_customer_name }), 'smartsheet_changed');
console.log('PASS changed local, linked job, permanent IDs, duplicate claims and remote revision/name block verification');

const normalized = normalizeOrderLinkedCustomerReviews([review], 1)[0];
assert.equal(normalized.orderUpdatedDate, review.order_updated_date);
assert.equal(normalized.remoteModifiedAt, review.remote_modified_at);

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js','utf8');
const panel = readFileSync('src/components/orders/OrderLinkedCustomerReview.jsx','utf8');
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx','utf8');
const preview = backend.slice(backend.indexOf("if (action === 'preview_order_customer_decision')"),
  backend.indexOf("if (action === 'audit_sales_permanent_ownership')"));
assert.ok(preview.length > 2500);
assert.match(preview, /adminActor\?\.role !== 'admin' \|\| !hasSessionToken/);
assert.match(preview, /checkOrderCustomerDecisionEvidence\(\{/);
assert.match(preview, /duplicateCount !== 1/);
assert.match(preview, /query: \{ smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId \}/);
assert.match(preview, /smartsheetGet\(`\/sheets\/\$\{sheetId\}\/rows\/\$\{rowId\}`/);
assert.match(preview, /freshClaims\.length !== 1/);
assert.match(preview, /state !== 'verified_read_only'/);
assert.match(preview, /read_only: true, writes_attempted: false/);
assert.doesNotMatch(preview, /\.update\(|\.updateMany\(|\.bulkUpdate\(|\.create\(|\.upsert\(|smartsheetWrite\(|smartsheetWriteNoTimeoutRetry\(|claimInvocationRun\(/);
assert.match(client, /action: 'preview_order_customer_decision'/);
assert.match(client, /attempts: 1, retryRateLimit: false, retryCoordinatorBusy: false/);
assert.match(client, /result\?\.writes_attempted !== false/);
assert.match(panel, /Verify decision safely/);
assert.match(panel, /isAdmin &&/);
assert.match(panel, /previewEpochRef\.current \+= 1/);
assert.match(ui, /isAdmin=\{currentUser\?\.role === 'admin'\} sessionToken=\{sessionToken\}/);
console.log('PASS authenticated exact-revision read-only endpoint and admin-only desktop/mobile controls are wired with no write path');
