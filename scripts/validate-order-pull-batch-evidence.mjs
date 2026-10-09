import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordOrderPullBatchEvidence, ORDER_PULL_EVIDENCE_RECENT_BATCHES } from '../base44/shared/smartsheetOrderPullBatchEvidence.mjs';
import { orderFormSyncStatusRelevant } from '../src/components/orders/orderSyncWidgetRelevance.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

const batch = n => [{ id: `order-${n}-1`, _existing: { smartsheet_row_id: String(100000 + n) } },
  { id: `order-${n}-2`, _existing: { smartsheet_row_id: String(200000 + n) } }];
const add = (previous, n, state, totalBatches = 8) =>
  recordOrderPullBatchEvidence(previous, { batchNumber: n, totalBatches, batch: batch(n), state });

let evidence = add(null, 1, 'attempting');
assert.equal(evidence.attempted_batches, 1);
assert.equal(evidence.acknowledged_unverified_batches, 0);
assert.deepEqual(evidence.recent_batches[0].base44_order_ids, ['order-1-1', 'order-1-2']);
assert.deepEqual(evidence.recent_batches[0].smartsheet_row_ids, ['100001', '200001']);
assert.equal(evidence.recent_batches[0].state, 'attempting');
evidence = add(evidence, 1, 'acknowledged_unverified');
assert.equal(evidence.attempted_batches, 1);
assert.equal(evidence.acknowledged_unverified_batches, 1);
assert.equal(evidence.recent_batches[0].state, 'acknowledged_unverified');
evidence = add(evidence, 2, 'attempting');
evidence = add(evidence, 2, 'write_uncertain');
assert.equal(evidence.attempted_batches, 2);
assert.equal(evidence.write_uncertain_batches, 1);
assert.equal(evidence.acknowledged_unverified_batches, 1);
assert.equal(evidence.recent_batches[1].state, 'write_uncertain');
for (let n = 3; n <= 8; n++) {
  evidence = add(evidence, n, 'attempting');
  evidence = add(evidence, n, 'acknowledged_unverified');
}
assert.equal(evidence.attempted_batches, 8);
assert.equal(evidence.attempted_orders, 16);
assert.equal(evidence.acknowledged_unverified_batches, 7);
assert.equal(evidence.write_uncertain_batches, 1);
assert.equal(evidence.recent_batches.length, ORDER_PULL_EVIDENCE_RECENT_BATCHES);
assert.equal(evidence.older_batches_omitted, 3);
assert.deepEqual(evidence.recent_batches.map(item => item.batch_number), [4, 5, 6, 7, 8]);
console.log('PASS 8 batches keep bounded recent permanent IDs and aggregate attempted/acknowledged/uncertain counts');

for (const invalid of [
  { batchNumber: 1, totalBatches: 1, batch: [], state: 'attempting' },
  { batchNumber: 2, totalBatches: 1, batch: batch(2), state: 'attempting' },
  { batchNumber: 1, totalBatches: 1, batch: [{ id: 'x', _existing: {} }], state: 'attempting' },
  { batchNumber: 1, totalBatches: 1, batch: [batch(1)[0], batch(1)[0]], state: 'attempting' },
  { batchNumber: 1, totalBatches: 1, batch: batch(1), state: 'verified' },
]) assert.throws(() => recordOrderPullBatchEvidence(null, invalid), /evidence/);
assert.throws(() => add(null, 1, 'acknowledged_unverified'), /pre-write attempt/);
assert.equal(orderFormSyncStatusRelevant({
  status: 'failed', progress_dataset: 'orders',
  results: [], order_pull_batch_evidence: evidence,
}), true, 'A failed Order pull with no results must remain visible for review');
assert.equal(orderFormSyncStatusRelevant({
  status: 'failed', progress_dataset: 'sales',
  results: [], order_pull_batch_evidence: evidence,
}), false, 'The Order widget must not show unrelated Sales failures');
assert.equal(orderRunRequiresReview([{ dataset: 'orders', direction: 'pull', skipped: true, reason: 'Interrupted after first write' }]), true);
console.log('PASS invalid batch evidence fails closed and an incomplete Order run remains reviewable without Sales leakage');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const pull = backend.slice(backend.indexOf('async function pullDataset('), backend.indexOf('async function loadSyncConfig('));
const attempt = pull.indexOf("state: 'attempting'");
const beforeWrite = pull.indexOf('await options.reportOrderPullProgress({', attempt);
const write = pull.indexOf('await base44.asServiceRole.entities[entityName].bulkUpdate(payload)');
const acknowledgment = pull.indexOf("state: 'acknowledged_unverified'");
const uncertain = pull.indexOf("state: 'write_uncertain'");
assert.ok(attempt >= 0 && beforeWrite > attempt && beforeWrite < write);
assert.ok(acknowledgment > write && uncertain > write);
assert.match(pull, /batchEvidence: orderPullBatchEvidence/);
assert.match(backend, /let lastOrderPullBatchEvidence: any = null/);
assert.match(backend, /if \(batchEvidence\) lastOrderPullBatchEvidence = batchEvidence/);
assert.ok((backend.match(/order_pull_batch_evidence: lastOrderPullBatchEvidence/g) || []).length >= 2,
  'Batch evidence must survive both subsequent progress and terminal status writes');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
assert.match(widget, /currentUser\?\.role === 'admin'/);
assert.match(widget, /Order pull batch evidence:/);
assert.match(widget, /Base44 Order IDs:/);
assert.match(widget, /Permanent Smartsheet row IDs:/);
assert.match(widget, /An API acknowledgment does not prove fields or snapshots were saved/);
assert.match(widget, /status\?\.status === 'failed'/);
console.log('PASS evidence checkpoint precedes Base44 writes, survives final coordinator state, and is admin-only in Order Form');
