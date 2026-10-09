import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_SYNC_RECOVERY_STALE_MS,
  classifyRecoverableStaleOrderSync,
  recoveredStaleOrderSyncValue,
  orderStaleBatchEvidencePreserved,
} from '../base44/shared/smartsheetOrderStaleRunSafety.mjs';

const now = Date.parse('2026-09-28T23:59:00.000Z');
const base = {
  status: 'running',
  started_at: '2026-09-28T22:50:26.450Z',
  updated_at: '2026-09-28T22:50:26.528Z',
  total_steps: 4,
  completed_steps: 3,
  current_step_label: 'Order Form → Smartsheet',
  results: [{ dataset: 'orders', direction: 'pull', updated: 1675 }],
};

assert.equal(ORDER_SYNC_RECOVERY_STALE_MS, 5 * 60 * 1000);
assert.equal(classifyRecoverableStaleOrderSync(base, now).recoverable, true);
assert.equal(classifyRecoverableStaleOrderSync({
  ...base,
  progress_updated_at: new Date(now - ORDER_SYNC_RECOVERY_STALE_MS).toISOString(),
}, now).recoverable, false);
assert.equal(classifyRecoverableStaleOrderSync({
  ...base,
  progress_updated_at: new Date(now - ORDER_SYNC_RECOVERY_STALE_MS - 1).toISOString(),
}, now).recoverable, true);
assert.equal(classifyRecoverableStaleOrderSync({ ...base, status: 'completed' }, now).reason, 'not_running');
assert.equal(classifyRecoverableStaleOrderSync({
  ...base, current_step_label: 'Sales Pipeline → Smartsheet',
}, now).reason, 'not_order_stage');
assert.equal(classifyRecoverableStaleOrderSync({
  status: 'running', current_step_label: 'Order Form → Smartsheet',
}, now).reason, 'missing_timestamp');
console.log('PASS only a provably stale running Order stage is recoverable');

const recoveredAt = '2026-09-28T23:59:01.000Z';
const recovered = recoveredStaleOrderSyncValue({
  ...base,
  progress_dataset: 'orders',
  progress_direction: 'push',
  progress_current: 418,
  progress_total: 1675,
  progress_item_label: '#418 · New Cincy',
}, recoveredAt);
assert.equal(recovered.status, 'needs_review');
assert.equal(recovered.needs_review, true);
assert.equal(recovered.completed_at, recoveredAt);
assert.equal(recovered.recovered_stale_run, true);
assert.equal(recovered.current_step_label, '');
assert.equal(recovered.results.length, 2);
assert.deepEqual(recovered.results[0], base.results[0]);
assert.equal(recovered.results[1].dataset, 'orders');
assert.equal(recovered.results[1].direction, 'push');
assert.equal(recovered.results[1].skipped, true);
assert.equal(recovered.results[1].partial, true);
assert.equal(recovered.results[1].stalled, true);
assert.equal(recovered.results[1].outcome_unverified, true);
assert.equal(recovered.results[1].processed_records, 418);
assert.equal(recovered.results[1].remaining_records, 1257);
assert.match(recovered.progress_detail, /1,257 line items were not confirmed complete/);
console.log('PASS recovery preserves prior results and records the stalled push as unverified rather than successful');

// A stalled Order pull may be interrupted in the middle of a Base44 batch.
// Close-for-review must preserve the exact permanent-ID evidence and must
// never imply that uncertain writes are safe to retry automatically.
const attemptedEvidence = {
  attempted_batches: 2,
  attempted_orders: 102,
  acknowledged_unverified_batches: 1,
  write_uncertain_batches: 1,
  older_batches_omitted: 0,
  recent_batches: [
    { batch_number: 1, total_batches: 2, count: 100, state: 'acknowledged_unverified',
      base44_order_ids: ['id-1', 'id-2'], smartsheet_row_ids: ['123456', '123457'] },
    { batch_number: 2, total_batches: 2, count: 2, state: 'write_uncertain',
      base44_order_ids: ['id-3', 'id-4'], smartsheet_row_ids: ['123458', '123459'] },
  ],
};
const stalePull = {
  ...base, results: [],
  current_step_label: 'Order Form ← Smartsheet',
  progress_dataset: 'orders', progress_direction: 'pull',
  progress_phase: 'applying', progress_current: 102, progress_total: 102,
  order_pull_batch_evidence: attemptedEvidence,
};
const recoveredPull = recoveredStaleOrderSyncValue(stalePull, recoveredAt);
assert.equal(recoveredPull.status, 'needs_review');
assert.equal(recoveredPull.order_pull_batch_evidence, attemptedEvidence);
assert.equal(recoveredPull.results.length, 1);
assert.equal(recoveredPull.results[0].direction, 'pull');
assert.equal(recoveredPull.results[0].skipped, true);
assert.equal(recoveredPull.results[0].outcome_unverified, true);
assert.equal(recoveredPull.results[0].order_pull_batch_evidence_requires_review, true);
assert.equal(recoveredPull.results[0].attempted_order_pull_batches, 2);
assert.match(recoveredPull.results[0].reason, /does not retry writes/);
assert.match(recoveredPull.results[0].reason, /permanent Order and Smartsheet row IDs/);
assert.match(recoveredPull.progress_detail, /no automatic retry/);
assert.equal(orderStaleBatchEvidencePreserved(stalePull, recoveredPull), true);
assert.equal(orderStaleBatchEvidencePreserved(base, recovered), true);
assert.equal(orderStaleBatchEvidencePreserved(stalePull, {
  ...recoveredPull, order_pull_batch_evidence: undefined,
}), false, 'Lost batch evidence cannot be treated as verified recovery');
assert.equal(orderStaleBatchEvidencePreserved(stalePull, {
  ...recoveredPull,
  order_pull_batch_evidence: { ...attemptedEvidence, attempted_batches: 1 },
}), false, 'Lost batch counts must invalidate recovery verification');
assert.equal(orderStaleBatchEvidencePreserved(stalePull, {
  ...recoveredPull,
  order_pull_batch_evidence: { ...attemptedEvidence,
    recent_batches: attemptedEvidence.recent_batches.map((item, i) => i === 0
      ? { ...item, smartsheet_row_ids: ['999999', '123457'] } : item) },
}), false, 'Changed permanent row identity must invalidate recovery verification');
assert.equal(orderStaleBatchEvidencePreserved(stalePull, {
  ...recoveredPull,
  order_pull_batch_evidence: { recent_batches: attemptedEvidence.recent_batches,
    attempted_orders: 102, write_uncertain_batches: 1, older_batches_omitted: 0,
    acknowledged_unverified_batches: 1, attempted_batches: 2 },
}), true, 'Object property ordering is not evidence tampering');
console.log('PASS stalled Order pull retains exact permanent IDs and uncertain batches; missing or changed evidence invalidates recovery');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
const layout = readFileSync('src/Layout.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSyncRecovery.js', 'utf8');

assert.match(backend, /supported_actions:[\s\S]*?'recover_stale_order_run'/);
assert.match(backend, /if \(action === 'recover_stale_order_run'\)/);
assert.match(backend, /expectedStartedAt !== cleanText\(current\?\.started_at, 80\)/);
assert.match(backend, /classifyRecoverableStaleOrderSync\(current, Date\.now\(\)\)/);
assert.match(backend, /updateMany\([\s\S]*?updated_date: record\.updated_date/);
assert.match(backend, /stale_recovered_by: cleanText\(adminActor\?\.email, 320\)/);
assert.match(backend, /status !== 'needs_review'/);
assert.match(backend, /stale_recovered_at !== recoveredAt/);
assert.match(backend, /!orderStaleBatchEvidencePreserved\(current, verified\?\.setting_value\)/);
assert.match(backend, /writes_retried: false/);
assert.match(backend, /without retrying writes/);
assert.match(backend, /!\['push_saved_orders', 'push_saved_sales'\]\.includes\(action\)/);
console.log('PASS backend recovery is admin-only, exact-run checked, stale-checked, CAS-protected and read-back verified');

assert.match(client, /action: "recover_stale_order_run"/);
assert.match(client, /expected_started_at: startedAt/);
assert.match(layout, /sessionToken=\{sessionToken\}/);
assert.match(layout, /currentUser=\{currentUser\}/);
assert.match(widget, /currentUser\?\.role === 'admin'/);
assert.match(widget, /orderProgress\.heartbeatAgeMs !== null/);
assert.match(widget, /Close stalled run/);
assert.match(widget, /recoverStalledOrderSync\(\{ sessionToken, expectedStartedAt: status\?\.started_at \}\)/);
assert.match(widget, /await loadStatus\(\)/);
console.log('PASS Order Form exposes recovery only to an authenticated admin and reloads authoritative status afterward');
