import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderPulledFieldsUnchanged, orderPullSnapshotAligned } from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { buildOrderPullSnapshot, parseRowToFields } from '../base44/shared/smartsheetSyncFields.ts';

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

const blankRow = { id: '9001', cells: [
  { column_id: '11', value: 'Acme', display_value: 'Acme' },
  { column_id: '12', value: null, display_value: '' },
] };
const blankBindings = { customer_name: '11', quantity: '12', vendor: '13' };
const blankPulled = parseRowToFields(blankRow, blankBindings, 'orders');
assert.equal(blankPulled.customer_name, 'Acme');
assert.equal(Object.prototype.hasOwnProperty.call(blankPulled, 'quantity'), false);
assert.equal(Object.prototype.hasOwnProperty.call(blankPulled, 'vendor'), false);
assert.deepEqual(buildOrderPullSnapshot(blankRow, blankBindings), { '11': 'Acme', '12': '', '13': '' });
console.log('PASS blank Order cells preserve Base44 fields while the remote snapshot records the actual blank');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /const expectedOrderSnapshot = buildOrderPullSnapshot\(row, bindings\)/);
assert.match(backend, /_remoteSnapshot: buildOrderPullSnapshot\(row, bindings\)/);
assert.match(backend, /const snapshot = _remoteSnapshot;/);
assert.match(backend, /orderPulledFieldsUnchanged\(existing, fieldValues\)\) \{[\s\S]*?!orderPullSnapshotAligned\(existing, expectedOrderSnapshot\)[\s\S]*?unchangedSkipped\+\+;\s*continue;/);
assert.ok(backend.indexOf("orderPulledFieldsUnchanged(existing, fieldValues)") < backend.indexOf("toUpdate.push({ id: existing.id"));
assert.match(backend, /unchanged_skipped: unchangedSkipped/);
console.log('PASS exact Order pulls skip business-field writes only with a verified nonempty snapshot and sync timestamp');
