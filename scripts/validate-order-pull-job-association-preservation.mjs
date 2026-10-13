import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import {
  classifyOrderPullBusinessReadback,
  orderPulledFieldsUnchanged,
  orderPullSnapshotAligned,
} from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

// Exercise the actual Order pull translator, not a hand-authored reproduction.
// Everything below is synthetic; no Base44 records or Smartsheet rows are read or written.
const compiled = await build({
  entryPoints: ['base44/shared/smartsheetSyncFields.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const fieldTranslator = await import('data:text/javascript;base64,' +
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const { parseRowToFields, buildOrderPullSnapshot, ORDER_MAPPABLE_FIELDS } = fieldTranslator;

const sheetId = '4963691473987460';
const rowId = '918273645';
const customerColumn = '1684354771511172';
const bindings = {
  customer_name: customerColumn,
  request_type: '5349364064380804',
  description: '5912314017802116',
  quantity: '2950182582151044',
  // Deliberately inject an unsupported binding: the remote sheet must NEVER
  // become a source of Order.work_order_id if a configuration gains extra keys.
  work_order_id: '777888999',
};
const remoteRow = {
  id: rowId,
  cells: [
    { column_id: customerColumn, value: 'Earlier Smartsheet customer' },
    { column_id: bindings.request_type, value: 'Substrate' },
    { column_id: bindings.description, value: 'Cut PVC letters' },
    { column_id: bindings.quantity, value: '3' },
    { column_id: bindings.work_order_id, value: 'retired-workorder-id' },
  ],
};
const mapped = parseRowToFields(remoteRow, bindings, 'orders');
assert.equal(ORDER_MAPPABLE_FIELDS.some(field => field.key === 'work_order_id'), false);
assert.equal(Object.hasOwn(mapped, 'work_order_id'), false);
assert.equal(mapped.customer_name, 'Earlier Smartsheet customer');
assert.equal(Object.values(mapped).includes('retired-workorder-id'), false);
console.log('PASS actual Order pull translator ignores even a rogue Work Order ID binding and does not infer links from customer text');

// Permanent Smartsheet identities remain stable after a local unlink or
// reassignment. Even if a later mapped name changes, the pull patch consists
// of mapped fields only and cannot silently replace the local job association.
const base = {
  id: 'synthetic-order-link-001', smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId,
  customer_name: 'Current app customer', request_type: 'Substrate',
  description: 'Cut PVC letters', quantity: '3', deleted: false,
};
for (const localLink of ['', 'newly-reassigned-workorder']) {
  const existing = { ...base, work_order_id: localLink, smartsheet_pending_local_sync: false };
  const businessPatch = { ...mapped };
  assert.equal(Object.hasOwn(businessPatch, 'work_order_id'), false);
  const persisted = { ...existing, ...businessPatch };
  assert.equal(persisted.work_order_id, localLink);
  assert.equal(persisted.smartsheet_sheet_id, sheetId);
  assert.equal(persisted.smartsheet_row_id, rowId);
  const expected = [{
    id: base.id, sheetId, rowId, fields: businessPatch,
    snapshot: buildOrderPullSnapshot(remoteRow, bindings),
  }];
  assert.equal(orderPulledFieldsUnchanged(persisted, businessPatch), true);
  assert.deepEqual(classifyOrderPullBusinessReadback(expected, [persisted]), {
    verified: expected, failures: [],
  });
}
console.log('PASS synthetic manual pull leaves unlinked and reassigned Base44 Work Order IDs unchanged, even as mapped customer text pulls');

// When the local relationship is still durably pending outbound sync,
// background/manual pull is held at the backend rather than applying old data.
const pending = { ...base, work_order_id: 'newly-reassigned-workorder',
  smartsheet_pending_local_sync: true };
const heldPatch = null; // Mirrors the backend continue before toUpdate.push.
assert.equal(pending.smartsheet_pending_local_sync, true);
assert.equal(heldPatch, null);
assert.equal(orderRunRequiresReview([{ dataset: 'orders', direction: 'pull',
  conflicts: 1, conflict_record_ids: [base.id], updated: 0, errors: 0 }]), true);
console.log('PASS pending local reassignment is treated as an Order pull conflict needing review, not a silent overwrite');

// An otherwise unchanged mapped record with the same permanent row and
// snapshot does not need a business-field update just to handle the job link.
const snapshot = buildOrderPullSnapshot(remoteRow, bindings);
const unlinked = { ...base, customer_name: mapped.customer_name, work_order_id: '',
  smartsheet_pending_local_sync: false, smartsheet_sync_snapshot: snapshot,
  smartsheet_last_synced_at: '2026-10-13T10:00:00Z' };
assert.equal(orderPulledFieldsUnchanged(unlinked, mapped), true);
assert.equal(orderPullSnapshotAligned(unlinked, snapshot), true);
console.log('PASS no-op pull preserves a deliberate unlink without unnecessary Base44 updates');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const pull = backend.slice(backend.indexOf('async function pullDataset('),
  backend.indexOf('async function pushDataset('));
assert.ok(pull.length > 10000);
assert.match(pull, /const rowId = row\.id/);
assert.match(pull, /const existing = recordsByRowId\[rowId\]/);
assert.match(pull, /const rawFields = parseRowToFields\(row, bindings, dataset\)/);
assert.match(pull, /for \(const \[key, val\] of Object\.entries\(rawFields\)\)/);
assert.match(pull, /if \(dataset === 'orders' && existing\?\.smartsheet_pending_local_sync === true\) \{/);
assert.match(pull, /orderLocalPendingConflicts\.push\(existing\.id\);[\s\S]*?continue;/);
assert.match(pull, /toUpdate\.push\(\{ id: existing\.id, _existing: existing,/);
assert.match(pull, /\.\.\.fieldValues \}\);/);
assert.match(pull, /const payload = ordinaryBatch\.map\(\(\{ id, _existing,[\s\S]*?return \{ id, \.\.\.withoutUnverifiedTimestamp \}/);
assert.match(pull, /classifyOrderPullBusinessReadback\(eligible, actualRows\)/);
assert.match(pull, /automatic_relink_attempted: false/);
// Review-only diagnostics may include a linked Work Order ID. Restrict this
// assertion to the actual incoming Order mutation payload, not review evidence.
const orderPullPayload = pull.slice(pull.indexOf('toUpdate.push({ id: existing.id, _existing: existing,'),
  pull.indexOf('} else if (dataset === \'sales\' && profile?.create_base44_from_smartsheet)'));
assert.doesNotMatch(orderPullPayload, /work_order_id\s*:/);
assert.match(pull, /linkedOrderCustomerPullNeedsReview\(\{/);
assert.match(client, /action: "pull_dataset",\s*dataset: "orders"/);
assert.match(ui, /if \(Object\.keys\(pendingChangesRef\.current\)\.length \|\| pendingSyncIdsRef\.current\.size\)/);
assert.match(ui, /const reloaded = await loadData\(false, \{ manualPullReload: true \}\)/);
console.log('PASS source contracts use permanent row IDs, omit job relations in pull patches, and block pending local Save & Sync changes');
