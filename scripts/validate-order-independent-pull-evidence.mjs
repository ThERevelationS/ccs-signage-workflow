import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_PULL_EVIDENCE_SETTING_KEY, readOrderPullEvidenceStore,
  assertNoUnresolvedOrderPullEvidence, saveOrderPullEvidence,
  verifyCompletedOrderPullEvidence,
} from '../base44/shared/smartsheetOrderPullEvidenceStore.mjs';

const run1 = '2026-10-09T12:00:00.000Z';
const run2 = '2026-10-09T12:10:00.000Z';
const sheetId = '4963691473987460';
const batch = (number, state = 'attempting') => ({
  attempted_batches: number, attempted_orders: number * 2,
  acknowledged_unverified_batches: state === 'acknowledged_unverified' ? number : 0,
  write_uncertain_batches: 0, older_batches_omitted: 0,
  recent_batches: [{ batch_number: number, total_batches: 2, count: 2, state,
    base44_order_ids: ['b44-a', 'b44-b'], smartsheet_row_ids: ['1111111', '2222222'] }],
});
function mockStore() {
  const records = [];
  let revision = 0;
  let getOverride = null;
  let createThrowsAfterCommit = false;
  let rejectCas = false;
  const counters = { reads: 0, creates: 0, updates: 0, gets: 0 };
  return {
    records, counters,
    setGetOverride(fn) { getOverride = fn; },
    setLostCreateAck(value) { createThrowsAfterCommit = value; },
    setRejectCas(value) { rejectCas = value; },
    async filter({ setting_key }) {
      counters.reads++;
      return structuredClone(records.filter(r => r.setting_key === setting_key));
    },
    async get(id) {
      counters.gets++;
      const found = records.find(r => r.id === id);
      return getOverride ? getOverride(structuredClone(found)) : structuredClone(found);
    },
    async create(value) {
      counters.creates++;
      const newRecord = { id: 'rec-' + (++revision), updated_date: 'v' + revision, ...structuredClone(value) };
      records.push(newRecord);
      if (createThrowsAfterCommit) throw new Error('Transport ACK lost');
      return structuredClone(newRecord);
    },
    async updateMany(filter, { $set }) {
      counters.updates++;
      if (rejectCas) return { updated: 0 };
      const index = records.findIndex(r => r.id === filter.id &&
        r.setting_key === filter.setting_key && r.updated_date === filter.updated_date);
      if (index < 0) return { updated: 0 };
      records[index] = { ...records[index], ...structuredClone($set), updated_date: 'v' + (++revision) };
      return { updated: 1 };
    },
  };
}

const storage = mockStore();
assert.equal(await assertNoUnresolvedOrderPullEvidence(storage), null);
const initial = await saveOrderPullEvidence(storage, { startedAt: run1, sheetId, batchEvidence: batch(1) });
assert.equal(initial.state, 'unresolved');
assert.equal(storage.records.length, 1);
assert.equal(storage.records[0].setting_key, ORDER_PULL_EVIDENCE_SETTING_KEY);
await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(storage), /previous Order pull has unresolved/);
await assert.rejects(() => saveOrderPullEvidence(storage, { startedAt: run2, sheetId, batchEvidence: batch(1) }), /different Order pull or sheet/);
await assert.rejects(() => saveOrderPullEvidence(storage, { startedAt: run1, sheetId: '99999', batchEvidence: batch(1) }), /different Order pull or sheet/);
const ack = await saveOrderPullEvidence(storage, { startedAt: run1, sheetId, batchEvidence: batch(1, 'acknowledged_unverified') });
assert.equal(ack.batch_evidence.recent_batches[0].state, 'acknowledged_unverified');
await saveOrderPullEvidence(storage, { startedAt: run1, sheetId, batchEvidence: batch(2) });
await assert.rejects(() => saveOrderPullEvidence(storage, { startedAt: run1, sheetId, batchEvidence: batch(1) }), /regressed/);
assert.equal(storage.records.length, 1);
console.log('PASS separate Order evidence record persists before writes, preserves run/sheet and rejects regressed batches');

// A Sales-only coordinator overwrite cannot mutate this independent record.
const salesCoordinator = { status: 'completed', action: 'push_dataset', progress_dataset: 'sales', results: [] };
assert.equal(salesCoordinator.order_pull_batch_evidence, undefined);
await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(storage), /unresolved/);
const resolved = await verifyCompletedOrderPullEvidence(storage, { startedAt: run1 });
assert.equal(resolved.state, 'verified_complete');
assert.equal(resolved.batch_evidence.attempted_batches, 2);
assert.equal((await assertNoUnresolvedOrderPullEvidence(storage)).setting_value.state, 'verified_complete');
await assert.rejects(() => verifyCompletedOrderPullEvidence(storage, { startedAt: run1 }), /does not match/);
await saveOrderPullEvidence(storage, { startedAt: run2, sheetId, batchEvidence: batch(1) });
assert.equal(storage.records.length, 1, 'Existing verified record is updated without duplicates');
await assert.rejects(() => verifyCompletedOrderPullEvidence(storage, { startedAt: run1 }), /does not match/);
console.log('PASS Sales-only coordinator overwrite cannot clear unresolved Order evidence; only exact verified completion releases it');

const duplicates = mockStore();
duplicates.records.push({ id: 'dup-1', setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY });
duplicates.records.push({ id: 'dup-2', setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY });
await assert.rejects(() => readOrderPullEvidenceStore(duplicates), /unambiguous/);
await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(duplicates), /unambiguous/);
const uncertainCreate = mockStore();
uncertainCreate.setLostCreateAck(true);
await assert.rejects(() => saveOrderPullEvidence(uncertainCreate, { startedAt: run1, sheetId, batchEvidence: batch(1) }), /Transport ACK lost/);
assert.equal(uncertainCreate.records.length, 1);
await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(uncertainCreate), /unresolved/);
const casLost = mockStore();
await saveOrderPullEvidence(casLost, { startedAt: run1, sheetId, batchEvidence: batch(1) });
casLost.setRejectCas(true);
await assert.rejects(() => saveOrderPullEvidence(casLost, { startedAt: run1, sheetId, batchEvidence: batch(2) }), /changed concurrently/);
await assert.rejects(() => verifyCompletedOrderPullEvidence(casLost, { startedAt: run1 }), /completion was not saved/);
const badReadback = mockStore();
badReadback.setGetOverride(rec => ({ ...rec, setting_value: { state: 'verified_complete' } }));
await assert.rejects(() => saveOrderPullEvidence(badReadback, { startedAt: run1, sheetId, batchEvidence: batch(1) }), /could not be verified/);
await assert.rejects(() => assertNoUnresolvedOrderPullEvidence(badReadback), /unresolved/);
console.log('PASS duplicate records, lost ACK, concurrent CAS, and silently lost readback all fail closed');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const claim = backend.slice(backend.indexOf('async function claimSyncRun('), backend.indexOf('const ALERT_SETTING_KEY'));
assert.ok(claim.indexOf('assertNoUnresolvedOrderPullEvidence(') < claim.indexOf('entities.GlobalSettings.updateMany('));
assert.match(claim, /if \(status\?\.order_pull_requested === true\)/);
const run = backend.slice(backend.indexOf("if (action === 'run_sync' || action === 'push_dataset' || action === 'pull_dataset')"));
const persistAt = run.indexOf('await saveOrderPullEvidence(');
const coordinatorAt = run.indexOf('const saved = await saveSyncStatusForRun(base44, {', persistAt);
assert.ok(persistAt > 0 && coordinatorAt > persistAt);
assert.match(run, /if \(dataset === 'orders' && lastOrderPullBatchEvidence && orderPullWritesVerified\(pullResult\)\)/);
assert.match(run, /await verifyCompletedOrderPullEvidence\(/);
assert.match(run, /order_pull_requested: steps\.some/);
assert.match(backend, /await base44\.asServiceRole\.entities\[entityName\]\.bulkUpdate\(payload\)/);
console.log('PASS backend gates Order coordinator claims and persists batch evidence before Order writes without changing Sales-only claims');
