import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyOrderPullBusinessReadback } from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

const proposed = { id: 'order-a', sheetId: '4963691473987460', rowId: '123456789',
  fields: { description: 'New panel', quantity: 2, date_needed_option: 'ASAP' },
  snapshot: { '5912314017802116': 'New panel' } };
const persisted = { id: 'order-a', smartsheet_sheet_id: proposed.sheetId,
  smartsheet_row_id: proposed.rowId, description: 'New panel', quantity: 2, date_needed_option: 'ASAP' };
const verify = (order) => classifyOrderPullBusinessReadback([proposed], order === null ? [] : [order]);
assert.equal(verify(persisted).verified.length, 1);
assert.deepEqual(verify(persisted).failures, []);
for (const unverified of [
  null,
  { ...persisted, description: 'Old panel' }, // acknowledged but silently dropped non-date field
  { ...persisted, quantity: 1 },
  { ...persisted, date_needed_option: '' },
  { ...persisted, smartsheet_row_id: '999999999' }, // visually identical recreated row
  { ...persisted, smartsheet_sheet_id: '222222222' },
  { ...persisted, smartsheet_pending_local_sync: true }, // new local edit while pulling
  { ...persisted, deleted: true },
]) {
  const result = verify(unverified);
  assert.equal(result.verified.length, 0);
  assert.deepEqual(result.failures.map(x => x.id), [proposed.id]);
}
assert.equal(classifyOrderPullBusinessReadback([{ ...proposed, fields: {} }], [persisted]).verified.length, 0);
assert.equal(classifyOrderPullBusinessReadback([{ ...proposed, rowId: '' }], [persisted]).verified.length, 0);
assert.equal(classifyOrderPullBusinessReadback([proposed, { ...proposed, id: 'order-missing' }], [persisted]).verified.length, 1);
assert.equal(classifyOrderPullBusinessReadback([proposed, { ...proposed, id: 'order-missing' }], [persisted]).failures.length, 1);
assert.equal(orderRunRequiresReview([{ dataset: 'orders', direction: 'pull', business_field_write_failures: 1, errors: 0 }]), true);
assert.equal(orderRunRequiresReview([{ dataset: 'sales', direction: 'pull', business_field_write_failures: 1 }]), false);
console.log('PASS read-back preserves Order permanent row and full business fields; failed or partial updates require review');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const pull = backend.slice(backend.indexOf('async function pullDataset('), backend.indexOf('async function loadSyncConfig('));
const bulk = pull.indexOf('await base44.asServiceRole.entities[entityName].bulkUpdate(payload)');
const candidate = pull.indexOf('orderBusinessVerifications.push({');
const verification = pull.indexOf('classifyOrderPullBusinessReadback(eligible, actualRows)');
const metadata = pull.indexOf('snapshotUpdates.push(...review.verified.map(');
const metadataWrite = pull.indexOf('await base44.asServiceRole.entities[entityName].bulkUpdate(batch)');
assert.ok(bulk >= 0 && candidate > bulk && verification > candidate && metadata > verification && metadataWrite > metadata);
assert.match(pull, /orderFailedDateVerificationIds.add\(String\(item.id\)\)/);
assert.match(pull, /eligible = orderBusinessVerifications.filter\(item => !orderFailedDateVerificationIds.has\(String\(item.id\)\)\)/);
const orderBulkBranch = pull.slice(pull.indexOf("if (dataset === 'orders') {\n            const changes = changedPulledOrderDates"), pull.indexOf("} else {\n            const expectedParentRowId"));
assert.ok(orderBulkBranch.includes('orderBusinessVerifications.push({'));
assert.doesNotMatch(orderBulkBranch, /snapshotUpdates.push\(/, 'Order snapshot cannot advance from a bulk ACK without read-back');
assert.match(pull, /if \(typeof options\?\.assertRunOwnership === 'function'\) await options.assertRunOwnership\(\);\s*try \{\s*const actualRows/);
assert.match(pull, /business_field_write_failures: orderBusinessWriteFailures/);
console.log('PASS Order business-field read-back occurs after bulk ACK and before snapshot writes, without modifying Sales flow');
