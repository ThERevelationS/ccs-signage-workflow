import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changedPulledOrderDates, verifyPulledOrderDates } from '../base44/shared/smartsheetOrderDatePersistence.mjs';

const previous = { id: 'stable-order', date_needed: '', date_ordered: '', date_received: '2026-09-22' };
const incoming = { date_needed: '2026-09-25', date_ordered: '2026-09-23', date_received: '' };
assert.deepEqual(changedPulledOrderDates(previous, incoming), incoming);
assert.deepEqual(changedPulledOrderDates(previous, { date_needed: '', date_ordered: '', date_received: '2026-09-22' }), {});
assert.deepEqual(changedPulledOrderDates(previous, {}), {});
console.log('PASS only changed mapped Order dates are checked, including clearing stale date for text receipt');

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

const neverRetained = entity({ date_needed: '', date_ordered: '', date_received: '2026-09-22' }, { dropUpdates: true });
await assert.rejects(verifyPulledOrderDates(neverRetained, 'stable-order', previous, expected), /did not retain verified date fields/);
console.log('PASS falsely successful individual update cannot qualify for snapshot or sync timestamp');

const concurrent = entity({ date_needed: '2026-09-24', date_ordered: '', date_received: '2026-09-22' });
await assert.rejects(verifyPulledOrderDates(concurrent, 'stable-order', previous, expected), /changed concurrently/);
assert.equal(concurrent.calls.length, 0);
await assert.rejects(verifyPulledOrderDates({ get: async () => null, update: async () => {} }, 'stable-order', previous, expected), /permanent ID/);
console.log('PASS concurrent conflicting dates and unverifiable permanent IDs fail closed');

const engine = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts', import.meta.url), 'utf8');
assert.match(engine, /dataset === 'orders' \? withoutUnverifiedTimestamp : fields/);
assert.match(engine, /changedPulledOrderDates\(_existing, fields\)/);
assert.match(engine, /await verifyPulledOrderDates\(base44\.asServiceRole\.entities\.Order/);
assert.match(engine, /Snapshot not advanced/);
assert.match(engine, /smartsheet_last_synced_at: new Date\(\)\.toISOString\(\)/);
console.log('PASS Order-only sync timestamp and snapshot follow date read-back verification');
