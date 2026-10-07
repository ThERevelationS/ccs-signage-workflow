import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyOrderPermanentRowIdentity } from '../base44/shared/smartsheetOrderPermanentRowSafety.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

const SHEET = '4963691473987460';
const order = {
  id: 'order-1',
  customer_name: 'Acme',
  description: 'Wall sign',
  smartsheet_sheet_id: SHEET,
  smartsheet_row_id: '111',
};

assert.equal(
  classifyOrderPermanentRowIdentity(order, SHEET, new Set(['111'])).state,
  'linked',
);
assert.equal(
  classifyOrderPermanentRowIdentity(order, SHEET, [{ id: '111', row_number: 999 }]).state,
  'linked',
);
console.log('PASS sorting or moving a Smartsheet row cannot break an Order permanent-ID link');

const recreated = classifyOrderPermanentRowIdentity(order, SHEET, [
  { id: '222', customer_name: 'Acme', description: 'Wall sign', row_number: 1 },
]);
assert.equal(recreated.state, 'missing_permanent_row');
assert.equal(recreated.row_id, '111');
assert.match(recreated.reason, /never relink by customer, description, row position, or a replacement row/);
console.log('PASS a deleted/recreated lookalike row with a new permanent ID is never treated as the original Order row');

assert.equal(
  classifyOrderPermanentRowIdentity(
    { ...order, smartsheet_sheet_id: '999' },
    SHEET,
    new Set(['111']),
  ).state,
  'invalid_link',
);
assert.equal(
  classifyOrderPermanentRowIdentity(
    { ...order, smartsheet_row_id: '' },
    SHEET,
    new Set(['111']),
  ).state,
  'invalid_link',
);
console.log('PASS malformed or wrong-sheet identities fail closed');

assert.equal(orderRunRequiresReview([{
  dataset: 'orders',
  direction: 'push',
  errors: 0,
  conflicts: 0,
  missing_permanent_row_links: 1,
}]), true);
console.log('PASS a missing permanent Order row independently forces needs-review status');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderLinkIntegrityReview.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
assert.match(client, /missing_permanent_row_links/);
assert.match(client, /stored permanent Smartsheet row ID that no longer exists/);
assert.match(client, /no automatic relink or replacement-row create was attempted/);
console.log('PASS Save & Sync tells the user exactly why the Order stayed queued');

assert.match(backend, /classifyOrderPermanentRowIdentity\(record, sheetId, sheetRowIds\)/);
assert.match(backend, /orderMissingPermanentRows\.set\(String\(record\.id\), existingRowId\)/);
assert.match(backend, /no automatic relink or replacement-row create was attempted/);
assert.match(backend, /no relink by customer, description, row position, or similar replacement row was attempted/);
assert.match(backend, /missing_permanent_row_links: orderMissingPermanentRows\.size/);
assert.match(backend, /permanent_row_matching_strategy: 'configured_sheet_and_permanent_row_id_only'/);
assert.match(backend, /automatic_relink_attempted: false/);

const linkedBranch = backend.slice(
  backend.indexOf("if (existingRowId && /^\\d+$/.test(existingRowId) && existingSheetId === sheetId)"),
  backend.indexOf("} else if (dataset === 'orders')", backend.indexOf("if (existingRowId && /^\\d+$/.test(existingRowId) && existingSheetId === sheetId)")),
);
assert.doesNotMatch(linkedBranch, /customer_name.*find|description.*find|row_number.*find/);
console.log('PASS push path holds the original permanent link and does not search for replacement identity by visible values');

assert.match(ui, /Sorting or moving a row does not change its ID; deleting and recreating it does/);
assert.match(ui, /replacement row with matching visible values is a different Smartsheet row/);
console.log('PASS admin link review explains movement versus delete/recreate permanent-ID behavior');
