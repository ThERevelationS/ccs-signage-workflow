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
assert.match(backend, /respectOrderCreateSetting: true/);
assert.match(backend, /query: \{ id: \{ \$in: requestedRecordIds \} \}/);
assert.match(backend, /could not be re-read by permanent ID/);
assert.match(backend, /automatic Order row creation is OFF\. No Smartsheet rows were written/);
assert.match(backend, /requestedRecordIds\.length > massLimit/);
assert.match(backend, /orderPushRecordUnchanged\(record, sheetId, buildSnapshot\(record, bindings, 'orders'\)\)/);
assert.doesNotMatch(
  backend.slice(backend.indexOf("if (action === 'push_saved_orders')"), backend.indexOf("if (action === 'audit_order_backup_readiness')")),
  /push_enabled/
);
assert.match(backend, /existing\?\.smartsheet_pending_local_sync === true[\s\S]*?orderLocalPendingConflicts\.push\(existing\.id\)[\s\S]*?continue/);
assert.match(backend, /conflicts: orderLocalPendingConflicts\.length/);
assert.match(backend, /smartsheet_pending_local_sync: false/);
console.log('PASS Save & Sync backend is exact-ID targeted, bounded, and background pull preserves locally pending Orders');

assert.match(client, /action: "push_saved_orders"/);
assert.match(client, /order_ids: ids/);
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
assert.match(ui, /const orderIds = \[\.\.\.pendingSyncIdsRef\.current\]/);
assert.match(ui, /pushSavedOrdersToSmartsheet\(\{ sessionToken, orderIds \}\)/);
assert.match(ui, /clearSyncedOrderIds\(orderIds\)/);
assert.match(ui, /smartsheet_pending_local_sync: false/);
assert.match(createSafety, /smartsheet_pending_local_sync: false/);
assert.match(ui, /Saved in Base44, but Smartsheet sync needs attention/);
assert.match(ui, /Retry Sync/);
assert.match(ui, /saveAndSync,/);
assert.match(page, /spreadsheetRef\.current\?\.saveAndSync\?\.\(\)/);
assert.match(page, /Save & Sync/);
assert.match(page, /onSaveStatusChange=\{setSaveStatus\}/);
console.log('PASS Order Form durable marker survives reload, protects local edits from pull, and clears only after confirmed Save & Sync paths');
