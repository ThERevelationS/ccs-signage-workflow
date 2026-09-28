import assert from 'node:assert/strict';
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

console.log('PASS exact Order pulls can skip writes only with a verified nonempty snapshot and sync timestamp');
