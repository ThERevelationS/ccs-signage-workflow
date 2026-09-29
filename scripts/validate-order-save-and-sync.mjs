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
assert.ok(client.includes('.filter((id) => typeof id === "string")'));
assert.ok(client.includes('.map((id) => id.trim()).filter(Boolean)'));
assert.ok(client.includes('ids.length !== rawIds.length'));
assert.ok(client.includes('ids.some((id) => !/^[A-Za-z0-9_-]{6,80}$/.test(id))'));
assert.ok(client.includes('Saved Orders contain an invalid or duplicate permanent ID. Reload before syncing.'));
assert.doesNotMatch(client, /String\(id \|\| ""\)\.trim\(\)/);
assert.match(client, /result\?\.sync_complete !== true \|\| result\?\.needs_review/);
assert.match(client, /Smartsheet did not confirm that the Order sync completed\./);
assert.match(client, /expectedOrderCount = 0/);
assert.ok(client.includes('typeof expectedOrderCount === "number" && Number.isSafeInteger(expectedOrderCount) && expectedOrderCount >= 0'));
assert.ok(client.includes('The requested Order count could not be verified. The Orders will stay queued.'));
assert.doesNotMatch(client, /Math\.max\(0, Number\(expectedOrderCount\)/);
assert.ok(client.includes('const results = Array.isArray(result?.results) ? result.results : []'));
assert.ok(client.includes('if (expected === 0)'));
assert.ok(client.includes('results.length === 0 && result?.success === true && result?.sync_complete === true && result?.needs_review === false'));
assert.ok(client.includes('return { success: true, sync_complete: true, needs_review: false, results: [] }'));
assert.ok(client.includes('unexpected Order sync result when no Orders were requested'));
assert.ok(client.includes('const orderResults = results.filter((row) => row?.dataset === "orders")'));
assert.ok(client.includes('orderResults.length !== 1 || results.length !== 1'));
assert.ok(client.includes('exactly one isolated, verifiable Order sync result'));
assert.ok(client.includes('item?.direction !== "push"'));
assert.ok(client.includes('Smartsheet did not return a verifiable Order push result. The requested Orders will stay queued.'));
assert.match(client, /recordsExamined !== expected/);
assert.match(client, /The remaining Orders will stay queued\./);
assert.ok(client.includes('typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null'));
assert.doesNotMatch(client, /const count = Number\(value\)/);
assert.ok(client.includes('[recordsExamined, created, updated, unchanged, errors, conflicts].some((count) => count === null)'));
assert.ok(client.includes('Smartsheet returned invalid Order sync counts. The requested Orders will stay queued.'));
assert.ok(client.includes('const accounted = created + updated + unchanged'));
assert.ok(client.includes('accounted !== expected'));
assert.ok(client.includes('Unaccounted Orders will stay queued.'));
assert.ok(client.includes('result?.configured !== true'));
assert.ok(client.includes('result?.write_actions_available !== true'));
assert.ok(client.includes('explicit writable, configured Order sync confirmation'));
assert.match(ui, /summarizeSavedOrderSync\(result, \{ expectedOrderCount: orderIds\.length \}\)/);
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
const saveAndSyncBody = ui.slice(ui.indexOf('const saveAndSync = async () =>'), ui.indexOf('// Existing internal/manual callers'));
assert.ok(saveAndSyncBody.indexOf('syncInFlightRef.current = true') < saveAndSyncBody.indexOf('await saveAllChanges()'));
assert.match(saveAndSyncBody, /if \(!saveResult\?\.complete\) \{\s*syncInFlightRef\.current = false;\s*return false;/);
assert.match(saveAndSyncBody, /if \(orderIds\.length === 0\) \{\s*syncInFlightRef\.current = false;/);
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
