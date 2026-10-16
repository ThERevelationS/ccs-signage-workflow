import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual Order Form handlers with isolated synthetic dependencies.
// Never invoke Base44 entities, browser APIs, or real Smartsheet.
const source = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
function handler(startMarker, endMarker, name, dependencies) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start > 0 && end > start, `Could not isolate ${name}`);
  const body = source.slice(start, end);
  return new Function('env', `const { ${Object.keys(dependencies).join(', ')} } = env;\n${body}\nreturn ${name};`)(dependencies);
}
const quietConsole = { error() {} };

function syncFixture(overrides = {}) {
  const errors = [];
  const notices = [];
  const syncing = [];
  const pendingIds = new Set(['order-123']);
  const versions = new Map([['order-123', 1]]);
  const refs = {
    syncInFlightRef: { current: false },
    customerNameDraftOrderRef: { current: null },
    customerSelectionInFlightRef: { current: false },
    saveInFlightRef: { current: false },
    dateNeededSaveInFlightRef: { current: false },
    pendingSyncIdsRef: { current: pendingIds },
    pendingSyncVersionRef: { current: versions },
    pendingChangesRef: { current: {} },
    originalOrdersRef: { current: {} },
  };
  let calls = 0;
  const dependencies = {
    ...refs,
    readError: '',
    sessionToken: 'synthetic-only',
    saveAllChanges: async () => ({ complete: true, savedIds: [] }),
    setSaveError: message => errors.push(message),
    setSyncMessage: message => notices.push(message),
    setIsSyncing: state => syncing.push(state),
    verifyUncertainOrderSyncReadback: async () => { throw new Error('synthetic read unavailable'); },
    loadAllEntityRows: async () => { throw new Error('Must not reach real persistence'); },
    Order: {},
    pushSavedOrdersToSmartsheet: async () => { calls++; throw new Error('Must not send POST'); },
    summarizeSavedOrderSync: () => { throw new Error('Must not summarize'); },
    clearSyncedOrderIds: () => { throw new Error('Must not clear pending IDs'); },
    setPendingSyncCount: () => {},
    setOrders: () => {},
    setLastSynced: () => {},
    setLastSyncDirection: () => {},
    loadData: async () => false,
    console: quietConsole,
    ...overrides,
  };
  return {
    run: handler('  const saveAndSync = async () => {', '\n  const handleCustomerResolutionApplied', 'saveAndSync', dependencies),
    refs, errors, notices, syncing, pendingIds, versions,
    get outboundCalls() { return calls; },
  };
}

{
  const state = syncFixture({ saveAllChanges: async () => { throw new Error('Unexpected local save failure'); } });
  assert.equal(await state.run(), false);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.versions.get('order-123'), 1);
  assert.equal(state.outboundCalls, 0);
  assert.match(state.errors.at(-1), /Reload Orders and review pending changes/);
  assert.equal(await state.run(), false, 'The lock must release for subsequent guarded attempts');
  console.log('PASS rejected save preparation releases lock without clearing durable pending queue or sending remote writes');
}

{
  const state = syncFixture({ setSyncMessage: () => { throw new Error('Synthetic status initialization failed'); } });
  assert.equal(await state.run(), false);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.outboundCalls, 0);
  console.log('PASS initial status-update exception releases sync lock before any save or remote call');
}

{
  const state = syncFixture({ saveAllChanges: async () => ({ complete: false, savedIds: ['order-123'] }) });
  assert.equal(await state.run(), false);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.outboundCalls, 0);
  console.log('PASS partial or blocked Base44 save retains queued Orders and releases lock');
}

{
  const state = syncFixture({
    pendingSyncVersionRef: { current: { get() { throw new Error('Version snapshot unavailable'); } } },
  });
  assert.equal(await state.run(), false);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.outboundCalls, 0);
  assert.match(state.errors.at(-1), /Version snapshot unavailable/);
  console.log('PASS pending-ID/version preparation exception safely releases lock');
}

{
  let resolveSave;
  const blockedSave = new Promise(resolve => { resolveSave = resolve; });
  let saves = 0;
  const state = syncFixture({
    saveAllChanges: async () => { saves++; return blockedSave; },
  });
  state.pendingIds.clear();
  const first = state.run();
  assert.equal(state.refs.syncInFlightRef.current, true);
  assert.equal(await state.run(), false);
  assert.equal(saves, 1);
  resolveSave({ complete: true, savedIds: [] });
  assert.equal(await first, true);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.match(state.notices.at(-1), /No new Order changes/);
  console.log('PASS same-tick double-click blocked while awaiting initial save and lock released on clean completion');
}

{
  const state = syncFixture({ setIsSyncing: value => { if (value) throw new Error('Synthetic spinner initialization failed'); } });
  assert.equal(await state.run(), false);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.outboundCalls, 0);
  assert.match(state.errors.at(-1), /Saved in Base44, but Smartsheet sync needs attention/);
  console.log('PASS exception entering sync spinner still runs both lock cleanup paths');
}

{
  const state = syncFixture();
  assert.equal(await state.run(), false);
  assert.deepEqual(state.syncing, [true, false]);
  assert.equal(state.refs.syncInFlightRef.current, false);
  assert.deepEqual([...state.pendingIds], ['order-123']);
  assert.equal(state.outboundCalls, 0);
  assert.match(state.errors.at(-1), /Saved in Base44, but Smartsheet sync needs attention/);
  console.log('PASS failed pending-ID readback releases lock and spinner but never clears pending Orders');
}

function saveFixture(overrides = {}) {
  const errors = [];
  const pendingChangesRef = { current: { 'order-123': { customer_name: 'New local name' } } };
  const saveInFlightRef = { current: false };
  const dependencies = {
    saveInFlightRef,
    dateNeededSaveInFlightRef: { current: false },
    pendingChangesRef,
    originalOrdersRef: { current: { 'order-123': { id: 'order-123', customer_name: 'Prior name' } } },
    setIsSaving: value => { if (value === true) throw new Error('Synthetic setIsSaving setup fault'); },
    setSaveError: value => errors.push(value),
    setHasUnsavedChanges: () => {},
    setLastSaved: () => {},
    setOrders: () => {},
    replaceOrderFieldsIfUnchanged: async () => { throw new Error('Must not write entity'); },
    Order: {},
    markOrderNeedsSync: () => { throw new Error('Must not mark save as committed'); },
    NotificationTriggers: {},
    currentUser: {},
    console: quietConsole,
    ...overrides,
  };
  return {
    run: handler('  const saveAllChanges = async () => {', '\n  const saveAndSync = async () => {', 'saveAllChanges', dependencies),
    saveInFlightRef, pendingChangesRef, errors,
  };
}

{
  const state = saveFixture();
  const result = await state.run();
  assert.equal(result.complete, false);
  assert.equal(state.saveInFlightRef.current, false);
  assert.deepEqual(state.pendingChangesRef.current['order-123'], { customer_name: 'New local name' });
  assert.match(state.errors.at(-1), /0 Order rows were saved before the save stopped/);
  console.log('PASS unexpected initial save UI exception releases save lock and preserves the unsaved draft');
}
