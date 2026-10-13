import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pendingAfterManualCustomerBlur } from '../src/components/orders/orderCustomerAssociationSafety.mjs';
import { classifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';

// Compile the ACTUAL shared Smartsheet field translator in memory for a
// read-only synthetic Order round-trip; no network or production writes.
const bundled = await build({
  entryPoints: ['base44/shared/smartsheetSyncFields.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const { buildCells, buildSnapshot, parseRowToFields, ORDER_MAPPABLE_FIELDS } = mod;
const sheetId = '4963691473987460';
const rowId = '691827364';
const customerCol = '1684354771511172';
const bindings = {
  customer_name: customerCol,
  request_type: '5349364064380804',
  description: '5912314017802116',
  quantity: '2950182582151044',
};
assert.equal(ORDER_MAPPABLE_FIELDS.some(f => f.key === 'work_order_id'), false);
assert.equal(Object.hasOwn(bindings, 'work_order_id'), false);

const baseline = {
  id: 'synthetic-order-001', updated_date: '2026-10-12T21:20:00Z',
  customer_name: 'Original customer', work_order_id: 'old-base44-workorder',
  request_type: 'Substrate', description: 'Sign material', quantity: '2',
  smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId,
  smartsheet_pending_local_sync: false,
  smartsheet_sync_snapshot: { [customerCol]: 'Original customer' },
};
const changed = pendingAfterManualCustomerBlur({
  baseline, pending: {}, customerName: 'Updated customer', unlinkJob: true,
});
assert.deepEqual(changed, { customer_name: 'Updated customer', work_order_id: '' });
const saved = { ...baseline, ...changed, smartsheet_pending_local_sync: true,
  updated_date: '2026-10-12T21:21:00Z' };
assert.equal(saved.work_order_id, '');
assert.equal(saved.smartsheet_pending_local_sync, true);

// A real fieldHistoryAction Save must accept BOTH expected fields and commit
// the patch under one Base44 revision CAS (checked against source below).
const outgoing = buildCells(saved, bindings, 'orders');
const matchingCustomer = outgoing.filter(c => String(c.columnId) === customerCol);
assert.deepEqual(matchingCustomer, [{ columnId: customerCol, value: 'Updated customer' }]);
assert.equal(outgoing.some(c => c.value === 'old-base44-workorder'), false);
const snapshot = buildSnapshot(saved, bindings, 'orders');
assert.equal(snapshot[customerCol], 'Updated customer');
assert.equal(Object.values(snapshot).includes('old-base44-workorder'), false);
assert.equal(Object.values(snapshot).includes(''), false);
const readRemote = parseRowToFields({
  id: rowId,
  cells: outgoing.map(c => ({column_id: c.columnId, value: c.value})),
}, bindings, 'orders');
assert.equal(readRemote.customer_name, 'Updated customer');
assert.equal(Object.hasOwn(readRemote, 'work_order_id'), false);
console.log('PASS actual Order field mapper sends new customer name by configured column but never sends or reconstructs Base44 Work Order association');

// Model only the exact backend reconciliation metadata patch, which must not
// undo the previously saved business relationship. Do not call live APIs.
const metadata = {
  smartsheet_sync_snapshot: snapshot,
  smartsheet_last_synced_at: '2026-10-12T21:22:00Z',
  smartsheet_pending_local_sync: false,
};
const reconciled = { ...saved, ...metadata };
assert.equal(reconciled.customer_name, 'Updated customer');
assert.equal(reconciled.work_order_id, '');
assert.equal(reconciled.smartsheet_sheet_id, sheetId);
assert.equal(reconciled.smartsheet_row_id, rowId);
assert.deepEqual(classifyUncertainOrderSyncReadback([saved.id], [reconciled]),
  { confirmedIds: [saved.id], pendingIds: [] });
assert.deepEqual(classifyUncertainOrderSyncReadback([saved.id], [saved]),
  { confirmedIds: [], pendingIds: [saved.id] });
console.log('PASS synthetic successful and unfinished sync retain cleared local job link and exact sheet/row identity');

// If the customer returns to their original name, an intentional unlink is a
// local-only change. It still needs a durable pending marker and completed
// verified sync acknowledgment; do not automatically relink by name.
const unlinkedOnly = pendingAfterManualCustomerBlur({
  baseline, pending: {}, customerName: baseline.customer_name, unlinkJob: true,
});
assert.deepEqual(unlinkedOnly, { work_order_id: '' });
assert.equal(buildSnapshot({ ...baseline, ...unlinkedOnly }, bindings, 'orders')[customerCol],
  baseline.customer_name);
console.log('PASS unlink-only Order stays unlinked even if the customer text matches the previous name');

// Assert the live data flow's concrete contracts and that the backend only
// reconciles mapped fields + sync metadata, never assigns work_order_id.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const frontend = readFileSync('src/components/orders/orderPersistence.js', 'utf8');
const fieldHistory = readFileSync('base44/functions/fieldHistoryAction/entry.ts', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const orderFields = readFileSync('base44/shared/smartsheetSyncFields.ts', 'utf8');
const save = ui.slice(ui.indexOf('const saveAllChanges = async () =>'), ui.indexOf('const saveAndSync = async () =>'));
assert.match(save, /nextFields: \{ \.\.\.cleanedUpdates, smartsheet_pending_local_sync: true \}/);
assert.match(frontend, /saveTrackedFields\(\{entityType:'Order',id:recordId,[\s\S]*?nextFields,guardFields\}\)/);
assert.match(fieldHistory, /const patch=\{\.\.\.\(body\.next_fields\|\|\{\}\)\}, expected=body\.expected_fields/);
assert.match(fieldHistory, /if\(type==='Order'\)patch\.smartsheet_pending_local_sync=true/);
assert.match(fieldHistory, /trackedConditionalSave\(base44,type,record,patch,actor\)/);
const push = backend.slice(backend.indexOf('async function pushDataset'), backend.indexOf('// Phase 5: Resolve conflict decisions'));
assert.match(push, /query: \{ id: \{ \$in: requestedRecordIds \} \}/);
assert.match(push, /const deferredUpdate = \{\s*id: record\.id,\s*\.\.\.fieldPlan\.incoming,\s*smartsheet_sync_snapshot:/);
assert.match(push, /\{ id: recordId, updated_date: verification\.originalUpdatedDate, smartsheet_pending_local_sync: true \}/);
assert.doesNotMatch(orderFields.slice(orderFields.indexOf('export const ORDER_MAPPABLE_FIELDS'), orderFields.indexOf('export function getMappableFields')), /work_order_id/);
assert.match(backend, /if \(dataset === 'orders' && existing\?\.smartsheet_pending_local_sync === true\)/);
console.log('PASS source contracts protect exact-ID, CAS-guarded Base44 unlink and never infer job relationship from Smartsheet');
