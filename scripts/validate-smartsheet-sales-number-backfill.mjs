import assert from 'node:assert/strict';
import { assessSalesNumberFill, normalizeSalesNumber, validateSalesNumberSelections,
  SALES_NUMBER_BACKFILL_CONFIRMATION } from '../base44/shared/smartsheetSalesNumberBackfill.mjs';
const sheetId = '8702703019812740', rowId = '1234567890';
const record = { id: 'w1', in_pipeline: true, deleted: false, smartsheet_sheet_id: sheetId,
  smartsheet_row_id: rowId, est_inv_at: '', corbridge_invoice_number: '',
  corbridge_link: 'https://example.com/keep-base44-only' };
const input = { record, sheetId, rowId, remoteValue: 14568, expectedNumber: '14568', activeLinks: 1 };
const test = (delta, expected, message) => assert.equal(assessSalesNumberFill({ ...input, ...delta }), expected, message);
assert.equal(normalizeSalesNumber(14568), '14568');
assert.equal(normalizeSalesNumber(' 14589 '), '14589');
assert.equal(normalizeSalesNumber('INV-14568'), '');
assert.equal(normalizeSalesNumber('123456'), '');
assert.equal(validateSalesNumberSelections([{ workorder_id: 'w1', smartsheet_row_id: rowId, expected_number: 14568 }])[0].expected_number, '14568');
assert.throws(() => validateSalesNumberSelections([{ workorder_id: 'w1', smartsheet_row_id: rowId, expected_number: '14568' }, { workorder_id: 'w2', smartsheet_row_id: rowId, expected_number: '14568' }]));
assert.throws(() => validateSalesNumberSelections([]));
test({}, 'eligible', 'Five-digit Smartsheet values fill only blank matched WorkOrders');
test({ record: { ...record, est_inv_at: '14568' } }, 'already_set', 'Retry is idempotent');
test({ record: { ...record, est_inv_at: '14589' } }, 'base44_number_already_populated', 'Existing estimate number must not be overwritten');
test({ record: { ...record, corbridge_invoice_number: '14589' } }, 'existing_corebridge_number_differs', 'Conflicting existing invoice number blocks fill');
test({ expectedNumber: '14589' }, 'smartsheet_changed_since_preview', 'Stale preview blocks fill');
test({ remoteValue: 'INV-14568' }, 'invalid_smartsheet_number', 'Invalid Smartsheet number blocks fill');
test({ activeLinks: 2 }, 'ambiguous_link', 'Duplicate permanent row link blocks fill');
test({ record: { ...record, smartsheet_row_id: '999' } }, 'link_changed', 'Moved row link blocks fill');
test({ record: { ...record, deleted: true } }, 'link_changed', 'Deleted records cannot be filled');
assert.equal(record.corbridge_link, 'https://example.com/keep-base44-only', 'Link is never included in number classification');
assert.equal(SALES_NUMBER_BACKFILL_CONFIRMATION, 'FILL_BLANK_SALES_NUMBERS_BY_VERIFIED_ROW_ID');
console.log('Sales five-digit number backfill safety: 19/19 PASS.');
