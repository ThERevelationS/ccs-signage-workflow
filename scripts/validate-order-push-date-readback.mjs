import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyPulledOrderDates, changedPulledOrderDates } from '../base44/shared/smartsheetOrderDatePersistence.mjs';

const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');

// The push path must plan Smartsheet-winning date/text changes for read-back,
// not trust the updateMany acknowledgment.
assert.match(entry, /previous: record,\s*dateChanges: changedPulledOrderDates\(record, fieldPlan\.incoming\)/,
  'orders push must record the pre-plan Order and its incoming date/text changes');
assert.match(entry, /await verifyPulledOrderDates\(\s*base44\.asServiceRole\.entities\.Order, recordId,\s*verification\.previous, verification\.dateChanges\)/,
  'orders push commit must verify Smartsheet-winning date/text fields before completing');
assert.match(entry, /Order date\/text verification: \$\{dateVerificationError\?\.message \|\| 'unknown error'\}\. The Order was re-queued\./,
  'a failed date read-back must report and re-queue the Order instead of completing');

// Status must follow an incoming Date Ordered change when the sheet has no
// Status column binding, mirroring the pull path.
assert.match(entry, /dataset === 'orders' && Object\.hasOwn\(fieldPlan\.incoming, 'date_ordered'\)[\s\S]*?orderStatusFromPulledDates\(fieldPlan\.incoming, record, false\)/,
  'orders push must derive status from an incoming Date Ordered change without a Status binding');
console.log('PASS push commit verifies Smartsheet-winning Order dates and re-queues failures');

// Functional: silent drop of the bulk write is repaired and confirmed.
{
  const previous = { id: 'o1', date_ordered: '2025-09-01' };
  const changes = changedPulledOrderDates(previous, { date_ordered: '' });
  assert.deepEqual(changes, { date_ordered: '' });
  const store = new Map([['o1', { id: 'o1', date_ordered: '2025-09-01' }]]);
  let updateCalls = 0;
  const entity = {
    get: async (id) => store.get(id),
    update: async (id, fields) => { updateCalls++; store.set(id, { ...store.get(id), ...fields }); },
  };
  const result = await verifyPulledOrderDates(entity, 'o1', previous, changes);
  assert.deepEqual(result, { repaired: true });
  assert.equal(updateCalls, 1);
  assert.equal(store.get('o1').date_ordered, '');
  console.log('PASS dropped Order date write is repaired by a verified correction');
}

// Functional: if the correction write does not stick, the check must throw.
{
  const previous = { id: 'o2', date_ordered: '2025-09-01' };
  const changes = { date_ordered: '' };
  const store = new Map([['o2', { id: 'o2', date_ordered: '2025-09-01' }]]);
  const entity = {
    get: async (id) => store.get(id),
    update: async () => { /* acknowledged but silently dropped */ },
  };
  await assert.rejects(
    () => verifyPulledOrderDates(entity, 'o2', previous, changes),
    /did not retain verified date or text option fields/);
  console.log('PASS an Order date repair that does not persist fails closed');
}
