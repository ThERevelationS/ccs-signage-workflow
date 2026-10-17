import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCommitOrderReload } from '../src/components/orders/orderReloadSafety.mjs';
import { durablePendingOrderIds } from '../src/components/orders/orderSyncReconnect.mjs';

const source = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const start = source.indexOf('  const loadData = async (showLoading = true,');
const end = source.indexOf('  useEffect(() => {\n    const refreshAuthoritativeOrders', start);
assert.ok(start >= 0 && end > start, 'Real guarded Order reload must be isolated');
const reloadSource = source.slice(start, end);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const before = [{ id: 'old-order', customer_name: 'Previous', smartsheet_pending_local_sync: false }];
const after = [
  { id: 'old-order', customer_name: 'Updated by import', smartsheet_pending_local_sync: true },
  { id: 'new-import-order', customer_name: 'Imported', smartsheet_pending_local_sync: true },
];

function fixture({ deferredInitial = false } = {}) {
  const oldRead = deferred();
  const state = { orders: [], readError: 'Earlier Order read failed', pending: -1, orderWrites: 0, reads: 0 };
  const refs = {
    manualPullInFlightRef: { current: false },
    importInFlightRef: { current: false },
    orderLoadGenerationRef: { current: 0 },
    orderLocalEditGenerationRef: { current: 0 },
    pendingChangesRef: { current: {} },
    customerNameDraftOrderRef: { current: null },
    customerSelectionInFlightRef: { current: false },
    saveInFlightRef: { current: false },
    dateNeededSaveInFlightRef: { current: false },
    pendingSyncIdsRef: { current: new Set(['saved-pending-before-import']) },
    pendingSyncVersionRef: { current: new Map([['saved-pending-before-import', 7]]) },
    originalOrdersRef: { current: {} },
  };
  const Order = { kind: 'orders' }, WorkOrder = { kind: 'workorders' }, AuthorizedEmail = { kind: 'users' };
  const env = {
    ...refs, Order, WorkOrder, AuthorizedEmail,
    workOrderFilter: null,
    orders: before,
    hasActiveOrderEdits: () => Boolean(Object.keys(refs.pendingChangesRef.current).length ||
      refs.customerNameDraftOrderRef.current || refs.customerSelectionInFlightRef.current ||
      refs.saveInFlightRef.current || refs.dateNeededSaveInFlightRef.current),
    loadAllEntityRows: ({ entity }) => {
      const batch = Math.floor(state.reads / 3);
      state.reads++;
      if (batch === 0 && deferredInitial) {
        return oldRead.promise.then(records => entity === Order ? records : []);
      }
      return Promise.resolve(entity === Order ? after : []);
    },
    canCommitOrderReload, durablePendingOrderIds,
    setOrders: value => { state.orders = value; state.orderWrites++; },
    setWorkOrders: () => {}, setUsers: () => {},
    setPendingSyncCount: value => { state.pending = value; },
    setReadError: value => { state.readError = value; },
    setIsLoading: () => {},
    console: { error() {} },
  };
  const load = new Function('env',
    'const { ' + Object.keys(env).join(', ') + ' } = env;\n' +
    reloadSource + '\nreturn loadData;')(env);
  return { load, refs, state, oldRead };
}

{
  const f = fixture({ deferredInitial: true });
  const older = f.load(false);
  assert.equal(f.state.reads, 3);
  assert.equal(f.refs.orderLoadGenerationRef.current, 1);
  // Import reserves its lock and invalidates all previously started reads
  // before the first file-reader or network await.
  f.refs.importInFlightRef.current = true;
  f.refs.orderLoadGenerationRef.current++;
  assert.equal(await f.load(false), false, 'Focus/timer refresh must not start during import');
  assert.equal(f.state.reads, 3, 'Background refresh must not issue entity reads');
  f.oldRead.resolve(before);
  assert.equal(await older, false, 'Pre-import read must be discarded');
  assert.equal(f.state.orderWrites, 0);
  assert.equal(f.state.pending, -1);
  assert.deepEqual([...f.refs.pendingSyncIdsRef.current], ['saved-pending-before-import']);
  assert.equal(f.state.readError, 'Earlier Order read failed');
  const verified = await f.load(false, { importReload: true });
  assert.equal(verified, true);
  assert.deepEqual(f.state.orders.map(order => order.id), ['old-order', 'new-import-order']);
  assert.deepEqual([...f.refs.pendingSyncIdsRef.current], ['old-order', 'new-import-order']);
  assert.equal(f.state.pending, 2);
  assert.equal(f.state.readError, '');
  assert.equal(f.refs.pendingSyncVersionRef.current.has('saved-pending-before-import'), false);
  assert.equal(f.refs.pendingSyncVersionRef.current.has('new-import-order'), true);
  f.refs.importInFlightRef.current = false;
  assert.equal(await f.load(false), true, 'Normal refresh must resume after import');
  console.log('PASS old and overlapping Order reads cannot replace import data or clear pending markers; import-owned verified reload can commit');
}

{
  const f = fixture({ deferredInitial: true });
  const older = f.load(false);
  f.refs.importInFlightRef.current = true;
  f.refs.orderLoadGenerationRef.current++;
  f.oldRead.reject(Error('Synthetic old network failure'));
  assert.equal(await older, false);
  assert.equal(f.state.readError, 'Earlier Order read failed', 'Stale read error must not overwrite the current status');
  assert.equal(f.state.orderWrites, 0);
  console.log('PASS invalidated pre-import request failures cannot overwrite the latest read/error state');
}

{
  const f = fixture();
  f.refs.importInFlightRef.current = true;
  f.refs.orderLoadGenerationRef.current++;
  // An Order edit during the import should block the import-owned reload
  // rather than discard an unsaved user field or rebuild its pending markers.
  const pending = f.refs.pendingSyncIdsRef.current;
  f.refs.pendingChangesRef.current['old-order'] = { description: 'Fresh local draft' };
  assert.equal(await f.load(false, { importReload: true }), false);
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.orderWrites, 0);
  assert.strictEqual(f.refs.pendingSyncIdsRef.current, pending);
  assert.equal(f.refs.pendingChangesRef.current['old-order'].description, 'Fresh local draft');
  console.log('PASS import-owned reload still protects active local edits and leaves durable pending queue untouched');
}

assert.equal(canCommitOrderReload({ requestGeneration: 4, latestGeneration: 4, importInFlight: true }), false);
assert.equal(canCommitOrderReload({
  requestGeneration: 4, latestGeneration: 4, importInFlight: true, importReload: true,
}), true);
assert.equal(canCommitOrderReload({
  requestGeneration: 3, latestGeneration: 4, importInFlight: true, importReload: true,
}), false);
assert.equal(canCommitOrderReload({
  requestGeneration: 4, latestGeneration: 4, importInFlight: true, importReload: true,
  localEditInProgress: true,
}), false);
assert.equal(canCommitOrderReload({
  requestGeneration: 4, latestGeneration: 4, importInFlight: true, manualPullReload: true,
}), false, 'Manual-pull reload permission must never bypass active import');
console.log('PASS import reload exception is narrow and cannot bypass edit-generation or read-order fencing');
