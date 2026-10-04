import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditOrderPermanentLinks, classifyOrderUnlinkedReviewHint } from '../base44/shared/smartsheetOrderLinkIntegrity.mjs';

const sheetId = '4963691473987460';
const bindings = {
  customer_name: '11',
  request_type: '12',
  description: '13',
  quantity: '14',
};

const orders = [
  { id: 'matched', customer_name: 'Acme', description: 'Linked', smartsheet_sheet_id: sheetId, smartsheet_row_id: '101' },
  { id: 'unlinked', customer_name: 'Remote Same Name', description: 'No row id', smartsheet_sheet_id: '', smartsheet_row_id: '' },
  { id: 'wrong-sheet', customer_name: 'Wrong', smartsheet_sheet_id: '999', smartsheet_row_id: '102' },
  { id: 'invalid-row', customer_name: 'Bad ID', smartsheet_sheet_id: sheetId, smartsheet_row_id: 'abc' },
  { id: 'dup-a', customer_name: 'Dup A', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103' },
  { id: 'dup-b', customer_name: 'Dup B', smartsheet_sheet_id: sheetId, smartsheet_row_id: '103' },
  { id: 'missing-remote', customer_name: 'Missing Remote', smartsheet_sheet_id: sheetId, smartsheet_row_id: '104' },
  { id: 'deleted-link', deleted: true, customer_name: 'Deleted', smartsheet_sheet_id: sheetId, smartsheet_row_id: '105' },
];

const rows = [
  { id: '101', row_number: 2, cells: [{ column_id: '11', display_value: 'Acme' }] },
  { id: '102', row_number: 3, cells: [{ column_id: '11', display_value: 'Wrong' }] },
  { id: '103', row_number: 4, cells: [{ column_id: '11', display_value: 'Dup' }] },
  { id: '105', row_number: 5, cells: [{ column_id: '11', display_value: 'Deleted' }] },
  { id: '106', row_number: 6, cells: [
    { column_id: '11', display_value: 'Remote Same Name' },
    { column_id: '12', display_value: 'Supplies' },
    { column_id: '13', display_value: 'No row id' },
    { column_id: '14', value: 6 },
  ] },
];

const report = auditOrderPermanentLinks(orders, rows, sheetId, bindings);
assert.equal(report.read_only, true);
assert.equal(report.counts.active_base44_orders, 7);
assert.equal(report.counts.linked_to_configured_sheet, 4);
assert.equal(report.counts.matched_permanent_links, 1);
assert.equal(report.counts.base44_unlinked, 1);
assert.equal(report.counts.base44_unlinked_likely_test_artifacts, 0);
assert.equal(report.counts.invalid_base44_row_id, 1);
assert.equal(report.counts.wrong_sheet_link, 1);
assert.equal(report.counts.duplicate_base44_row_ids, 1);
assert.equal(report.counts.duplicate_base44_link_records, 2);
assert.equal(report.counts.linked_row_missing_remote, 1);
assert.equal(report.counts.unlinked_smartsheet_rows, 3);
assert.equal(report.link_health.clean, false);
assert.equal(report.link_health.action_required, 8);
console.log('PASS permanent-link audit classifies active Base44 and remote row identity problems without mutating data');

assert.equal(report.records_by_category.base44_unlinked[0].base44_order_id, 'unlinked');
assert.equal(report.records_by_category.unlinked_smartsheet_row.some(item => item.row_id === '106'), true);
const remote106 = report.records_by_category.unlinked_smartsheet_row.find(item => item.row_id === '106');
assert.equal(remote106.customer_name, 'Remote Same Name');
assert.equal(remote106.description, 'No row id');
assert.equal(remote106.request_type, 'Supplies');
assert.equal(remote106.quantity, '6');
assert.equal(report.records_by_category.duplicate_base44_row_link[0].orders.length, 2);
assert.equal(report.records_by_category.linked_row_missing_remote[0].base44_order_id, 'missing-remote');
console.log('PASS unlinked remote rows expose identifying evidence while permanent IDs remain the only match key');

assert.throws(
  () => auditOrderPermanentLinks([], [{ id: '101', cells: [] }, { id: '101', cells: [] }], sheetId, bindings),
  /invalid or repeated permanent Smartsheet row ID/
);
assert.throws(
  () => auditOrderPermanentLinks([], [{ id: 'bad', cells: [] }], sheetId, bindings),
  /invalid or repeated permanent Smartsheet row ID/
);
console.log('PASS incomplete/ambiguous remote identity evidence fails closed');

const nameCollision = auditOrderPermanentLinks(
  [{ id: 'local', customer_name: 'Same Name', smartsheet_sheet_id: '', smartsheet_row_id: '' }],
  [{ id: '999', cells: [{ column_id: '11', display_value: 'Same Name' }] }],
  sheetId,
  bindings,
);
assert.equal(nameCollision.counts.base44_unlinked, 1);
assert.equal(nameCollision.counts.unlinked_smartsheet_rows, 1);
assert.equal(nameCollision.counts.matched_permanent_links, 0);
console.log('PASS matching names never create or imply a permanent link');

const likelyTest = {
  id: 'old-test', customer_name: 'This is a Test', description: 'This is a test of the ',
  created_by: 'anonymous', created_by_id: 'anonymous', customer_id: null, work_order_id: '',
  smartsheet_sheet_id: null, smartsheet_row_id: null, smartsheet_sync_snapshot: null,
  smartsheet_last_synced_at: null, smartsheet_create_attempt: null, smartsheet_pending_local_sync: false,
};
assert.equal(classifyOrderUnlinkedReviewHint(likelyTest).kind, 'likely_historical_test_artifact');
assert.equal(classifyOrderUnlinkedReviewHint({ ...likelyTest, customer_id: 'customer-1' }).kind, 'unlinked_order');
assert.equal(classifyOrderUnlinkedReviewHint({ ...likelyTest, smartsheet_sync_snapshot: { '1': 'x' } }).kind, 'unlinked_order');
assert.equal(classifyOrderUnlinkedReviewHint({ ...likelyTest, customer_name: 'Testing Equipment', description: 'Production order' }).kind, 'unlinked_order');
const testReport = auditOrderPermanentLinks([likelyTest], [], sheetId, bindings);
assert.equal(testReport.counts.base44_unlinked, 1);
assert.equal(testReport.counts.base44_unlinked_likely_test_artifacts, 1);
assert.equal(testReport.records_by_category.base44_unlinked[0].review_hint, 'likely_historical_test_artifact');
assert.equal(testReport.link_health.action_required, 1);
console.log('PASS likely historical test artifacts are review hints only and remain explicit unlinked issues');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderLinkIntegrityReview.jsx', 'utf8');
const tools = readFileSync('src/components/orders/OrderReviewTools.jsx', 'utf8');
const action = backend.slice(
  backend.indexOf("if (action === 'audit_order_link_integrity')"),
  backend.indexOf("if (action === 'audit_order_create_attempts')"),
);

assert.match(backend, /'audit_order_link_integrity'/);
assert.match(action, /createSmartsheetOrderPageGuard/);
assert.match(action, /verifyOrderCreateAuditSheetIdentity\(result\.body, sheetId\)/);
assert.match(action, /guard\.assertComplete\(\)/);
assert.match(action, /auditOrderPermanentLinks\(allOrders, sheetRows, sheetId, bindings\)/);
assert.match(action, /matching_strategy: 'permanent_sheet_and_row_ids_only'/);
assert.doesNotMatch(action, /smartsheetWrite|\.bulkUpdate\(|\.create\(|\.update\(|\.delete\(/);
console.log('PASS backend link-integrity endpoint uses a complete verified sheet read and has no write path');

assert.match(ui, /action: "audit_order_link_integrity"/);
assert.match(ui, /matching_strategy !== "permanent_sheet_and_row_ids_only"/);
assert.match(ui, /Current visual row:.*display only, never used for matching/);
assert.match(ui, /Names, descriptions and visual row numbers are never used to repair links/);
assert.match(ui, /No partial results are displayed and nothing was changed/);
assert.match(ui, /Likely historical test artifact/);
assert.match(ui, /review hint only\. Nothing is hidden, deleted, linked, or retired automatically/);
assert.match(tools, /Review links/);
assert.match(tools, /<OrderLinkIntegrityReview/);
console.log('PASS admin diagnostics expose a read-only link review without adding link controls to the everyday Order Form');
