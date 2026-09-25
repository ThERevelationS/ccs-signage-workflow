import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateOrderDateValue, auditOrderDateParity } from '../base44/shared/smartsheetOrderDateTranslation.mjs';

const sheetId = '4963691473987460';
const bindings = { date_needed: '1', date_ordered: '2', date_received: '3' };
assert.deepEqual(translateOrderDateValue('9/25/26', 'date_received'), { kind: 'date', value: '2026-09-25' });
assert.deepEqual(translateOrderDateValue('2026-09-25', 'date_received'), { kind: 'date', value: '2026-09-25' });
assert.deepEqual(translateOrderDateValue('In Stock', 'date_received'), { kind: 'text', value: 'In Stock' });
assert.equal(translateOrderDateValue('2/30/26', 'date_received').kind, 'invalid');
assert.equal(translateOrderDateValue('9/25/26', 'date_needed').kind, 'date');
console.log('PASS strict mixed date and text translation rejects impossible dates');

const orders = [
  { id: 'order-1', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101', date_ordered: '' },
  { id: 'order-2', smartsheet_sheet_id: sheetId, smartsheet_row_id: '102', date_received: '2026-09-24' },
  { id: 'order-3', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103', date_received: '' },
];
const rows = [
  { id: '103', cells: [{ column_id: '3', value: '2/30/26' }] },
  { id: '102', cells: [{ column_id: '3', value: 'In Stock' }] },
  { id: '101', cells: [{ column_id: '2', value: '9/25/26' }] },
];
const report = auditOrderDateParity(orders, rows, bindings, sheetId);
assert.equal(report.read_only, true);
assert.equal(report.counts.matched, 3);
assert.equal(report.counts.smartsheet_date_missing_in_base44, 1);
assert.equal(report.counts.invalid_date_values, 1);
assert.equal(report.counts.text_receipt_differences, 1);
assert.equal(report.by_field.date_ordered.missing_base44, 1);
assert.equal(report.samples.missing_dates[0].base44_order_id, 'order-1');
console.log('PASS permanent-ID date parity classifies missing dates, invalid values and text receipt choices');

const ui = readFileSync('src/components/orders/OrderDateParityReview.jsx', 'utf8');
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(page, /currentUser\?\.role === "admin" && !!sessionToken && \(\s*<Button type="button" onClick=\{\(\) => setDateReviewOpen\(true\)\}/);
assert.match(page, /<OrderDateParityReview[\s\S]*?sessionToken=\{sessionToken\}/);
assert.match(ui, /action: "audit_order_dates", session_token: sessionToken/);
assert.match(ui, /data\.read_only !== true \|\| data\.sheet_download_verified !== true/);
assert.match(ui, /active\.current !== requestId/);
assert.doesNotMatch(ui, /push_dataset|pull_dataset|run_sync|\.update\(|\.create\(|\.delete\(/);
const action = backend.slice(backend.indexOf("if (action === 'audit_order_dates')"), backend.indexOf("if (action === 'debug_dates')"));
assert.ok(action.length > 100);
assert.match(action, /createSmartsheetOrderPageGuard/);
assert.match(action, /guard\.assertComplete\(\)/);
assert.match(action, /verifyOrderCreateAuditSheetIdentity\(result\.body, sheetId\)/);
assert.match(action, /auditOrderDateParity/);
assert.doesNotMatch(action, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(|\.delete\(/);
console.log('PASS admin-only UI and full-sheet verified backend review have no write path');
