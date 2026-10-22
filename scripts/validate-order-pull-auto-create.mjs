import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_BACKGROUND_SYNC_POLICY,
  orderBackgroundSyncPolicyViolations,
  enforceOrderBackgroundSyncPolicy,
} from '../base44/shared/smartsheetOrderBackgroundPolicy.mjs';
import { classifyRemoteUnlinkedOrderRow } from '../base44/shared/smartsheetOrderLinkIntegrity.mjs';

// Policy: pull-side Order creation is an admin toggle; push and remote row
// creation stay locked. Both policy files must agree (mirror is identical).
const mirror = readFileSync('src/shared/smartsheetOrderBackgroundPolicy.mjs', 'utf8');
const policySource = readFileSync('base44/shared/smartsheetOrderBackgroundPolicy.mjs', 'utf8');
assert.equal(mirror, policySource, 'frontend policy mirror must be byte-identical to the backend file');
assert.ok(!Object.hasOwn(ORDER_BACKGROUND_SYNC_POLICY, 'create_base44_from_smartsheet'));
assert.equal(ORDER_BACKGROUND_SYNC_POLICY.push_enabled, false);
assert.equal(ORDER_BACKGROUND_SYNC_POLICY.create_smartsheet_from_base44, false);
assert.deepEqual(orderBackgroundSyncPolicyViolations({
  create_base44_from_smartsheet: true,
}), []);
assert.equal(enforceOrderBackgroundSyncPolicy({ create_base44_from_smartsheet: true }).create_base44_from_smartsheet, true);
console.log('PASS policy no longer locks Base44-from-Smartsheet Order creation but still locks push and remote creation');

// Classification gate: only fully populated unlinked rows may auto-create.
const linkedOrder = {
  id: 'o-linked', customer_name: 'Acme Signs', description: 'Lobby sign',
  request_type: 'Substrate', quantity: '1', smartsheet_row_id: '111',
};
assert.equal(classifyRemoteUnlinkedOrderRow({
  customer_name: 'New Co', request_type: 'Vinyl', description: 'Window decal', quantity: '2',
}, [linkedOrder]).kind, 'populated_unlinked_order');
assert.equal(classifyRemoteUnlinkedOrderRow({
  customer_name: 'New Co', request_type: '', description: '', quantity: '',
}, [linkedOrder]).kind, 'sparse_unlinked_row');
assert.equal(classifyRemoteUnlinkedOrderRow({
  customer_name: 'test', request_type: '', description: '', quantity: '',
}, [linkedOrder]).kind, 'blank_or_placeholder');
assert.equal(classifyRemoteUnlinkedOrderRow({
  customer_name: 'Acme Signs', request_type: 'Substrate', description: 'Lobby sign', quantity: '1',
}, [linkedOrder]).kind, 'duplicate_looking_historical',
  'a row matching a linked Order must never auto-create a duplicate');
console.log('PASS only populated_unlinked_order rows are eligible for auto-create');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const settings = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');

assert.match(backend, /const ORDER_PULL_CREATE_LIMIT = 50;/);
assert.match(backend, /orderToCreate\.length >= ORDER_PULL_CREATE_LIMIT/, 'creates are capped at 50 per run');
assert.match(backend, /else if \(dataset === 'orders' && profile\?\.create_base44_from_smartsheet === true\)/);
assert.match(backend, /classifyRemoteUnlinkedOrderRow\(\s*orderRemoteRowIdentitySummary\(row, bindings\), existingRecords\)/);
assert.match(backend, /classification\.kind !== 'populated_unlinked_order'[\s\S]*?orderCreatesHeldForReview\.push/);
assert.match(backend, /auditOrderCreateAttempts\(existingRecords, allRows, sheetId\)/,
  'unresolved app-side create attempts must hold all Order creates');
assert.match(backend, /kind: 'create_attempts_unresolved'/);
assert.ok(!/errors\.push\(unresolvedCreateAttempts/.test(backend),
  'held creates are review items, not write errors that would keep the pull evidence gate closed');
assert.match(backend, /smartsheet_row_id: \{ \$in: orderToCreate\.map/,
  'a fresh permanent-row ownership recheck must run immediately before bulkCreate');
assert.match(backend, /smartsheet_row_id: \{ \$in: allowedCreates\.map/,
  'auto-created Orders are re-read by permanent row ID for verification');
assert.match(backend, /orderCreateVerificationFailures\+\+[\s\S]*?mapped to \$\{matches\.length\} verified active linked Order/);
assert.match(backend, /orders_created_from_smartsheet: orderVerifiedCreatedRowIds\.size/);
assert.match(backend, /order_creates_held_for_review: orderCreatesHeldForReview\.length/);
assert.match(backend, /create_verification_failures: orderCreateVerificationFailures/);
assert.match(backend, /unlinked_row_ids: orderUnlinkedRowIds\.filter\(\(rowId: string\) => !orderVerifiedCreatedRowIds\.has\(String\(rowId\)\)\)/,
  'unlinked review lists must reflect only rows not created this run');
assert.match(backend, /smartsheet_pending_local_sync: false,\s*row_number: row\.row_number,\s*deleted: false/);

assert.match(settings, /disabled=\{dataset === "orders" && \["push_enabled", "create_smartsheet_from_base44"\]\.includes\(key\)\}/,
  'the create-in-Base44 toggle must be enabled for orders');
assert.match(settings, /Pull creates linked Orders for new Smartsheet rows\. Duplicate-looking or sparse rows stay held for review\./);
console.log('PASS Order pull auto-create is toggle-gated, classify-gated, capped, rechecked and verified');
