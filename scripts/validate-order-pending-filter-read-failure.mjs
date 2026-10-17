import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { durablePendingOrderIds } from '../src/components/orders/orderSyncReconnect.mjs';
import { orderSaveSyncStatus } from '../src/components/orders/orderSaveSyncStatus.mjs';
import { canCommitOrderReload } from '../src/components/orders/orderReloadSafety.mjs';
import { orderMatchesReceivedFilter } from '../src/shared/smartsheetOrderReceivedState.mjs';

// Display-only search/status filters must not shrink the durable queue.
const orders = [
  { id: 'order-open', customer_name: 'Alpha', status: 'pending', smartsheet_pending_local_sync: true },
  { id: 'order-received', customer_name: 'Beta', date_received: '2026-10-01', smartsheet_pending_local_sync: true },
  { id: 'order-other', customer_name: 'Gamma', status: 'ordered', smartsheet_pending_local_sync: false },
  { id: 'order-deleted', customer_name: 'Delta', deleted: true, smartsheet_pending_local_sync: true },
];
const visible = orders.filter(row => orderMatchesReceivedFilter(row, 'open_only') &&
  row.customer_name.toLowerCase().includes('alpha'));
assert.deepEqual(visible.map(row => row.id), ['order-open']);
assert.deepEqual(durablePendingOrderIds(orders), ['order-open', 'order-received']);
assert.deepEqual(durablePendingOrderIds(structuredClone(orders)), ['order-open', 'order-received']);
console.log('PASS reopened and filtered Order Form queues include durable pending received/hidden Orders but exclude deleted and completed Orders');

// A bad initial read must never look like clean/ready even if a previous sync
// timestamp exists and no pending rows could be loaded.
for (const status of [
  { readError: 'Base44 unavailable' },
  { readError: 'Partial Order page', lastSynced: new Date() },
  { readError: 'Invalid linked Order record', pendingSyncCount: 0 },
]) {
  const result = orderSaveSyncStatus(status);
  assert.equal(result.kind, 'error');
  assert.equal(result.text, 'Reload Orders');
}
assert.equal(orderSaveSyncStatus({ readError: '' }).kind, 'ready');
assert.equal(orderSaveSyncStatus({ readError: '', pendingSyncCount: 2 }).kind, 'pending');
console.log('PASS failed Order reads cannot report clean/ready and successful authoritative reload restores pending state');

// An invalidated prior request must not clear the newest failed read's latch.
assert.equal(canCommitOrderReload({ requestGeneration: 3, latestGeneration: 4 }), false);
assert.equal(canCommitOrderReload({ requestGeneration: 4, latestGeneration: 4 }), true);
assert.equal(canCommitOrderReload({ requestGeneration: 4, latestGeneration: 4, manualPullInFlight: true }), false);
console.log('PASS prior/stale Order reloads cannot replace a newer authoritative reload');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const load = ui.slice(ui.indexOf('const loadData = async'), ui.indexOf('const saveAllChanges = async'));
const loadStart = load.indexOf('const requestGeneration = ++orderLoadGenerationRef.current');
const verify = load.indexOf('if (!canCommitOrderReload({');
const queue = load.indexOf('pendingSyncIdsRef.current = durablePendingIds');
const clear = load.indexOf('setReadError("")');
const failure = load.indexOf('setReadError(error?.message');
assert.ok(loadStart >= 0 && verify > loadStart && queue > verify && clear > queue && failure > clear,
  'Read-error latch may clear only after a current complete Order snapshot rebuilt the pending queue');
assert.equal(load.slice(0, verify).includes('setReadError("")'), false);
assert.match(load, /query: workOrderFilter\s*\? \{ work_order_id: workOrderFilter, deleted: \{ \$ne: true \} \}\s*: \{ deleted: \{ \$ne: true \} \}/);
assert.doesNotMatch(load, /query: \{[^\n]*(?:filterStatus|searchTerm)/);
assert.match(ui, /const durablePendingIds = new Set\(durablePendingOrderIds\(ordersData\)\)/);
const filter = ui.slice(ui.indexOf('const filteredOrders = useMemo'), ui.indexOf('// Virtual scrolling setup'));
assert.match(filter, /orders\.filter\(order =>/);
assert.match(filter, /orderMatchesReceivedFilter\(order, filterStatus\)/);
assert.match(filter, /searchTerm/);
assert.match(ui, /isSyncing, isPulling, lastSyncDirection, pendingSyncCount, lastSynced, syncMessage, saveError, readError/);
assert.match(ui, /saveError, readError, onSaveStatusChange/);
console.log('PASS UI keeps presentation filters separate from authoritative pending-marker retrieval');

assert.match(page, /disabled=\{saveStatus\.customerDraftActive \|\| saveStatus\.isSaving \|\| saveStatus\.isSyncing \|\| saveStatus\.isLoading \|\| Boolean\(saveStatus\.readError\)\}/);
assert.match(page, /disabled=\{saveStatus\.isSyncing \|\| saveStatus\.isSaving \|\| saveStatus\.isLoading \|\| Boolean\(saveStatus\.readError\)\}/);
assert.match(page, /disabled=\{saveStatus\.isLoading \|\| Boolean\(saveStatus\.readError\)\}/);
assert.match(ui, /const pullFromSmartsheet = async \(\) => \{\s*if \(readError \|\| !isRegistered/);
assert.match(ui, /const saveAndSync = async \(\) => \{\s*if \(readError \|\| syncInFlightRef/);
assert.match(ui, /const addNewRow = async \(\) => \{\s*(?:\/\/[^\n]*\n\s*)*if \(!isRegistered \|\| readError/);
assert.match(ui, /const exportToExcel = async \(\) => \{\s*if \(readError\) return/);
console.log('PASS read-failure toolbar and internal action guards block Sync, Save & Sync, Add and partial-data Export');
