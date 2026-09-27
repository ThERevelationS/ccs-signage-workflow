import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changedPulledOrderDates, verifyPulledOrderDates } from '../base44/shared/smartsheetOrderDatePersistence.mjs';

const previous = { id: 'stable-order', date_needed: '', date_ordered: '', date_received: '2026-09-22' };
const incoming = { date_needed: '2026-09-25', date_ordered: '2026-09-23', date_received: '' };
assert.deepEqual(changedPulledOrderDates(previous, incoming), incoming);
assert.deepEqual(changedPulledOrderDates(previous, { date_needed: '', date_ordered: '', date_received: '2026-09-22' }), {});
assert.deepEqual(changedPulledOrderDates(previous, {}), {});
console.log('PASS only changed mapped Order dates are checked, including clearing stale date for text receipt');

const oldMixed = { id: 'stable-order', date_needed: '', date_needed_option: 'ASAP',
  date_ordered: '', date_ordered_option: 'N/A', date_received: '', receipt_option: 'Stock' };
const newMixed = { date_needed: '2026-09-28', date_needed_option: '',
  date_ordered: '2026-09-26', date_ordered_option: '',
  date_received: '2026-09-27', receipt_option: '' };
assert.deepEqual(changedPulledOrderDates(oldMixed, newMixed), newMixed);
assert.deepEqual(changedPulledOrderDates(oldMixed, {
  date_needed_option: 'ASAP', date_ordered_option: 'N/A', receipt_option: 'Stock',
}), {});
assert.deepEqual(changedPulledOrderDates(oldMixed, { vendor: 'New vendor' }), {});
console.log('PASS every date/text pair detects new dates and stale text options without touching unrelated fields');

const entity = (initial, { dropUpdates = false } = {}) => {
  let row = { id: 'stable-order', ...initial };
  const calls = [];
  return {
    calls,
    get: async id => id === row.id ? { ...row } : null,
    update: async (id, changes) => {
      assert.equal(id, row.id);
      calls.push(changes);
      if (!dropUpdates) row = { ...row, ...changes };
    },
  };
};

const expected = { date_needed: '2026-09-25', date_ordered: '2026-09-23', date_received: '' };
const alreadyRetained = entity(expected);
assert.deepEqual(await verifyPulledOrderDates(alreadyRetained, 'stable-order', previous, expected), { repaired: false });
assert.equal(alreadyRetained.calls.length, 0);
console.log('PASS dates retained by bulkUpdate require no second write');

const silentlyDropped = entity({ date_needed: '', date_ordered: '', date_received: '2026-09-22' });
assert.deepEqual(await verifyPulledOrderDates(silentlyDropped, 'stable-order', previous, expected), { repaired: true });
assert.deepEqual(silentlyDropped.calls, [expected]);
console.log('PASS dropped dates and stale date clear are repaired and re-read by permanent Order ID');

const droppedOptionClear = entity({ ...oldMixed, date_needed: '2026-09-28',
  date_ordered: '2026-09-26', date_received: '2026-09-27' });
assert.deepEqual(await verifyPulledOrderDates(droppedOptionClear, 'stable-order', oldMixed, newMixed),
  { repaired: true });
assert.deepEqual(droppedOptionClear.calls, [{ date_needed_option: '', date_ordered_option: '', receipt_option: '' }]);

const textSource = { id: 'stable-order', date_needed: '2026-09-25', date_needed_option: '',
  date_ordered: '2026-09-24', date_ordered_option: '', date_received: '2026-09-23', receipt_option: '' };
const textIncoming = { date_needed: '', date_needed_option: 'ASAP',
  date_ordered: '', date_ordered_option: 'N/A', date_received: '', receipt_option: 'Stock' };
const droppedTextOptions = entity({ ...textSource, date_needed: '', date_ordered: '', date_received: '' });
assert.deepEqual(await verifyPulledOrderDates(droppedTextOptions, 'stable-order', textSource,
  changedPulledOrderDates(textSource, textIncoming)), { repaired: true });
assert.deepEqual(droppedTextOptions.calls, [{ date_needed_option: 'ASAP',
  date_ordered_option: 'N/A', receipt_option: 'Stock' }]);
console.log('PASS dropped text options and paired date clears are repaired and re-read by permanent ID');

const neverRetained = entity({ date_needed: '', date_ordered: '', date_received: '2026-09-22' }, { dropUpdates: true });
await assert.rejects(verifyPulledOrderDates(neverRetained, 'stable-order', previous, expected), /did not retain verified date or text option fields/);
console.log('PASS falsely successful individual update cannot qualify for snapshot or sync timestamp');

const concurrent = entity({ date_needed: '2026-09-24', date_ordered: '', date_received: '2026-09-22' });
await assert.rejects(verifyPulledOrderDates(concurrent, 'stable-order', previous, expected), /changed concurrently/);
assert.equal(concurrent.calls.length, 0);
await assert.rejects(verifyPulledOrderDates({ get: async () => null, update: async () => {} }, 'stable-order', previous, expected), /permanent ID/);
const concurrentText = entity({ ...oldMixed, date_needed_option: 'URGENT' });
await assert.rejects(verifyPulledOrderDates(concurrentText, 'stable-order', oldMixed,
  changedPulledOrderDates(oldMixed, newMixed)), /changed concurrently/);
assert.equal(concurrentText.calls.length, 0);
const unexpectedBlank = entity({ ...textSource, date_needed: '', date_needed_option: '' });
await assert.rejects(verifyPulledOrderDates(unexpectedBlank, 'stable-order', textSource,
  { date_needed: '2026-09-28' }), /changed concurrently/);
assert.equal(unexpectedBlank.calls.length, 0);
await assert.rejects(verifyPulledOrderDates(silentlyDropped, 'stable-order', previous,
  { vendor: 'New vendor' }), /unmapped field/);
console.log('PASS concurrent date/option edits, unexpected blanking and unmapped fields fail closed');

const engine = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
assert.match(engine, /dataset === 'orders' \? withoutUnverifiedTimestamp : fields/);
assert.match(engine, /changedPulledOrderDates\(_existing, fields\)/);
assert.match(engine, /rawFields\[dateField\]/);
assert.match(engine, /fieldValues\[key\] = '';/);
assert.match(engine, /orderDateOptionField\(candidate\) === key/);
assert.match(engine, /await verifyPulledOrderDates\(base44\.asServiceRole\.entities\.Order/);
assert.match(engine, /Snapshot not advanced/);
assert.match(engine, /smartsheet_last_synced_at: new Date\(\)\.toISOString\(\)/);
console.log('PASS Order-only sync timestamp and snapshot follow date read-back verification');
