import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findUnresolvedOrderEvidencePair,
  compareUnresolvedOrderEvidenceRow,
} from '../base44/shared/smartsheetOrderPullRowReview.mjs';

const sheetId = '4963691473987460';
const runStartedAt = '2026-10-10T10:00:00.000Z';
const data = {
  state: 'unresolved', run_started_at: runStartedAt, smartsheet_sheet_id: sheetId,
  batch_evidence: { attempted_batches: 2, recent_batches: [
    { batch_number: 1, state: 'acknowledged_unverified',
      base44_order_ids: ['o-a', 'o-b'], smartsheet_row_ids: ['101', '102'] },
    { batch_number: 2, state: 'write_uncertain',
      base44_order_ids: ['o-c'], smartsheet_row_ids: ['103'] },
  ] },
};
const args = { runStartedAt, orderId: 'o-a', rowId: '101', sheetId };
assert.deepEqual(findUnresolvedOrderEvidencePair(data, args),
  { batchNumber: 1, batchState: 'acknowledged_unverified' });
for (const altered of [
  { runStartedAt: '2026-10-09T10:00:00.000Z' },
  { orderId: 'o-z' },
  { rowId: '102' },
  { sheetId: '123' },
]) assert.equal(findUnresolvedOrderEvidencePair(data, { ...args, ...altered }), null);
assert.equal(findUnresolvedOrderEvidencePair({ ...data, state: 'verified_complete' }, args), null);
assert.equal(findUnresolvedOrderEvidencePair({ ...data, batch_evidence: {
  attempted_batches: 2, recent_batches: [
    data.batch_evidence.recent_batches[0],
    { batch_number: 2, state: 'write_uncertain',
      base44_order_ids: ['o-c'], smartsheet_row_ids: ['101'] },
  ],
} }, args), null, 'Duplicate Smartsheet permanent row assigned to two Orders must block comparison');
assert.equal(findUnresolvedOrderEvidencePair({ ...data, batch_evidence: {
  attempted_batches: 2, recent_batches: [
    data.batch_evidence.recent_batches[0],
    { batch_number: 2, state: 'write_uncertain',
      base44_order_ids: ['o-a'], smartsheet_row_ids: ['101'] },
  ],
} }, args), null);
assert.equal(findUnresolvedOrderEvidencePair({ ...data, batch_evidence: {
  attempted_batches: 1, recent_batches: [{ batch_number: 1, state: 'verified', base44_order_ids: ['o-a'], smartsheet_row_ids: ['101'] }],
} }, args), null);
console.log('PASS only one exact pair from the unresolved recorded run is reviewable; duplicate or changed identities fail closed');

const order = {
  id: 'o-a', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101',
  description: 'Panel', quantity: '2', date_needed: '2026-10-11',
  smartsheet_last_synced_at: '2026-10-09T10:00:00Z',
  smartsheet_sync_snapshot: { '123': 'Panel', '124': '2' },
  smartsheet_pending_local_sync: false,
};
const remoteRow = { id: '101' };
const base = { base44Order: order, remoteRow, orderId: 'o-a', rowId: '101',
  sheetId, expectedFields: { description: 'Panel', quantity: '2' },
  expectedSnapshot: { '123': 'Panel', '124': '2' } };
const matching = compareUnresolvedOrderEvidenceRow(base);
assert.equal(matching.state, 'currently_aligned_unresolved');
assert.equal(matching.fields_differing, 0);
assert.equal(matching.snapshot_matches, true);
assert.match(matching.message, /remains unresolved/);
const different = compareUnresolvedOrderEvidenceRow({ ...base,
  expectedFields: { description: 'Changed', quantity: '2' } });
assert.equal(different.state, 'fields_differ');
assert.equal(different.fields_differing, 1);
assert.deepEqual(different.fields.map(f => f.matches), [false, true]);
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  expectedSnapshot: { '123': 'Old', '124': '2' } }).state, 'snapshot_outdated');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  base44Order: { ...order, smartsheet_pending_local_sync: true } }).state, 'local_changes_pending');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  base44Order: { ...order, smartsheet_row_id: '999' } }).state, 'identity_mismatch');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  base44Order: { ...order, deleted: true } }).state, 'identity_mismatch');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  base44Order: null }).state, 'identity_mismatch');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  remoteRow: { id: '999' } }).state, 'remote_unverified');
assert.equal(compareUnresolvedOrderEvidenceRow({ ...base,
  expectedFields: {} }).state, 'insufficient_fields');
console.log('PASS field differences, stale snapshots, local edits, deleted/incorrect permanent IDs never imply reconciliation');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const start = backend.indexOf("if (action === 'review_unresolved_order_pull_row')");
const end = backend.indexOf("if (action === 'recover_stale_order_run')", start);
assert.ok(start >= 0 && end > start);
const action = backend.slice(start, end);
assert.match(action, /adminActor\?\.role !== 'admin' \|\| !hasSessionToken/);
assert.match(action, /findUnresolvedOrderEvidencePair\(evidence/);
assert.match(action, /profile\.smartsheet_sheet_id, 40\) !== sheetId/);
assert.match(action, /entities\.Order\.get\(orderId\)/);
assert.match(action, /smartsheetGet\(`\/sheets\/\$\{sheetId\}\/rows\/\$\{rowId\}`/);
assert.match(action, /parseRowToFields\(remoteRow, bindings, 'orders'\)/);
assert.match(action, /normalizePullValue\(key, val\)/);
assert.match(action, /orderStatusFromPulledDates\(/);
assert.match(action, /buildOrderPullSnapshot\(remoteRow, bindings\)/);
assert.match(action, /auditOrderDateParity\(\[base44Order\], \[remoteRow\], bindings, sheetId\)/);
assert.match(action, /sameStableValue\(current\?\.setting_value, evidence\)/);
assert.match(action, /read_only: true, writes_attempted: false, evidence_unresolved: true/);
assert.doesNotMatch(action, /\.updateMany\(|\.bulkUpdate\(|\.create\(|\.delete\(|claimInvocationRun\(/);
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const panel = readFileSync('src/components/orders/OrderIndependentPullEvidence.jsx', 'utf8');
assert.match(page, /sessionToken=\{sessionToken\}/);
assert.match(panel, /action: 'review_unresolved_order_pull_row'/);
assert.match(panel, /Compare live records/);
assert.match(panel, /data\.read_only !== true/);
assert.match(panel, /Comparison does not clear the review lock/);
console.log('PASS authenticated single-row read-only endpoint and Order-only UI do not perform reconciliation writes');
