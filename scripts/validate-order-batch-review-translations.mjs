import assert from 'node:assert/strict';
import { buildOrderPullReadOnlyRowReport } from '../base44/shared/smartsheetOrderPullReviewMapping.ts';

const sheetId = '4963691473987460';
const rowId = '1111222233334444';
const orderId = 'base44-order-1';
const bindings = {
  description: '10001', date_received: '10002', request_type: '10003', status: '10004',
};
const base44Order = {
  id: orderId, smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId,
  description: 'Panel', request_type: 'Supplies', status: 'ordered',
  date_received: '2026-10-09', receipt_option: '',
  smartsheet_pending_local_sync: false,
};
const remoteRow = {
  id: rowId,
  cells: [
    { column_id: '10001', value: 'Panel', display_value: 'Panel' },
    { column_id: '10002', value: 'In Stock', display_value: 'In Stock' },
    { column_id: '10003', value: 'Supplies', display_value: 'Supplies' },
    { column_id: '10004', value: 'Received', display_value: 'Received' },
  ],
};
const compare = (order, row) => buildOrderPullReadOnlyRowReport({
  base44Order: order, remoteRow: row, orderId, rowId, sheetId, bindings,
});
const actual = compare(base44Order, remoteRow);
assert.equal(actual.state, 'fields_differ');
assert.equal(actual.fields.find(field => field.field === 'date_received')?.smartsheet_pulled_value, '');
assert.equal(actual.fields.find(field => field.field === 'receipt_option')?.smartsheet_pulled_value, 'In Stock');
assert.equal(actual.fields.find(field => field.field === 'status')?.smartsheet_pulled_value, 'received');
assert.equal(actual.fields.find(field => field.field === 'description')?.matches, true);
assert.equal(compare({ ...base44Order, smartsheet_pending_local_sync: true }, remoteRow).state, 'local_changes_pending');
const invalid = compare(base44Order, { ...remoteRow,
  cells: remoteRow.cells.map(cell => cell.column_id === '10002'
    ? { ...cell, value: '2026-02-30', display_value: '2026-02-30' } : cell),
});
assert.equal(invalid.state, 'invalid_remote_dates');
assert.equal(invalid.fields.length, 0);
assert.equal(compare({ ...base44Order, smartsheet_row_id: '222' }, remoteRow).state, 'identity_mismatch');
assert.equal(compare(base44Order, null).state, 'remote_unverified');
console.log('PASS the bounded batch review uses the same legacy date/text choices, enum, invalid-date and permanent-ID safety as single-row review');
