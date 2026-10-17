import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Order Form inline write-path acceptance with synthetic dependencies only.
// No Base44 entities or Smartsheet are called.
const source = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
function handler(marker, until, identifier, env) {
  const start = source.indexOf(marker);
  const end = source.indexOf(until, start + marker.length);
  assert.ok(start >= 0 && end > start, 'Missing Order handler: ' + identifier);
  return new Function('env',
    'const { ' + Object.keys(env).join(', ') + ' } = env;\n' +
    source.slice(start, end) + '\nreturn ' + identifier + ';')(env);
}

const orderId = 'order-permanent-123';
function fixture({ ref = false, rendered = false } = {}) {
  const calls = { changes: 0, writes: 0, queued: 0, notifications: [], generations: 0 };
  const initialOrder = { id: orderId, quantity: '2', vendor: 'A', description: 'Before' };
  const pendingChangesRef = { current: {} };
  const originalOrdersRef = { current: { [orderId]: initialOrder } };
  const orderLocalEditGenerationRef = { current: 0 };
  const manualPullInFlightRef = { current: ref };
  const env = {
    isPulling: rendered, manualPullInFlightRef,
    orders: [initialOrder], pendingChangesRef, originalOrdersRef, orderLocalEditGenerationRef,
    manuallyUnlinkedCustomerOrderIdsRef: { current: new Set() },
    verifiedCustomerSelectionRef: { current: new Map() },
    setSaveError: message => calls.notifications.push(message),
    setOrders: callback => { calls.changes++; assert.equal(typeof callback, 'function'); },
    setHasUnsavedChanges: () => {},
    shouldUnlinkOrderJobForTypedCustomer: () => false,
    trackChange: () => { calls.generations++; },
    Order: {},
    replaceOrderFieldsIfUnchanged: async () => {
      calls.writes++;
      return { ...initialOrder, quantity: '3', smartsheet_pending_local_sync: true };
    },
    markOrderNeedsSync: () => { calls.queued++; },
    remainingOrderPendingAfterImmediateSave: () => ({}),
  };
  return { env, calls, pendingChangesRef, originalOrdersRef, orderLocalEditGenerationRef, manualPullInFlightRef };
}

for (const state of [{ ref: true }, { rendered: true }]) {
  const f = fixture(state);
  const update = handler('  const updateOrder = (orderId, field, value, skipHistory = false) => {',
    '\n  const persistImmediateOrderFields', 'updateOrder', f.env);
  const persist = handler('  const persistImmediateOrderFields = async (orderId, nextFields, label, { supersedePendingFields = [] } = {}) => {',
    '\n  // Date Needed is one verified write', 'persistImmediateOrderFields', f.env);
  update(orderId, 'quantity', '3');
  update(orderId, 'vendor', 'B');
  update(orderId, 'description', 'New text');
  assert.equal(f.calls.changes, 0);
  assert.equal(f.calls.generations, 0);
  assert.equal(f.orderLocalEditGenerationRef.current, 0);
  assert.deepEqual(f.pendingChangesRef.current, {});
  await assert.rejects(() => persist(orderId, { date_received: '2026-10-16' }, 'Received'),
    /Wait for the Smartsheet pull/);
  await assert.rejects(() => persist(orderId, { date_ordered: '2026-10-16' }, 'Ordered'),
    /Wait for the Smartsheet pull/);
  assert.equal(f.calls.writes, 0);
  assert.equal(f.calls.queued, 0);
}
console.log('PASS pull ref and rendered pull state each fence all inline staged edits and immediate date/receipt saves without a Base44 write');

{
  const f = fixture();
  const update = handler('  const updateOrder = (orderId, field, value, skipHistory = false) => {',
    '\n  const persistImmediateOrderFields', 'updateOrder', f.env);
  const persist = handler('  const persistImmediateOrderFields = async (orderId, nextFields, label, { supersedePendingFields = [] } = {}) => {',
    '\n  // Date Needed is one verified write', 'persistImmediateOrderFields', f.env);
  update(orderId, 'quantity', '3');
  assert.equal(f.pendingChangesRef.current[orderId].quantity, '3');
  assert.equal(f.orderLocalEditGenerationRef.current, 1);
  assert.equal(f.calls.changes, 1);
  const saved = await persist(orderId, { date_ordered: '2026-10-16' }, 'Ordered');
  assert.equal(saved.smartsheet_pending_local_sync, true);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.queued, 1);
}
console.log('PASS inline edits still stage, and immediate writes still mark Order pending when no manual pull is active');

const needed = source.slice(source.indexOf('  const persistDateNeeded = async ('),
  source.indexOf('\n  const [deleteConfirm', source.indexOf('  const persistDateNeeded = async (')));
assert.match(needed, /if \(manualPullInFlightRef\.current \|\| isPulling\) \{\s*throw new Error\('Wait for the Smartsheet pull/);
assert.ok(needed.indexOf('if (manualPullInFlightRef.current || isPulling)') <
  needed.indexOf('dateNeededSaveInFlightRef.current = true'),
  'Date Needed must reject pulls before changing the save lock');

const ui = source.slice(source.indexOf('  // Mobile card view'));
for (const field of ['request_type', 'quantity', 'vendor', 'description']) {
  const snippet = ui.slice(ui.indexOf('updateOrder(' + (field === 'description' ? 'expandedDescription' : 'order.id') + ', "' + field + '"'));
  assert.match(snippet.slice(0, 500), /disabled=\{!isRegistered \|\| isPulling\}/,
    'Inline ' + field + ' must visibly disable during a pull');
}
assert.equal((ui.match(/<PopoverTrigger asChild disabled=\{!isRegistered \|\| isPulling\}>/g) || []).length, 3);
assert.match(ui, /variant=\{order\.receipt_option === option \? 'default' : 'outline'\} disabled=\{isSaving \|\| isPulling\}/);
assert.match(ui, /if \(!isRegistered \|\| manualPullInFlightRef\.current \|\| isPulling\) return;/);
assert.match(ui, /onMouseDown=\{\(\) => \{\s*if \(manualPullInFlightRef\.current \|\| isPulling\) return;\s*updateOrder\(order\.id, "requestor_name"/);
console.log('PASS pull-time UI disables editable controls and protects requestor dropdown in the same tick');
