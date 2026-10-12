import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';
import { orderSmartsheetCreateNeedsReview, recoverableOrderSmartsheetCreate } from '../base44/shared/smartsheetOrderCreateSafety.mjs';

const sheetId = '4963691473987460';
const linked = {
  id: 'order-linked', smartsheet_pending_local_sync: false,
  smartsheet_sheet_id: sheetId, smartsheet_row_id: '987654321',
  smartsheet_last_synced_at: '2026-10-11T16:00:00Z',
  smartsheet_sync_snapshot: { '111': 'Created' },
  smartsheet_create_attempt: { sheet_id: sheetId, row_id: '987654321', status: 'linked' },
};
const pending = { id: 'order-pending', smartsheet_pending_local_sync: true };
const requested = ['order-linked', 'order-pending'];
const sent = [];
const readExact = async (ids) => {
  assert.deepEqual(ids, requested);
  return [pending, linked]; // reordering is not a changed identity
};
const preflight = await verifyUncertainOrderSyncReadback(requested, readExact);
assert.deepEqual(preflight, { confirmedIds: ['order-linked'], pendingIds: ['order-pending'] });
if (preflight.pendingIds.length) sent.push(preflight.pendingIds);
assert.deepEqual(sent, [['order-pending']]);
assert.equal(orderSmartsheetCreateNeedsReview(linked), false);
console.log('PASS mocked Retry Sync includes only durable pending Orders and omits the already-linked created Order');

const noPending = await verifyUncertainOrderSyncReadback(['order-linked'], async () => [linked]);
assert.deepEqual(noPending.pendingIds, []);
assert.equal(sent.length, 1, 'Nothing is submitted after every requested Order is confirmed complete');
console.log('PASS completed-only Retry Sync yields zero outbound row IDs');

const uncertainCreate = {
  id: 'order-uncertain', smartsheet_pending_local_sync: true,
  smartsheet_sheet_id: sheetId,
  smartsheet_create_attempt: {
    status: 'reserved', sheet_id: sheetId, attempt_id: 'abc', expected_snapshot: { '111': 'Created' },
  },
};
assert.equal(orderSmartsheetCreateNeedsReview(uncertainCreate), true);
assert.equal(recoverableOrderSmartsheetCreate(uncertainCreate, sheetId), null);
const recoverable = {
  ...uncertainCreate,
  smartsheet_create_attempt: {
    ...uncertainCreate.smartsheet_create_attempt,
    status: 'created_unlinked', row_id: '987654321',
  },
};
assert.deepEqual(recoverableOrderSmartsheetCreate(recoverable, sheetId)?.rowId, '987654321');
assert.deepEqual((await verifyUncertainOrderSyncReadback(['order-uncertain'], async () => [uncertainCreate])).pendingIds, ['order-uncertain']);
console.log('PASS create reservation remains pending: unknown POST outcome is not auto-retried; known permanent ID is recoverable without POST');

for (const bad of [
  { ...linked, smartsheet_create_attempt: { ...linked.smartsheet_create_attempt, status: 'reserved' } },
  { ...linked, smartsheet_create_attempt: { ...linked.smartsheet_create_attempt, status: 'created_unlinked' } },
  { ...linked, smartsheet_create_attempt: { ...linked.smartsheet_create_attempt, row_id: '123' } },
  { ...linked, smartsheet_create_attempt: { ...linked.smartsheet_create_attempt, sheet_id: '123' } },
]) {
  await assert.rejects(verifyUncertainOrderSyncReadback(['order-linked'], async () => [bad]), /lacked verified sync metadata/);
}
await assert.rejects(verifyUncertainOrderSyncReadback(requested, async () => [pending]), /omitted requested permanent Order IDs/);
await assert.rejects(verifyUncertainOrderSyncReadback(requested, async () => { throw new Error('Mock read permission denied'); }), /Mock read permission denied/);
console.log('PASS inconsistent create markers, missing IDs, and read failures fail closed rather than replaying writes');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const start = ui.indexOf('const saveAndSync = async () =>');
const end = ui.indexOf('// Existing internal/manual callers', start);
const save = ui.slice(start, end);
const select = save.indexOf('const preflight = await verifyUncertainOrderSyncReadback(orderIds');
const push = save.indexOf('pushSavedOrdersToSmartsheet({ sessionToken, orderIds: pendingOrderIds })');
const summary = save.indexOf('expectedOrderCount: pendingOrderIds.length');
assert.ok(select !== -1 && push > select && summary > push, 'exact read-back must precede the pending-only push');
assert.match(save, /query: \{ id: \{ \$in: ids \} \}/);
assert.match(save, /const pendingOrderIds = preflight\.pendingIds/);
assert.match(save, /Object\.keys\(pendingChangesRef\.current\)\.length/);
assert.match(save, /pendingSyncVersionRef\.current\.get\(id\) !== version/);
assert.match(client, /if \(!ids\.length\) return \{ success: true, sync_complete: true, needs_review: false, results: \[\] \}/);
const action = backend.slice(backend.indexOf("if (action === 'push_saved_orders')"),
  backend.indexOf("if (action === 'push_saved_sales')"));
assert.match(action, /recordIds: orderIds/);
assert.match(action, /requireOrderPendingMarker: true/);
assert.match(action, /allowExplicitOrderCreate: true/);
assert.match(backend, /const blocked = unresolved\.filter/);
assert.match(backend, /createOrderSmartsheetRowWithGuard\(/);
console.log('PASS UI and backend preserve permanent-ID pending-only retry and protected Smartsheet create path');
