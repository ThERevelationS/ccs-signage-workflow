import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

assert.ok(page.includes('onRefresh={() => spreadsheetRef.current?.refreshOrders?.()}'), 'pull refresh should call OrderSpreadsheet');
assert.ok(!page.includes('setSearchTerm(s => s)'), 'pull refresh must not use the old no-op state update');
assert.ok(sheet.includes('refreshOrders: () => loadData(false)'), 'OrderSpreadsheet should expose its guarded quiet reload');
// The current reload guard applies to quiet AND explicit refreshes. It also
// protects focused customer drafts, asynchronous job selection, and pulls.
assert.match(sheet, /const hasActiveOrderEdits = \(\) => Boolean\([\s\S]*?customerNameDraftOrderRef\.current \|\| customerSelectionInFlightRef\.current \|\|[\s\S]*?saveInFlightRef\.current \|\| dateNeededSaveInFlightRef\.current \|\|[\s\S]*?Object\.keys\(pendingChangesRef\.current\)\.length > 0/,
  'quiet reload must protect drafts, pending changes, and in-flight saves');
assert.match(sheet, /if \(\(manualPullInFlightRef\.current && !manualPullReload\) \|\| hasActiveOrderEdits\(\)\) return false;/,
  'quiet and explicit refreshes must reject active Order edits before reading');

console.log('PASS Order pull-to-refresh reloads data without replacing pending edits');
