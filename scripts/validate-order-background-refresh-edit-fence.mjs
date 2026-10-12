import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCommitOrderReload } from '../src/components/orders/orderReloadSafety.mjs';

// Simulate the Order Form's async refresh and a field edit that starts only
// after the read began, and completes BEFORE the read resolves. Merely
// checking current pendingChanges cannot catch that short race.
const call = (values = {}) => canCommitOrderReload({
  requestGeneration: 5, latestGeneration: 5,
  startedEditGeneration: 11, latestEditGeneration: 11,
  ...values,
});
assert.equal(call(), true);
assert.equal(call({ startedEditGeneration: 10 }), false);
assert.equal(call({ latestEditGeneration: 12 }), false);
assert.equal(call({ localEditInProgress: true }), false);
assert.equal(call({ requestGeneration: 4 }), false);
assert.equal(call({ manualPullInFlight: true }), false);
assert.equal(call({ manualPullInFlight: true, manualPullReload: true }), true);
assert.equal(call({ startedEditGeneration: Number.NaN }), false);
assert.equal(call({ latestEditGeneration: undefined }), false);
console.log('PASS async Order refresh cannot apply if an edit, save, or newer load occurred in the meantime');

// Mock the same event order with one deferred Base44 read. No entities are
// written and no real Smartsheet API calls are made.
let finishRead;
const deferredRead = new Promise(resolve => { finishRead = resolve; });
let editGeneration = 0;
let currentValue = 'Original';
let didCommitStale = false;
const startGeneration = editGeneration;
const staleLoad = deferredRead.then(record => {
  if (canCommitOrderReload({
    requestGeneration: 1, latestGeneration: 1,
    startedEditGeneration: startGeneration,
    latestEditGeneration: editGeneration,
    localEditInProgress: false,
  })) {
    didCommitStale = true;
    currentValue = record.customer_name;
  }
});
editGeneration++; // focus/typing
currentValue = 'New customer draft';
editGeneration++; // local save completes, no longer an active edit
finishRead({ customer_name: 'Original' });
await staleLoad;
assert.equal(didCommitStale, false);
assert.equal(currentValue, 'New customer draft');
console.log('PASS delayed Base44 response cannot roll back a new name even after its pending field has been saved');

const source = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const reload = source.slice(source.indexOf('const hasActiveOrderEdits = () =>'),
  source.indexOf('useEffect(() => {\n    const refreshAuthoritativeOrders'));
assert.match(reload, /customerNameDraftOrderRef\.current/);
assert.match(reload, /customerSelectionInFlightRef\.current/);
assert.match(reload, /if \(\(manualPullInFlightRef\.current && !manualPullReload\) \|\| hasActiveOrderEdits\(\)\) return false/);
assert.match(reload, /const startedEditGeneration = orderLocalEditGenerationRef\.current/);
assert.equal((reload.match(/latestEditGeneration: orderLocalEditGenerationRef\.current/g) || []).length, 2);
assert.equal((reload.match(/localEditInProgress: hasActiveOrderEdits\(\)/g) || []).length, 2);
assert.match(reload, /pendingSyncIdsRef\.current = durablePendingIds/);
assert.match(reload, /setReadError\(error\?\.message \|\| "Orders could not be verified completely\."\)/);
console.log('PASS timer, focus, explicit retry, and load-error branches share the Order edit-generation fence');

const input = source.slice(source.indexOf('{/* Customer Name with Work Order Link */}'),
  source.indexOf('getFilteredWorkOrders(customerSearch).map(wo =>'));
assert.match(input, /customerNameDraftOrderRef\.current = order\.id/);
assert.match(input, /orderLocalEditGenerationRef\.current \+= 1/);
assert.match(input, /customerNameDraftOrderRef\.current === order\.id\) customerNameDraftOrderRef\.current = null/);
assert.match(source, /const markOrderNeedsSync = useCallback\([\s\S]*?orderLocalEditGenerationRef\.current \+= 1/);
assert.match(source, /const updateOrder = \(orderId, field, value, skipHistory = false\) => \{[\s\S]*?orderLocalEditGenerationRef\.current \+= 1/);
console.log('PASS customer-name typing remains save-on-blur but blocks stale refresh, and saved edits invalidate older reads');
