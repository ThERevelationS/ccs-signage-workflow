import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderSaveSyncStatus } from '../src/components/orders/orderSaveSyncStatus.mjs';

assert.deepEqual(orderSaveSyncStatus({ isSaving: true }).kind, 'working');
assert.match(orderSaveSyncStatus({ isSaving: true }).text, /Saving locally/);
assert.deepEqual(orderSaveSyncStatus({ isSyncing: true }).kind, 'working');
assert.match(orderSaveSyncStatus({ isSyncing: true }).text, /Syncing to Smartsheet/);

const syncError = orderSaveSyncStatus({
  saveError: 'Saved in Base44, but Smartsheet sync needs attention: conflict',
  pendingSyncCount: 2,
});
assert.equal(syncError.kind, 'error');
assert.match(syncError.text, /Saved locally/);
assert.match(syncError.text, /Sync needs attention/);

assert.equal(orderSaveSyncStatus({ saveError: 'Save failed' }).text, 'Save needs attention');
assert.equal(orderSaveSyncStatus({ hasUnsavedChanges: true, pendingSyncCount: 3 }).text, 'Unsaved changes');
assert.equal(orderSaveSyncStatus({ pendingSyncCount: 1 }).text, '1 saved · waiting to sync');
assert.equal(orderSaveSyncStatus({ pendingSyncCount: 4 }).text, '4 saved · waiting to sync');
assert.equal(orderSaveSyncStatus({ lastSynced: new Date() }).text, 'Saved & synced');
assert.equal(orderSaveSyncStatus({ lastSaved: new Date() }).text, 'Saved locally');
assert.equal(orderSaveSyncStatus({}).text, 'Ready');
console.log('PASS Save & Sync status precedence is explicit and non-misleading');

const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

assert.match(page, /orderSaveSyncStatus\(saveStatus\)/);
assert.match(page, /aria-live="polite"/);
assert.match(page, /Order save and sync status:/);
assert.match(page, /dark:border-red-900\/60/);
assert.match(page, /dark:border-amber-900\/60/);
assert.match(page, /dark:border-blue-900\/60/);
assert.match(page, /dark:border-emerald-900\/60/);
assert.match(page, /flex flex-wrap items-center gap-2/);
assert.match(page, /max-w-full items-center/);
assert.match(page, /Loader2 className="w-4 h-4 mr-1 animate-spin"/);
assert.doesNotMatch(page, /Save & Sync"\}\s*\(\$\{saveStatus\.pendingSyncCount\}/);
assert.match(sheet, /isSyncing, pendingSyncCount, lastSynced, syncMessage, saveError/);
console.log('PASS compact desktop/mobile toolbar status receives sync errors and keeps Save & Sync button uncluttered');
