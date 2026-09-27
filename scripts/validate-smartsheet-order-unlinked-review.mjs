import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditOrderDateParity } from '../base44/shared/smartsheetOrderDateTranslation.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';

const sheetId = '4963691473987460';
const bindings = { date_needed: '1', date_ordered: '2', date_received: '3' };
const orders = [
  { id: 'first', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101', date_needed: '2026-09-27' },
  { id: 'other-sheet', smartsheet_sheet_id: '999', smartsheet_row_id: '103' },
  { id: 'deleted', smartsheet_sheet_id: sheetId, smartsheet_row_id: '104', deleted: true },
];
const rows = [
  { id: '101', cells: [{ column_id: '1', value: '2026-09-27' }] },
  { id: '103', cells: [{ column_id: '2', value: 'N/A' }] },
  { id: '104', cells: [] },
];
const audit = auditOrderDateParity(orders, rows, bindings, sheetId);
assert.equal(audit.read_only, true);
assert.equal(audit.counts.matched, 1);
assert.equal(audit.counts.unlinked_smartsheet_rows, 2);
assert.deepEqual(audit.samples.unlinked_rows, [{ row_id: '103' }, { row_id: '104' }]);
assert.equal(audit.counts.duplicate_base44_links, 0);
assert.equal(audit.counts.invalid_date_values, 0);
assert.equal(audit.by_field.date_ordered.text_choices, 1);
const manyRows = Array.from({ length: 35 }, (_, i) => ({ id: String(1000 + i), cells: [] }));
const bounded = auditOrderDateParity([], manyRows, bindings, sheetId);
assert.equal(bounded.counts.unlinked_smartsheet_rows, 35);
assert.equal(bounded.samples.unlinked_rows.length, 20);
assert.equal(bounded.samples.unlinked_rows[0].row_id, '1000');
assert.equal(bounded.samples.unlinked_rows[19].row_id, '1019');
console.log('PASS unlinked Smartsheet rows use permanent IDs, exclude deleted/other-sheet matches, and cap review samples');

const flagged = [{ dataset: 'orders', direction: 'pull', rows_examined: 3,
  records_examined: 1, unlinked_smartsheet_rows_flagged_for_review: 2,
  unlinked_row_ids: ['103', '104'], updated: 1, errors: 0 }];
assert.equal(orderRunRequiresReview(flagged), true);
assert.equal(orderRunRequiresReview([{ dataset: 'orders', direction: 'pull',
  rows_examined: 3, records_examined: 3, unlinked_smartsheet_rows_flagged_for_review: 0,
  updated: 3, errors: 0 }]), false);
console.log('PASS unlinked Order rows require review without mistaking them for Base44 records examined');

const engine = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const reviewUI = readFileSync('src/components/orders/OrderDateParityReview.jsx', 'utf8');
const adminUI = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
assert.match(engine, /orderUnlinkedRowCount = audit\.counts\.unlinked_smartsheet_rows/);
assert.match(engine, /orderUnlinkedRowIds = audit\.samples\.unlinked_rows/);
assert.match(engine, /unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount/);
assert.match(engine, /records_examined: dataset === 'orders' \? existingRecords\.length : allRows\.length/);
assert.match(engine, /else if \(profile\?\.create_base44_from_smartsheet\)/);
assert.match(reviewUI, /key: "unlinked_rows"/);
assert.match(reviewUI, /No matching active Base44 Order/i);
assert.match(adminUI, /r\.unlinked_smartsheet_rows_flagged_for_review/);
assert.match(adminUI, /r\.unlinked_row_ids\.join\(', '\)/);
assert.match(adminUI, /r\.rows_examined \?\? r\.records_examined/);
assert.doesNotMatch(reviewUI, /push_dataset|pull_dataset|run_sync/);
console.log('PASS Order pull and admin UI flag unmatched row identities without creating or deleting data');
