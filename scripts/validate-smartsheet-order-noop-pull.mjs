import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderPulledFieldsUnchanged, orderPullSnapshotAligned } from '../base44/shared/smartsheetOrderPullSafety.mjs';

const row = { customer_name: 'Acme', quantity: '2', status: 'ordered', date_needed: '2026-10-01',
  smartsheet_last_synced_at: '2026-09-28T11:30:00.000Z',
  smartsheet_sync_snapshot: { '11': 'Acme', '12': '2', '13': '2026-10-01' } };

assert.equal(orderPulledFieldsUnchanged(row,
  { customer_name: 'Acme', quantity: '2', status: 'ordered', date_needed: '2026-10-01' }), true);
assert.equal(orderPullSnapshotAligned(row,
  { '13': '2026-10-01', '12': '2', '11': 'Acme' }), true);

assert.equal(orderPulledFieldsUnchanged(row, { customer_name: 'Acme', quantity: '3' }), false);
assert.equal(orderPullSnapshotAligned(row, { '11': 'Acme', '12': '3', '13': '2026-10-01' }), false);
assert.equal(orderPullSnapshotAligned({ ...row, smartsheet_sync_snapshot: null }, { '11': 'Acme' }), false);
assert.equal(orderPullSnapshotAligned({ ...row, smartsheet_last_synced_at: '' }, row.smartsheet_sync_snapshot), false);
assert.equal(orderPullSnapshotAligned({ ...row, smartsheet_sync_snapshot: {} }, {}), false);
assert.equal(orderPullSnapshotAligned(row, { '11': 'Acme', '12': '2' }), false);

assert.equal(orderPulledFieldsUnchanged({ receipt_option: 'In Stock', date_received: '' },
  { receipt_option: '', date_received: '2026-09-28' }), false);

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /const expectedOrderSnapshot = buildSnapshot\(\{ \.\.\.existing, \.\.\.fieldValues \}, bindings, 'orders'\)/);
assert.match(backend, /orderPulledFieldsUnchanged\(existing, fieldValues\) &&[\s\S]*?orderPullSnapshotAligned\(existing, expectedOrderSnapshot\)[\s\S]*?unchangedSkipped\+\+[\s\S]*?continue/);
assert.ok(backend.indexOf("orderPulledFieldsUnchanged(existing, fieldValues)") < backend.indexOf("toUpdate.push({ id: existing.id"));
assert.match(backend, /unchanged_skipped: unchangedSkipped/);
console.log('PASS exact Order pulls skip business-field writes only with a verified nonempty snapshot and sync timestamp');
