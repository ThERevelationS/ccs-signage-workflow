import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyOrderPermanentRowIdentity } from '../base44/shared/smartsheetOrderPermanentRowSafety.mjs';
import { auditOrderDateParity } from '../base44/shared/smartsheetOrderDateTranslation.mjs';
import { orderRunRequiresReview } from '../base44/shared/smartsheetOrderRunSafety.mjs';
import { ORDER_BACKGROUND_SYNC_POLICY } from '../base44/shared/smartsheetOrderBackgroundPolicy.mjs';

const SHEET = '4963691473987460';
const originalOrder = {
  id: 'order-a',
  customer_name: 'Acme',
  request_type: 'Sign',
  description: 'Wall sign',
  quantity: 1,
  smartsheet_sheet_id: SHEET,
  smartsheet_row_id: '111',
};

const moved = classifyOrderPermanentRowIdentity(originalOrder, SHEET, [
  { id: '111', row_number: 987, customer_name: 'Acme', description: 'Wall sign' },
]);
assert.equal(moved.state, 'linked');
assert.equal(moved.row_id, '111');
console.log('PASS Order pull identity survives sorting or row movement because the permanent row ID is unchanged');

const replacementRow = {
  id: '222',
  row_number: 1,
  customer_name: 'Acme',
  request_type: 'Sign',
  description: 'Wall sign',
  quantity: 1,
  cells: [],
};
const missing = classifyOrderPermanentRowIdentity(originalOrder, SHEET, [replacementRow]);
assert.equal(missing.state, 'missing_permanent_row');
assert.equal(missing.row_id, '111');
assert.match(missing.reason, /replacement row with similar values/i);
console.log('PASS a visually identical recreated row never replaces the stored permanent Order row identity');

const audit = auditOrderDateParity([originalOrder], [replacementRow], {}, SHEET);
assert.equal(audit.counts.matched, 0);
assert.equal(audit.counts.unlinked_smartsheet_rows, 1);
assert.deepEqual(audit.samples.unlinked_rows, [{ row_id: '222' }]);
console.log('PASS recreated row B remains an unlinked Smartsheet row requiring review');

assert.ok(!Object.hasOwn(ORDER_BACKGROUND_SYNC_POLICY, 'create_base44_from_smartsheet'),
  'Base44-from-Smartsheet Order creation is an admin toggle, not a locked policy');
assert.equal(orderRunRequiresReview([{
  dataset: 'orders',
  direction: 'pull',
  missing_permanent_row_links: 1,
  unlinked_smartsheet_rows_flagged_for_review: 1,
  created: 0,
  updated: 0,
  errors: 0,
}]), true);
console.log('PASS missing row A plus unlinked row B forces Order pull review without destructive reconciliation');

const engine = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

assert.match(engine, /else if \(dataset === 'sales' && profile\?\.create_base44_from_smartsheet\)/);
assert.doesNotMatch(engine, /else if \(profile\?\.create_base44_from_smartsheet\)/);
assert.match(engine, /else if \(dataset === 'orders' && profile\?\.create_base44_from_smartsheet === true\)[\s\S]*?classification\.kind !== 'populated_unlinked_order'/,
  'Order pull auto-create requires the explicit toggle and a verified populated unlinked row');
console.log('PASS Order pull auto-create is gated on the admin toggle plus populated-row classification');

assert.match(engine, /classifyOrderPermanentRowIdentity\(record, sheetId, smartsheetRowIds\)/);
assert.match(engine, /\.filter\(\(item: any\) => item\.identity\.state === 'missing_permanent_row'\)/);
assert.match(engine, /missing_permanent_row_links: orderMissingPermanentRows\.length/);
assert.match(engine, /missing_permanent_row_record_ids:/);
assert.match(engine, /missing_permanent_smartsheet_row_ids:/);
assert.match(engine, /permanent_row_matching_strategy: 'configured_sheet_and_permanent_row_id_only'/);
assert.match(engine, /automatic_relink_attempted: false/);
assert.match(engine, /automatic_smartsheet_to_base44_create_allowed: profile\?\.create_base44_from_smartsheet === true/);
console.log('PASS Order pull reports permanent-ID delete/recreate evidence explicitly and never relinks by visible values');
