import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createdOrderSmartsheetRowId,
  createOrderSmartsheetRowWithGuard,
  orderSmartsheetCreateNeedsReview,
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
  let stored = { id: 'order-123', customer_name: 'Example', ...initial };
  const calls = [];
  const entity = {
    async get(id) {
      assert.equal(id, 'order-123');
      calls.push('GET');
      return structuredClone(stored);
    },
    async update(id, patch) {
      assert.equal(id, 'order-123');
      calls.push(patch.smartsheet_row_id ? 'LINK' : 'RESERVE');
      stored = { ...stored, ...structuredClone(patch) };
      return structuredClone(stored);
    },
  };
  const args = (postRow) => ({
    entity,
    record: { id: 'order-123' },
    sheetId: '123456',
    postRow,
    makeSnapshot: (record) => ({ '111': record.customer_name }),
    attemptId: 'attempt-test',
    startedAt: '2026-09-24T18:00:00.000Z',
  });
  return { entity, args, calls, getStored: () => stored };
}

{
  const state = fixture();
  let posts = 0;
  const result = await createOrderSmartsheetRowWithGuard(state.args(async (fresh) => {
    posts++;
    assert.equal(fresh.customer_name, 'Example');
    assert.equal(state.getStored().smartsheet_sheet_id, '123456');
    assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
    assert.equal(state.getStored().smartsheet_create_attempt.attempt_id, 'attempt-test');
    return success();
  }));
  assert.deepEqual(result, { rowId: '987654321', recordId: 'order-123' });
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_row_id, '987654321');
  assert.deepEqual(state.getStored().smartsheet_sync_snapshot, { '111': 'Example' });
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'linked');
  assert.equal(orderSmartsheetCreateNeedsReview(state.getStored()), false);
  assert.deepEqual(state.calls.slice(0, 4), ['GET', 'RESERVE', 'GET', 'LINK']);
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(); })),
    /already has a Smartsheet identity/,
  );
  assert.equal(posts, 1);
  console.log('PASS write-ahead reservation, verified permanent link, snapshot and repeat-create blocking');
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
  const originalUpdate = state.entity.update;
  state.entity.update = async (id, patch) => {
    if (patch.smartsheet_row_id) throw new Error('Base44 link write failed');
    return originalUpdate(id, patch);
  };
  let posts = 0;
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(5678); })),
    /created Order row 5678.*never POST again/,
  );
  assert.equal(posts, 1);
  assert.equal(state.getStored().smartsheet_create_attempt.status, 'reserved');
  await assert.rejects(
    createOrderSmartsheetRowWithGuard(state.args(async () => { posts++; return success(); })),
    /unresolved Smartsheet create attempt/,
  );
  assert.equal(posts, 1);
  console.log('PASS Base44 linking failure retains durable marker and blocks another Smartsheet row');
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

const source = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const schema = readFileSync('base44/entities/Order.jsonc', 'utf8');
assert.match(schema, /"smartsheet_create_attempt": \{/);
assert.match(source, /createOrderSmartsheetRowWithGuard\(\{/);
assert.match(source, /const unresolved = existingRecords\.filter\(orderSmartsheetCreateNeedsReview\)/);
assert.match(source, /const unresolved = records\.filter\(orderSmartsheetCreateNeedsReview\)/);
assert.match(source, /postRow: async \(freshOrder: any\)/);
assert.match(source, /if \(dataset === 'orders'\)/);
assert.match(source, /Preserve the existing Sales creation flow/);
console.log('PASS only Order creation is guarded and unresolved creates block both sync directions');
