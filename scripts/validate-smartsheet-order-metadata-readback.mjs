import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findUnverifiedOrderSyncMetadata } from '../base44/shared/smartsheetOrderMetadataVerification.mjs';

const expected = [
  {
    id: 'order-a',
    smartsheet_sync_snapshot: { date_needed: '2026-09-30', customer_name: 'Alpha' },
    smartsheet_last_synced_at: '2026-09-28T10:00:00.000Z',
  },
  {
    id: 'order-b',
    smartsheet_sync_snapshot: { date_received: '2026-09-27', receipt_option: '' },
    smartsheet_last_synced_at: '2026-09-28T10:00:01.000Z',
  },
];

assert.deepEqual(findUnverifiedOrderSyncMetadata(expected, [
  {
    id: 'order-a',
    // Persisted object key order must not matter.
    smartsheet_sync_snapshot: { customer_name: 'Alpha', date_needed: '2026-09-30' },
    smartsheet_last_synced_at: '2026-09-28T10:00:00.000Z',
  },
  {
    id: 'order-b',
    smartsheet_sync_snapshot: { receipt_option: '', date_received: '2026-09-27' },
    smartsheet_last_synced_at: '2026-09-28T10:00:01.000Z',
  },
  { id: 'unrelated', smartsheet_sync_snapshot: {}, smartsheet_last_synced_at: '' },
]), []);
console.log('PASS exact Order metadata survives read-back regardless of object key order');

assert.deepEqual(findUnverifiedOrderSyncMetadata(expected, [
  {
    id: 'order-a',
    smartsheet_sync_snapshot: { customer_name: 'Alpha', date_needed: '2026-09-29' },
    smartsheet_last_synced_at: '2026-09-28T10:00:00.000Z',
  },
  {
    id: 'order-b',
    smartsheet_sync_snapshot: { date_received: '2026-09-27', receipt_option: '' },
    smartsheet_last_synced_at: '2026-09-28T09:59:59.000Z',
  },
]), [
  { id: 'order-a', reason: 'snapshot_mismatch' },
  { id: 'order-b', reason: 'timestamp_mismatch' },
]);
console.log('PASS silently dropped snapshot or timestamp fields are reported separately');

assert.deepEqual(findUnverifiedOrderSyncMetadata(expected, [
  {
    id: 'order-a',
    smartsheet_sync_snapshot: { date_needed: '2026-09-30', customer_name: 'Alpha' },
    smartsheet_last_synced_at: '2026-09-28T10:00:00.000Z',
  },
]), [{ id: 'order-b', reason: 'record_missing' }]);
assert.deepEqual(findUnverifiedOrderSyncMetadata([{ smartsheet_sync_snapshot: {} }], []),
  [{ id: '', reason: 'missing_expected_id' }]);
console.log('PASS missing permanent Order IDs/records fail closed');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /findUnverifiedSyncMetadata/);
assert.match(backend, /const verifiedMetadataExpected: any\[\] = \[\]/);
assert.match(backend, /verifiedMetadataExpected\.push\(\.\.\.batch\)/);
assert.match(backend, /label: dataset === 'sales'[\s\S]*?'Order Form sync metadata verification'/);
assert.match(backend, /query: \{ smartsheet_sheet_id: sheetId \}/);
assert.match(backend, /metadataRows\.filter\(\(record: any\) => !record\?\.deleted\)/);
assert.match(backend, /snapshotWriteFailures \+= metadataFailures\.length/);
assert.match(backend, /if \(dataset === 'orders'\) updatedCount = Math\.max\(0, updatedCount - metadataFailures\.length\)/);
assert.match(backend, /const datasetLabel = dataset === 'sales' \? 'Sales' : 'Order'/);
assert.match(backend, /sync metadata read-back failed/);
assert.match(backend, /sync metadata could not be re-read/);
assert.doesNotMatch(
  backend.slice(backend.indexOf('// Re-read every metadata write by permanent Base44 ID'),
    backend.indexOf('// Preserve Base44 records whose exact permanent Smartsheet row ID is missing.')),
  /\.bulkUpdate\(|\.update\(|\.create\(/,
);
console.log('PASS Order metadata verification stays read-only after the metadata write and fails the run closed');
