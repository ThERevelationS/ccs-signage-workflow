import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_PULL_REVIEW_PAGE_SIZE,
  planUnresolvedOrderBatchReview,
  verifyUnresolvedOrderBatchSheetRows,
  summarizeUnresolvedOrderBatchPage,
} from '../base44/shared/smartsheetOrderPullBatchReview.mjs';
import {
  startOrderBatchReview,
  appendOrderBatchReviewPage,
} from '../src/components/orders/orderBatchReviewSummary.mjs';

const sheetId = '4963691473987460';
const runStartedAt = '2026-10-10T10:00:00Z';
const ids = Array.from({ length: 43 }, (_, i) => 'order-' + (i + 1));
const rows = ids.map((_, i) => String(10000000 + i + 1));
const batch = {
  batch_number: 4, total_batches: 5, count: 43, state: 'write_uncertain',
  base44_order_ids: ids, smartsheet_row_ids: rows,
};
const evidence = {
  state: 'unresolved', run_started_at: runStartedAt,
  smartsheet_sheet_id: sheetId,
  batch_evidence: { attempted_batches: 5, recent_batches: [batch] },
};
const args = { runStartedAt, sheetId, batchNumber: 4 };
assert.equal(ORDER_PULL_REVIEW_PAGE_SIZE, 20);
const a = planUnresolvedOrderBatchReview(evidence, args);
const b = planUnresolvedOrderBatchReview(evidence, { ...args, offset: 20 });
const c = planUnresolvedOrderBatchReview(evidence, { ...args, offset: 40 });
assert.deepEqual([a.pairs.length, b.pairs.length, c.pairs.length], [20, 20, 3]);
assert.deepEqual([a.nextOffset, b.nextOffset, c.nextOffset], [20, 40, null]);
assert.equal(b.pairs[0].orderId, 'order-21');
assert.equal(c.pairs[2].rowId, rows[42]);
for (const different of [
  { ...args, sheetId: '42' }, { ...args, runStartedAt: '2026-10-09T10:00:00Z' },
  { ...args, batchNumber: 1 }, { ...args, offset: 1 }, { ...args, offset: 60 },
]) assert.throws(() => planUnresolvedOrderBatchReview(evidence, different), /Order/);
assert.throws(() => planUnresolvedOrderBatchReview({ ...evidence, state: 'verified_complete' }, args), /Order/);
assert.throws(() => planUnresolvedOrderBatchReview({ ...evidence, batch_evidence: {
  attempted_batches: 5, recent_batches: [batch, { ...batch, batch_number: 5 }],
} }, args), /duplicate or invalid permanent/);
assert.throws(() => planUnresolvedOrderBatchReview({ ...evidence, batch_evidence: {
  attempted_batches: 5, recent_batches: [{ ...batch, smartsheet_row_ids: [rows[0], rows[0], ...rows.slice(2)] }],
} }, args), /duplicate or invalid permanent/);
assert.throws(() => planUnresolvedOrderBatchReview({ ...evidence, batch_evidence: {
  attempted_batches: 5, recent_batches: [{ ...batch, count: 44 }],
} }, args), /malformed permanent/);
console.log('PASS exact unresolved batch identity, safe 20+20+3 paging and duplicate permanent-ID rejection');

// The rowIds-filtered Smartsheet Get Sheet response may change row order,
// but absent, extra, duplicate, or malformed permanent IDs invalidate a page.
const selectedIds = a.pairs.map(pair => pair.rowId);
const responseRows = selectedIds.map(id => ({ id: Number(id), cells: [] }));
assert.equal(verifyUnresolvedOrderBatchSheetRows({ rows: [...responseRows].reverse() }, selectedIds).length, 20);
assert.equal(verifyUnresolvedOrderBatchSheetRows({ rows: responseRows.slice(0, 3) }, selectedIds.slice(0, 3)).length, 3);
for (const invalid of [
  { rows: responseRows.slice(1) },
  { rows: [] },
  { rows: [...responseRows.slice(0, 19), responseRows[0]] },
  { rows: [...responseRows, { id: 987654321 }] },
  { rows: [...responseRows.slice(0, 19), { id: 987654321 }] },
  { rows: [...responseRows.slice(0, 19), { cells: [] }] },
  { rows: null },
  {},
]) assert.throws(() => verifyUnresolvedOrderBatchSheetRows(invalid, selectedIds), /Smartsheet/);
for (const request of [[selectedIds[0], selectedIds[0]], ['not-a-row'], []]) {
  assert.throws(() => verifyUnresolvedOrderBatchSheetRows({ rows: responseRows }, request), /Order|Smartsheet/);
}
console.log('PASS exact rowIds-filtered completeness, reordering, omissions, duplicates, unexpected IDs and malformed payloads');

function reports(plan, offset = 0) {
  return plan.pairs.map((pair, i) => ({
    base44_order_id: pair.orderId, smartsheet_row_id: pair.rowId,
    state: ['currently_aligned_unresolved', 'fields_differ',
      'snapshot_outdated', 'local_changes_pending', 'remote_unverified'][(offset + i) % 5],
    fields_differing: (offset + i) % 5 === 1 ? 1 : 0,
  }));
}
let combined = startOrderBatchReview({
  number: 4, links: ids.map((base44Id, i) => ({ base44Id, smartsheetRowId: rows[i] })),
}, { runStartedAt, sheetId });
assert.equal(combined.kind, 'running');
for (const plan of [a, b, c]) {
  const summary = summarizeUnresolvedOrderBatchPage(plan, reports(plan, plan.offset));
  assert.equal(summary.counts.matching + summary.counts.differing + summary.counts.investigating, summary.reviewed);
  const response = { success: true, read_only: true, writes_attempted: false, evidence_unresolved: true,
    run_started_at: runStartedAt, sheet_id: sheetId, ...summary };
  combined = appendOrderBatchReviewPage(combined, response, {
    links: ids.map((base44Id, i) => ({ base44Id, smartsheetRowId: rows[i] })),
  });
  if (plan !== c) assert.equal(combined.kind, 'running');
}
assert.equal(combined.kind, 'complete');
assert.equal(combined.reviewed, 43);
assert.equal(combined.counts.matching, 9);
assert.equal(combined.counts.differing, 18);
assert.equal(combined.counts.investigating, 16);
assert.equal(combined.rows.length, 43);
assert.deepEqual(combined.rows[42].smartsheet_row_id, rows[42]);
console.log('PASS batch summaries aggregate only confirmed matching/differing/investigating rows and never imply reconciliation');

const one = summarizeUnresolvedOrderBatchPage(a, reports(a));
const baseResponse = {
  success: true, read_only: true, writes_attempted: false, evidence_unresolved: true,
  run_started_at: runStartedAt, sheet_id: sheetId, ...one,
};
const initial = startOrderBatchReview({
  number: 4, links: ids.map((base44Id, i) => ({ base44Id, smartsheetRowId: rows[i] })),
}, { runStartedAt, sheetId });
for (const bad of [
  { ...baseResponse, read_only: false },
  { ...baseResponse, writes_attempted: true },
  { ...baseResponse, run_started_at: 'other' },
  { ...baseResponse, offset: 20 },
  { ...baseResponse, next_offset: null },
  { ...baseResponse, counts: { ...one.counts, matching: 999 } },
  { ...baseResponse, rows: [{ ...one.rows[0], base44_order_id: 'different' }, ...one.rows.slice(1)] },
  { ...baseResponse, rows: [{ ...one.rows[0], category: 'matching', state: 'fields_differ' }, ...one.rows.slice(1)] },
]) assert.throws(() => appendOrderBatchReviewPage(initial, bad, {
  links: ids.map((base44Id, i) => ({ base44Id, smartsheetRowId: rows[i] })),
}), /review|Order|batch|counts|misclassified/i);
assert.throws(() => summarizeUnresolvedOrderBatchPage(a, reports(a).slice(1)), /incomplete/);
console.log('PASS partial, spoofed, misclassified, duplicated, or out-of-order responses fail closed');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const begin = backend.indexOf("if (action === 'review_unresolved_order_pull_batch')");
const end = backend.indexOf("if (action === 'review_unresolved_order_pull_row')", begin);
assert.ok(begin > 0 && end > begin);
const action = backend.slice(begin, end);
assert.match(action, /adminActor\?\.role !== 'admin'/);
assert.match(action, /readOrderPullEvidenceStore\(/);
assert.match(action, /planUnresolvedOrderBatchReview\(/);
assert.match(action, /rowIds: rowIds\.join\(','\)/);
assert.match(action, /query: \{ id: \{ \$in: ids \} \}/);
assert.match(action, /verifyOrderCreateAuditSheetIdentity\(/);
assert.match(action, /buildOrderPullReadOnlyRowReport\(/);
assert.match(action, /sameStableValue\(current\?\.setting_value, evidence\)/);
assert.match(action, /read_only: true, writes_attempted: false, evidence_unresolved: true/);
assert.doesNotMatch(action, /\.updateMany\(|\.bulkUpdate\(|\.create\(|\.delete\(|claimInvocationRun\(/);
const panel = readFileSync('src/components/orders/OrderIndependentPullEvidence.jsx','utf8');
assert.match(panel, /action: 'review_unresolved_order_pull_batch'/);
assert.match(panel, /Review batch/);
assert.match(panel, /appendOrderBatchReviewPage\(/);
assert.match(panel, /Any partial counts above are not a complete batch review/);
assert.match(panel, /Matching values do not resolve the interrupted run or unlock Sync/);
assert.match(panel, /reviewEpoch\.current\+\+/);
console.log('PASS Order-only admin read-only bounded batch action, progress UI and stale evidence guard preserve the review lock');
