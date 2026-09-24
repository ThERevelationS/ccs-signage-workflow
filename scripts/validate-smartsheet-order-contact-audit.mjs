import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditOrderRequestorContacts } from '../base44/shared/smartsheetOrderContactAudit.mjs';

const makeOrder = (id, rowId, name, email, deleted = false) => ({
  id, smartsheet_row_id: rowId, requestor_name: name, requestor_email: email, deleted,
});
const makeRow = (rowId, email, name) => ({
  id: rowId, cells: [{ column_id: '12345', value: email, display_value: name }],
});

const orders = [
  makeOrder('valid', '101', 'Valid Person', 'valid@example.com'),
  makeOrder('blank', '102', 'Blank Person', ''),
  makeOrder('candidate', '103', 'Alex Person', 'Alex Person'),
  makeOrder('mismatch', '104', 'Bailey Person', 'Bailey Person'),
  makeOrder('unverified', '105', 'Casey Person', 'Casey Person'),
  makeOrder('missing-email', '106', 'Dana Person', 'Dana Person'),
  makeOrder('missing-row', '107', 'Elliot Person', 'Elliot Person'),
  makeOrder('duplicate-a', '108', 'Finley Person', 'Finley Person'),
  makeOrder('duplicate-b', '108', 'Finley Person', 'Finley Person'),
  makeOrder('no-link', '', 'Gray Person', 'Gray Person'),
  makeOrder('deleted', '109', 'Hidden Person', 'Hidden Person', true),
];
const sheetRows = [
  makeRow('108', 'finley@example.com', 'Finley Person'),
  makeRow('106', 'Dana Person', 'Dana Person'),
  makeRow('105', 'casey@example.com', 'casey@example.com'),
  makeRow('104', 'bailey@example.com', 'Another Person'),
  makeRow('103', 'alex@example.com', 'Alex Person'),
  makeRow('102', '', ''),
  makeRow('101', 'valid@example.com', 'Valid Person'),
];
const originalOrders = JSON.stringify(orders);
const originalRows = JSON.stringify(sheetRows);
const first = auditOrderRequestorContacts(orders, sheetRows, '12345');
const sorted = auditOrderRequestorContacts(orders, [...sheetRows].reverse(), '12345');
assert.deepEqual(first, sorted, 'Smartsheet row order cannot change matching');
assert.equal(first.read_only, true);
assert.equal(first.total_active_orders_examined, 10);
assert.equal(first.invalid_base44_email_count, 8);
assert.equal(first.invalid_email_matches_name, 8);
assert.equal(first.valid_base44_email_count, 1);
assert.equal(first.blank_base44_email_count, 1);
assert.deepEqual(first.counts, {
  same_name_valid_smartsheet_email: 1,
  smartsheet_name_mismatch: 1,
  smartsheet_name_unverified: 1,
  smartsheet_contact_has_no_valid_email: 1,
  smartsheet_row_missing: 1,
  duplicate_base44_row_link: 2,
  base44_row_link_missing: 1,
});
assert.equal(first.record_ids_by_category.same_name_valid_smartsheet_email[0].base44_record_id, 'candidate');
assert.equal(JSON.stringify(orders), originalOrders);
assert.equal(JSON.stringify(sheetRows), originalRows);
console.log('PASS stable-ID match, candidate/review categories, sort independence and no data mutation');

assert.throws(
  () => auditOrderRequestorContacts(orders, [...sheetRows, sheetRows[0]], '12345'),
  /repeated permanent row ID/,
);
assert.throws(() => auditOrderRequestorContacts(orders, sheetRows, ''), /permanent Requestor column/);
console.log('PASS invalid or duplicate Smartsheet IDs fail closed');

const many = Array.from({ length: 101 }, (_, index) =>
  makeOrder('repeat-' + index, String(1000 + index), 'Repeat Person', 'Repeat Person'));
const manyRows = many.map((order) =>
  makeRow(order.smartsheet_row_id, 'repeat@example.com', 'Repeat Person'));
const limited = auditOrderRequestorContacts(many, manyRows, '12345');
assert.equal(limited.counts.same_name_valid_smartsheet_email, 101);
assert.equal(limited.record_ids_by_category.same_name_valid_smartsheet_email.length, 100);
assert.equal(limited.record_id_lists_truncated.same_name_valid_smartsheet_email, true);
console.log('PASS report caps ID lists but retains full counts');

const engine = await readFile('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const start = engine.indexOf("if (action === 'audit_order_requestor_emails') {");
const end = engine.indexOf("if (action === 'debug_dates')", start);
assert.ok(start >= 0 && end > start);
const auditRoute = engine.slice(start, end);
assert.match(auditRoute, /loadAllEntityRows/);
assert.match(auditRoute, /query: \{ smartsheet_sheet_id: sheetId \}/);
assert.match(auditRoute, /createSmartsheetOrderPageGuard/);
assert.match(auditRoute, /guard\.assertComplete\(\)/);
assert.match(auditRoute, /auditOrderRequestorContacts/);
assert.doesNotMatch(auditRoute, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(/);
const unauthenticatedActions = engine.match(/else if \((action !== 'run_sync'.*)\) \{/);
assert.ok(unauthenticatedActions && !unauthenticatedActions[1].includes('audit_order_requestor_emails'));
console.log('PASS audit API is admin-session-only, read-only and full-page-verified');
