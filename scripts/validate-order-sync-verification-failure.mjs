import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const uncertainSync = ui.slice(ui.indexOf('const saveAndSync = async () =>'), ui.indexOf('// Existing internal/manual callers'));

assert.match(uncertainSync, /catch \(error\) \{/);
assert.match(uncertainSync, /const verificationLoaded = await loadData\(false\)/);
assert.match(uncertainSync, /if \(!verificationLoaded\) throw new Error\('Authoritative Order verification reload failed\.'\)/);
assert.match(uncertainSync, /catch \(verificationError\)/);

const loadData = ui.slice(ui.indexOf('const loadData = async'), ui.indexOf('const saveAllChanges = async'));
assert.match(loadData, /ordersData\.forEach[\s\S]*?return true;/);
assert.match(loadData, /catch \(error\)[\s\S]*?setReadError[\s\S]*?return false;/);
assert.match(uncertainSync, /Could not verify uncertain Order sync:/);
assert.match(uncertainSync, /Saved in Base44, but Smartsheet sync needs attention:/);
assert.match(uncertainSync, /finally \{\s*syncInFlightRef\.current = false/);

console.log('PASS uncertain Order sync remains retryable when authoritative verification reload also fails');
