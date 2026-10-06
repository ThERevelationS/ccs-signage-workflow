import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertOrderRestoreSmartsheetSafe,
  orderRestoreSmartsheetIdentity,
} from '../src/components/orders/orderRestoreSmartsheetSafety.mjs';

const sheetId = '4963691473987460';
const linkedTrash = {
  id: 'trash-1',
  deleted: true,
  smartsheet_sheet_id: sheetId,
  smartsheet_row_id: '123456789',
  smartsheet_pending_local_sync: true,
};

assert.deepEqual(orderRestoreSmartsheetIdentity({ id: 'local-only', deleted: true }), {
  hasRelationship: false, sheetId: '', rowId: ''
});
assert.deepEqual(orderRestoreSmartsheetIdentity(linkedTrash), {
  hasRelationship: true, sheetId, rowId: '123456789'
});
assert.throws(
  () => assertOrderRestoreSmartsheetSafe({
    id: 'broken',
    deleted: true,
    smartsheet_sheet_id: sheetId,
    smartsheet_sync_snapshot: { '1': 'value' },
  }, []),
  /does not have one complete permanent sheet \+ row identity/
);
console.log('PASS restore distinguishes local-only trash from complete and incomplete Smartsheet identities');

const safe = assertOrderRestoreSmartsheetSafe(linkedTrash, []);
assert.equal(safe.hasRelationship, true);
assert.equal(safe.sheetId, sheetId);
assert.equal(safe.rowId, '123456789');
assert.equal(safe.pendingLocalSync, true);

assert.throws(
  () => assertOrderRestoreSmartsheetSafe(linkedTrash, [{
    id: 'active-owner',
    deleted: false,
    smartsheet_sheet_id: sheetId,
    smartsheet_row_id: '123456789',
  }]),
  /already owned by 1 active Base44 Order/
);
assert.doesNotThrow(() => assertOrderRestoreSmartsheetSafe(linkedTrash, [{
  id: 'other-row',
  deleted: false,
  smartsheet_sheet_id: sheetId,
  smartsheet_row_id: '987654321',
}]));
assert.doesNotThrow(() => assertOrderRestoreSmartsheetSafe(linkedTrash, [{
  id: 'trash-1',
  deleted: false,
  smartsheet_sheet_id: sheetId,
  smartsheet_row_id: '123456789',
}]));
console.log('PASS restore fails closed when another active Order owns the exact permanent row and ignores unrelated/self rows');

const persistence = readFileSync('src/components/orders/orderPersistence.js', 'utf8');
const trashUi = readFileSync('src/components/admin/OrderTrash.jsx', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

const restoreStart = persistence.indexOf('export async function restoreOrderFromLoadedTrashSnapshot');
const restoreEnd = persistence.indexOf('function mapDeleteResult', restoreStart);
const restoreSource = persistence.slice(restoreStart, restoreEnd);

assert.match(restoreSource, /readActiveLinkedOrders/);
assert.match(restoreSource, /assertOrderRestoreSmartsheetSafe\(order, \[\], label\)/);
assert.match(restoreSource, /readActiveLinkedOrders\(\{ sheetId: identity\.sheetId, rowId: identity\.rowId \}\)/);
assert.match(restoreSource, /String\(verified\.smartsheet_sheet_id \|\| ""\)\.trim\(\) !== restoreSafety\.sheetId/);
assert.match(restoreSource, /String\(verified\.smartsheet_row_id \|\| ""\)\.trim\(\) !== restoreSafety\.rowId/);
assert.match(restoreSource, /verified\.smartsheet_pending_local_sync === true\) !== restoreSafety\.pendingLocalSync/);
assert.match(restoreSource, /post-restore ownership check/);
assert.match(restoreSource, /duplicate-owner rollback/);
assert.match(restoreSource, /This Order was safely returned to trash/);
assert.doesNotMatch(restoreSource, /smartsheetWrite|POST|createOrderSmartsheetRowWithGuard/);
console.log('PASS restore reuses and verifies the original permanent row, preserves pending-sync state, and never creates a Smartsheet row');

assert.match(trashUi, /smartsheet_sheet_id: sheetId/);
assert.match(trashUi, /smartsheet_row_id: rowId/);
assert.match(trashUi, /deleted: \{ \$ne: true \}/);
assert.match(trashUi, /Order Trash restore permanent-row ownership/);
assert.match(trashUi, /Its original permanent Smartsheet row will be preserved/);
assert.match(trashUi, /Recovery is blocked if another active Order already owns that row/);
console.log('PASS Order Trash uses exact permanent IDs for restore ownership checks and explains the behavior');

assert.match(backend, /records = \(Array\.isArray\(records\) \? records : \[\]\)\.filter\(\(r: any\) => !r\?\.deleted\)/);
assert.doesNotMatch(backend, /smartsheetWrite\s*\(\s*['"]DELETE['"]/);
assert.doesNotMatch(backend, /smartsheetWriteNoTimeoutRetry\s*\(\s*['"]DELETE['"]/);
console.log('PASS deleted Orders cannot be pushed and restore/delete lifecycle has no destructive remote Smartsheet operation');
