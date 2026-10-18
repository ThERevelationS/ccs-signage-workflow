import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOrderHistoricalImportEvidence,
  validateOrderImportAuditRowIds,
} from '../base44/shared/smartsheetOrderHistoricalImportAudit.mjs';

const sheetId = '4963691473987460';
const bindings = { customer_name: '11', description: '12' };
const rowIds = ['101', '102', '103', '104', '105', '106'];
const orders = [
  { id: 'aligned', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101',
    smartsheet_last_synced_at: '2026-10-01T00:00:00Z', smartsheet_sync_snapshot: { '11': 'Acme', '12': 'Sign' } },
  { id: 'queued', smartsheet_sheet_id: sheetId, smartsheet_row_id: '102',
    smartsheet_pending_local_sync: true, smartsheet_last_synced_at: '2026-10-01T00:00:00Z',
    smartsheet_sync_snapshot: { '11': 'Acme', '12': 'Queued' } },
  { id: 'duplicate-active', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103',
    smartsheet_sync_snapshot: { '11': 'Acme', '12': 'Current' } },
  { id: 'duplicate-deleted', deleted: true, smartsheet_sheet_id: sheetId, smartsheet_row_id: '103',
    smartsheet_sync_snapshot: { '11': 'Acme', '12': 'Old' } },
  { id: 'missing-remote', smartsheet_sheet_id: sheetId, smartsheet_row_id: '104' },
  { id: 'deleted-only', deleted: true, smartsheet_sheet_id: sheetId, smartsheet_row_id: '106' },
  { id: 'no-permanent-id', smartsheet_sheet_id: sheetId, smartsheet_row_id: '' },
  { id: 'bad-permanent-id', smartsheet_sheet_id: sheetId, smartsheet_row_id: 'abc',
    smartsheet_pending_local_sync: false },
  { id: 'other-sheet', smartsheet_sheet_id: '999', smartsheet_row_id: '107' },
];
const remoteRows = [
  { id: '101', modified_at: '2026-10-18T12:00:00Z', remote_snapshot: { '11': 'Acme', '12': 'Sign' } },
  { id: '102', remote_snapshot: { '11': 'Acme', '12': 'Queued' } },
  { id: '103', remote_snapshot: { '11': 'Acme', '12': 'Current' } },
  { id: '105', remote_snapshot: { '11': 'No Base44 owner', '12': 'Remote' } },
  { id: '106', remote_snapshot: { '11': 'Deleted', '12': 'Only' } },
];
const localSnapshots = {
  aligned: { '11': 'Acme', '12': 'Sign' },
  queued: { '11': 'Acme', '12': 'Queued' },
  'duplicate-active': { '11': 'Acme', '12': 'Current' },
  'duplicate-deleted': { '11': 'Acme', '12': 'Old' },
  'missing-remote': { '11': 'Missing', '12': 'Remote' },
  'deleted-only': { '11': 'Deleted', '12': 'Only' },
};
const report = buildOrderHistoricalImportEvidence({
  orders, rowIds, remoteRows, configuredSheetId: sheetId, bindings, localSnapshots,
});

assert.equal(report.read_only, true);
assert.equal(report.writes_attempted, false);
assert.equal(report.counts.currently_aligned_with_remote, 1);
assert.equal(report.counts.pending_local_sync, 1);
assert.equal(report.counts.duplicate_permanent_id_claims, 1);
assert.equal(report.counts.remote_row_missing, 1);
assert.equal(report.counts.no_local_claim, 1);
assert.equal(report.counts.soft_deleted_claims, 1);
assert.equal(report.counts.missing_permanent_id_orders, 1);
assert.equal(report.counts.invalid_permanent_id_orders, 1);
assert.equal(report.counts.local_marker_true, 1);
assert.equal(report.counts.local_marker_false, 1);
assert.equal(report.counts.local_marker_absent, 7);
assert.equal(report.rows.find(row => row.row_id === '103').claims.length, 2);
assert.equal(report.rows.find(row => row.row_id === '103').claims.some(claim => claim.deleted), true);
assert.equal(report.rows.find(row => row.row_id === '104').review_required, true);
assert.equal(report.rows.find(row => row.row_id === '101').classification, 'currently_aligned_with_remote');
assert.match(report.interpretation, /does not prove that a historical Excel import was the source/);
assert.doesNotMatch(JSON.stringify(report), /"(?:Acme|No Base44 owner|Queued|Current|Sign|Old|Only)"/);
console.log('PASS classifications include active/deleted duplicates, queued, aligned, missing remote, no owner, and missing IDs without exposing cell values');

assert.deepEqual(validateOrderImportAuditRowIds(['001', '25']), ['001', '25']);
assert.throws(() => validateOrderImportAuditRowIds([]), /between 1 and 25/);
assert.throws(() => validateOrderImportAuditRowIds(Array.from({ length: 26 }, (_, i) => String(i + 1))), /between 1 and 25/);
assert.throws(() => validateOrderImportAuditRowIds(['10', '10']), /Repeated row IDs/);
assert.throws(() => validateOrderImportAuditRowIds(['1x']), /positive numeric/);
console.log('PASS audit batches reject empty, oversized, duplicate, and malformed row ID lists');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderLinkIntegrityReview.jsx', 'utf8');
const action = backend.slice(
  backend.indexOf("if (action === 'audit_order_import_sync_evidence')"),
  backend.indexOf("if (action === 'audit_order_link_integrity')"),
);
assert.match(backend, /audit_order_import_sync_evidence/);
assert.match(action, /adminActor\?\.role !== 'admin' \|\| !hasSessionToken/);
assert.match(action, /validateOrderImportAuditRowIds\(body\?\.row_ids\)/);
assert.match(action, /smartsheetGet\(.*rows\/\$\{rowId\}/s);
assert.match(action, /sameStableValue\(readSignature\(allOrders\), readSignature\(freshOrders\)\)/);
assert.match(action, /writes_attempted: false/);
assert.doesNotMatch(action, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(|\.delete\(/);
assert.match(ui, /action: "audit_order_import_sync_evidence"/);
assert.match(ui, /historicalRowIds\.split\(\/[\\s,;]\+\//);
assert.match(ui, /Missing markers alone never prove sync/);
console.log('PASS endpoint and Order review UI expose only bounded admin read-only reconciliation');
