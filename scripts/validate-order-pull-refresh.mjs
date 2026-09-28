import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

assert.ok(page.includes('onRefresh={() => spreadsheetRef.current?.refreshOrders?.()}'), 'pull refresh should call OrderSpreadsheet');
assert.ok(!page.includes('setSearchTerm(s => s)'), 'pull refresh must not use the old no-op state update');
assert.ok(sheet.includes('refreshOrders: () => loadData(false)'), 'OrderSpreadsheet should expose its guarded quiet reload');
assert.ok(sheet.includes('if (!showLoading && (saveInFlightRef.current || dateNeededSaveInFlightRef.current || Object.keys(pendingChangesRef.current).length > 0)) return;'), 'quiet reload must preserve pending or in-flight edits');

console.log('PASS Order pull-to-refresh reloads data without replacing pending edits');
