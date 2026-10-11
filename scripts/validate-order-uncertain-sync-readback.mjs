import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyUncertainOrderSyncReadback,
  verifyUncertainOrderSyncReadback,
} from '../src/components/orders/orderUncertainSyncReadback.mjs';

const synced = {
  id: 'order-a', smartsheet_pending_local_sync: false,
  smartsheet_sheet_id: '4963691473987460', smartsheet_row_id: '123456789',
  smartsheet_last_synced_at: '2026-10-11T12:00:00Z',
  smartsheet_sync_snapshot: { '10': 'Panel' },
};
const pending = { id: 'order-b', smartsheet_pending_local_sync: true };
const ids = ['order-a', 'order-b'];
let mockCalls = 0;
// A lost HTTP response after a completed Order + still-queued Order: the
// provider mock must receive EXACT immutable IDs, not a visible/filtered list.
const mockRead = async (requestedIds) => {
  mockCalls++;
  assert.deepEqual(requestedIds, ids);
  return [pending, synced]; // pagination may reorder records
};
assert.deepEqual(await verifyUncertainOrderSyncReadback(ids, mockRead), {
  confirmedIds: ['order-a'], pendingIds: ['order-b'],
});
assert.equal(mockCalls, 1);
assert.deepEqual(classifyUncertainOrderSyncReadback(['order-a'], [synced]),
  { confirmedIds: ['order-a'], pendingIds: [] });
assert.deepEqual(classifyUncertainOrderSyncReadback(['order-b'], [pending]),
  { confirmedIds: [], pendingIds: ['order-b'] });
console.log('PASS mocked response-loss read-back distinguishes verified completion from durable pending without repeating a write');

// The filtered spreadsheet might display only order-a. Never infer order-b
// succeeded merely because it vanished from that list after a reload.
const visibleRows = [synced];
assert.equal(visibleRows.some(row => row.id === 'order-b'), false);
assert.deepEqual(classifyUncertainOrderSyncReadback(ids, [synced, pending]).pendingIds, ['order-b']);

for (const badRows of [
  [synced], [pending], [], [synced, synced],
  [synced, pending, { id: 'extra', smartsheet_pending_local_sync: true }],
  [synced, { ...pending, deleted: true }],
  [{ ...synced, smartsheet_pending_local_sync: null }, pending],
  [{ ...synced, smartsheet_sync_snapshot: null }, pending],
  [{ ...synced, smartsheet_last_synced_at: null }, pending],
  [{ ...synced, smartsheet_row_id: 'bad' }, pending],
  [{ ...synced, smartsheet_sheet_id: 'bad' }, pending],
  [{ ...synced, smartsheet_sync_snapshot: {} }, pending],
  null,
]) {
  assert.throws(() => classifyUncertainOrderSyncReadback(ids, badRows),
    /Uncertain Order sync/);
}
for (const badIds of [[], ['order-a', 'order-a'], [''], [null]]) {
  assert.throws(() => classifyUncertainOrderSyncReadback(badIds, [synced]), /Uncertain Order sync/);
}
console.log('PASS omissions, duplicates, deleted/mislinked Orders, unverified metadata and malformed reads fail closed');

let failedCalls = 0;
await assert.rejects(verifyUncertainOrderSyncReadback(ids, async () => {
  failedCalls++;
  throw new Error('Mock Base44 read timeout');
}), /Mock Base44 read timeout/);
assert.equal(failedCalls, 1, 'Uncertain read failures are not retried blindly');
await assert.rejects(verifyUncertainOrderSyncReadback(ids, async () => [synced]), /omitted/);
await assert.rejects(verifyUncertainOrderSyncReadback(ids, null), /read-back operation/);
console.log('PASS mocked read timeout and incomplete response cannot be mistaken for successful synchronization');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const catchBlock = ui.slice(ui.indexOf('const saveAndSync = async () =>'),
  ui.indexOf('// Existing internal/manual callers'));
const exactStart = catchBlock.indexOf('await verifyUncertainOrderSyncReadback(orderIds');
const visibleReload = catchBlock.indexOf('const verificationLoaded = await loadData(false)');
const queueRepair = catchBlock.indexOf('for (const id of exact.pendingIds)');
const successCheck = catchBlock.indexOf('if (unresolvedTargets.length === 0)');
assert.ok(exactStart >= 0 && visibleReload > exactStart && queueRepair > visibleReload &&
  successCheck > queueRepair, 'Exact identity verification precedes visible-list reload and success claims');
assert.match(catchBlock, /query: \{ id: \{ \$in: ids \} \}/);
assert.match(catchBlock, /pendingSyncIdsRef\.current\.add\(id\)/);
assert.match(catchBlock, /if \(!verificationLoaded\) throw/);
assert.match(catchBlock, /catch \(verificationError\)/);
assert.match(catchBlock, /Saved in Base44, but Smartsheet sync needs attention:/);
console.log('PASS UI recovery refuses filtered-list absence as success and preserves pending Orders after uncertain responses');
