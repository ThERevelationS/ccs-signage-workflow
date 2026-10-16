import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderSaveSyncStatus } from '../src/components/orders/orderSaveSyncStatus.mjs';

const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const start = sheet.indexOf('  const pullFromSmartsheet = async () => {');
const end = sheet.indexOf('\n  // Existing internal/manual callers', start);
assert.ok(start > 0 && end > start);
const pullSource = sheet.slice(start, end);
function fixture({ draft = null, selecting = false } = {}) {
  const errors = [];
  let remoteCalls = 0;
  const deps = {
    readError: '', isRegistered: true,
    syncInFlightRef: { current: false }, saveInFlightRef: { current: false },
    dateNeededSaveInFlightRef: { current: false },
    addInFlightRef: { current: false }, deleteInFlightRef: { current: false },
    importInFlightRef: { current: false },
    customerNameDraftOrderRef: { current: draft },
    customerSelectionInFlightRef: { current: selecting },
    pendingChangesRef: { current: {} }, pendingSyncIdsRef: { current: new Set() },
    setSaveError: value => errors.push(value),
    pullOrdersFromSmartsheet: async () => { remoteCalls++; throw Error('No real requests allowed'); },
  };
  const pull = new Function('env', `const { ${Object.keys(deps).join(', ')} } = env;\n${pullSource}\nreturn pullFromSmartsheet;`)(deps);
  return { pull, deps, errors, get remoteCalls() { return remoteCalls; } };
}
for (const blocked of [
  { draft: 'order-123' },
  { selecting: true },
  { draft: 'order-123', selecting: true },
]) {
  const test = fixture(blocked);
  assert.equal(await test.pull(), false);
  assert.equal(test.remoteCalls, 0);
  assert.equal(test.deps.syncInFlightRef.current, false);
  assert.equal(test.errors.length, 1);
  assert.match(test.errors[0], /No remote pull was started/);
  assert.deepEqual([...test.deps.pendingSyncIdsRef.current], []);
}
console.log('PASS actual manual Smartsheet pull rejects focused customer drafts and active job verification before any remote request');

assert.match(sheet, /const \[customerDraftActive, setCustomerDraftActive\] = useState\(false\)/);
assert.match(sheet, /hasUnsavedChanges, customerDraftActive, isSaving, lastSaved/);
assert.match(sheet, /customerNameDraftOrderRef\.current = order\.id;\s*setCustomerDraftActive\(true\);/);
assert.match(sheet, /if \(customerNameDraftOrderRef\.current === order\.id\) customerNameDraftOrderRef\.current = null;\s*setCustomerDraftActive\(Boolean\(customerNameDraftOrderRef\.current \|\| customerSelectionInFlightRef\.current\)\)/);
assert.match(sheet, /customerSelectionInFlightRef\.current = false;\s*setCustomerDraftActive\(Boolean\(customerNameDraftOrderRef\.current\)\)/);
assert.match(sheet, /const saveAndSync = async \(\) => \{[\s\S]*?if \(customerNameDraftOrderRef\.current \|\| customerSelectionInFlightRef\.current\) \{[\s\S]*?Your draft has not been submitted/);
assert.match(page, /disabled=\{saveStatus\.customerDraftActive \|\| saveStatus\.isSaving/);
assert.match(page, /saveStatus\.customerDraftActive \? "Finish Customer Edit"/);
assert.match(page, /Finish editing the customer name or selecting an active job/);
assert.equal(orderSaveSyncStatus({ customerDraftActive: true }).text, 'Finish customer edit');
assert.equal(orderSaveSyncStatus({ customerDraftActive: true, pendingSyncCount: 2 }).text, 'Finish customer edit');
assert.equal(orderSaveSyncStatus({ customerDraftActive: false, pendingSyncCount: 2 }).text, '2 saved · waiting to sync');
assert.equal(orderSaveSyncStatus({ customerDraftActive: true, isSyncing: true }).kind, 'working');
console.log('PASS desktop/mobile toolbar holds Sync during focused drafts; blur returns to the correct queued or pull-only mode');
