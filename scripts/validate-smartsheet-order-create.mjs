import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createdOrderSmartsheetRowId,
  createOrderSmartsheetRowWithGuard,
  orderSmartsheetCreateNeedsReview,
  recoverableOrderSmartsheetCreate,
} from '../base44/shared/smartsheetOrderCreateSafety.mjs';

const success = (id = 987654321) => ({ message: 'SUCCESS', resultCode: 0, result: [{ id }] });
assert.equal(createdOrderSmartsheetRowId(success()), '987654321');
assert.equal(createdOrderSmartsheetRowId({ message: 'SUCCESS', resultCode: 0, result: { id: '987654321' } }), '987654321');
for (const body of [
  { message: 'SUCCESS', resultCode: 0, result: [] },
  { message: 'SUCCESS', resultCode: 0, result: [{ id: '12' }, { id: '34' }] },
  { message: 'PARTIAL_SUCCESS', resultCode: 3, result: [{ id: 12 }] },
  { message: 'SUCCESS', resultCode: 0, result: [{ id: Number.MAX_SAFE_INTEGER + 1 }] },
  { message: 'SUCCESS', resultCode: 0, result: [{ id: 'not-an-id' }] },
]) assert.throws(() => createdOrderSmartsheetRowId(body), /review/i);
console.log('PASS Smartsheet result array/object parsed only when exactly one safe ID is confirmed');

function fixture(initial = {}) {
  let revision = 0;
  const stamp = () => `2026-09-24T18:00:${String(revision).padStart(2, '0')}.000Z`;
  let stored = { id: 'order-123', customer_name: 'Example', updated_date: stamp(), ...initial };
  const calls = [];
  const applyPatch = (patch) => {
    revision++;
    stored = { ...stored, ...structuredClone(patch), updated_date: stamp() };
    return structuredClone(stored);
  };
  const entity = {
    async get(id) {
      assert.equal(id, 'order-123');
      calls.push('GET');
      return structuredClone(stored);
    },
    async update(id, patch) {
      assert.equal(id, 'order-123');
      calls.push(patch?.smartsheet_create_attempt?.status === 'created_unlinked' ? 'RECORD_ROW_ID' : 'RESERVE');
      return applyPatch(patch);
    },
    async updateMany(query, update) {
      assert.equal(query.id, 'order-123');
      calls.push(update?.$unset ? 'RELEASE_CAS' : 'LINK_CAS');
      if (query.updated_date && query.updated_date !== stored.updated_date) return { updated: 0 };
      if (query.smartsheet_pending_local_sync !== undefined && query.smartsheet_pending_local_sync !== stored.smartsheet_pending_local_sync) return { updated: 0 };
      if (query.smartsheet_sheet_id !== undefined && query.smartsheet_sheet_id !== stored.smartsheet_sheet_id) return { updated: 0 };
      for (const [key, value] of Object.entries(query)) {
        if (key.startsWith('smartsheet_create_attempt.') && stored.smartsheet_create_attempt?.[key.split('.')[1]] !== value) return { updated: 0 };
      }
      const next = structuredClone(stored);
      for (const field of Object.keys(update?.$unset || {})) delete next[field];
      revision++;
      stored = { ...next, ...structuredClone(update?.$set || {}), updated_date: stamp() };
      return { updated: 1 };
    },
  };
  const args = (postRow, verifyCreatedRow = async () => true) => ({
    entity,
    record: { id: 'order-123' },
    sheetId: '123456',
    postRow,
    makeSnapshot: (record) => ({ '111': record.customer_name }),
    verifyCreatedRow,
    attemptId: 'attempt-test',
    startedAt: '2026-09-24T18:00:00.000Z',
  });
  return { entity, args, calls, getStored: () => stored, setStored: (patch) => applyPatch(patch) };
}

{
  const state = fixture({ smartsheet_pending_local_sync: true });
  let posts = 0;
  const result = await createOrderSmartsheetRowWithGuard(state.args(async (fresh) => {
    posts++;
    assert.equal(fresh.customer_name, 'Example');
    assert.equal(state.getStored().smartsheet_sheet_id, '123456');
    assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
    assert.equal(state.getStored().smartsheet_create_attempt.attempt_id, 'attempt-test');
    assert.deepEqual(state.getStored().smartsheet_create_attempt.expected_snapshot, { '111': 'Example' });
    return success();
  }));
  assert.deepEqual(result, { rowId: '987654321', recordId: 'order-123', recovered: false, newerLocalEditsRemain: false });
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_row_id, '987654321');
  assert.deepEqual(state.getStored().smartsheet_sync_snapshot, { '111': 'Example' });
  assert.equal(state.getStored().smartsheet_pending_local_sync, false);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'linked');
  assert.equal(orderSmartsheetCreateNeedsReview(state.getStored()), false);
  assert.equal(state.calls.includes('RECORD_ROW_ID'), true);
  assert.equal(state.calls.includes('LINK_CAS'), true);
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(); })),
    /already has a Smartsheet identity/,
  );
  assert.equal(posts, 1);
  console.log('PASS explicit new-Order create durably records the permanent row ID before verified CAS link finalization');
}

{
  const state = fixture();
  let releasePost;
  let notifyEntered;
  const holdingPost = new Promise((resolve) => { releasePost = resolve; });
  const entered = new Promise((resolve) => { notifyEntered = resolve; });
  let posts = 0;
  const first = createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    notifyEntered();
    await holdingPost;
    return success(6789);
  }));
  await entered;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(9999); })),
    /already in progress/,
  );
  releasePost();
  await first;
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_row_id, '6789');
  console.log('PASS overlapping create calls in one runtime send only one POST');
}

{
  const state = fixture();
  let posts = 0;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => {
      posts++;
      throw new Error('Smartsheet request timed out after acceptance');
    })),
    /outcome is uncertain/,
  );
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
  assert.deepEqual(state.getStored().smartsheet_create_attempt.expected_snapshot, { '111': 'Example' });
  assert.equal(orderSmartsheetCreateNeedsReview(state.getStored()), true);
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(); })),
    /unresolved Smartsheet create attempt/,
  );
  assert.equal(posts, 1);
  console.log('PASS uncertain Smartsheet POST is never automatically retried');
}

{
  const state = fixture();
  let posts = 0;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => {
      posts++;
      return { message: 'SUCCESS', resultCode: 0, result: [] };
    })),
    /created Order rows|permanent Order row ID/,
  );
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(); })),
    /unresolved Smartsheet create attempt/,
  );
  assert.equal(posts, 1);
  console.log('PASS successful HTTP response without usable row ID remains held for review');
}

{
  const state = fixture();
  const originalUpdateMany = state.entity.updateMany;
  state.entity.updateMany = async () => { throw new Error('Base44 final link write failed'); };
  let posts = 0;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(5678); })),
    /row 5678 exists.*never POST again/i,
  );
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'created_unlinked');
  assert.equal(state.getStored().smartsheet_create_attempt.row_id, '5678');
  assert.deepEqual(state.getStored().smartsheet_create_attempt.expected_snapshot, { '111': 'Example' });
  assert.equal(recoverableOrderSmartsheetCreate(state.getStored(), '123456').rowId, '5678');

  state.entity.updateMany = originalUpdateMany;
  const recovered = await createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    throw new Error('SECOND POST MUST NOT BE SENT');
  }));
  assert.equal(posts, 1);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.rowId, '5678');
  assert.equal(state.getStored().smartsheet_row_id, '5678');
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'linked');
  assert.equal(state.getStored().smartsheet_pending_local_sync, false);
  console.log('PASS failed final Base44 link recovers from the durable permanent row ID without a second POST');
}

{
  const state = fixture({
    smartsheet_sheet_id: '123456',
    smartsheet_pending_local_sync: true,
    smartsheet_create_attempt: {
      sheet_id: '123456', attempt_id: 'attempt-test', started_at: '2026-09-24T18:00:00.000Z',
      status: 'created_unlinked', row_id: '445566', created_at: '2026-09-24T18:00:10.000Z',
      expected_snapshot: { '111': 'Example' },
    },
  });
  let posts = 0;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => {
      posts++;
      throw new Error('SECOND POST MUST NOT BE SENT');
    }, async () => false)),
    /could not be verified against the durable create snapshot/,
  );
  assert.equal(posts, 0);
  assert.equal(state.getStored().smartsheet_row_id ?? '', '');
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'created_unlinked');
  assert.equal(state.getStored().smartsheet_pending_local_sync, true);
  console.log('PASS recovery refuses to link when the exact permanent Smartsheet row does not verify');
}

{
  const state = fixture({
    customer_name: 'Example changed after create',
    smartsheet_sheet_id: '123456',
    smartsheet_pending_local_sync: true,
    smartsheet_create_attempt: {
      sheet_id: '123456', attempt_id: 'attempt-test', started_at: '2026-09-24T18:00:00.000Z',
      status: 'created_unlinked', row_id: '778899', created_at: '2026-09-24T18:00:10.000Z',
      expected_snapshot: { '111': 'Example' },
    },
  });
  let posts = 0;
  const recovered = await createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    throw new Error('SECOND POST MUST NOT BE SENT');
  }));
  assert.equal(posts, 0);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.newerLocalEditsRemain, true);
  assert.equal(state.getStored().smartsheet_row_id, '778899');
  assert.deepEqual(state.getStored().smartsheet_sync_snapshot, { '111': 'Example' });
  assert.equal(state.getStored().smartsheet_pending_local_sync, true);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'linked');
  console.log('PASS recovery links the permanent row but preserves newer local edits for the next Retry Sync');
}

for (const initial of [
  { smartsheet_sheet_id: '123456', smartsheet_row_id: '98765' },
  { smartsheet_sheet_id: '654321', smartsheet_row_id: '' },
  { smartsheet_create_attempt: { sheet_id: '123456', status: 'reserved' } },
  { deleted: true },
]) {
  const state = fixture(initial);
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    throw new Error('POST MUST NOT BE SENT');
  })), /blocked|review|identity|deleted/i);
  assert.equal(state.calls.filter((event) => event === 'RESERVE').length, 0);
}
console.log('PASS existing links, incomplete links, prior attempts and deleted Orders cannot be recreated');

{
  const state = fixture();
  const originalGet = state.entity.get;
  state.entity.get = async (id) => {
    const current = await originalGet(id);
    if (current.smartsheet_create_attempt?.status === 'reserved') {
      return { ...current, smartsheet_create_attempt: { ...current.smartsheet_create_attempt, attempt_id: 'other-run' } };
    }
    return current;
  };
  let posts = 0;
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    return success();
  })), /reservation could not be verified/);
  assert.equal(posts, 0);
  console.log('PASS competing or unverified reservation stops before POST');
}

// A changed backup detected before transport is definitively unsent. The
// specific reservation is released only after CAS and readback succeed.
{
  const state = fixture({ smartsheet_pending_local_sync: true });
  let posts = 0;
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    throw Object.assign(new Error('Sheet revision changed'), {
      orderBackupFirstWriteBlocked: true, orderCreatePrePostGuardBlocked: true,
    });
  })), /No new row was sent; the reservation was released and pending edits retained/);
  assert.equal(posts, 0);
  assert.equal(state.calls.includes('RELEASE_CAS'), true);
  assert.equal(state.getStored().smartsheet_create_attempt, undefined);
  assert.equal(state.getStored().smartsheet_sheet_id, undefined);
  assert.equal(state.getStored().smartsheet_pending_local_sync, true);
  assert.equal(orderSmartsheetCreateNeedsReview(state.getStored()), false);
  const result = await createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    return success(12345678);
  }));
  assert.equal(posts, 1);
  assert.equal(result.rowId, '12345678');
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'linked');
  console.log('PASS pre-POST backup change releases only verified reservation, preserves pending edits and permits one later fresh create');
}

{
  const state = fixture({ smartsheet_pending_local_sync: true });
  const normalCAS = state.entity.updateMany;
  state.entity.updateMany = async (query, update) => {
    if (update?.$unset) state.setStored({ customer_name: 'Concurrent edit' });
    return normalCAS(query, update);
  };
  let posts = 0;
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    throw Object.assign(new Error('Backup expired'), { orderCreatePrePostGuardBlocked: true });
  })), /administrator must audit/);
  assert.equal(posts, 0);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
  assert.equal(state.getStored().smartsheet_pending_local_sync, true);
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    posts++;
    return success();
  })), /unresolved Smartsheet create attempt/);
  assert.equal(posts, 0);
  console.log('PASS concurrent edits prevent reservation release and prevent any blind second POST');
}

{
  const state = fixture({ smartsheet_pending_local_sync: true });
  await assert.rejects(createOrderSmartsheetRowWithGuard(state.args(async () => {
    throw Object.assign(new Error('Retry guard held after definitive 429'), {
      orderBackupFirstWriteBlocked: true,
    });
  })), /outcome is uncertain/);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
  assert.equal(state.calls.includes('RELEASE_CAS'), false);
  console.log('PASS a post-transport backup guard failure never releases the create reservation');
}

const source = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const schema = readFileSync('base44/entities/Order.jsonc', 'utf8');
assert.match(schema, /"smartsheet_create_attempt": \{/);
assert.match(source, /createOrderSmartsheetRowWithGuard\(\{/);
assert.match(source, /const unresolved = existingRecords\.filter\(orderSmartsheetCreateNeedsReview\)/);
assert.match(source, /const unresolved = records\.filter\(orderSmartsheetCreateNeedsReview\)/);
assert.match(source, /options\?\.allowExplicitOrderCreate === true[\s\S]*recoverableOrderSmartsheetCreate\(record, sheetId\)/);
assert.match(source, /!recoverableOrderSmartsheetCreate\(record, sheetId\) && buildCells\(record, bindings, 'orders'\)\.length === 0/);
assert.match(source, /verifyCreatedRow: async \(\{ rowId, expectedSnapshot, record: verifyRecord, recovered \}/);
assert.match(source, /Recovering previously created Smartsheet row \$\{rowId\} without sending another POST/);
assert.match(source, /postRow: async \(freshOrder: any\)/);
assert.match(source, /if \(dataset === 'orders'\)/);
assert.match(source, /createSalesSmartsheetRowWithGuard\(\{/);
assert.match(source, /smartsheetWriteNoTimeoutRetry\('POST', `\/sheets\/\$\{sheetId\}\/rows`/);
console.log('PASS pull/background paths still block unresolved creates while explicit Order Save & Sync may recover only a durable permanent-row marker');
