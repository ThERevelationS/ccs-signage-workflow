import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canClearCompletedOrderSyncTarget } from '../src/components/orders/orderSyncCompletionSafety.mjs';
import { verifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';

const target = { id: 'order-A', version: 4 };
assert.equal(canClearCompletedOrderSyncTarget({ target, currentVersion: 4, pendingFields: {} }), true);
assert.equal(canClearCompletedOrderSyncTarget({ target, currentVersion: 5, pendingFields: {} }), false);
assert.equal(canClearCompletedOrderSyncTarget({ target, currentVersion: 4, pendingFields: { description: 'New unsaved value' } }), false);
assert.equal(canClearCompletedOrderSyncTarget({ target, currentVersion: 4, pendingFields: { description: '' } }), false);
assert.equal(canClearCompletedOrderSyncTarget({ target, currentVersion: 4, pendingFields: null }), false);
assert.equal(canClearCompletedOrderSyncTarget({ target: { id: '', version: 4 }, currentVersion: 4, pendingFields: {} }), false);
console.log('PASS in-flight response cannot clear newer saved versions or still-unsaved browser edits');

const synced = {
  id: 'order-A',
  smartsheet_sheet_id: '4963691473987460',
  smartsheet_row_id: '111222333',
  smartsheet_pending_local_sync: false,
  smartsheet_last_synced_at: '2026-10-12T12:00:00Z',
  smartsheet_sync_snapshot: { '90': 'Original synced' },
};
const newerInSecondTab = {
  ...synced, updated_date: '2026-10-12T12:00:01Z',
  smartsheet_pending_local_sync: true,
  description: 'Newer edit saved by browser 2',
};
const requests = [];
const mockRead = async (ids) => {
  requests.push([...ids]);
  return [newerInSecondTab];
};
// Browser 1 received a successful push response, but browser 2 already saved
// a newer revision. The *postflight* must see the durable new pending marker.
const afterSuccess = await verifyUncertainOrderSyncReadback(['order-A'], mockRead);
assert.deepEqual(afterSuccess, { confirmedIds: [], pendingIds: ['order-A'] });
assert.equal(afterSuccess.pendingIds.length > 0, true);
assert.deepEqual(requests, [['order-A']]);
const afterFullySynced = await verifyUncertainOrderSyncReadback(['order-A'], async () => [synced]);
assert.deepEqual(afterFullySynced, { confirmedIds: ['order-A'], pendingIds: [] });
await assert.rejects(verifyUncertainOrderSyncReadback(['order-A'], async () => []), /omitted/);
await assert.rejects(verifyUncertainOrderSyncReadback(['order-A'], async () => { throw new Error('Lost read-back'); }), /Lost read-back/);
console.log('PASS mocked second-browser edit, missing read-back, and timeout cannot be acknowledged as fully synced');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const save = ui.slice(ui.indexOf('const saveAndSync = async () =>'), ui.indexOf('// Existing internal/manual callers'));
const summary = save.indexOf('if (!summary.ok) throw new Error(summary.message)');
const postflight = save.indexOf('const postflight = await verifyUncertainOrderSyncReadback(orderIds');
const secondSessionPending = save.indexOf('if (postflight.pendingIds.length)');
const clear = save.indexOf('clearSyncedOrderIds(syncTargets)');
assert.ok(summary >= 0 && postflight > summary && secondSessionPending > postflight && clear > secondSessionPending);
assert.match(save, /query: \{ id: \{ \$in: ids \} \}/);
assert.match(save, /Keep the newer changes queued for Retry Sync/);
assert.match(save, /catch \(error\) \{[\s\S]*?await verifyUncertainOrderSyncReadback\(orderIds/);
const clearFn = ui.slice(ui.indexOf('const clearSyncedOrderIds = useCallback('), ui.indexOf('// Auto-save every 5 seconds'));
assert.match(clearFn, /canClearCompletedOrderSyncTarget\(/);
assert.match(clearFn, /pendingSyncVersionRef\.current\.get\(id\)/);
assert.match(clearFn, /pendingChangesRef\.current\[id\]/);
assert.match(backend, /updated_date: verification\.originalUpdatedDate, smartsheet_pending_local_sync: true/);
assert.match(backend, /Order changed while sync was running; its newer revision remains queued/);
console.log('PASS UI postflight precedes completion and backend Order CAS still fences concurrent revisions');
