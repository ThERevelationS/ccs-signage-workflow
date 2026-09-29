import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderPushRecordUnchanged } from '../base44/shared/smartsheetOrderPullSafety.mjs';

const synced = {
  id: 'order-1',
  smartsheet_row_id: '123456789',
  smartsheet_sheet_id: '4963691473987460',
  smartsheet_last_synced_at: '2026-09-28T20:00:00.000Z',
  smartsheet_sync_snapshot: { '11': 'Acme', '12': '2' },
};
assert.equal(orderPushRecordUnchanged(synced, '4963691473987460', { '12': '2', '11': 'Acme' }), true);
assert.equal(orderPushRecordUnchanged({ ...synced, smartsheet_sync_snapshot: { '11': 'Other', '12': '2' } },
  '4963691473987460', { '11': 'Acme', '12': '2' }), false);
assert.equal(orderPushRecordUnchanged({ ...synced, smartsheet_last_synced_at: '' },
  '4963691473987460', { '11': 'Acme', '12': '2' }), false);
assert.equal(orderPushRecordUnchanged({ ...synced, smartsheet_row_id: '' },
  '4963691473987460', { '11': 'Acme', '12': '2' }), false);
assert.equal(orderPushRecordUnchanged({ ...synced, smartsheet_pending_local_sync: true },
  '4963691473987460', { '11': 'Acme', '12': '2' }), false);
console.log('PASS targeted Order push skips only rows already proven synchronized and never skips a durable local-pending marker');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const schema = JSON.parse(readFileSync('base44/entities/Order.jsonc', 'utf8'));
const createSafety = readFileSync('base44/shared/smartsheetOrderCreateSafety.mjs', 'utf8');

assert.match(backend, /!\['push_saved_orders', 'push_saved_sales'\]\.includes\(action\)/);
assert.match(backend, /if \(action === 'push_saved_orders'\)/);
assert.match(backend, /recordIds: orderIds/);
assert.match(backend, /requireOrderPendingMarker: true/);
assert.match(backend, /allowExplicitOrderCreate: true/);
assert.doesNotMatch(backend, /respectOrderCreateSetting/);
assert.match(backend, /query: \{ id: \{ \$in: requestedRecordIds \} \}/);
assert.match(backend, /could not be re-read by permanent ID/);
assert.match(backend, /const createAllowed = profile\?\.create_smartsheet_from_base44 === true \|\| options\?\.allowExplicitOrderCreate === true/);
assert.match(backend, /automatic Order row creation is OFF\. No Smartsheet rows were written/);
assert.match(backend, /new Order\$\{noMappedCells\.length === 1 \? '' : 's'\} have no mapped Smartsheet values/);
assert.match(backend, /not durably marked as waiting for Save & Sync/);
assert.match(backend, /requestedRecordIds\.length > massLimit/);
assert.match(backend, /orderPushRecordUnchanged\(record, sheetId, buildSnapshot\(record, bindings, 'orders'\)\)/);
const savedOrderAction = backend.slice(
  backend.indexOf("if (action === 'push_saved_orders')"),
  backend.indexOf("if (action === 'push_saved_sales')"),
);
assert.doesNotMatch(savedOrderAction, /push_enabled/);
assert.doesNotMatch(savedOrderAction, /create_smartsheet_from_base44/);
assert.match(backend, /const pushResult = await pushDataset\(base44, token, dataset, profile, config,[\s\S]*?dataset === 'orders' \? \{/);
assert.match(backend, /onlyPendingOrderRecords: action === 'run_sync'/);
assert.match(backend, /existing\?\.smartsheet_pending_local_sync === true[\s\S]*?orderLocalPendingConflicts\.push\(existing\.id\)[\s\S]*?continue/);
assert.match(backend, /conflicts: orderLocalPendingConflicts\.length/);
assert.match(backend, /smartsheet_pending_local_sync: false/);
console.log('PASS explicit Save & Sync can create only durable pending new Orders while background creation still follows the OFF/ON profile setting');

assert.match(client, /action: "push_saved_orders"/);
assert.match(client, /order_ids: ids/);
assert.match(client, /result\?\.sync_complete !== true \|\| result\?\.needs_review/);
assert.match(client, /Smartsheet did not confirm that the Order sync completed\./);
assert.equal(schema.properties.smartsheet_pending_local_sync.type, 'boolean');
assert.equal(schema.properties.smartsheet_pending_local_sync.default, false);
assert.match(ui, /pendingSyncIdsRef = useRef\(new Set\(\)\)/);
assert.match(ui, /order\?\.smartsheet_pending_local_sync === true[\s\S]*?pendingSyncIdsRef\.current\.add/);
assert.match(ui, /nextFields: \{ \.\.\.cleanedUpdates, smartsheet_pending_local_sync: true \}/);
assert.match(ui, /nextFields: \{ \.\.\.nextFields, smartsheet_pending_local_sync: true \}/);
assert.match(ui, /smartsheet_pending_local_sync: true\n\s*\};/);
assert.match(ui, /markOrderNeedsSync\(orderId\)/);
assert.match(ui, /markOrderNeedsSync\(newOrder\.id\)/);
assert.match(ui, /const saveAndSync = async \(\) =>/);
assert.match(ui, /pendingSyncVersionRef = useRef\(new Map\(\)\)/);
assert.match(ui, /pendingSyncVersionRef\.current\.set\(id, \(pendingSyncVersionRef\.current\.get\(id\) \|\| 0\) \+ 1\)/);
assert.match(ui, /const syncTargets = \[\.\.\.pendingSyncIdsRef\.current\]\.map/);
assert.match(ui, /const orderIds = syncTargets\.map\(\(\{ id \}\) => id\)/);
assert.match(ui, /pushSavedOrdersToSmartsheet\(\{ sessionToken, orderIds \}\)/);
assert.match(ui, /pendingSyncVersionRef\.current\.get\(id\) !== target\?\.version/);
assert.match(ui, /clearSyncedOrderIds\(syncTargets\)/);
assert.match(ui, /catch \(error\) \{[\s\S]*?await loadData\(false\);[\s\S]*?unresolvedTargets = syncTargets\.filter\(\(\{ id \}\) => pendingSyncIdsRef\.current\.has\(id\)\)/);
assert.match(ui, /unresolvedTargets\.length === 0[\s\S]*?setLastSynced\(new Date\(\)\)[\s\S]*?Saved changes are synchronized/);
assert.match(ui, /smartsheet_pending_local_sync: false/);
assert.match(createSafety, /smartsheet_pending_local_sync: false/);
assert.match(ui, /Saved in Base44, but Smartsheet sync needs attention/);
assert.match(ui, /Retry Sync/);
assert.match(ui, /saveAndSync,/);
assert.match(page, /spreadsheetRef\.current\?\.saveAndSync\?\.\(\)/);
assert.match(page, /Save & Sync/);
assert.match(page, /onSaveStatusChange=\{setSaveStatus\}/);
console.log('PASS Order Form durable marker survives reload, protects local edits from pull, and clears only after confirmed Save & Sync paths');
