import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { orderPushRecordUnchanged } from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { summarizeSavedOrderSync } from '../src/components/orders/orderSaveSync.js';
import { classifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';

// Compile the actual shared TypeScript field translator and three-way planner
// in memory. No Base44 entities or Smartsheet API are queried or mutated.
const moduleBuild = await build({
  stdin: {
    contents: 'export { buildCells, buildSnapshot, buildOrderPullSnapshot, ORDER_MAPPABLE_FIELDS } from "../base44/shared/smartsheetSyncFields.ts"; export { planFieldPush } from "../base44/shared/smartsheetFieldMerge.ts";',
    resolveDir: process.cwd() + '/scripts',
    sourcefile: 'scripts/order-association-plan-check.ts',
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const actual = await import('data:text/javascript;base64,' +
  Buffer.from(moduleBuild.outputFiles[0].text).toString('base64'));
const { buildCells, buildSnapshot, buildOrderPullSnapshot, planFieldPush, ORDER_MAPPABLE_FIELDS } = actual;

const sheetId = '4963691473987460';
const rowId = '817263450981';
const orderId = 'synthetic-order-id-001';
const bindings = {
  customer_name: '1684354771511172',
  request_type: '5349364064380804',
  description: '5912314017802116',
  quantity: '2950182582151044',
};
assert.equal(ORDER_MAPPABLE_FIELDS.some(f => f.key === 'work_order_id'), false);
const original = {
  id: orderId, updated_date: '2026-10-12T21:15:00Z',
  customer_name: 'Existing Customer', work_order_id: 'old-job-id',
  request_type: 'Substrate', description: 'White aluminum', quantity: '2',
  smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId,
  smartsheet_last_synced_at: '2026-10-12T21:15:00Z',
};
const remoteCells = buildCells(original, bindings, 'orders');
const remoteRow = {
  id: rowId, modified_at: '2026-10-12T21:15:00Z',
  cells: remoteCells.map(cell => ({ column_id: cell.columnId, value: cell.value })),
};
const rawSheet = { id: sheetId, rows: [remoteRow], columns: Object.values(bindings).map(id => ({ id })) };
const remoteSnapshot = buildOrderPullSnapshot(remoteRow, bindings);
const edited = {
  ...original,
  work_order_id: 'new-job-id',
  smartsheet_sync_snapshot: remoteSnapshot,
  smartsheet_pending_local_sync: true,
  updated_date: '2026-10-12T21:20:00Z',
};
assert.equal(orderPushRecordUnchanged(edited, sheetId, buildSnapshot(edited, bindings, 'orders')), false,
  'pending local-only relationship edits may not be skipped');
assert.deepEqual(buildSnapshot(edited, bindings, 'orders'), buildSnapshot(original, bindings, 'orders'));
assert.deepEqual(buildCells(edited, bindings, 'orders'), remoteCells);

let forbiddenEntityCalls = 0;
const neverCall = () => { forbiddenEntityCalls++; throw new Error('unexpected external or database call'); };
const mockBase44 = { asServiceRole: { entities: new Proxy({}, { get: neverCall }) } };
const plan = await planFieldPush({
  base44: mockBase44, record: edited, dataset: 'orders',
  bindings, remoteRow, rawSheet, cells: buildCells(edited, bindings, 'orders'), get: neverCall,
});
assert.deepEqual(plan.outgoing, []);
assert.deepEqual(plan.incoming, {});
assert.deepEqual(plan.unresolved, []);
assert.deepEqual(plan.remote, remoteSnapshot);
assert.equal(forbiddenEntityCalls, 0);
console.log('PASS actual three-way planner processes the pending association-only Order with no outgoing Smartsheet cells or conflict writes');

// Metadata-only reconciliation must preserve the new local job and permanent
// row IDs. The completion acknowledgement is counted as updated (not skipped).
const reconciled = {
  ...edited, smartsheet_sync_snapshot: plan.remote,
  smartsheet_last_synced_at: '2026-10-12T21:21:00Z',
  smartsheet_pending_local_sync: false,
};
assert.equal(reconciled.work_order_id, 'new-job-id');
assert.equal(reconciled.smartsheet_sheet_id, sheetId);
assert.equal(reconciled.smartsheet_row_id, rowId);
assert.deepEqual(classifyUncertainOrderSyncReadback([orderId], [reconciled]), {
  confirmedIds: [orderId], pendingIds: [],
});
const acknowledgment = summarizeSavedOrderSync({
  success: true, configured: true, write_actions_available: true,
  sync_complete: true, needs_review: false,
  results: [{
    dataset: 'orders', direction: 'push', records_examined: 1,
    created: 0, updated: 1, unchanged_skipped: 0, errors: 0, conflicts: 0,
  }],
}, { expectedOrderCount: 1 });
assert.equal(acknowledgment.ok, true);
console.log('PASS metadata-only completion counts once and preserves permanent Order-to-job association');

// Refuse to declare a stale in-flight completion confirmed after another
// browser changes this record and the permanent pending marker remains true.
assert.deepEqual(classifyUncertainOrderSyncReadback([orderId], [
  { ...reconciled, updated_date: '2026-10-12T21:22:00Z', smartsheet_pending_local_sync: true },
]), { confirmedIds: [], pendingIds: [orderId] });

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const saveFrontend = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const fieldHistory = readFileSync('base44/functions/fieldHistoryAction/entry.ts', 'utf8');
const push = backend.slice(backend.indexOf('async function pushDataset('), backend.indexOf('// Phase 5: Resolve conflict decisions'));
const pushBlock = push.slice(push.indexOf('const pendingRecords ='), push.indexOf('// Phase 5: Resolve conflict decisions') < 0 ? undefined : push.indexOf('// Phase 5: Resolve conflict decisions'));
assert.match(push, /!orderPushRecordUnchanged\(record, sheetId, buildSnapshot\(record, bindings, 'orders'\)\)/);
assert.match(push, /if \(fieldPlan\.outgoing\.length\) \{\s*deferredSmartsheetWrites\.push/);
assert.match(push, /requiresRemoteWrite: fieldPlan\.outgoing\.length > 0/);
assert.match(push, /if \(!verification\.requiresRemoteWrite\) orderRemoteVerifiedIds\.add\(recordId\)/);
assert.match(push, /if \(eligibleSmartsheetWrites\.length\) \{/);
assert.match(push, /\{ id: recordId, updated_date: verification\.originalUpdatedDate, smartsheet_pending_local_sync: true \}/);
assert.match(push, /record\?\.smartsheet_pending_local_sync !== false/);
assert.match(push, /updated\.push\(recordId\)/);
assert.doesNotMatch(pushBlock, /work_order_id:\s*(?:null|''|undefined)/);
assert.match(fieldHistory, /work_order_id/);
assert.match(fieldHistory, /if\(type==='Order'\)patch\.smartsheet_pending_local_sync=true/);
assert.match(saveFrontend, /nextFields: \{ \.\.\.cleanedUpdates, smartsheet_pending_local_sync: true \}/);
console.log('PASS exact-revision CAS, no-PUT branch, durable queue completion and user-visible acknowledgment remain wired to verified Order metadata');
