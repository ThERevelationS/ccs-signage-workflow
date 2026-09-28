import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateOrderDateValue, auditOrderDateParity } from '../base44/shared/smartsheetOrderDateTranslation.mjs';

const sheetId = '4963691473987460';
const bindings = { date_needed: '1', date_ordered: '2', date_received: '3' };
assert.deepEqual(translateOrderDateValue('9/25/26', 'date_received'), { kind: 'date', value: '2026-09-25' });
assert.deepEqual(translateOrderDateValue('2026-09-25', 'date_received'), { kind: 'date', value: '2026-09-25' });
assert.deepEqual(translateOrderDateValue('In Stock', 'date_received'), { kind: 'text', value: 'In Stock', field: 'date_received' });
assert.deepEqual(translateOrderDateValue('ASAP', 'date_needed'), { kind: 'text', value: 'ASAP', field: 'date_needed' });
assert.deepEqual(translateOrderDateValue('N/A', 'date_ordered'), { kind: 'text', value: 'N/A', field: 'date_ordered' });
assert.deepEqual(translateOrderDateValue('03/09/021', 'date_needed'), { kind: 'date', value: '2021-03-09' });
assert.equal(translateOrderDateValue('2/30/26', 'date_received').kind, 'invalid');
assert.equal(translateOrderDateValue('9/25/26', 'date_needed').kind, 'date');
console.log('PASS strict mixed date and text translation rejects impossible dates');

const orders = [
  { id: 'order-1', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101', date_ordered: '' },
  { id: 'order-2', smartsheet_sheet_id: sheetId, smartsheet_row_id: '102', date_received: '2026-09-24' },
  { id: 'order-3', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103', date_received: '', date_needed: '2021-03-09' },
];
const rows = [
  { id: '103', cells: [{ column_id: '1', value: '03/09/021' }, { column_id: '3', value: '2/30/26' }] },
  { id: '102', cells: [{ column_id: '2', value: 'N/A' }, { column_id: '3', value: 'In Stock' }] },
  { id: '101', cells: [{ column_id: '1', value: 'ASAP' }, { column_id: '2', value: '9/25/26' }] },
];
const report = auditOrderDateParity(orders, rows, bindings, sheetId);
assert.equal(report.read_only, true);
assert.equal(report.counts.matched, 3);
assert.equal(report.counts.smartsheet_date_missing_in_base44, 1);
assert.equal(report.counts.invalid_date_values, 1);
assert.equal(report.counts.text_receipt_differences, 1);
assert.equal(report.counts.text_option_differences, 3);
assert.equal(report.by_field.date_ordered.missing_base44, 1);
assert.equal(report.by_field.date_needed.text_choices, 1);
assert.equal(report.by_field.date_ordered.text_choices, 1);
assert.equal(report.by_field.date_received.text_choices, 1);
assert.equal(report.samples.missing_dates[0].base44_order_id, 'order-1');
assert.deepEqual(new Set(report.samples.text_choices.map(item => item.field)), new Set(['date_needed', 'date_ordered', 'date_received']));
assert.equal(report.samples.invalid_values[0].raw, '2/30/26');
const duplicates = auditOrderDateParity([...orders, { ...orders[0], id: 'duplicate-order' }], rows, bindings, sheetId);
assert.equal(duplicates.counts.duplicate_base44_links, 1);
assert.deepEqual(duplicates.samples.ambiguous_links[0].base44_order_ids, ['order-1', 'duplicate-order']);
console.log('PASS permanent-ID date parity classifies missing dates, invalid values and text receipt choices');

const staleOrders = [
  { id: 'stale-needed', smartsheet_sheet_id: sheetId, smartsheet_row_id: '301',
    date_needed: '2026-09-25', date_needed_option: 'ASAP' },
  { id: 'stale-ordered', smartsheet_sheet_id: sheetId, smartsheet_row_id: '302',
    date_ordered: '', date_ordered_option: 'N/A' },
  { id: 'stale-received', smartsheet_sheet_id: sheetId, smartsheet_row_id: '303',
    date_received: '2026-09-25', receipt_option: 'Stock' },
  { id: 'valid-date', smartsheet_sheet_id: sheetId, smartsheet_row_id: '304',
    date_received: '2026-09-25', receipt_option: '' },
  { id: 'invalid-source', smartsheet_sheet_id: sheetId, smartsheet_row_id: '305',
    date_needed_option: 'ASAP' },
];
const staleRows = [
  { id: '301', cells: [{ column_id: '1', value: '2026-09-25' }] },
  { id: '302', cells: [] },
  { id: '303', cells: [{ column_id: '3', value: '2026-09-25' }] },
  { id: '304', cells: [{ column_id: '3', value: '2026-09-25' }] },
  { id: '305', cells: [{ column_id: '1', value: '2/30/26' }] },
];
const staleReport = auditOrderDateParity(staleOrders, staleRows, bindings, sheetId);
assert.equal(staleReport.counts.stale_text_options, 3);
assert.equal(staleReport.counts.different_dates, 0);
assert.equal(staleReport.counts.smartsheet_date_missing_in_base44, 0);
assert.equal(staleReport.counts.invalid_date_values, 1);
assert.equal(staleReport.by_field.date_needed.stale_text_options, 1);
assert.equal(staleReport.by_field.date_ordered.stale_text_options, 1);
assert.equal(staleReport.by_field.date_received.stale_text_options, 1);
assert.equal(staleReport.samples.stale_text_options.length, 3);
assert.equal(staleReport.samples.stale_text_options.find(s => s.field === 'date_ordered').smartsheet_blank, true);
assert.equal(staleReport.samples.stale_text_options.find(s => s.field === 'date_received').base44_value, 'Stock');
console.log('PASS stale text options are reported for matching dates and blank source cells without automatic clearing');

const ui = readFileSync('src/components/orders/OrderDateParityReview.jsx', 'utf8');
const reviewTools = readFileSync('src/components/orders/OrderReviewTools.jsx', 'utf8');
const syncAdmin = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
const orderPage = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(reviewTools, /if \(!sessionToken\) return null/);
assert.match(reviewTools, /<OrderDateParityReview[\s\S]*?sessionToken=\{sessionToken\}/);
assert.match(syncAdmin, /<OrderReviewTools sessionToken=\{sessionToken\}/);
assert.doesNotMatch(orderPage, /Review dates|Review emails|Review sync attempts|OrderDateParityReview/);
assert.match(ui, /action: "audit_order_dates", session_token: sessionToken/);
assert.match(ui, /data\.read_only !== true \|\| data\.sheet_download_verified !== true/);
assert.match(ui, /active\.current !== requestId/);
assert.match(ui, /Text choices \/ notes/);
assert.match(ui, /count\(field\.text_choices\)/);
assert.match(ui, /count\(field\.stale_text_options\)/);
assert.match(ui, /key: "stale_text_options"/);
assert.match(ui, /smartsheet_blank/);
assert.match(ui, /blockedByTranslation/);
assert.match(ui, /verified recoverable backup and deployed-code check/);
assert.doesNotMatch(ui, /push_dataset|pull_dataset|run_sync|\.update\(|\.create\(|\.delete\(/);
const action = backend.slice(backend.indexOf("if (action === 'audit_order_dates')"), backend.indexOf("if (action === 'debug_dates')"));
assert.ok(action.length > 100);
assert.match(action, /createSmartsheetOrderPageGuard/);
assert.match(action, /guard\.assertComplete\(\)/);
assert.match(action, /verifyOrderCreateAuditSheetIdentity\(result\.body, sheetId\)/);
assert.match(action, /auditOrderDateParity/);
assert.doesNotMatch(action, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(|\.delete\(/);
console.log('PASS admin-only UI and full-sheet verified backend review have no write path');
