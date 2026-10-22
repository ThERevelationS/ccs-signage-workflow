import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import * as browserBatch from '../src/components/orders/orderSaveSyncBatch.mjs';
import { ORDER_SAVE_SYNC_BATCH_LIMIT as serverCap, orderSaveSyncBatchLimit } from '../base44/shared/orderSaveSyncBatchLimit.mjs';
import { verifyUncertainOrderSyncReadback } from '../src/components/orders/orderUncertainSyncReadback.mjs';
import { canClearCompletedOrderSyncTarget } from '../src/components/orders/orderSyncCompletionSafety.mjs';
import { durablePendingOrderIds } from '../src/components/orders/orderSyncReconnect.mjs';
import { orderSaveSyncStatus } from '../src/components/orders/orderSaveSyncStatus.mjs';

// Only in-memory stand-ins are used. No real Base44 or Smartsheet request runs.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');
const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const clone = value => structuredClone(value);
const makeIds = count => Array.from({ length: count }, (_, i) => 'order-' + String(i + 1).padStart(3, '0'));
assert.equal(browserBatch.ORDER_SAVE_SYNC_BATCH_LIMIT, serverCap);
assert.equal(serverCap, 25);
for (const [configured, expected] of [[10000, 25], [25, 25], [10, 10], ['7', 7], [1.9, 1], [-1, 1], [0, 25], [undefined, 25], [Infinity, 25], ['invalid', 25]]) {
  assert.equal(orderSaveSyncBatchLimit(configured), expected);
}
console.log('PASS browser/server caps agree at 25 and stricter configured limits remain effective');

const guardStart = backend.indexOf("  const massLimit = dataset === 'orders' && options?.requireOrderPendingMarker");
const guardEnd = backend.indexOf('  if (requestedRecordIds.length > massLimit)', guardStart);
assert.ok(guardStart > 0 && guardEnd > guardStart);
const actualPushLimit = new Function('dataset', 'options', 'globalConfig', 'orderSaveSyncBatchLimit',
  backend.slice(guardStart, guardEnd) + '\nreturn massLimit;');
assert.equal(actualPushLimit('orders', { requireOrderPendingMarker: true }, { mass_change_limit_count: 10000 }, orderSaveSyncBatchLimit), 25);
assert.equal(actualPushLimit('orders', { requireOrderPendingMarker: true }, { mass_change_limit_count: 8 }, orderSaveSyncBatchLimit), 8);
assert.equal(actualPushLimit('sales', { requireOrderPendingMarker: true }, { mass_change_limit_count: 10000 }, orderSaveSyncBatchLimit), 10000);
assert.equal(actualPushLimit('orders', {}, { mass_change_limit_count: 10000 }, orderSaveSyncBatchLimit), 10000);
console.log('PASS actual shared push limit changes only targeted pending-Order Save & Sync');

const actionBlock = backend.slice(backend.indexOf("    if (action === 'push_saved_orders')"),
  backend.indexOf("    if (action === 'push_saved_sales')"));
const compiledAction = await transform('async function runAction() {\n' + actionBlock + '\n}', { loader: 'ts' });
async function backendAction(count, configuredLimit = 10000) {
  const claims = [], pushes = [];
  const config = { global_enabled: true, observation_mode: false, mass_change_limit_count: configuredLimit, orders: { mirror_enabled: true } };
  const env = {
    action: 'push_saved_orders', configured: true, token: 'synthetic-only', base44: {},
    body: { order_ids: makeIds(count) }, adminActor: { email: 'synthetic@example.invalid' },
    orderSaveSyncBatchLimit, Response,
    cleanText: (value, max) => String(value ?? '').trim().slice(0, max),
    loadSyncConfig: async () => ({ config }),
    claimInvocationRun: async value => claims.push(value),
    pushDataset: async (_base44, _token, dataset, _profile, _config, options) => {
      pushes.push([...options.recordIds]); return { dataset, updated: options.recordIds.length };
    },
    orderRunRequiresReview: () => false,
    saveSyncStatusForRun: async () => true,
    assertSyncRunOwnership: async () => {},
  };
  const run = new Function('env', 'const { ' + Object.keys(env).join(', ') + ' } = env;\n' + compiledAction.code + '\nreturn runAction;')(env);
  const response = await run();
  return { status: response.status, body: await response.json(), claims, pushes };
}
for (const [count, configured, limit] of [[26, 10000, 25], [11, 10, 10]]) {
  const result = await backendAction(count, configured);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'ORDER_SYNC_BATCH_LIMIT');
  assert.equal(result.body.order_batch_limit, limit);
  assert.equal(result.body.smartsheet_writes_attempted, false);
  assert.equal(result.claims.length, 0);
  assert.equal(result.pushes.length, 0);
}
const allowed = await backendAction(25);
assert.equal(allowed.status, 200);
assert.equal(allowed.claims.length, 1);
assert.equal(allowed.pushes[0].length, 25);
console.log('PASS actual backend action rejects oversized batches before claiming a run or invoking the push');

const clientBody = client.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
function actualClient(queueSmartsheetSync) {
  const env = { ...browserBatch, queueSmartsheetSync,
    normalizeOrderLinkedCustomerReviews: () => [], orderRemoteVerificationReviewMessage: () => '' };
  return new Function('env', 'const { ' + Object.keys(env).join(', ') + ' } = env;\n' + clientBody +
    '\nreturn { pushSavedOrdersToSmartsheet, summarizeSavedOrderSync };')(env);
}
{
  let calls = 0;
  const api = actualClient(async () => { calls++; throw new Error('Must not send'); });
  await assert.rejects(api.pushSavedOrdersToSmartsheet({ sessionToken: 'synthetic', orderIds: makeIds(26) }),
    error => error instanceof browserBatch.OrderSaveSyncBatchLimitError && error.limit === 25);
  assert.equal(calls, 0);
}
const validRejection = { success: false, code: 'ORDER_SYNC_BATCH_LIMIT', order_batch_limit: 10, smartsheet_writes_attempted: false };
for (const bad of [
  {}, { ...validRejection, success: true }, { ...validRejection, smartsheet_writes_attempted: true },
  { ...validRejection, smartsheet_writes_attempted: undefined }, { ...validRejection, order_batch_limit: 0 },
  { ...validRejection, order_batch_limit: 26 }, { ...validRejection, order_batch_limit: '10' },
  { ...validRejection, order_batch_limit: 1.5 }, { ...validRejection, code: 'OTHER_ERROR' },
]) assert.equal(browserBatch.readOrderSaveSyncBatchLimitError(bad), null);
assert.equal(browserBatch.readOrderSaveSyncBatchLimitError(validRejection).limit, 10);
console.log('PASS actual client blocks oversized requests locally and accepts lower limits only with verified no-write rejection evidence');

function compileUiPart(startMarker, endMarker, name, env) {
  const start = ui.indexOf(startMarker), end = ui.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, 'Actual ' + name + ' must be found');
  return new Function('env', 'const { ' + Object.keys(env).join(', ') + ' } = env;\n' +
    ui.slice(start, end) + '\nreturn ' + name + ';')(env);
}
function fixture({ count = 60, mode = 'success', serverLimit = 25, waitForPush = null } = {}) {
  const ids = makeIds(count);
  const records = new Map(ids.map((id, i) => [id, {
    id, description: 'Synthetic ' + id, smartsheet_pending_local_sync: true,
    smartsheet_sheet_id: '123456', smartsheet_row_id: String(2000 + i),
    smartsheet_last_synced_at: '2026-10-22T12:00:00Z', smartsheet_sync_snapshot: { '10': 'Synthetic ' + id },
  }]));
  const outbound = [], readbacks = [], messages = [], errors = [], spinner = [];
  let reloads = 0, visible = [...records.values()].map(clone);
  const refs = {
    syncInFlightRef: { current: false }, saveInFlightRef: { current: false },
    dateNeededSaveInFlightRef: { current: false }, customerNameDraftOrderRef: { current: null },
    customerSelectionInFlightRef: { current: false }, pendingChangesRef: { current: {} },
    pendingSyncIdsRef: { current: new Set(ids) }, pendingSyncVersionRef: { current: new Map(ids.map(id => [id, 1])) },
    originalOrdersRef: { current: Object.fromEntries([...records].map(([id, row]) => [id, clone(row)])) },
    orderSyncBatchLimitRef: { current: 25 },
  };
  const api = actualClient(async payload => {
    const submitted = [...payload.order_ids];
    outbound.push(submitted);
    assert.ok(submitted.length <= 25);
    if (submitted.length > serverLimit) {
      throw { response: { data: { ...validRejection, order_batch_limit: serverLimit } } };
    }
    if (waitForPush) await waitForPush;
    const completed = mode === 'partial' ? 10 : submitted.length;
    for (const id of submitted.slice(0, completed)) {
      records.set(id, { ...records.get(id), smartsheet_pending_local_sync: false });
    }
    if (mode === 'newer') {
      const id = submitted[0];
      records.set(id, { ...records.get(id), smartsheet_pending_local_sync: true });
      refs.pendingSyncVersionRef.current.set(id, 2);
    }
    if (mode === 'lost') throw new Error('Synthetic response loss after server completion');
    return { data: { success: true, configured: true, write_actions_available: true,
      sync_complete: mode !== 'partial', needs_review: mode === 'partial',
      results: [{ dataset: 'orders', direction: 'push', records_examined: submitted.length,
        updated: completed, created: 0, unchanged_skipped: 0,
        errors: submitted.length - completed, conflicts: 0, remaining_records: submitted.length - completed }] } };
  });
  const env = {
    ...refs, ...browserBatch, ...api, verifyUncertainOrderSyncReadback, canClearCompletedOrderSyncTarget,
    readError: '', sessionToken: 'synthetic-only', Order: {},
    saveAllChanges: async () => ({ complete: true, savedIds: [] }),
    setSaveError: value => errors.push(value), setSyncMessage: value => messages.push(value),
    setIsSyncing: value => spinner.push(value), setLastSynced: () => {}, setLastSyncDirection: () => {},
    setPendingSyncCount: () => {}, useCallback: fn => fn,
    setOrders: fn => { visible = fn(visible); }, console: { error() {} },
    loadAllEntityRows: async ({ query }) => {
      const requested = [...query.id.$in];
      readbacks.push(requested);
      assert.ok(requested.length <= 25);
      return requested.map(id => clone(records.get(id)));
    },
    loadData: async () => {
      reloads++;
      refs.pendingSyncIdsRef.current = new Set(durablePendingOrderIds([...records.values()]));
      return true;
    },
  };
  env.clearSyncedOrderIds = compileUiPart('  const clearSyncedOrderIds = useCallback(',
    '\n  // Auto-save every 5 seconds', 'clearSyncedOrderIds', env);
  const run = compileUiPart('  const saveAndSync = async () => {',
    '\n  const handleCustomerResolutionApplied', 'saveAndSync', env);
  return { ids, records, refs, outbound, readbacks, messages, errors, spinner, run,
    get reloads() { return reloads; }, get pending() { return [...refs.pendingSyncIdsRef.current]; } };
}

{
  const f = fixture();
  assert.equal(await f.run(), true);
  assert.deepEqual(f.outbound[0], f.ids.slice(0, 25));
  assert.deepEqual(f.pending, f.ids.slice(25));
  assert.match(f.messages.at(-1), /35 Orders remain queued/);
  assert.equal(orderSaveSyncStatus({ pendingSyncCount: f.pending.length, lastSynced: new Date() }).kind, 'pending');
  assert.equal(await f.run(), true);
  assert.deepEqual(f.outbound[1], f.ids.slice(25, 50));
  assert.match(f.messages.at(-1), /10 Orders remain queued/);
  assert.equal(await f.run(), true);
  assert.deepEqual(f.outbound[2], f.ids.slice(50));
  assert.equal(f.pending.length, 0);
  assert.equal(new Set(f.outbound.flat()).size, 60);
  assert.doesNotMatch(f.messages.at(-1), /remain queued/);
  assert.equal(f.refs.syncInFlightRef.current, false);
  console.log('PASS actual form processes 60 Orders over three clicks without clearing or resending untouched batches');
}
{
  const f = fixture({ count: 30, mode: 'lost' });
  assert.equal(await f.run(), true);
  assert.equal(f.outbound.length, 1);
  assert.equal(f.reloads, 1);
  assert.deepEqual(f.pending, f.ids.slice(25));
  assert.match(f.messages.at(-1), /5 Orders remain queued/);
  assert.equal(f.readbacks.flat().some(id => f.ids.slice(25).includes(id)), false);
  console.log('PASS lost acknowledgment reads back only the attempted batch and preserves truthful remaining-queue status');
}
{
  const f = fixture({ count: 40, mode: 'partial' });
  assert.equal(await f.run(), false);
  assert.equal(f.outbound.length, 1);
  assert.equal(f.pending.length, 30);
  assert.match(f.errors.at(-1), /10 Orders synced successfully; 30 remain queued/);
  for (const id of f.ids.slice(25)) assert.equal(f.records.get(id).smartsheet_pending_local_sync, true);
  assert.equal(f.refs.syncInFlightRef.current, false);
  console.log('PASS partial completion preserves failed and unsubmitted Orders and reports the total remaining queue');
}
{
  const f = fixture({ count: 30, mode: 'newer' });
  assert.equal(await f.run(), false);
  assert.ok(f.pending.includes(f.ids[0]));
  assert.deepEqual(f.pending.slice(1), f.ids.slice(25));
  assert.equal(f.refs.pendingSyncVersionRef.current.get(f.ids[0]), 2);
  assert.equal(f.records.get(f.ids[0]).smartsheet_pending_local_sync, true);
  console.log('PASS a newer revision stays queued alongside untouched batches after a delayed success response');
}
{
  const f = fixture({ count: 30, serverLimit: 10 });
  assert.equal(await f.run(), false);
  assert.equal(f.outbound.length, 1, 'A limit rejection must never replay automatically');
  assert.equal(f.reloads, 0);
  assert.equal(f.pending.length, 30);
  assert.equal(f.refs.orderSyncBatchLimitRef.current, 10);
  assert.match(f.errors.at(-1), /up to 10 Orders per batch/);
  assert.equal(await f.run(), true);
  assert.equal(f.outbound.length, 2);
  assert.equal(f.outbound[1].length, 10);
  assert.deepEqual(f.pending, f.ids.slice(10));
  console.log('PASS verified lower server limit is applied on the next user click without automatic replay or lost markers');
}
{
  let release;
  const waitForPush = new Promise(resolve => { release = resolve; });
  const f = fixture({ count: 30, waitForPush });
  const first = f.run();
  for (let i = 0; i < 30 && f.outbound.length === 0; i++) await Promise.resolve();
  assert.equal(f.outbound.length, 1);
  assert.equal(await f.run(), false);
  assert.equal(f.outbound.length, 1);
  release();
  assert.equal(await first, true);
  assert.equal(f.pending.length, 5);
  assert.deepEqual(f.spinner, [true, false]);
  console.log('PASS same-tick repeated clicks cannot submit a second batch while the first batch is in flight');
}
