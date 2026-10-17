import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  replaceImportedOrderFieldsIfUnchanged,
  createImportedOrderWithRecovery,
  OrderImportConflictError,
} from '../base44/shared/orderImportPersistence.mjs';
import { durablePendingOrderIds } from '../src/components/orders/orderSyncReconnect.mjs';

// Production entities and Smartsheet are NOT touched. Exercise the real import
// persistence helpers against synthetic CAS entity behavior and permanent IDs.
const source = readFileSync('base44/functions/importOrders/entry.ts', 'utf8');
const helper = readFileSync('base44/shared/orderImportPersistence.mjs', 'utf8');
const original = {
  id: 'order-permanent-123', updated_date: 'version-1', customer_name: 'Acme',
  description: 'Vinyl sign', request_type: 'Vinyl', work_order_id: 'job-456',
  smartsheet_sheet_id: 'sheet-permanent-777', smartsheet_row_id: 'row-permanent-888',
  quantity: '2', smartsheet_pending_local_sync: false, deleted: false,
};
const copy = record => structuredClone(record);
function fixture({ before = original, loseResponse = false, stripMarkerAfterSave = false } = {}) {
  let current = copy(before);
  const calls = [];
  return {
    get current() { return copy(current); },
    set current(value) { current = copy(value); },
    calls,
    entity: {
      async get(id) { assert.equal(id, original.id); return copy(current); },
      async updateMany(query, update) {
        calls.push({ query: copy(query), update: copy(update) });
        assert.deepEqual(Object.keys(query).sort(), ['id', 'updated_date']);
        assert.deepEqual(Object.keys(update), ['$set']);
        if (query.id !== current.id || query.updated_date !== current.updated_date) return { updated: 0 };
        const fields = update.$set;
        assert.equal(fields.smartsheet_pending_local_sync, true,
          'Changed business values and durable pending marker must be written atomically');
        assert.ok(!('id' in fields) && !('smartsheet_sheet_id' in fields) &&
          !('smartsheet_row_id' in fields) && !('work_order_id' in fields),
          'Import must never overwrite permanent IDs or job associations');
        current = {
          ...current, ...fields, updated_date: 'version-' + (calls.length + 1),
        };
        if (stripMarkerAfterSave) current.smartsheet_pending_local_sync = false;
        if (loseResponse) throw Error('Synthetic lost update acknowledgment');
        return { updated: 1 };
      },
    },
  };
}

{
  const f = fixture();
  const result = await replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(original), nextFields: { quantity: '5', vendor: 'Grimco' },
  });
  assert.equal(result.status, 'updated');
  assert.equal(f.calls.length, 1);
  assert.equal(f.current.quantity, '5');
  assert.equal(f.current.vendor, 'Grimco');
  assert.equal(f.current.smartsheet_pending_local_sync, true);
  assert.equal(f.current.smartsheet_sheet_id, original.smartsheet_sheet_id);
  assert.equal(f.current.smartsheet_row_id, original.smartsheet_row_id);
  assert.equal(f.current.work_order_id, original.work_order_id);
  assert.deepEqual(durablePendingOrderIds([f.current]), [original.id]);
  console.log('PASS changed imported Order atomically saves imported fields plus durable pending marker without touching permanent identities');
}

{
  const f = fixture();
  const result = await replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(original), nextFields: { quantity: original.quantity },
  });
  assert.equal(result.status, 'already_desired');
  assert.equal(f.calls.length, 0);
  assert.equal(f.current.smartsheet_pending_local_sync, false);
  console.log('PASS no-op reimport does not queue an unnecessary Smartsheet write');
}

{
  const f = fixture();
  const saved = await replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(original), nextFields: { quantity: '8' },
  });
  const next = await replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(saved.record), nextFields: { quantity: '8' },
  });
  assert.equal(next.status, 'already_desired');
  assert.equal(f.calls.length, 1);
  assert.equal(f.current.smartsheet_pending_local_sync, true);
  console.log('PASS repeated import preserves one pending marker and performs no duplicate update');
}

{
  const f = fixture();
  f.current = { ...original, quantity: 'Other editor', updated_date: 'version-2' };
  await assert.rejects(
    () => replaceImportedOrderFieldsIfUnchanged({
      entity: f.entity, order: copy(original), nextFields: { quantity: '8' },
    }),
    err => err instanceof OrderImportConflictError && /changed in another session/.test(err.message),
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.current.smartsheet_pending_local_sync, false);
  console.log('PASS newer concurrent business changes are not overwritten or falsely queued');
}

{
  const f = fixture({ loseResponse: true });
  const result = await replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(original), nextFields: { quantity: '9' },
  });
  assert.equal(result.status, 'converged_after_response_loss');
  assert.equal(result.record.smartsheet_pending_local_sync, true);
  assert.deepEqual(durablePendingOrderIds([result.record]), [original.id]);
  console.log('PASS lost CAS acknowledgment is reconciled only when both business fields and pending marker persisted');
}

for (const mode of [{ stripMarkerAfterSave: true }, { loseResponse: true, stripMarkerAfterSave: true }]) {
  const f = fixture(mode);
  await assert.rejects(() => replaceImportedOrderFieldsIfUnchanged({
    entity: f.entity, order: copy(original), nextFields: { quantity: '9' },
  }), /changed again immediately|response|Synthetic lost update acknowledgment/);
  assert.equal(f.current.quantity, '9');
  assert.equal(f.current.smartsheet_pending_local_sync, false);
  console.log('PASS missing durable pending marker cannot be falsely acknowledged as a completed import update');
}

assert.match(source, /const newOrder = \{[\s\S]*?work_order_id: workOrderFilter \|\| '',[\s\S]*?smartsheet_pending_local_sync: true,/);
assert.equal((source.match(/replaceImportedOrderFieldsIfUnchanged\(\{/g) || []).length, 2,
  'Both the regular update and concurrent-reuse branches must use the atomic marker helper');
{
  const f = fixture();
  let createCalls = 0;
  const created = await createImportedOrderWithRecovery({
    entity: {
      async create(data) { createCalls++; return {
        ...data, id: 'order-new-created-1', updated_date: 'version-new',
      }; },
    },
    data: { customer_name: 'New import', description: 'Panel', request_type: 'Vinyl',
      smartsheet_pending_local_sync: true },
    readMatches: async () => [],
    settleMs: 0,
  });
  assert.equal(created.status, 'created');
  assert.equal(createCalls, 1);
  assert.deepEqual(durablePendingOrderIds([created.record]), ['order-new-created-1']);
}
assert.match(helper, /\{ \$set: writeFields \}/);
assert.match(helper, /targetFieldsConverged\(afterError, writeFields\)/);
assert.match(helper, /targetFieldsConverged\(saved, writeFields\)/);
console.log('PASS backend create payload and concurrent-reuse update paths enter durable Save & Sync queue; readback proves atomic marker');
