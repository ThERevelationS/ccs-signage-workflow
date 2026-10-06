import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertOrderPermanentDeleteSafe,
  orderHasSmartsheetRelationship,
} from '../src/components/orders/orderDeletionSmartsheetSafety.mjs';
import { classifyOrderDeletedLinkTombstones } from '../base44/shared/smartsheetOrderDeletionSafety.mjs';
import {
  orderStatusAfterOrderedDateChange,
  orderStatusFromPulledDates,
} from '../base44/shared/smartsheetOrderReceivedState.mjs';

const sheetId = '4963691473987460';

assert.equal(orderHasSmartsheetRelationship({ id: 'plain' }), false);
for (const order of [
  { smartsheet_sheet_id: sheetId },
  { smartsheet_row_id: '101' },
  { smartsheet_last_synced_at: '2026-10-01T12:00:00Z' },
  { smartsheet_sync_snapshot: { '1': 'value' } },
  { smartsheet_create_attempt: { status: 'reserved' } },
]) {
  assert.equal(orderHasSmartsheetRelationship(order), true);
  assert.throws(() => assertOrderPermanentDeleteSafe(order, 'Synthetic permanent delete'), /blocked.*Smartsheet relationship|preserves a Smartsheet relationship/i);
}
assert.equal(assertOrderPermanentDeleteSafe({ id: 'local-only' }), true);
console.log('PASS permanent-delete safety preserves every known Smartsheet identity/create-history form');

const tombstones = classifyOrderDeletedLinkTombstones([
  { id: 'deleted-linked', deleted: true, smartsheet_sheet_id: sheetId, smartsheet_row_id: '101' },
  { id: 'active-linked', deleted: false, smartsheet_sheet_id: sheetId, smartsheet_row_id: '102' },
  { id: 'deleted-other-sheet', deleted: true, smartsheet_sheet_id: '999', smartsheet_row_id: '103' },
  { id: 'deleted-invalid-row', deleted: true, smartsheet_sheet_id: sheetId, smartsheet_row_id: 'bad' },
], sheetId);
assert.deepEqual([...tombstones.deletedRowIds], ['101']);
assert.deepEqual([...tombstones.activeRowIds], ['102']);
assert.deepEqual([...tombstones.tombstoneRowIds], ['101']);
assert.deepEqual(tombstones.shadowedDeletedRowIds, []);
const collision = classifyOrderDeletedLinkTombstones([
  { deleted: true, smartsheet_sheet_id: sheetId, smartsheet_row_id: '777' },
  { deleted: false, smartsheet_sheet_id: sheetId, smartsheet_row_id: '777' },
], sheetId);
assert.deepEqual(collision.shadowedDeletedRowIds, ['777']);
assert.deepEqual([...collision.tombstoneRowIds], []);
assert.throws(() => classifyOrderDeletedLinkTombstones([], ''), /permanent sheet ID/);
console.log('PASS deleted linked Orders reserve only row IDs without an active owner; historical deleted duplicates defer to the active permanent link');

assert.deepEqual(orderStatusFromPulledDates({}, { status: 'cancelled' }, false), {});
assert.equal(orderStatusAfterOrderedDateChange({ status: 'cancelled' }, '2026-10-10'), 'cancelled');
assert.equal(orderStatusAfterOrderedDateChange({ status: 'cancelled' }, ''), 'cancelled');
console.log('PASS ordinary Order date pull/edit logic never reopens a locally cancelled Order');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const persistence = readFileSync('src/components/orders/orderPersistence.js', 'utf8');
const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const trash = readFileSync('src/components/admin/OrderTrash.jsx', 'utf8');

assert.match(backend, /classifyOrderDeletedLinkTombstones/);
assert.match(backend, /activeAuditRows = deletedOrderLinkedRowIds\.size[\s\S]*allRows\.filter/);
assert.match(backend, /if \(dataset === 'orders' && deletedOrderLinkedRowIds\.has\(rowId\)\)[\s\S]*orderDeletedLinkTombstonesPreserved\+\+[\s\S]*continue/);
assert.match(backend, /deleted_order_link_tombstones_preserved: orderDeletedLinkTombstonesPreserved/);
assert.match(backend, /deleted_order_links_shadowed_by_active: deletedOrderTombstones\.shadowedDeletedRowIds\.length/);
assert.ok(
  backend.indexOf("deletedOrderLinkedRowIds.has(rowId)") < backend.indexOf("profile?.create_base44_from_smartsheet"),
  'Deleted Order tombstones must be checked before any remote-row create path.'
);
assert.doesNotMatch(backend, /smartsheetWrite\s*\(\s*['"]DELETE['"]/);
assert.doesNotMatch(backend, /smartsheetWriteNoTimeoutRetry\s*\(\s*['"]DELETE['"]/);
console.log('PASS Order pull preserves deleted-row tombstones before create logic and has no Smartsheet DELETE transport');

assert.match(persistence, /assertOrderPermanentDeleteSafe\(order, label\)/);
assert.ok((persistence.match(/assertOrderPermanentDeleteSafe\(order, label\)/g) || []).length >= 2);
assert.match(persistence, /const protectedOrders = Array\.isArray\(loaded\) \? loaded\.filter\(orderHasSmartsheetRelationship\) : \[\]/);
assert.match(persistence, /Nothing was permanently deleted\. Linked Order history must remain available as a permanent-ID tombstone/);
console.log('PASS single permanent delete and Order System Reset both protect Smartsheet relationship tombstones');

assert.match(sheet, /pendingSyncIdsRef\.current\.delete\(target\.id\)/);
assert.match(sheet, /pendingSyncVersionRef\.current\.delete\(target\.id\)/);
assert.match(sheet, /setPendingSyncCount\(pendingSyncIdsRef\.current\.size\)/);
console.log('PASS soft-deleting an Order immediately removes it from the in-memory Retry Sync queue without erasing durable link evidence');

assert.match(trash, /Smartsheet identity preserved/);
assert.match(trash, /orderHasSmartsheetRelationship\(order\)/);
assert.match(trash, /Permanent delete is blocked because this Order preserves a Smartsheet relationship/);
assert.match(trash, /any Order that preserves a Smartsheet sheet\/row identity, sync snapshot, prior sync timestamp, or create-attempt marker blocks the reset before deletion begins/);
console.log('PASS Order Trash explains and enforces permanent-ID preservation for linked Orders');
